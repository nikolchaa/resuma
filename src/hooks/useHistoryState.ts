import { SetStateAction, useCallback, useRef, useState } from "react";

/** Edits closer together than this are merged into one undo step (typing). */
export const COALESCE_MS = 600;
const MAX_STEPS = 200;

type History<T> = { past: T[]; present: T | null; future: T[] };

export type HistoryState<T> = {
  value: T | null;
  /** Like a useState setter; records undo history. */
  set: (action: SetStateAction<T | null>, opts?: { checkpoint?: boolean }) => void;
  /** Replaces the current value without recording a step (e.g. after saving). */
  replace: (value: T | null) => void;
  /** Starts a fresh history (e.g. when a resume is loaded). */
  reset: (value: T | null) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export function applyEdit<T>(h: History<T>, next: T | null, coalesce: boolean): History<T> {
  if (next === h.present) return h;
  if (h.present === null) return { past: [], present: next, future: [] };
  return {
    past: coalesce && h.past.length ? h.past : [...h.past, h.present].slice(-MAX_STEPS),
    present: next,
    future: [],
  };
}

export function applyUndo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present as T, ...h.future] };
}

export function applyRedo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present as T], present: h.future[0], future: h.future.slice(1) };
}

/**
 * State with undo/redo. Consecutive edits within COALESCE_MS become one
 * step; a `checkpoint` edit (e.g. an AI change) always gets its own step.
 */
export function useHistoryState<T>(initial: T | null = null): HistoryState<T> {
  const [h, setH] = useState<History<T>>({ past: [], present: initial, future: [] });
  const lastEdit = useRef(0);

  const set = useCallback((action: SetStateAction<T | null>, opts?: { checkpoint?: boolean }) => {
    const now = Date.now();
    const coalesce = !opts?.checkpoint && now - lastEdit.current < COALESCE_MS;
    lastEdit.current = opts?.checkpoint ? 0 : now;
    setH((prev) => {
      const next = typeof action === "function" ? (action as (p: T | null) => T | null)(prev.present) : action;
      return applyEdit(prev, next, coalesce);
    });
  }, []);

  const replace = useCallback((value: T | null) => setH((prev) => ({ ...prev, present: value })), []);
  const reset = useCallback((value: T | null) => {
    lastEdit.current = 0;
    setH({ past: [], present: value, future: [] });
  }, []);
  const undo = useCallback(() => {
    lastEdit.current = 0;
    setH(applyUndo);
  }, []);
  const redo = useCallback(() => {
    lastEdit.current = 0;
    setH(applyRedo);
  }, []);

  return {
    value: h.present,
    set,
    replace,
    reset,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
