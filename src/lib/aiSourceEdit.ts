/**
 * AI edits through Resuma Markup.
 *
 * The model gets the current .rsm source (content or template) plus an
 * instruction and must return the whole updated source. The reply is parsed
 * and validated; on errors the model gets one retry with the diagnostics.
 * Nothing is applied here: the caller shows a diff and the user accepts.
 */
import type { Diagnostic } from "@/renderer/rsm/parse";
import { parseContent, printContent, topLevelBlocks } from "@/renderer/rsm/content";
import { compileTemplate } from "@/renderer/template/template";
import { ENTRY_FIELDS, LABELS, PERSONAL_FIELDS, SECTION_KINDS } from "@/renderer/template/schema";
import { PAGE_PROPERTIES, PROPERTIES } from "@/renderer/template/styles";
import type { RenderIssue } from "@/renderer/check";
import { BUILTIN_TEMPLATES } from "@/templates";
import type { ResumeContent } from "./resumesStore";

export type EditTarget = "content" | "template";

export type EditWarning =
  | { kind: "removed"; section: string; count: number }
  | { kind: "added"; section: string; count: number }
  | { kind: "newDates"; values: string[] }
  | { kind: "newNames"; values: string[] }
  | { kind: "newNumbers"; values: string[] }
  | { kind: "personalChanged"; fields: string[] }
  | { kind: "sectionsDropped"; values: string[] }
  /** A problem found by rendering the template (see renderer/check). */
  | { kind: "render"; issue: RenderIssue };

export type EditResult =
  | {
      ok: true;
      /** The source the edit applies to, as sent (canonical for content). */
      before: string;
      text: string;
      attempts: number;
      warnings: EditWarning[];
    }
  | {
      ok: false;
      /** cutOff: the model ran out of context while still thinking. */
      reason: "invalid" | "unchanged" | "empty" | "cutOff";
      diagnostics: Diagnostic[];
      output: string;
      attempts: number;
    };

export const CONTENT_GUIDE = `Resuma Markup content format:
- Top level, in this order: \\education{...}, \\experience{...}, \\projects{...}, \\skills{...}, \\awards{...}, then optional \\custom[id="..."]{\\title{...} \\entry{...}...} and \\layout{...}. The personal details block is left out on purpose; do not add one.
- A section holds \\entry{...} blocks. Each field is \\name{plain text}.
- Lists are \\field{\\item{...}\\item{...}}. Dates are \\date{\\from{...}\\to{...}}; an empty \\to{} means "present".
- Entry fields: education (school, degree, location, gpa, date, courses); experience (jobTitle, company, location, description, date, notes); projects (name, link, date, description, technologies); skills (category, items); awards (title, organizer, date, description, location); custom entries (title, subtitle, location, date, description, items).
- \\layout{\\order{\\item{skills}...} \\hidden{\\item{awards}} \\titles{\\title[section="skills"]{New title}}} arranges sections; custom section keys are custom:<id>.
- Only \\, { and } are special characters; write \\\\, \\{ and \\} to use them literally. % at the start of a line starts a comment. Do not use any other LaTeX commands.`;

