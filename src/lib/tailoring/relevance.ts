/**
 * Which resume entries fit a job. One entry point, `judgeRelevance`, so the
 * method behind it (the chat model's yes/no, or a dedicated scoring model)
 * can change without touching the tailoring flow. Removing anything is only
 * ever a suggestion, and a few entries are never suggested at all.
 */
import type { ResumeContent } from "@/lib/resumesStore";
import type { EntrySection } from "@/lib/mcp/proposals";
import { AiRequest, isAiCancelled, startPrompt } from "@/lib/llmUtils";
import { t as translate, AppLanguage } from "@/lib/i18n";
import { LEAVE_OUT_BELOW, rerankScores, stopReranker } from "./reranker";

export type RelevanceItem = {
  section: EntrySection;
  index: number;
  entry: unknown;
  /** The entry as plain prose, which is what the models judge. */
  text: string;
  /** A short name for the entry ("Barista, Kafeterija"). */
  label: string;
};

export type Verdict = { item: RelevanceItem; keep: boolean; score?: number };

/** Sections tailoring looks at, in resume order. */
export const RELEVANCE_SECTIONS: EntrySection[] = ["experience", "education", "projects", "skills"];

const sentence = (s?: string) => {
  const v = (s ?? "").trim();
  return v ? (/[.!?…]$/.test(v) ? v : `${v}.`) : "";
};

/**
 * Every entry tailoring can judge, with its prose and label. The prose
 * follows the form the job-matching cut-off was measured on: "Experience:
 * Backend Developer at Nordlab (2022 – Present). …", "Project: …",
 * "Skills - Backend: …".
 */
export function relevanceItems(content: ResumeContent, language: AppLanguage): RelevanceItem[] {
  const t = (key: string, values: Record<string, string> = {}) =>
    translate(language, key).replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
  const dateRange = (d?: { from?: string; to?: string }) =>
    d?.from || d?.to ? ` (${[d?.from, d?.to?.trim() || (d?.from ? t("common.present") : "")].filter(Boolean).join(" – ")})` : "";
  const items: RelevanceItem[] = [];
  content.experience.forEach((e, index) => {
    const label = [e.jobTitle, e.company].filter(Boolean).join(", ");
    const role = e.jobTitle && e.company ? t("tailor.entryAt", { title: e.jobTitle, company: e.company }) : label;
    const text = [
      `${t("tailor.kind.experience")}: ${role}${dateRange(e.date)}.`,
      sentence(e.description),
      ...(e.notes ?? []).map(sentence),
    ]
      .filter(Boolean)
      .join(" ");
    items.push({ section: "experience", index, entry: e, text, label });
  });
  content.education.forEach((e, index) => {
    const label = [e.degree, e.school].filter(Boolean).join(", ");
    const courses = e.courses?.filter(Boolean).join(", ");
    const text = [`${t("tailor.kind.education")}: ${label}${dateRange(e.date)}.`, courses ? sentence(courses) : ""]
      .filter(Boolean)
      .join(" ");
    items.push({ section: "education", index, entry: e, text, label });
  });
  content.projects.forEach((p, index) => {
    const tech = p.technologies?.filter(Boolean).join(", ");
    const text = [`${t("tailor.kind.project")}: ${p.name}.`, sentence(p.description), tech ? sentence(tech) : ""]
      .filter(Boolean)
      .join(" ");
    items.push({ section: "projects", index, entry: p, text, label: p.name });
  });
  content.skills.forEach((s, index) => {
    const text = `${t("tailor.kind.skills")} - ${s.category}: ${s.items.filter(Boolean).join(", ")}.`;
    items.push({ section: "skills", index, entry: s, text, label: s.category });
  });
  return items.filter((i) => i.text.replace(/[^\p{L}\p{N}]/gu, "").length > 0);
}

/** The latest year in a date range; "present"-style end dates count as now. */
function endYear(d?: { from?: string; to?: string }): number {
  const years = (s?: string) => (s?.match(/\d{4}/g) ?? []).map(Number);
  const to = d?.to?.trim() ?? "";
  if (d?.from && (!to || !/\d{4}/.test(to))) return Number.MAX_SAFE_INTEGER;
  return Math.max(-1, ...years(d?.from), ...years(to));
}

/**
 * Entries never suggested for leaving out, however they score: the most
 * recent job (a gap there hurts more than a mismatch) and the only degree.
 */
export function protectedItems(content: ResumeContent): Set<string> {
  const keys = new Set<string>();
  if (content.experience.length) {
    let latest = 0;
    content.experience.forEach((e, i) => {
      if (endYear(e.date) > endYear(content.experience[latest].date)) latest = i;
    });
    keys.add(`experience:${latest}`);
  }
  if (content.education.length === 1) keys.add("education:0");
  return keys;
}

/**
 * The entries to suggest leaving out: judged irrelevant, not protected, and
 * never a whole section (its best-scoring entry stays).
 */
