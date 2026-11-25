/**
 * Tailoring a resume to a job, in the background. The resume is never
 * changed here: what comes out are suggestions (see mcp/proposals.ts) the
 * user applies, discards or undoes, one entry at a time. A job keeps
 * running while the user edits or moves between screens, and can be
 * stopped at any point; suggestions made before that are kept.
 */
import { useSyncExternalStore } from "react";
import { appProposals, currentResume } from "@/lib/mcp/app";
import type { EntryChange } from "@/lib/mcp/proposals";
import { AiRequest, isAiCancelled, startPrompt } from "@/lib/llmUtils";
import { getSection } from "@/lib/store";
import type { SettingsType } from "@/contexts/OnboardingContext";
import { normalizeLanguage, t as translate, AppLanguage } from "@/lib/i18n";
import { windowSingleton } from "@/lib/singleton";
import { showError, showSuccess, showWarning } from "@/lib/toastUtils";
import { judgeRelevance, leaveOutCandidates, relevanceItems } from "./relevance";
import { applyExperienceReply, applyProjectReply, experiencePrompt, projectPrompt } from "./rewrite";

export type TailorState = {
  resumeId: string;
  phase: "scoring" | "rewriting";
  done: number;
  total: number;
};

type Job = { state: TailorState; stopped: boolean; request: AiRequest | null };

const jobs = windowSingleton("tailoringJobs", () => ({
  running: new Map<string, Job>(),
  listeners: new Set<() => void>(),
  // A new object on every change, for useSyncExternalStore.
  snapshot: new Map<string, TailorState>(),
}));

function changed() {
  jobs.snapshot = new Map([...jobs.running].map(([id, job]) => [id, { ...job.state }]));
  jobs.listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  jobs.listeners.add(listener);
  return () => jobs.listeners.delete(listener);
}

/** The running job for a resume, if any. */
export function useTailoring(resumeId: string | undefined): TailorState | undefined {
  const all = useSyncExternalStore(subscribe, () => jobs.snapshot);
  return resumeId ? all.get(resumeId) : undefined;
}

export const isTailoring = (resumeId: string) => jobs.running.has(resumeId);

/** Stops a resume's job; it ends after cleaning up and says so. */
export function stopTailoring(resumeId: string) {
  const job = jobs.running.get(resumeId);
  if (!job) return;
  job.stopped = true;
  job.request?.cancel();
}

/**
 * Sections whose entries are reworded. Rewording comes after the relevance
 * check, so entries suggested for leaving out aren't reworded as well.
 */
const REWRITE_SECTIONS = ["experience", "projects"] as const;

/** Rewording is a short, mechanical task: local models skip their thinking for it. */
const REWRITE_NO_THINK = true;

/**
 * Starts tailoring a resume to a job. Returns false when one is already
 * running for it.
 */
export function startTailoring(resumeId: string, jobDesc: string): boolean {
  if (jobs.running.has(resumeId) || !jobDesc.trim()) return false;
  const job: Job = { state: { resumeId, phase: "scoring", done: 0, total: 0 }, stopped: false, request: null };
  jobs.running.set(resumeId, job);
  changed();
  void run(job, jobDesc.trim()).finally(() => {
    jobs.running.delete(resumeId);
    changed();
  });
  return true;
}

async function run(job: Job, jobDesc: string) {
  const app = await getSection<SettingsType["app"]>("app").catch(() => undefined);
  const lang: AppLanguage = normalizeLanguage(app?.language);
  const t = (key: string, values: Record<string, string | number> = {}) =>
    translate(lang, key).replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
  const client = t("tailor.client");
  const { resumeId } = job.state;
  let suggestions = 0;

  const progress = (phase: TailorState["phase"], done: number, total: number) => {
    job.state = { resumeId, phase, done, total };
    changed();
  };

  try {
    const data = await currentResume(resumeId);
    if (!data) return;
    const content = data.content;

    // 1. Which entries fit the job.
    const items = relevanceItems(content, lang);
    const verdicts = await judgeRelevance(items, jobDesc, {
      onProgress: (done, total) => progress("scoring", done, total),
      track: (r) => (job.request = r),
      stopped: () => job.stopped,
    });
    if (job.stopped) return;

    const leaveOut = leaveOutCandidates(verdicts, content);
    if (leaveOut.length) {
      const r = await appProposals.proposeEntries({
        client,
        resumeId,
        origin: "app",
        dropRemovalWarning: true,
        changes: leaveOut.map((i): EntryChange => ({ section: i.section, before: i.entry })),
        labels: leaveOut.map((i) => i.label),
        summary: leaveOut.length === 1 ? t("tailor.leaveOutOne") : t("tailor.leaveOutMany", { n: leaveOut.length }),
      });
      if (r.ok) suggestions++;
    }

    // 2. New wording for the entries that stay.
    const left = new Set(leaveOut.map((i) => `${i.section}:${i.index}`));
    const targets = REWRITE_SECTIONS.flatMap((section) =>
      (content[section] as unknown[]).map((entry, index) => ({ section, index, entry })).filter((x) => !left.has(`${x.section}:${x.index}`))
    );
    let failures = 0;
    for (const [n, target] of targets.entries()) {
      if (job.stopped) return;
      progress("rewriting", n, targets.length);
      const label =
        target.section === "experience"
          ? [content.experience[target.index].jobTitle, content.experience[target.index].company].filter(Boolean).join(", ")
          : content.projects[target.index].name;
      const prompt =
        target.section === "experience"
          ? experiencePrompt(jobDesc, content.experience[target.index])
          : projectPrompt(jobDesc, content.projects[target.index]);
      const request = startPrompt(prompt, { noThink: REWRITE_NO_THINK });
      job.request = request;
      let reply: string;
      try {
        reply = await request.promise;
        failures = 0;
      } catch (error) {
        if (isAiCancelled(error)) return;
        if (++failures >= 2) throw error;
        showWarning(t("tailor.entryFailed", { entry: label }));
        continue;
      } finally {
        job.request = null;
      }
      const after =
        target.section === "experience"
          ? applyExperienceReply(content.experience[target.index], reply)
          : applyProjectReply(content.projects[target.index], reply);
      if (!after) {
        showWarning(t("tailor.entryFailed", { entry: label }));
        continue;
      }
      // Unchanged and stale results (the user edited the entry meanwhile) just don't become suggestions.
      const r = await appProposals.proposeEntries({
        client,
        resumeId,
        origin: "app",
        changes: [{ section: target.section, before: target.entry, after }],
        summary: t("tailor.rewrite", { entry: label }),
      });
      if (r.ok) suggestions++;
    }
    progress("rewriting", targets.length, targets.length);
  } catch (error) {
    if (!isAiCancelled(error)) {
      showError(t("tailor.failed"), String((error as Error)?.message ?? error));
      return;
    }
  } finally {
    if (job.stopped) {
      showWarning(t("tailor.stopped"), t("tailor.stoppedDesc"));
    }
  }
  if (job.stopped) return;
  showSuccess(
    t("tailor.done"),
    suggestions === 0 ? t("tailor.doneNone") : suggestions === 1 ? t("tailor.doneOne") : t("tailor.doneMany", { n: suggestions })
  );
}