export const TEMPLATE_GUIDE = `Resuma Markup template format (declarative; no scripting):
- Start with \\template[id=..., name=..., version=1]. Optional \\option[name, type=color|size|font|choice, default=..., label="..."] values are used in styles as @name; a choice option also needs choices="a|b|c" including its default. @font is built in (the font the user picks): use it, never declare an option called font.
- Write one command per line and indent nested blocks like the example, so every { has its matching }.
- \\page{margin: 40; font-family: @font; font-size: 11; color: #1f2937} sets page styles. \\style[heading]{font-size: 12; font-weight: bold} defines a style class called heading (the name goes alone in the brackets); use it as \\p[heading]{...}.
- Style properties: ${Object.keys(PROPERTIES).join(", ")}. Page properties: ${Object.keys(PAGE_PROPERTIES).join(", ")}. Numbers are points, colours are hex, fonts are Figtree, Inter or "Space Grotesk", font-weight is normal or bold, border-bottom is "<width> <colour>", keep is together or with-next.
- \\header{...} renders personal fields: ${Object.keys(PERSONAL_FIELDS).join(", ")}.
- \\section[kind]{...} for kind in ${SECTION_KINDS.join(", ")}, or * for custom sections. Inside, \\entries[style]{...} repeats per entry.
- Two columns: \\cols[widths="32,68", gap=20, left=styleName, right=styleName]{left column}{right column}. Each column holds \\header{...} and \\section[...]{...} blocks; with \\cols every \\section must be inside a column, and only a \\header written before \\cols spans the full width. A column style may set background (fills the column to the page edge and full page height), color, font properties, padding-left and padding-right; background works only on column styles. Lay it out like this:
\\cols[widths="32,68", gap=20, left=side]{
  \\header{
    \\p[contact]{\\v{email}}
  }
  \\section[skills]{
    \\p[sideheading]{\\sectiontitle}
    \\entries[entry]{
      \\p{\\list[sep=", "]{items}}
    }
  }
}{
  \\section[experience]{
    ...
  }
}
- Entry fields: ${Object.entries(ENTRY_FIELDS)
  .map(([k, f]) => `${k === "*" ? "custom" : k} (${Object.keys(f).join(", ")})`)
  .join("; ")}.
- Blocks: \\p[style]{inline}, \\block[style]{blocks}, \\row{left blocks}{right blocks}, \\hr[style], \\if{field}{then}{else}, \\each{listField}{...}.
- Inline: plain text, \\v{field} (options nolink, first, rest), \\sectiontitle, \\label{key} for ${Object.keys(LABELS).join(", ")}, \\range[sep=" – "]{date}, \\join[sep=" | "]{a}{b}..., \\list[sep=", "]{listField}, \\lines[prefix="• "]{listField}, \\span[style]{...}, \\if, \\each (use \\v{.} for the item).
- Every style class you use must be defined with \\style.`;

const GENERATE_RULES = `- Write a NEW template that follows the description. You may change the layout, styles, options and wording completely; the example template only shows the syntax.
- Show every section (education, experience, projects, awards, skills, and \\section[*] for custom sections) with the useful fields of each.
- Give it a new \\template id (lowercase letters, digits, dashes) and a short name.`;

/** Design guidance for new templates; each rule answers a mistake models made in testing. */
export const DESIGN_RULES = `Design rules:
- Every piece of text must stand out from what is behind it. The page is white, so text on it is dark. A full-width \\header written before \\cols is on the white page too.
- A column with a dark background needs light text: set a light color on the column style, and every style used inside that column must either set a light color or set no color at all (then it uses the column's). Never reuse a dark-text style inside a dark column; make separate styles for it (for example sideheading and heading).
- Sizes: name 18 to 26, section headings 10 to 14, body text 9 to 11, small details 8 to 9; nothing below 7.
- Page margins between 30 and 50. Use at most three colours besides black, white and greys, and make each of them an \\option so the user can change it.`;

/** Asks for a two-column layout, in English or Serbian. */
const WANTS_COLUMNS = /column|side ?bar|kolon|bo[čc]n/i;

/** The example a new design is shown: a two-column one when columns are asked for. */
function exampleFor(description: string, current: string): string {
  return WANTS_COLUMNS.test(description) && !/\\cols\b/.test(current) ? BUILTIN_TEMPLATES.sidebar : current;
}

function buildGeneratePrompt(description: string, example: string): string {
  return `You design a new resume template written in Resuma Markup.

${TEMPLATE_GUIDE}

Rules:
- Return the COMPLETE new template in a single \`\`\`rsm code block and nothing else.
${GENERATE_RULES}

${DESIGN_RULES}

Description: ${description.trim()}

Example template (for the syntax):
\`\`\`rsm
${exampleFor(description, example)}
\`\`\``;
}

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

/**
 * The original request again (each call is stateless: without it the model
 * would have lost the format guide and the instruction), then the previous
 * answer and what was wrong with it.
 */
