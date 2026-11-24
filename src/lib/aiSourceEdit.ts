/**
 * AI edits through Resuma Markup.
 *
 * The model gets the current .rsm source (content or template) plus an
 * instruction and must return the whole updated source. The reply is parsed
 * and validated; on errors the model gets one retry with the diagnostics.
 * Nothing is applied here: the caller shows a diff and the user accepts.
 */
import type { Diagnostic } from "@/renderer/rsm/parse";
import { parseContent } from "@/renderer/rsm/content";
import { compileTemplate } from "@/renderer/template/template";
import { ENTRY_FIELDS, LABELS, PERSONAL_FIELDS, SECTION_KINDS } from "@/renderer/template/schema";
import { PAGE_PROPERTIES, PROPERTIES } from "@/renderer/template/styles";
import type { ResumeContent } from "./resumesStore";

export type EditTarget = "content" | "template";

export type EditWarning =
  | { kind: "removed"; section: string; count: number }
  | { kind: "added"; section: string; count: number }
  | { kind: "newDates"; values: string[] }
  | { kind: "newNames"; values: string[] }
  | { kind: "personalChanged"; fields: string[] };

export type EditResult =
  | { ok: true; text: string; attempts: number; warnings: EditWarning[] }
  | { ok: false; reason: "invalid" | "unchanged" | "empty"; diagnostics: Diagnostic[]; output: string; attempts: number };

const CONTENT_GUIDE = `Resuma Markup content format:
- Top level, in this order: \\personal{...}, \\education{...}, \\experience{...}, \\projects{...}, \\skills{...}, \\awards{...}, then optional \\custom[id="..."]{\\title{...} \\entry{...}...} and \\layout{...}.
- A section holds \\entry{...} blocks. Each field is \\name{plain text}.
- Lists are \\field{\\item{...}\\item{...}}. Dates are \\date{\\from{...}\\to{...}}; an empty \\to{} means "present".
- Personal fields: ${Object.keys({ fullName: 1, email: 1, location: 1, phone: 1, website: 1, linkedin: 1, github: 1 }).join(", ")}.
- Entry fields: education (school, degree, location, gpa, date, courses); experience (jobTitle, company, location, description, date, notes); projects (name, link, date, description, technologies); skills (category, items); awards (title, organizer, date, description, location); custom entries (title, subtitle, location, date, description, items).
- \\layout{\\order{\\item{skills}...} \\hidden{\\item{awards}} \\titles{\\title[section="skills"]{New title}}} arranges sections; custom section keys are custom:<id>.
- Only \\, { and } are special characters; write \\\\, \\{ and \\} to use them literally. % at the start of a line starts a comment. Do not use any other LaTeX commands.`;

const TEMPLATE_GUIDE = `Resuma Markup template format (declarative; no scripting):
- Start with \\template[id=..., name=..., version=1]. Optional \\option[name, type=color|size|font|choice, default=..., label="..."] values are used in styles as @name.
- \\page{margin: 40; font-family: @font; font-size: 11; color: #1f2937} sets page styles. \\style[name]{property: value; ...} defines a style class.
- Style properties: ${Object.keys(PROPERTIES).join(", ")}. Page properties: ${Object.keys(PAGE_PROPERTIES).join(", ")}. Numbers are points, colours are hex, fonts are Figtree, Inter or "Space Grotesk", font-weight is normal or bold, border-bottom is "<width> <colour>", keep is together or with-next.
- \\header{...} renders personal fields: ${Object.keys(PERSONAL_FIELDS).join(", ")}.
- \\section[kind]{...} for kind in ${SECTION_KINDS.join(", ")}, or * for custom sections. Inside, \\entries[style]{...} repeats per entry.
- Entry fields: ${Object.entries(ENTRY_FIELDS)
  .map(([k, f]) => `${k === "*" ? "custom" : k} (${Object.keys(f).join(", ")})`)
  .join("; ")}.
- Blocks: \\p[style]{inline}, \\block[style]{blocks}, \\row{left blocks}{right blocks}, \\hr[style], \\if{field}{then}{else}, \\each{listField}{...}.
- Inline: plain text, \\v{field} (options nolink, first, rest), \\sectiontitle, \\label{key} for ${Object.keys(LABELS).join(", ")}, \\range[sep=" – "]{date}, \\join[sep=" | "]{a}{b}..., \\list[sep=", "]{listField}, \\lines[prefix="• "]{listField}, \\span[style]{...}, \\if, \\each (use \\v{.} for the item).
- Every style class you use must be defined with \\style.`;

function buildPrompt(target: EditTarget, instruction: string, source: string, jobDesc?: string): string {
  const rules =
    target === "content"
      ? `- Change only what the instruction asks for and keep everything else exactly as it is.
- Never invent employers, schools, titles, dates, numbers or achievements that are not in the document or the instruction.`
      : `- Change only what the instruction asks for. Keep the \\template header, the sections and every field the template already shows unless told otherwise.`;
  return `You edit a resume ${target === "content" ? "document" : "template"} written in Resuma Markup.

${target === "content" ? CONTENT_GUIDE : TEMPLATE_GUIDE}

Rules:
- Return the COMPLETE updated ${target === "content" ? "document" : "template"} in a single \`\`\`rsm code block and nothing else.
${rules}
${jobDesc?.trim() ? `\nJob description (for context):\n${jobDesc.trim()}\n` : ""}
Instruction: ${instruction.trim()}

Current ${target === "content" ? "document" : "template"}:
\`\`\`rsm
${source}
\`\`\``;
}

