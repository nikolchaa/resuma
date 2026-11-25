/**
 * Rewording one entry for a job. Only the free text changes (description
 * and bullet points); employer, title, dates and the rest are copied from
 * the original, whatever the model returns. Replies that copy the job ad,
 * lose most of the text, or talk about the entry instead of rewording it
 * are refused.
 */
import type { ResumeContent } from "@/lib/resumesStore";

type Experience = ResumeContent["experience"][number];
type Project = ResumeContent["projects"][number];

const RULES = `Rules:
- Keep every fact as it is. Don't add employers, tools, numbers, dates or achievements that aren't in the entry.
- Never copy the job ad into the entry. Use its wording only where it truthfully describes what the entry already says.
- Keep the description about as long as it is now.
- Write in the same language as the entry.
- If the entry already fits the job, return it unchanged.`;

const jobAd = (jobDesc: string) => `The job ad, for context only:
"""
${jobDesc}
"""`;

export function experiencePrompt(jobDesc: string, e: Experience): string {
  const notes = (e.notes ?? []).filter((n) => n.trim());
  const shape = notes.length
    ? `{"description": "<the description, reworded>", "notes": [${notes.map((_, i) => `"<bullet point ${i + 1}, reworded>"`).join(", ")}]}`
    : `{"description": "<the description, reworded>", "notes": []}`;
  return `You are editing one entry of a resume so that it fits a job ad.

${jobAd(jobDesc)}

The entry:
Job title: ${e.jobTitle || "(none)"}
Employer: ${e.company || "(none)"}
Description: ${e.description || "(none)"}
Bullet points:
${notes.length ? notes.map((n) => `- ${n}`).join("\n") : "(none)"}

Reword the entry's description and each of its bullet points so they speak to this job.
${RULES}
- Return exactly ${notes.length} bullet point${notes.length === 1 ? "" : "s"}, one for each of the originals, in the same order.

Reply with JSON only, no code block, in this shape: ${shape}`;
}

export function projectPrompt(jobDesc: string, p: Project): string {
  return `You are editing one project on a resume so that it fits a job ad.

${jobAd(jobDesc)}

The project:
Name: ${p.name}
Description: ${p.description || "(none)"}
Technologies: ${(p.technologies ?? []).join(", ") || "(none)"}

Reword the project's description so it speaks to this job.
${RULES}

Reply with JSON only, no code block, in this shape: {"description": "<the description, reworded>"}`;
}

