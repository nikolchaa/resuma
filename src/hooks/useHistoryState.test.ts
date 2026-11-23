import { describe, expect, it } from "vitest";
import { applyEdit, applyRedo, applyUndo } from "./useHistoryState";

const start = { past: [] as string[], present: "a" as string | null, future: [] as string[] };

describe("history", () => {
  it("records steps and undoes/redoes them", () => {
    let h = applyEdit(start, "b", false);
    h = applyEdit(h, "c", false);
    expect(h).toEqual({ past: ["a", "b"], present: "c", future: [] });
    h = applyUndo(h);
    expect(h.present).toBe("b");
    h = applyUndo(h);
    expect(h.present).toBe("a");
    expect(applyUndo(h)).toBe(h); // nothing left
    h = applyRedo(h);
    expect(h).toEqual({ past: ["a"], present: "b", future: ["c"] });
  });

  it("coalesces rapid edits into one step", () => {
    let h = applyEdit(start, "ab", false);
    h = applyEdit(h, "abc", true);
    h = applyEdit(h, "abcd", true);
    expect(h).toEqual({ past: ["a"], present: "abcd", future: [] });
    expect(applyUndo(h).present).toBe("a");
  });

  it("a new edit clears the redo stack", () => {
    let h = applyEdit(start, "b", false);
    h = applyUndo(h);
    h = applyEdit(h, "x", false);
    expect(h).toEqual({ past: ["a"], present: "x", future: [] });
  });

  it("ignores no-op edits and the initial load", () => {
    expect(applyEdit(start, "a", false)).toBe(start);
    const empty = { past: [], present: null, future: [] };
    expect(applyEdit(empty, "loaded", false)).toEqual({ past: [], present: "loaded", future: [] });
  });
});
