import { describe, expect, it } from "vitest";
import { contentWarnings, extractSource, runSourceEdit } from "./aiSourceEdit";
import { lineDiff, withContext } from "./lineDiff";
import { normalizeResume } from "./resumeMigration";
import { printContent } from "@/renderer/rsm/content";
import { sampleResume } from "@/renderer/testing/sample";
import { BUILTIN_TEMPLATES } from "@/templates";

const source = printContent(normalizeResume(sampleResume())!.content);
const fence = (s: string) => "Sure! Here it is:\n```rsm\n" + s + "```\nLet me know.";

/** A fake model that returns the given replies in order and records prompts. */
const scripted = (...replies: string[]) => {
  const prompts: string[] = [];
  return {
    prompts,
    call: async (p: string) => {
      prompts.push(p);
      return replies.shift() ?? "";
    },
  };
};

describe("extractSource", () => {
  it("takes the fenced block and drops reasoning tags", () => {
    expect(extractSource("<think>\\fake{x}</think>\n```rsm\n\\p{a}\n```")).toBe("\\p{a}\n");
    expect(extractSource("Here:\n```\n\\p{b}\n```")).toBe("\\p{b}\n");
    expect(extractSource("Okay so \\personal{}")).toBe("\\personal{}\n");
    expect(extractSource("```rsm\r\r\n\\skills{}\r\r\n```")).toBe("\\skills{}\n");
  });
});

describe("runSourceEdit", () => {
  it("returns a valid content edit with its prompt carrying the source and instruction", async () => {
    const edited = source.replace("Built the billing platform", "Designed and built the billing platform");
    const model = scripted(fence(edited));
    const r = await runSourceEdit({ target: "content", instruction: "Make it stronger", source, jobDesc: "Rust dev", call: model.call });
    expect(r).toMatchObject({ ok: true, attempts: 1, warnings: [] });
    expect(model.prompts[0]).toContain("Instruction: Make it stronger");
    expect(model.prompts[0]).toContain("Rust dev");
    expect(model.prompts[0]).toContain("\\jobTitle{Software Engineer}");
  });

  it("never sends personal details and puts the originals back", async () => {
    const model = scripted(
      (() => {
        // The model even invents a personal block; it must be ignored.
        const sent = source.replace(/^\\personal\{[\s\S]*?\n\}\n\n/, "");
        return fence("\\personal{\\fullName{Someone Else}\\email{x@y.z}}\n" + sent.replace("Acme", "Acme Inc"));
      })()
    );
    const r = await runSourceEdit({ target: "content", instruction: "x", source, call: model.call });
    for (const secret of ["Jane Marie Doe", "jane@doe.dev", "+381 60 123 4567", "linkedin.com/in/janedoe", "\\personal"]) {
      expect(model.prompts[0]).not.toContain(secret);
    }
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.text).toContain("\\fullName{Jane Marie Doe}");
      expect(r.text).not.toContain("Someone Else");
      expect(r.text).toContain("Acme Inc");
    }
  });

  it("treats a partial answer (missing sections) as an error and retries", async () => {
    const onlyExperience = (s: string) => s.match(/\\experience\{[\s\S]*?\n\}\n/)![0];
    const model = scripted(fence(onlyExperience(source).replace("Acme", "Acme Inc")), fence(source.replace("Acme", "Acme Inc")));
    const r = await runSourceEdit({ target: "content", instruction: "x", source, call: model.call });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(model.prompts[1]).toMatch(/left out \\education\{\.\.\.\}/);
  });

  it("retries once with the diagnostics, then succeeds", async () => {
    const broken = source.replace("\\company{Acme}", "\\employer{Acme}");
    const fixed = source.replace("Acme", "Acme Corp");
    const model = scripted(fence(broken), fence(fixed));
    const r = await runSourceEdit({ target: "content", instruction: "x", source, call: model.call });
    expect(r).toMatchObject({ ok: true, attempts: 2 });
    expect(model.prompts[1]).toMatch(/Unknown field `\\employer`/);
    // Calls are stateless: the retry carries the guide, the instruction and the previous answer.
    expect(model.prompts[1].startsWith(model.prompts[0])).toBe(true);
    expect(model.prompts[1]).toContain("\\employer{Acme}");
  });

  it("gives up after two invalid replies without applying anything", async () => {
    const model = scripted(fence("\\personal{"), fence("\\nope{}"));
    const r = await runSourceEdit({ target: "content", instruction: "x", source, call: model.call });
    expect(r).toMatchObject({ ok: false, reason: "invalid", attempts: 2 });
    if (!r.ok) expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it("reports unchanged and empty replies", async () => {
    expect(await runSourceEdit({ target: "content", instruction: "x", source, call: scripted(fence(source)).call }))
      .toMatchObject({ ok: false, reason: "unchanged" });
    expect(await runSourceEdit({ target: "content", instruction: "x", source, call: scripted("").call }))
      .toMatchObject({ ok: false, reason: "empty" });
  });

  it("reports a reply cut off while the model was still thinking", async () => {
    const r = await runSourceEdit({
      target: "template",
      instruction: "x",
      source: BUILTIN_TEMPLATES.modern,
      call: scripted("<think>Let me plan this. First the example:\n```rsm\n" + BUILTIN_TEMPLATES.modern + "```\nthen").call,
    });
    expect(r).toMatchObject({ ok: false, reason: "cutOff", attempts: 1 });
  });

  it("validates template edits with the template validator", async () => {
    const tpl = BUILTIN_TEMPLATES.modern;
    const good = tpl.replace("default=#00d9cb", "default=#1d4ed8");
    const r1 = await runSourceEdit({ target: "template", instruction: "blue", source: tpl, call: scripted(fence(good)).call });
    expect(r1).toMatchObject({ ok: true });
    const bad = tpl.replace("\\style[title]", "\\style[ttl]");
    const model = scripted(fence(bad), fence(bad));
    const r2 = await runSourceEdit({ target: "template", instruction: "x", source: tpl, call: model.call });
    expect(r2).toMatchObject({ ok: false, reason: "invalid" });
    expect(model.prompts[0]).toContain("Style properties:");
    expect(model.prompts[1]).toMatch(/Unknown style `title`/);
  });

  it("warns when a template edit drops sections", async () => {
    const tpl = BUILTIN_TEMPLATES.professional;
    const withoutAwards = tpl.replace(/\\section\[awards\]\{[\s\S]*?\r?\n\}\r?\n/, "");
    expect(withoutAwards).not.toBe(tpl);
    const r = await runSourceEdit({ target: "template", instruction: "x", source: tpl, call: scripted(fence(withoutAwards)).call });
    expect(r).toMatchObject({ ok: true, warnings: [{ kind: "sectionsDropped", values: ["awards"] }] });
  });
});

