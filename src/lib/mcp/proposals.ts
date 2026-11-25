/**
 * Changes other AI apps propose. Nothing a connected app sends changes a
 * resume or the template library directly: it becomes a proposal the user
 * applies or discards (or, if they opted in, one applied automatically when
 * it raised no warnings). Proposals live for the app session.
 */
import type { ResumeData } from "@/lib/resumesStore";
import type { LibraryTemplate } from "@/lib/templateLibrary";
import { contentWarnings, EditWarning, sourceEditProblems, templateWarnings } from "@/lib/aiSourceEdit";
import type { Diagnostic } from "@/renderer/rsm/parse";
import type { RenderIssue } from "@/renderer/check";
import { compileTemplate } from "@/renderer/template/template";
import { topLevelBlocks } from "@/renderer/rsm/content";
import { applyText, fullText, resumeView, ResumePart, revisionOf } from "./views";

export type ProposalWarning =
  | EditWarning
  | { kind: "replacesTemplate"; name: string }
  /** Top-level parts of the content the proposal leaves out (they're removed). */
  | { kind: "partsRemoved"; values: string[] };

export type ProposalStatus = "pending" | "applied" | "discarded" | "stale" | "undone";

export type ProposalTarget =
  | { kind: "resume"; resumeId: string; part: ResumePart; /** The resume's title when proposed. */ title: string }
  | { kind: "template"; name: string; libraryId: string };

/** Content sections whose entries an entry-level proposal can change. */
export type EntrySection = "education" | "experience" | "projects" | "skills" | "awards";

/**
 * One entry an entry-level proposal changes: `before` as it is in the
 * resume, and `after` to replace it, or no `after` to remove it.
 */
export type EntryChange = { section: EntrySection; before: unknown; after?: unknown };

export type Proposal = {
  id: string;
  /** The connected app's name, as it introduced itself. */
  client: string;
  /**
   * "app": made by Resuma itself (job tailoring). Never applied
   * automatically, and announced by its own job rather than one toast each.
   */
  origin?: "app";
  /**
   * Entry-level changes. Unlike a text proposal, these apply (and undo)
   * whenever their entries are still as proposed, so several can be
   * applied in any order.
   */
  entries?: EntryChange[];
  /** Short labels of the entries changed, for the card ("Barista, Kafeterija"). */
  labels?: string[];
  summary: string;
  createdAt: string;
  target: ProposalTarget;
  /** The proposed text. */
  source: string;
  /** Revision of what the client read (resume proposals). */
  baseRevision?: string;
  /** Full texts before and after, for the user's review. */
  before: string;
  after: string;
  warnings: ProposalWarning[];
  status: ProposalStatus;
  autoApplied?: boolean;
  /** Why it's stale, or why undo/apply failed. */
  message?: string;
  undo?: {
    resume?: ResumeData;
    afterRevision?: string;
    template?: string | null;
    /** Entry-level: where each change landed, to put the entries back. */
    entries?: { section: EntrySection; index: number; before: unknown; after?: unknown }[];
  };
};

export type ProposalIO = {
  /** The resume as the user sees it: the open editor's draft, else the saved file. */
  loadResume: (id: string) => Promise<ResumeData | null>;
  /** Writes a resume: into the open editor as one undo step, else to its file. */
  writeResume: (id: string, next: ResumeData) => Promise<void>;
  sharesPersonal: (id: string) => Promise<boolean>;
  checkTemplate: (source: string, resume: ResumeData | null) => Promise<RenderIssue[]>;
  library: {
    get: (id: string) => Promise<LibraryTemplate | undefined>;
    save: (name: string, source: string) => Promise<LibraryTemplate>;
    remove: (id: string) => Promise<void>;
    idFor: (name: string) => string;
  };
  autoApply: () => Promise<boolean>;
  now: () => string;
  newId: () => string;
};

export type ProposeResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; reason: "notFound" | "stale" | "invalid" | "unchanged"; message: string; diagnostics?: Diagnostic[] };

const KEEP = 50;

/**
 * Puts entries back as they were before an applied entry-level proposal:
 * rewritten ones must still read as rewritten, removed ones return to
 * their old place (or the end, if the section got shorter). Null when a
 * rewritten entry was edited since.
 */