function retryPrompt(original: string, previous: string, diagnostics: Diagnostic[]): string {
  const problems = diagnostics
    .filter((d) => d.severity === "error")
    .slice(0, 12)
    .map((d) => (d.line > 0 ? `- line ${d.line}, column ${d.col}: ${d.message}` : `- ${d.message}`))
    .join("\n");
  return `${original}

You already answered this once:
\`\`\`rsm
${previous}
\`\`\`

That answer could not be used because of these problems:
${problems}

Fix them and return the complete corrected source in a single \`\`\`rsm code block and nothing else. Write one command per line so every { has its matching }.`;
}

/** Pulls the .rsm source out of a model reply (code block, reasoning tags, chatter). */
export function extractSource(reply: string): string {
  // Windows console output can arrive as "\r\r\n"; normalise line endings first.
  const text = reply.replace(/\r+\n/g, "\n").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = [...text.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (fenced.length) return fenced.sort((a, b) => b.length - a.length)[0].replace(/\s+$/, "") + "\n";
  // No code block: start at the first command.
  const first = text.search(/\\[A-Za-z]/);
  return (first >= 0 ? text.slice(first) : text).replace(/\s+$/, "") + "\n";
}

const errorsOf = (diagnostics: Diagnostic[]) => diagnostics.filter((d) => d.severity === "error");

/** Errors in a reply, including whole blocks the model left out (a partial answer). */
export function sourceEditProblems(target: EditTarget, sent: string, reply: string): Diagnostic[] {
  if (target === "template") return errorsOf(compileTemplate(reply).diagnostics);
  const errors = errorsOf(parseContent(reply).diagnostics);
  if (errors.length) return errors;
  const present = new Set(topLevelBlocks(reply));
  const missing = topLevelBlocks(sent).filter((b) => !present.has(b));
  return missing.map((b) => ({
    severity: "error" as const,
    line: 1,
    col: 1,
    message: `Your answer left out \\${b.startsWith("custom:") ? `custom[id="${b.slice(7)}"]` : b}{...}. Return the complete document, including the parts you did not change.`,
  }));
}

const normalise = (s: string) => s.replace(/\r\n/g, "\n").trim();

/** Render problems the model is asked to fix (others are only shown to the user). */
const BLOCKING_RENDER: RenderIssue["kind"][] = ["offPage", "lowContrast"];

/** How a render problem is explained to the model in a retry. */
function describeIssue(issue: RenderIssue): string {
  switch (issue.kind) {
    case "missingSections":
      return `These sections render nothing: ${issue.values.join(", ")}. Add a \\section for each (\\section[*] for custom sections).`;
    case "offPage":
      return `${issue.count} pieces of text run off the page. Reduce widths, margins or padding.`;
    case "lowContrast": {
      const colours = (issue.pairs ?? []).map((p) => `text ${p.text} on background ${p.background}`).join("; ");
      const examples = issue.values.length ? `: ${issue.values.map((v) => `"${v}"`).join(", ")}` : "";
      return `Some text is hard to read against its background${examples}${
        colours ? ` (${colours})` : ""
      }. Find the styles that set those text colours in that place, or the column style whose background is behind them, and change the colours so text is dark on light backgrounds and light on dark ones.`;
    }
    case "tinyText":
      return `Some text is only ${issue.size} points; use at least 7.`;
    case "morePages":
      return `The resume now needs ${issue.after} pages instead of ${issue.before}.`;
  }
}

export async function runSourceEdit(opts: {
  target: EditTarget;
  instruction: string;
  source: string;
  jobDesc?: string;
  call: (prompt: string) => Promise<string>;
  maxAttempts?: number;
  /**
   * Templates only: write a new template from the instruction, using
   * `source` only as a syntax example. The result replaces the template.
   */
  generate?: boolean;
  /** Templates only: renders the candidate and reports problems (renderer/check). */
  check?: (template: string) => RenderIssue[];
}): Promise<EditResult> {
  const generate = opts.target === "template" && opts.generate === true;
  // A whole new design goes wrong in more ways than an edit; it gets one more try.
  const { target, instruction, source, jobDesc, call, maxAttempts = generate ? 3 : 2, check } = opts;

  // Content edits never send personal details (name, email, phone, links):
  // they are left out of the prompt and put back from the original.
  let sent = source;
  let personal: ResumeContent["personal"] | null = null;
  if (target === "content") {
    const original = parseContent(source).content;
    if (!original) {
      return { ok: false, reason: "invalid", diagnostics: errorsOf(parseContent(source).diagnostics), output: "", attempts: 0 };
    }
    personal = original.personal;
    sent = printContent(original, { omitPersonal: true });
  }
  const before = target === "content" ? printContent(parseContent(source).content!) : source;

  const original = generate ? buildGeneratePrompt(instruction, sent) : buildPrompt(target, instruction, sent, jobDesc);
  let prompt = original;
  let output = "";
  let diagnostics: Diagnostic[] = [];
  // A new template must cover every section; an edit may drop one on purpose.
  const blocking: RenderIssue["kind"][] = generate ? [...BLOCKING_RENDER, "missingSections"] : BLOCKING_RENDER;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const reply = await call(prompt);
    // Thinking that never ends means the context filled up before the answer;
    // anything "extracted" from such a reply is not an answer.
    if (/<think>/i.test(reply) && !/<\/think>/i.test(reply)) {
      return { ok: false, reason: "cutOff", diagnostics: [], output: reply.slice(-2000), attempts: attempt };
    }
    output = extractSource(reply);
    if (!output.trim()) return { ok: false, reason: "empty", diagnostics: [], output, attempts: attempt };
    diagnostics = sourceEditProblems(target, sent, output);
    if (!diagnostics.length) {
      let text = output;
      if (target === "content") {
        const reply = parseContent(output).content!;
        text = printContent({ ...reply, personal: personal! });
      }
      if (normalise(text) === normalise(before)) {
        return { ok: false, reason: "unchanged", diagnostics: [], output, attempts: attempt };
      }
      const issues = target === "template" && check ? check(text) : [];
      const toFix = issues.filter((i) => blocking.includes(i.kind));
      if (toFix.length && attempt < maxAttempts) {
        prompt = retryPrompt(
          original,
          output,
          toFix.map((i) => ({ severity: "error" as const, line: 0, col: 0, message: describeIssue(i) }))
        );
        continue;
      }
      const warnings: EditWarning[] =
        target === "content" ? contentWarnings(before, text) : generate ? [] : templateWarnings(before, text);
      warnings.push(...issues.map((issue) => ({ kind: "render" as const, issue })));
      return { ok: true, before, text, attempts: attempt, warnings };
    }
    prompt = retryPrompt(original, output, diagnostics);
  }
  return { ok: false, reason: "invalid", diagnostics, output, attempts: maxAttempts };
}