describe("runSourceEdit with a render check", () => {
  const tpl = BUILTIN_TEMPLATES.modern;
  const changed = tpl.replace("default=#00d9cb", "default=#1d4ed8");

  it("asks the model to fix blocking render problems, then accepts the fix", async () => {
    const better = tpl.replace("default=#00d9cb", "default=#2563eb");
    const model = scripted(fence(changed), fence(better));
    const check = (t: string) => (t.includes("#1d4ed8") ? [{ kind: "lowContrast" as const, values: ["EXPERIENCE"] }] : []);
    const r = await runSourceEdit({ target: "template", instruction: "blue", source: tpl, call: model.call, check });
    expect(r).toMatchObject({ ok: true, attempts: 2, warnings: [] });
    expect(model.prompts[1]).toMatch(/hard to read against its background: "EXPERIENCE"/);
  });

  it("returns the last answer with its render problems as warnings when retries run out", async () => {
    const check = () => [{ kind: "offPage" as const, count: 3 }, { kind: "morePages" as const, before: 1, after: 2 }];
    const r = await runSourceEdit({ target: "template", instruction: "x", source: tpl, call: scripted(fence(changed), fence(changed)).call, check });
    expect(r).toMatchObject({
      ok: true,
      attempts: 2,
      warnings: [
        { kind: "render", issue: { kind: "offPage", count: 3 } },
        { kind: "render", issue: { kind: "morePages", before: 1, after: 2 } },
      ],
    });
  });

  it("only shows (doesn't retry) a missing section on an edit, but retries it when generating", async () => {
    const check = () => [{ kind: "missingSections" as const, values: ["awards"] }];
    const edit = scripted(fence(changed));
    const r1 = await runSourceEdit({ target: "template", instruction: "x", source: tpl, call: edit.call, check });
    expect(r1).toMatchObject({ ok: true, attempts: 1 });

    // A new design gets three attempts.
    const gen = scripted(fence(changed), fence(changed), fence(changed));
    const r2 = await runSourceEdit({ target: "template", instruction: "Two columns", source: tpl, call: gen.call, check, generate: true });
    expect(r2).toMatchObject({ ok: true, attempts: 3, warnings: [{ kind: "render", issue: { kind: "missingSections" } }] });
    expect(gen.prompts[0]).toContain("You design a new resume template");
    expect(gen.prompts[0]).toContain("Description: Two columns");
    expect(gen.prompts[0]).toContain("\\cols[widths=");
    expect(gen.prompts[1]).toMatch(/These sections render nothing: awards/);
  });
});

describe("contentWarnings", () => {
  it("flags removed entries, new dates, new names and personal changes", () => {
    const edited = source
      .replace("\\company{Acme}", "\\company{Google}")
      .replace("\\from{2021-03}", "\\from{2018-01}")
      .replace("\\email{jane@doe.dev}", "\\email{jane@gmail.com}")
      .replace(/\\awards\{[\s\S]*?\n\}\n/, "\\awards{}\n");
    expect(contentWarnings(source, edited)).toEqual([
      { kind: "removed", section: "awards", count: 1 },
      { kind: "newDates", values: ["2018-01"] },
      { kind: "newNames", values: ["Google"] },
      { kind: "personalChanged", fields: ["email"] },
    ]);
  });
});

describe("contentWarnings on numbers", () => {
  it("flags numbers in free text that weren't in the original", () => {
    const edited = source.replace("cut invoice time by 40%", "cut invoice time by 70%").replace("2,000 customers", "5,000 customers");
    expect(contentWarnings(source, edited)).toEqual([{ kind: "newNumbers", values: ["5,000", "70%"] }]);
  });

  it("doesn't treat labels like C1 or v2 as numbers", () => {
    const edited = source.replace("\\item{Rust}", "\\item{Rust}\\item{English C1}\\item{OAuth2}");
    expect(contentWarnings(source, edited)).toEqual([]);
  });
});

describe("lineDiff", () => {
  it("marks added and removed lines and keeps context", () => {
    const d = lineDiff("a\nb\nc\nd\ne\nf\ng", "a\nb\nC\nd\ne\nf\ng\nh");
    expect(d.filter((l) => l.type !== "same")).toEqual([
      { type: "del", text: "c" },
      { type: "add", text: "C" },
      { type: "add", text: "h" },
    ]);
    expect(withContext(d, 1)).toEqual([
      { type: "skip", count: 1 },
      { type: "same", text: "b" },
      { type: "del", text: "c" },
      { type: "add", text: "C" },
      { type: "same", text: "d" },
      { type: "skip", count: 2 },
      { type: "same", text: "g" },
      { type: "add", text: "h" },
    ]);
  });
});
