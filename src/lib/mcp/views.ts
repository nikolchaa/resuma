/**
 * What a connected app sees of a resume, and how a text it proposes becomes
 * the next version of that resume. Shared by reading and proposing, so a
 * revision a client got from `get_resume` is exactly what a proposal is
 * checked against.
 */
import type { ResumeData } from "@/lib/resumesStore";
import { normalizeContent } from "@/lib/resumeMigration";
import { mergeParsedContent, parseContent, printContent } from "@/renderer/rsm/content";
import { BUILTIN_TEMPLATES, templateSourceFor } from "@/templates";

export type ResumePart = "content" | "template";

const lf = (s: string) => s.replace(/\r\n/g, "\n");

/** Short, stable fingerprint of a text (FNV-1a), so a later change can be detected. */
export function revisionOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The resume's template text: its own copy, or its built-in theme. */
export function templateText(data: ResumeData): string {
  return data.templateSource?.trim() ? lf(data.templateSource) : templateSourceFor(data.theme);
}

/**
 * The text a client gets for a part of a resume. Content leaves out
 * `\personal` unless `sharesPersonal`.
 */
export function resumeView(data: ResumeData, part: ResumePart, sharesPersonal: boolean): string {
  return part === "template"
    ? templateText(data)
    : printContent(normalizeContent(data.content), { omitPersonal: !sharesPersonal });
}

/** The full text of a part, personal details included (for the user's own review). */
export function fullText(data: ResumeData, part: ResumePart): string {
  return part === "template" ? templateText(data) : printContent(normalizeContent(data.content));
}

/**
 * The resume after applying a proposed text to a part. Content keeps fields
 * outside the format, and keeps the original personal details unless the
 * client was allowed to see (and so to change) them. A template that is
 * exactly a built-in one switches the resume to it instead of storing a copy.
 */
export function applyText(data: ResumeData, part: ResumePart, text: string, sharesPersonal: boolean): ResumeData {
  if (part === "template") {
    // Exactly a built-in template: switch to it instead of keeping a copy.
    const builtin = Object.entries(BUILTIN_TEMPLATES).find(([, source]) => source === lf(text))?.[0];
    if (builtin) return { ...data, theme: builtin, templateSource: undefined };
    return { ...data, templateSource: lf(text) };
  }
  const parsed = parseContent(text).content;
  if (!parsed) throw new Error("The content isn't valid Resuma Markup.");
  if (!sharesPersonal) parsed.personal = data.content.personal;
  return { ...data, content: normalizeContent(mergeParsedContent(data.content, parsed)) };
}