function retryPrompt(previous: string, diagnostics: Diagnostic[]): string {
  const problems = diagnostics
    .filter((d) => d.severity === "error")
    .slice(0, 12)
    .map((d) => `- line ${d.line}, column ${d.col}: ${d.message}`)
    .join("\n");
  return `Your answer could not be used because of these problems:
${problems}

Fix them and return the complete corrected source again in a single \`\`\`rsm code block and nothing else.

Your previous answer:
\`\`\`rsm
${previous}
\`\`\``;
}

/** Pulls the .rsm source out of a model reply (code block, reasoning tags, chatter). */
export function extractSource(reply: string): string {
  const text = reply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = [...text.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (fenced.length) return fenced.sort((a, b) => b.length - a.length)[0].replace(/\s+$/, "") + "\n";
  // No code block: start at the first command.
  const first = text.search(/\\[A-Za-z]/);
  return (first >= 0 ? text.slice(first) : text).replace(/\s+$/, "") + "\n";
}

const validate = (target: EditTarget, source: string): Diagnostic[] =>
  (target === "content" ? parseContent(source) : compileTemplate(source)).diagnostics.filter(
    (d) => d.severity === "error"
  );

const normalise = (s: string) => s.replace(/\r\n/g, "\n").trim();

export async function runSourceEdit(opts: {
  target: EditTarget;
  instruction: string;
  source: string;
  jobDesc?: string;
  call: (prompt: string) => Promise<string>;
  maxAttempts?: number;
}): Promise<EditResult> {
  const { target, instruction, source, jobDesc, call, maxAttempts = 2 } = opts;
  let prompt = buildPrompt(target, instruction, source, jobDesc);
  let output = "";
  let diagnostics: Diagnostic[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    output = extractSource(await call(prompt));
    if (!output.trim()) return { ok: false, reason: "empty", diagnostics: [], output, attempts: attempt };
    diagnostics = validate(target, output);
    if (!diagnostics.length) {
      if (normalise(output) === normalise(source)) {
        return { ok: false, reason: "unchanged", diagnostics: [], output, attempts: attempt };
      }
      const warnings = target === "content" ? contentWarnings(source, output) : [];
      return { ok: true, text: output, attempts: attempt, warnings };
    }
    prompt = retryPrompt(output, diagnostics);
  }
  return { ok: false, reason: "invalid", diagnostics, output, attempts: maxAttempts };
}

// ---- checks for content edits --------------------------------------------

type Entries = Record<string, Record<string, unknown>[]>;

const sectionsOf = (c: ResumeContent): Entries => {
  const out: Entries = {};
  for (const k of SECTION_KINDS) out[k] = (c[k] ?? []) as unknown as Record<string, unknown>[];
  for (const s of c.custom ?? []) out[s.title || `custom:${s.id}`] = s.entries as unknown as Record<string, unknown>[];
  return out;
};

const collect = (c: ResumeContent, pick: (e: Record<string, unknown>) => unknown[]): Set<string> =>
  new Set(
    Object.values(sectionsOf(c))
      .flat()
      .flatMap(pick)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      .map((v) => v.trim())
  );

const datesOf = (e: Record<string, unknown>) => {
  const d = e.date as { from?: string; to?: string } | undefined;
  return [d?.from, d?.to];
};
const namesOf = (e: Record<string, unknown>) => [e.company, e.school, e.organizer, e.degree, e.jobTitle];

/**
 * Things a reviewer should look at before accepting an AI content edit:
 * removed or added entries, dates and organisations that weren't there
 * before (possible fabrication), and changed personal details.
 */
export function contentWarnings(beforeSource: string, afterSource: string): EditWarning[] {
  const before = parseContent(beforeSource).content;
  const after = parseContent(afterSource).content;
  if (!before || !after) return [];
  const warnings: EditWarning[] = [];

  const a = sectionsOf(before);
  const b = sectionsOf(after);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const diff = (b[key]?.length ?? 0) - (a[key]?.length ?? 0);
    if (diff < 0) warnings.push({ kind: "removed", section: key, count: -diff });
    if (diff > 0) warnings.push({ kind: "added", section: key, count: diff });
  }

  const oldDates = collect(before, datesOf);
  const newDates = [...collect(after, datesOf)].filter((d) => !oldDates.has(d));
  if (newDates.length) warnings.push({ kind: "newDates", values: newDates });

  const oldNames = collect(before, namesOf);
  const newNames = [...collect(after, namesOf)].filter((n) => !oldNames.has(n));
  if (newNames.length) warnings.push({ kind: "newNames", values: newNames });

  const p1 = before.personal as Record<string, unknown>;
  const p2 = after.personal as Record<string, unknown>;
  const changed = Object.keys({ ...p1, ...p2 }).filter((k) => (p1[k] ?? "") !== (p2[k] ?? ""));
  if (changed.length) warnings.push({ kind: "personalChanged", fields: changed });

  return warnings;
}