export function leaveOutCandidates(verdicts: Verdict[], content: ResumeContent): RelevanceItem[] {
  const keep = protectedItems(content);
  const out = verdicts.filter((v) => !v.keep && !keep.has(`${v.item.section}:${v.item.index}`));
  for (const section of RELEVANCE_SECTIONS) {
    const all = verdicts.filter((v) => v.item.section === section);
    const dropped = out.filter((v) => v.item.section === section);
    if (all.length > 0 && dropped.length === all.length) {
      const best = [...dropped].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      out.splice(out.indexOf(best), 1);
    }
  }
  return out.map((v) => v.item);
}

export type RelevanceControl = {
  onProgress: (done: number, total: number) => void;
  /** Called with each AI request, so stopping the job can stop it. */
  track: (request: AiRequest | null) => void;
  stopped: () => boolean;
};

// The chat model's own judgement. Thinking stays on: without it, small
// local models answer "yes" to everything.
function relevancePrompt(jobDesc: string, text: string): string {
  return `Job Description:
${jobDesc}

Entry:
${text}

Evaluate whether this entry is relevant to the job description based strictly on skills, tools, or tasks mentioned. Ignore dates, years of experience, and time-based requirements. For education entries, relevance means the field of study aligns with the job, even if courses don't match. For skill categories or groups, keep the entry if at least one item is even slightly relevant.

Respond ONLY with "yes" or "no" — no explanations, no formatting.

If the job description is empty or you're unsure, assume the entry IS relevant.`;
}

/** The model's answer; anything but a clear "no" keeps the entry. */
export function readYesNo(answer: string): boolean {
  return !/^\W*(no|ne)\b/i.test(answer.trim());
}

/** Stops after this many failed calls in a row: the provider is likely down. */
const MAX_FAILURES_IN_A_ROW = 2;

/** How entries are judged: the job-matching model (local AI only), or the chat model. */
export type RelevanceMethod = { kind: "reranker"; runtime: string } | { kind: "chat" };

/** Entries scored per job-matching request: small enough to stop quickly. */
const RERANK_BATCH = 4;

export async function judgeRelevance(
  items: RelevanceItem[],
  jobDesc: string,
  ctl: RelevanceControl,
  method: RelevanceMethod = { kind: "chat" }
): Promise<Verdict[]> {
  if (method.kind === "reranker") {
    const scored = await rerankRelevance(items, jobDesc, ctl, method.runtime);
    // If the model can't run (an old runtime, say), the chat model judges the rest.
    if (scored.length === items.length || ctl.stopped()) return scored;
    const rest = await chatRelevance(items.slice(scored.length), jobDesc, {
      ...ctl,
      onProgress: (done) => ctl.onProgress(scored.length + done, items.length),
    });
    return [...scored, ...rest];
  }
  return chatRelevance(items, jobDesc, ctl);
}

async function rerankRelevance(items: RelevanceItem[], jobDesc: string, ctl: RelevanceControl, runtime: string): Promise<Verdict[]> {
  const verdicts: Verdict[] = [];
  ctl.onProgress(0, items.length);
  try {
    for (let i = 0; i < items.length && !ctl.stopped(); i += RERANK_BATCH) {
      const batch = items.slice(i, i + RERANK_BATCH);
      const promise = rerankScores(runtime, jobDesc, batch.map((b) => b.text));
      ctl.track({ promise: promise.then(() => ""), cancel: () => void stopReranker() });
      try {
        const scores = await promise;
        batch.forEach((item, j) => verdicts.push({ item, keep: scores[j] >= LEAVE_OUT_BELOW, score: scores[j] }));
      } finally {
        ctl.track(null);
      }
      ctl.onProgress(verdicts.length, items.length);
    }
  } catch (error) {
    if (!ctl.stopped() && !isAiCancelled(error)) console.warn("[tailoring] job matching failed, asking the chat model:", error);
  } finally {
    // Free its memory before the chat model rewords entries.
    await stopReranker();
  }
  return verdicts;
}

async function chatRelevance(items: RelevanceItem[], jobDesc: string, ctl: RelevanceControl): Promise<Verdict[]> {
  const verdicts: Verdict[] = [];
  let failures = 0;
  ctl.onProgress(0, items.length);
  for (const item of items) {
    if (ctl.stopped()) break;
    const request = startPrompt(relevancePrompt(jobDesc, item.text));
    ctl.track(request);
    try {
      const keep = readYesNo(await request.promise);
      verdicts.push({ item, keep, score: keep ? 1 : 0 });
      failures = 0;
    } catch (error) {
      if (isAiCancelled(error)) break;
      if (++failures >= MAX_FAILURES_IN_A_ROW) throw error;
      // Unknown means keep.
      verdicts.push({ item, keep: true });
    } finally {
      ctl.track(null);
    }
    ctl.onProgress(verdicts.length, items.length);
  }
  return verdicts;
}