/** The first JSON object in a reply, tolerating code fences and stray text. */
function firstObject(reply: string): Record<string, unknown> | null {
  const text = reply.replace(/```(?:json)?/gi, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

const words = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Runs of this many words taken from the job ad mean it was copied. */
const COPIED_RUN = 10;

/** Whether `text` holds a long run of words from `jobDesc` that `original` didn't have. */
export function copiesJobAd(text: string, jobDesc: string, original: string): boolean {
  const run = (list: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i + COPIED_RUN <= list.length; i++) out.add(list.slice(i, i + COPIED_RUN).join(" "));
    return out;
  };
  const ad = run(words(jobDesc));
  const had = run(words(original));
  for (const r of run(words(text))) if (ad.has(r) && !had.has(r)) return true;
  return false;
}

/**
 * A reworded description that's usable: not a copy of the job ad, not far
 * longer (pasted text) and not far shorter (lost content) than the original.
 */
function usableDescription(next: string, original: string, jobDesc: string): boolean {
  if (!next) return false;
  if (copiesJobAd(next, jobDesc, original) || ECHO.test(next) || switchedLanguage(next, original)) return false;
  if (!original.trim()) return next.length <= 400;
  return next.length <= Math.max(original.length * 2.5, original.length + 250) && next.length >= original.length * 0.4;
}

// Bullet points that talk about the entry or the job instead of rewording it.
const COMMENTARY = /\b(the entry|this entry|bullet points?|job (description|ad)|the resume|already (aligns?|fits?|includes?|matches?))\b/i;

// The prompt's own labels, repeated back instead of a rewording.
const ECHO = /\b(job title|employer|description|bullet points?|technologies)\s*:/i;

// Short, common words that tell English from Serbian (Latin script).
const ENGLISH = new Set(["the", "and", "of", "to", "in", "for", "with", "on", "by", "from", "as", "at", "an", "a", "using"]);
const SERBIAN = new Set(["i", "u", "za", "na", "sa", "je", "se", "od", "do", "kao", "koji", "koja", "što", "su", "iz", "po", "kod", "uz"]);

function leaning(text: string): number {
  let score = 0;
  for (const w of words(text)) score += (SERBIAN.has(w) ? 1 : 0) - (ENGLISH.has(w) ? 1 : 0);
  return score;
}

/** Whether a Serbian original came back in English, or the other way round. */
export function switchedLanguage(next: string, original: string): boolean {
  const before = leaning(original);
  const after = leaning(next);
  return (before >= 2 && after < 0) || (before <= -2 && after > 0);
}

const termsIn = (text: string) =>
  text
    .split(/(?<=[.!?;:])\s+|\n+/)
    .flatMap((sentence) =>
      (sentence.match(/[\p{L}\p{N}][\p{L}\p{N}+#.-]*[\p{L}\p{N}+#]|\p{L}/gu) ?? []).filter(
        (token, i) =>
          /^[\p{Lu}\d]{2,}$/u.test(token) || // REST, AWS, S3
          /\p{Ll}\p{Lu}/u.test(token) || // PostgreSQL, TypeScript
          /\p{L}[.+#]|\+\+|#$/u.test(token) || // Node.js, C++, C#
          (i > 0 && /^\p{Lu}\p{Ll}/u.test(token)) // Kubernetes, mid-sentence
      )
    );

/**
 * Tools and names the reworded text mentions that the original didn't:
 * what a reviewer should check before accepting it ("REST", "Kubernetes").
 */
export function newTerms(next: string, original: string): string[] {
  const had = original.toLowerCase();
  const seen = new Set<string>();
  for (const term of termsIn(next)) {
    const lower = term.toLowerCase();
    if (had.includes(lower) || had.includes(lower.replace(/s$/, ""))) continue;
    seen.add(term);
  }
  return [...seen];
}

/** An entry's free text, for comparing a rewording with the original. */
export const entryText = (e: { description?: string; notes?: string[] }) =>
  [e.description ?? "", ...(e.notes ?? [])].join("\n");

/**
 * The entry with the model's wording, or null when the reply isn't usable.
 * Bullet points are taken only when there is one for each original and
 * none of them is commentary or copied from the job ad.
 */
export function applyExperienceReply(e: Experience, reply: string, jobDesc = ""): Experience | null {
  const obj = firstObject(reply);
  if (!obj) return null;
  const description = clean(obj.description);
  const original = (e.notes ?? []).filter((n) => n.trim());
  const notes = Array.isArray(obj.notes) ? obj.notes.map(clean).filter(Boolean) : [];
  const notesOk =
    notes.length === original.length &&
    notes.every(
      (n, i) =>
        !COMMENTARY.test(n) &&
        !ECHO.test(n) &&
        !copiesJobAd(n, jobDesc, original[i]) &&
        !switchedLanguage(n, original[i]) &&
        n.length <= Math.max(original[i].length * 3, 200)
    );
  const descriptionOk = usableDescription(description, e.description ?? "", jobDesc);
  if (!descriptionOk && !notesOk) return null;
  return {
    ...e,
    description: descriptionOk ? description : e.description,
    notes: notesOk ? notes : e.notes,
  };
}

export function applyProjectReply(p: Project, reply: string, jobDesc = ""): Project | null {
  const obj = firstObject(reply);
  if (!obj) return null;
  const description = clean(obj.description);
  return usableDescription(description, p.description ?? "", jobDesc) ? { ...p, description } : null;
}

/**
 * The model's size in billions of parameters, read from its name ("Qwen3
 * 0.6B", "Llama-3.2-3B-Instruct"), or null when the name doesn't say.
 */
export function modelBillions(model: string | undefined): number | null {
  const m = model?.match(/(?:^|[^\d.])(\d+(?:[._]\d+)?)\s*b(?![a-z])/i);
  return m ? parseFloat(m[1].replace("_", ".")) : null;
}

/**
 * Models below this size reword unreliably: tested, Qwen3 0.6B pasted the
 * job ad into the entry with and without thinking. Their tailoring keeps
 * to suggesting what to leave out.
 */
export const MIN_REWRITE_BILLIONS = 3;