function withoutEntryChanges(
  data: ResumeData,
  landed: NonNullable<NonNullable<Proposal["undo"]>["entries"]>
): ResumeData | null {
  const next = structuredClone(data);
  const bySection = new Map<EntrySection, typeof landed>();
  for (const l of landed) bySection.set(l.section, [...(bySection.get(l.section) ?? []), l]);
  for (const [section, list] of bySection) {
    const entries = [...sectionOf(next, section)];
    const used = new Set<number>();
    for (const l of list.filter((l) => l.after !== undefined)) {
      const i = entries.findIndex((e, idx) => !used.has(idx) && sameEntry(e, l.after));
      if (i === -1) return null;
      used.add(i);
      entries[i] = structuredClone(l.before);
    }
    for (const l of list.filter((l) => l.after === undefined).sort((a, b) => a.index - b.index)) {
      entries.splice(Math.min(l.index, entries.length), 0, structuredClone(l.before));
    }
    (next.content as unknown as Record<string, unknown>)[section] = entries;
  }
  return next;
}

/** Top-level blocks (sections, custom sections, layout) of `before` that `after` doesn't have. */
function missingParts(before: string, after: string): string[] {
  const present = new Set(topLevelBlocks(after));
  return topLevelBlocks(before).filter((b) => !present.has(b));
}

/** JSON with sorted keys, so two entries compare equal whatever their key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v
  );
}

const sameEntry = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

function sectionOf(data: ResumeData, section: EntrySection): unknown[] {
  const list = (data.content as unknown as Record<string, unknown>)[section];
  return Array.isArray(list) ? list : [];
}

/**
 * `data` with entry-level changes made, or null when an entry they change
 * isn't in the resume (any more). Each change finds its own entry, so
 * changes made earlier by other proposals don't get in the way.
 */
function withEntryChanges(
  data: ResumeData,
  changes: EntryChange[]
): { next: ResumeData; landed: NonNullable<Proposal["undo"]>["entries"] } | null {
  const next = structuredClone(data);
  const landed: NonNullable<Proposal["undo"]>["entries"] = [];
  const bySection = new Map<EntrySection, EntryChange[]>();
  for (const c of changes) bySection.set(c.section, [...(bySection.get(c.section) ?? []), c]);
  for (const [section, list] of bySection) {
    const entries = sectionOf(next, section);
    const used = new Set<number>();
    const plan = new Map<number, EntryChange>();
    for (const c of list) {
      const i = entries.findIndex((e, idx) => !used.has(idx) && sameEntry(e, c.before));
      if (i === -1) return null;
      used.add(i);
      plan.set(i, c);
      landed!.push({ section, index: i, before: c.before, after: c.after });
    }
    const out: unknown[] = [];
    entries.forEach((e, i) => {
      const c = plan.get(i);
      if (!c) out.push(e);
      else if (c.after !== undefined) out.push(structuredClone(c.after));
    });
    (next.content as unknown as Record<string, unknown>)[section] = out;
  }
  return { next, landed };
}

export class ProposalStore {
  private proposals: Proposal[] = [];
  private listeners = new Set<() => void>();

  constructor(private readonly io: ProposalIO) {}

  list(): Proposal[] {
    return this.proposals;
  }

  get(id: string): Proposal | undefined {
    return this.proposals.find((p) => p.id === id);
  }

  pending(): Proposal[] {
    return this.proposals.filter((p) => p.status === "pending");
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    // Keep every pending proposal and the most recent others.
    const settled = this.proposals.filter((p) => p.status !== "pending");
    if (settled.length > KEEP) {
      const drop = new Set(settled.slice(0, settled.length - KEEP).map((p) => p.id));
      this.proposals = this.proposals.filter((p) => !drop.has(p.id));
    }
    this.proposals = [...this.proposals];
    this.listeners.forEach((l) => l());
  }

