/**
 * What connected AI apps did in this session: which app called which tool on
 * which resume or template, and when. Never the content. Shown in Settings.
 */
import { windowSingleton } from "@/lib/singleton";

export type Activity = { at: string; client: string; tool: string; target?: string };

const KEEP = 50;
const log = windowSingleton("mcpActivity", () => ({ entries: [] as Activity[], listeners: new Set<() => void>() }));

export function recordActivity(entry: Omit<Activity, "at">) {
  log.entries = [...log.entries, { ...entry, at: new Date().toISOString() }].slice(-KEEP);
  log.listeners.forEach((l) => l());
}

export function getActivity(): Activity[] {
  return log.entries;
}

export function onActivity(listener: () => void): () => void {
  log.listeners.add(listener);
  return () => log.listeners.delete(listener);
}