/** Template edits: flag sections the new template no longer renders. */
export function templateWarnings(before: string, after: string): EditWarning[] {
  const kinds = (s: string) => new Set(compileTemplate(s).template?.sections.map((x) => x.kind) ?? []);
  const a = kinds(before);
  const b = kinds(after);
  const dropped = [...a].filter((k) => !b.has(k)).map((k) => (k === "*" ? "custom sections" : k));
  return dropped.length ? [{ kind: "sectionsDropped", values: dropped }] : [];
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

  // Numbers in free text ("40%" → "70%", "2,000 customers") that weren't there before.
  // Standalone numbers only: "C1", "B2", "v2" or "Q3" are labels, not claims.
  const numbers = (s: string) => new Set(s.match(/(?<![A-Za-z\d])\d+(?:[.,]\d+)*%?(?![A-Za-z])/g) ?? []);
  const oldNumbers = numbers(beforeSource);
  const inNewDates = new Set(newDates.flatMap((d) => [...numbers(d)]));
  const newNumbers = [...numbers(afterSource)].filter((n) => !oldNumbers.has(n) && !inNewDates.has(n));
  if (newNumbers.length) warnings.push({ kind: "newNumbers", values: newNumbers });

  const p1 = before.personal as Record<string, unknown>;
  const p2 = after.personal as Record<string, unknown>;
  const changed = Object.keys({ ...p1, ...p2 }).filter((k) => (p1[k] ?? "") !== (p2[k] ?? ""));
  if (changed.length) warnings.push({ kind: "personalChanged", fields: changed });

  return warnings;
}
