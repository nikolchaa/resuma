import { describe, expect, it } from "vitest";
import type { ResumeData } from "@/lib/resumesStore";
import { BUILTIN_TEMPLATES } from "@/templates";
import { memoryStore } from "./testing";
import { resumeView, revisionOf } from "./views";

const view = (data: ResumeData, part: "content" | "template" = "content", shared = false) => resumeView(data, part, shared);

describe("ProposalStore", () => {
  it("proposes a content change without touching the resume, then applies it", async () => {
    const { store, files } = memoryStore();
    const before = view(files.get("jane")!);
    const r = await store.proposeResume({
      client: "Claude",
      resumeId: "jane",
      part: "content",
      source: before.replace("Acme", "Acme Corp"),
      baseRevision: revisionOf(before),
      summary: "Full company name",
    });
    expect(r).toMatchObject({ ok: true, proposal: { status: "pending", client: "Claude", warnings: [{ kind: "newNames" }] } });
    expect(files.get("jane")!.content.experience[0].company).toBe("Acme");

    const applied = await store.apply("p1");
    expect(applied.status).toBe("applied");
    expect(files.get("jane")!.content.experience[0].company).toBe("Acme Corp");
    // Personal details weren't shared, so the originals stay.
    expect(files.get("jane")!.content.personal.fullName).toBe("Jane Marie Doe");
  });

  it("refuses stale, invalid, partial and empty proposals", async () => {
    const { store, files } = memoryStore();
    const before = view(files.get("jane")!);
    const base = { client: "x", resumeId: "jane", part: "content" as const, summary: "" };
    expect(await store.proposeResume({ ...base, source: before, baseRevision: "deadbeef" })).toMatchObject({ ok: false, reason: "stale" });
    expect(await store.proposeResume({ ...base, source: "\\experience{", baseRevision: revisionOf(before) })).toMatchObject({ ok: false, reason: "invalid" });
    const onlyExperience = before.match(/\\experience\{[\s\S]*?\n\}\n/)![0];
    const partial = await store.proposeResume({ ...base, source: onlyExperience, baseRevision: revisionOf(before) });
    expect(partial).toMatchObject({ ok: false, reason: "invalid" });
    if (!partial.ok) expect(partial.diagnostics?.[0].message).toMatch(/left out/);
    expect(await store.proposeResume({ ...base, source: before, baseRevision: revisionOf(before) })).toMatchObject({ ok: false, reason: "unchanged" });
    expect(await store.proposeResume({ ...base, resumeId: "nope", source: before, baseRevision: "x" })).toMatchObject({ ok: false, reason: "notFound" });
    expect(store.list()).toEqual([]);
  });

  it("goes stale when the resume changes before it's applied", async () => {
    const { store, files } = memoryStore();
    const before = view(files.get("jane")!);
    await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: before.replace("Acme", "Initech"), baseRevision: revisionOf(before), summary: "" });
    files.get("jane")!.content.experience[0].jobTitle = "Staff Engineer";
    expect((await store.apply("p1")).status).toBe("stale");
    expect(files.get("jane")!.content.experience[0].company).toBe("Acme");
  });

  it("applies into the open editor when the resume is open there", async () => {
    const { store, files, editor } = memoryStore({ openInEditor: ["jane"] });
    // The editor has an unsaved edit; the client read (and proposes against) the draft.
    editor.get("jane")!.content.experience[0].jobTitle = "Staff Engineer";
    const draftView = view(editor.get("jane")!);
    await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: draftView.replace("Acme", "Initech"), baseRevision: revisionOf(draftView), summary: "" });
    expect((await store.apply("p1")).status).toBe("applied");
    expect(editor.get("jane")!.content.experience[0]).toMatchObject({ company: "Initech", jobTitle: "Staff Engineer" });
    expect(files.get("jane")!.content.experience[0].company).toBe("Acme");
  });

  it("auto-applies only proposals without warnings", async () => {
    const { store, files } = memoryStore({ autoApply: true });
    const before = view(files.get("jane")!);
    // Rewording a description: no warnings, applied at once.
    const quiet = before.replace("Open-source resume builder.", "An open-source resume builder.");
    const r1 = await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: quiet, baseRevision: revisionOf(before), summary: "" });
    expect(r1).toMatchObject({ ok: true, proposal: { status: "applied", autoApplied: true } });
    // A new employer is a warning: it waits for the user.
    const now = view(files.get("jane")!);
    const r2 = await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: now.replace("Acme", "Initech"), baseRevision: revisionOf(now), summary: "" });
    expect(r2).toMatchObject({ ok: true, proposal: { status: "pending" } });
    expect(files.get("jane")!.content.experience[0].company).toBe("Acme");
  });

  it("undoes an applied change unless the resume changed since", async () => {
    const { store, files } = memoryStore();
    const before = view(files.get("jane")!);
    await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: before.replace("Acme", "Initech"), baseRevision: revisionOf(before), summary: "" });
    await store.apply("p1");
    expect((await store.undo("p1")).status).toBe("undone");
    expect(files.get("jane")!.content.experience[0].company).toBe("Acme");

    const again = view(files.get("jane")!);
    await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: again.replace("Acme", "Initech"), baseRevision: revisionOf(again), summary: "" });
    await store.apply("p2");
    files.get("jane")!.content.skills[0].category = "Tools";
    const refused = await store.undo("p2");
    expect(refused).toMatchObject({ status: "applied", message: expect.stringMatching(/changed after/) });
  });

  it("proposes templates for a resume with render warnings, and saves library templates", async () => {
    const { store, files, library } = memoryStore({ issues: true });
    const tpl = view(files.get("jane")!, "template");
    const r = await store.proposeResume({
      client: "x",
      resumeId: "jane",
      part: "template",
      source: BUILTIN_TEMPLATES.sidebar,
      baseRevision: revisionOf(tpl),
      summary: "Two columns",
    });
    expect(r).toMatchObject({ ok: true, proposal: { warnings: expect.arrayContaining([{ kind: "render", issue: { kind: "tinyText", size: 5 } }]) } });
    await store.apply("p1");
    // Exactly a built-in: the resume switches to it rather than keeping a copy.
    expect(files.get("jane")).toMatchObject({ theme: "sidebar", templateSource: undefined });
    await store.undo("p1");
    expect(files.get("jane")).toMatchObject({ theme: "professional", templateSource: undefined });
    // A changed copy is kept as the resume's own template.
    const own = BUILTIN_TEMPLATES.sidebar.replace("default=#1f2937", "default=#14532d");
    const tpl2 = view(files.get("jane")!, "template");
    await store.proposeResume({ client: "x", resumeId: "jane", part: "template", source: own, baseRevision: revisionOf(tpl2), summary: "" });
    await store.apply(store.list()[store.list().length - 1].id);
    expect(files.get("jane")).toMatchObject({ theme: "professional", templateSource: own });

    const t1 = await store.proposeTemplate({ client: "x", name: "Ocean", source: BUILTIN_TEMPLATES.modern, summary: "" });
    expect(t1).toMatchObject({ ok: true, proposal: { target: { kind: "template", libraryId: "ocean" } } });
    const id1 = t1.ok ? t1.proposal.id : "";
    await store.apply(id1);
    expect(library.get("ocean")?.source).toBe(BUILTIN_TEMPLATES.modern);
    const t2 = await store.proposeTemplate({ client: "x", name: "Ocean", source: BUILTIN_TEMPLATES.compact, summary: "" });
    expect(t2).toMatchObject({ ok: true, proposal: { warnings: expect.arrayContaining([{ kind: "replacesTemplate", name: "Ocean" }]) } });
    const id2 = t2.ok ? t2.proposal.id : "";
    await store.apply(id2);
    await store.undo(id2);
    expect(library.get("ocean")?.source).toBe(BUILTIN_TEMPLATES.modern);
    await store.undo(id1);
    expect(library.has("ocean")).toBe(false);
    expect(await store.proposeTemplate({ client: "x", name: "Bad", source: "\\template[id=x]\n\\p{", summary: "" })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("discards, and lets the user change personal details only when they were shared", async () => {
    const { store, files } = memoryStore({ shared: ["jane"] });
    const before = view(files.get("jane")!, "content", true);
    await store.proposeResume({ client: "x", resumeId: "jane", part: "content", source: before.replace("jane@doe.dev", "jane@new.dev"), baseRevision: revisionOf(before), summary: "" });
    expect(store.get("p1")!.warnings).toContainEqual({ kind: "personalChanged", fields: ["email"] });
    expect(store.discard("p1")?.status).toBe("discarded");
    expect(files.get("jane")!.content.personal.email).toBe("jane@doe.dev");
    expect(store.pending()).toEqual([]);
  });
});
