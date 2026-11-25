/**
 * Rewording one entry for a job. Only the free text changes (description
 * and bullet points); employer, title, dates and the rest are copied from
 * the original, whatever the model returns.
 */
import type { ResumeContent } from "@/lib/resumesStore";

type Experience = ResumeContent["experience"][number];
type Project = ResumeContent["projects"][number];

const RULES = `Rules:
- Keep every fact as it is. Don't add employers, tools, numbers, dates or achievements that aren't in the entry.
- Use the job's wording only where it truthfully describes what the entry already says.
- Write in the same language as the entry.
- Keep it concise and professional.
- If the entry already fits the job, return it unchanged.`;

export function experiencePrompt(jobDesc: string, e: Experience): string {
  const notes = (e.notes ?? []).filter((n) => n.trim());
  return `Job description:
${jobDesc}

Resume entry: ${[e.jobTitle, e.company].filter(Boolean).join(", ")}
Description: ${e.description || "(none)"}
Bullet points:
${notes.length ? notes.map((n) => `- ${n}`).join("\n") : "(none)"}

Rewrite the description and the bullet points so they speak to this job.
${RULES}
- Return exactly ${notes.length} bullet point${notes.length === 1 ? "" : "s"}, one for each of the originals, in the same order.

Reply with JSON only, no code block: {"description": "...", "notes": [${notes.length ? '"..."' : ""}]}`;
}

export function projectPrompt(jobDesc: string, p: Project): string {
  return `Job description:
${jobDesc}

Project: ${p.name}
Description: ${p.description || "(none)"}
Technologies: ${(p.technologies ?? []).join(", ") || "(none)"}

Rewrite the project description so it speaks to this job.
${RULES}

Reply with JSON only, no code block: {"description": "..."}`;
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

/**
 * The entry with the model's wording, or null when the reply isn't usable.
 * Bullet points are taken only when there is one for each original, so a
 * reply can't silently drop any.
 */
export function applyExperienceReply(e: Experience, reply: string): Experience | null {
  const obj = firstObject(reply);
  if (!obj) return null;
  const description = clean(obj.description) || e.description;
  const original = (e.notes ?? []).filter((n) => n.trim());
  const notes = Array.isArray(obj.notes) ? obj.notes.map(clean).filter(Boolean) : [];
  return {
    ...e,
    description,
    notes: notes.length === original.length ? notes : e.notes,
  };
}

export function applyProjectReply(p: Project, reply: string): Project | null {
  const obj = firstObject(reply);
  if (!obj) return null;
  const description = clean(obj.description);
  return description ? { ...p, description } : null;
}
