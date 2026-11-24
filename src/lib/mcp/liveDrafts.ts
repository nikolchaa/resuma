/**
 * Resumes open in the editor. While a resume is open, connected apps read and
 * change its live draft (what the user sees, saved or not) instead of the
 * file, and changes land in the editor's history as one undo step.
 */
import type { ResumeData } from "@/lib/resumesStore";
import { windowSingleton } from "@/lib/singleton";

export type LiveDraft = {
  get: () => ResumeData | null;
  /** Replaces the draft as one undo step. */
  update: (next: ResumeData) => void;
};

const open = windowSingleton("liveDrafts", () => new Map<string, LiveDraft>());
const listeners = windowSingleton("liveDraftListeners", () => new Set<() => void>());

export function registerLiveDraft(id: string, draft: LiveDraft): () => void {
  open.set(id, draft);
  listeners.forEach((l) => l());
  return () => {
    if (open.get(id) === draft) open.delete(id);
    listeners.forEach((l) => l());
  };
}

export function getLiveDraft(id: string): LiveDraft | undefined {
  return open.get(id);
}

/** Ids of the resumes open in an editor right now. */
export function openResumeIds(): string[] {
  return [...open.keys()];
}

export function onLiveDrafts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