  private update(id: string, patch: Partial<Proposal>): Proposal {
    this.proposals = this.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p));
    this.changed();
    return this.get(id)!;
  }

  private async add(proposal: Proposal): Promise<Proposal> {
    this.proposals = [...this.proposals, proposal];
    this.changed();
    // Opt-in: changes with no warnings at all are applied at once. The
    // setting is for connected apps; Resuma's own suggestions always wait.
    if (proposal.origin !== "app" && proposal.warnings.length === 0 && (await this.io.autoApply())) {
      const applied = await this.apply(proposal.id);
      return applied.status === "applied" ? this.update(proposal.id, { autoApplied: true }) : applied;
    }
    return proposal;
  }

  // ---- proposing --------------------------------------------------------------

  async proposeResume(input: {
    client: string;
    resumeId: string;
    part: ResumePart;
    source: string;
    baseRevision: string;
    summary: string;
  }): Promise<ProposeResult> {
    const { resumeId, part, source } = input;
    const data = await this.io.loadResume(resumeId);
    if (!data) return { ok: false, reason: "notFound", message: `No resume with id "${resumeId}".` };
    const shares = await this.io.sharesPersonal(resumeId);
    const view = resumeView(data, part, shares);
    if (revisionOf(view) !== input.baseRevision) {
      return {
        ok: false,
        reason: "stale",
        message: "The resume changed since you read it. Read it again with get_resume and base the change on that.",
      };
    }
    // Same checks as the in-app AI: valid markup, and no section left out.
    // Markup errors refuse the proposal. Unlike the in-app AI (where a missing
    // part means a cut-off reply), a connected app may leave a part out on
    // purpose: that becomes a warning the user reviews, and it is never
    // applied automatically.
    const missing = part === "content" ? missingParts(view, source) : [];
    const problems = sourceEditProblems(part, view, source).filter(
      (d) => d.severity === "error" && !(missing.length && /left out/.test(d.message))
    );
    if (problems.length) {
      return { ok: false, reason: "invalid", message: "The proposed text has problems; nothing was proposed.", diagnostics: problems };
    }
    const next = applyText(data, part, source, shares);
    const before = fullText(data, part);
    const after = fullText(next, part);
    if (before.trim() === after.trim()) {
      return { ok: false, reason: "unchanged", message: "The proposed text changes nothing." };
    }
    const warnings: ProposalWarning[] =
      part === "content" ? contentWarnings(before, after) : templateWarnings(before, after);
    if (missing.length) {
      const named = missing.map((b) =>
        b.startsWith("custom:") ? data.content.custom?.find((c) => `custom:${c.id}` === b)?.title || b : b
      );
      warnings.unshift({ kind: "partsRemoved", values: named });
    }
    if (part === "template") {
      const issues = await this.io.checkTemplate(after, next);
      warnings.push(...issues.map((issue) => ({ kind: "render" as const, issue })));
    }
    const proposal = await this.add({
      id: this.io.newId(),
      client: input.client,
      summary: input.summary.trim(),
      createdAt: this.io.now(),
      target: { kind: "resume", resumeId, part, title: data.title?.trim() ?? "" },
      source,
      baseRevision: input.baseRevision,
      before,
      after,
      warnings,
      status: "pending",
    });
    return { ok: true, proposal };
  }

  /**
   * Proposes changes to single entries (rewrite or remove), checked the same
   * way as a content proposal. `dropRemovalWarning` is for proposals whose
   * whole point is removing entries, where saying so again isn't a warning.
   */
  async proposeEntries(input: {
    client: string;
    resumeId: string;
    changes: EntryChange[];
    summary: string;
    labels?: string[];
    origin?: "app";
    dropRemovalWarning?: boolean;
  }): Promise<ProposeResult> {
    const data = await this.io.loadResume(input.resumeId);
    if (!data) return { ok: false, reason: "notFound", message: `No resume with id "${input.resumeId}".` };
    if (input.changes.length === 0) return { ok: false, reason: "unchanged", message: "No entries to change." };
    const changed = withEntryChanges(data, input.changes);
    if (!changed) {
      return { ok: false, reason: "stale", message: "An entry this would change isn't in the resume any more." };
    }
    const before = fullText(data, "content");
    const after = fullText(changed.next, "content");
    if (before.trim() === after.trim()) {
      return { ok: false, reason: "unchanged", message: "The proposed entries change nothing." };
    }
    const warnings: ProposalWarning[] = contentWarnings(before, after).filter(
      (w) => !(input.dropRemovalWarning && w.kind === "removed")
    );
    const proposal = await this.add({
      id: this.io.newId(),
      client: input.client,
      origin: input.origin,
      summary: input.summary.trim(),
      createdAt: this.io.now(),
      target: { kind: "resume", resumeId: input.resumeId, part: "content", title: data.title?.trim() ?? "" },
      source: after,
      entries: input.changes,
      labels: input.labels,
      before,
      after,
      warnings,
      status: "pending",
    });
    return { ok: true, proposal };
  }

  async proposeTemplate(input: { client: string; name: string; source: string; summary: string }): Promise<ProposeResult> {
    const compiled = compileTemplate(input.source);
    if (!compiled.template) {
      return {
        ok: false,
        reason: "invalid",
        message: "The template has problems; nothing was proposed.",
        diagnostics: compiled.diagnostics.filter((d) => d.severity === "error"),
      };
    }
    const libraryId = this.io.library.idFor(input.name);
    const existing = await this.io.library.get(libraryId);
    const warnings: ProposalWarning[] = existing ? [{ kind: "replacesTemplate", name: existing.name }] : [];
    const issues = await this.io.checkTemplate(input.source, null);
    warnings.push(...issues.map((issue) => ({ kind: "render" as const, issue })));
    const proposal = await this.add({
      id: this.io.newId(),
      client: input.client,
      summary: input.summary.trim(),
      createdAt: this.io.now(),
      target: { kind: "template", name: input.name.trim(), libraryId },
      source: input.source,
      before: existing?.source ?? "",
      after: input.source,
      warnings,
      status: "pending",
    });
    return { ok: true, proposal };
  }

  // ---- deciding -----------------------------------------------------------------

  async apply(id: string): Promise<Proposal> {
    const p = this.get(id);
    if (!p || p.status !== "pending") return p!;
    if (p.target.kind === "template") {
      const previous = await this.io.library.get(p.target.libraryId);
      await this.io.library.save(p.target.name, p.source);
      return this.update(id, { status: "applied", undo: { template: previous?.source ?? null } });
    }
    const { resumeId, part } = p.target;
    const data = await this.io.loadResume(resumeId);
    if (!data) return this.update(id, { status: "stale", message: "The resume no longer exists." });
    if (p.entries) {
      const changed = withEntryChanges(data, p.entries);
      if (!changed) {
        return this.update(id, { status: "stale", message: "An entry this changes was edited or removed since." });
      }
      await this.io.writeResume(resumeId, changed.next);
      return this.update(id, { status: "applied", undo: { entries: changed.landed } });
    }
    const shares = await this.io.sharesPersonal(resumeId);
    // Applying over newer edits would undo them: the resume must still be
    // what the client read.
    if (revisionOf(resumeView(data, part, shares)) !== p.baseRevision) {
      return this.update(id, { status: "stale", message: "The resume changed after this was proposed." });
    }
    const next = applyText(data, part, p.source, shares);
    await this.io.writeResume(resumeId, next);
    return this.update(id, {
      status: "applied",
      undo: { resume: data, afterRevision: revisionOf(fullText(next, part)) },
    });
  }

  /** Applies each pending proposal in turn and counts what happened. */
  async applyAll(ids: string[]): Promise<{ applied: number; stale: number }> {
    let applied = 0;
    let stale = 0;
    for (const id of ids) {
      const after = await this.apply(id);
      if (after?.status === "applied") applied++;
      else if (after?.status === "stale") stale++;
    }
    return { applied, stale };
  }

  discard(id: string): Proposal | undefined {
    const p = this.get(id);
    if (!p || p.status !== "pending") return p;
    return this.update(id, { status: "discarded" });
  }

  /** Reverts an applied proposal, if nothing changed since. */
  async undo(id: string): Promise<Proposal> {
    const p = this.get(id);
    if (!p || p.status !== "applied" || !p.undo) return p!;
    if (p.target.kind === "template") {
      if (p.undo.template) await this.io.library.save(p.target.name, p.undo.template);
      else await this.io.library.remove(p.target.libraryId);
      return this.update(id, { status: "undone", message: undefined });
    }
    const { resumeId, part } = p.target;
    const data = await this.io.loadResume(resumeId);
    if (data && p.undo.entries) {
      const restored = withoutEntryChanges(data, p.undo.entries);
      if (!restored) {
        return this.update(id, { message: "An entry this changed was edited since, so it can't be undone here." });
      }
      await this.io.writeResume(resumeId, restored);
      return this.update(id, { status: "undone", message: undefined });
    }
    if (!data || revisionOf(fullText(data, part)) !== p.undo.afterRevision) {
      return this.update(id, { message: "The resume changed after this was applied, so it can't be undone here." });
    }
    const previous = p.undo.resume!;
    await this.io.writeResume(resumeId, applyText(data, part, fullText(previous, part), true));
    return this.update(id, { status: "undone", message: undefined });
  }
}
