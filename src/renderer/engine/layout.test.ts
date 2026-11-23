import { describe, expect, it } from "vitest";
import { renderResume } from "..";
import { PAPER, RenderedDocument } from "./types";
import { loadTestFonts, sampleResume } from "../testing/fixtures";

const fonts = loadTestFonts();

const texts = (doc: RenderedDocument) =>
  doc.pages.flatMap((p) => p.items.filter((i) => i.type === "text").map((i) => (i as { text: string }).text));

const lineTexts = (doc: RenderedDocument) => {
  // Join runs that share a line id prefix (".../l<n>").
  const lines = new Map<string, string>();
  for (const p of doc.pages)
    for (const i of p.items)
      if (i.type === "text") {
        const key = `${p.index}:${i.id.replace(/\/r\d+$/, "")}`;
        lines.set(key, (lines.get(key) ?? "") + i.text);
      }
  return [...lines.values()];
};

describe("renderResume", () => {
  it.each(["professional", "modern", "compact"])("%s keeps every item inside the page margins", (theme) => {
    for (const format of ["A4", "LETTER"] as const) {
      const doc = renderResume({ ...sampleResume(), theme }, { format, language: "en", fonts });
      const { width, height } = PAPER[format];
      expect(doc.pages.length).toBe(1);
      for (const item of doc.pages[0].items) {
        if (item.type !== "text") continue;
        expect(item.x).toBeGreaterThanOrEqual(40 - 0.01);
        expect(item.x + item.width).toBeLessThanOrEqual(width - 40 + 0.01);
        expect(item.y).toBeGreaterThan(40);
        expect(item.y).toBeLessThan(height - 40);
      }
    }
  });

  it("renders Professional like the old template", () => {
    const lines = lineTexts(renderResume(sampleResume(), { format: "A4", language: "en", fonts }));
    expect(lines).toContain("JANE MARIE DOE");
    expect(lines).toContain("jane@doe.dev | Belgrade, Serbia | +381 60 123 4567");
    // empty github is skipped without a stray separator
    expect(lines).toContain("linkedin.com/in/janedoe | jane.dev");
    expect(lines).toContain("EXPERIENCE");
    // empty location → no leading " | "; missing `to` → Present
    expect(lines).toContain("2021-03 – Present");
    expect(lines).toContain("• Led a team of 4 engineers.");
    expect(lines).toContain("Courses: Algorithms, Compilers");
  });

  it("uses localised labels", () => {
    const lines = lineTexts(renderResume(sampleResume(), { format: "A4", language: "rs", fonts }));
    expect(lines).toContain("ISKUSTVO");
    expect(lines).toContain("2021-03 – Trenutno");
  });

  it("splits Modern's name into first and rest", () => {
    const doc = renderResume({ ...sampleResume(), theme: "modern" }, { format: "A4", language: "en", fonts });
    const first = doc.pages[0].items.find((i) => i.type === "text" && i.text === "JANE");
    const rest = doc.pages[0].items.find((i) => i.type === "text" && i.text.includes("MARIE DOE"));
    expect(first).toBeDefined();
    expect(rest).toBeDefined();
    expect((first as { fontKey: string }).fontKey).toBe("Figtree|normal");
    expect((rest as { fontKey: string }).fontKey).toBe("Figtree|bold");
  });

  it("uses Compact's coursework label and one line per note", () => {
    const lines = lineTexts(renderResume({ ...sampleResume(), theme: "compact" }, { format: "A4", language: "en", fonts }));
    expect(lines).toContain("Relevant Coursework: Algorithms, Compilers");
    expect(lines).toContain("• Migrated payments to Rust.");
  });

  it("follows the resume font setting", () => {
    const doc = renderResume({ ...sampleResume(), font: "inter" }, { format: "A4", language: "en", fonts });
    const keys = new Set(doc.pages[0].items.flatMap((i) => (i.type === "text" ? [i.fontKey] : [])));
    expect([...keys].sort()).toEqual(["Inter|bold", "Inter|normal"]);
  });

  it("links emails, phones and URLs", () => {
    const doc = renderResume(sampleResume(), { format: "A4", language: "en", fonts });
    const hrefs = doc.pages[0].items.flatMap((i) => (i.type === "link" ? [i.href] : []));
    expect(hrefs).toEqual(
      expect.arrayContaining(["mailto:jane@doe.dev", "tel:+381601234567", "https://jane.dev", "https://linkedin.com/in/janedoe"])
    );
    // Professional shows project links as plain text
    expect(hrefs).not.toContain("https://github.com/nikolchaa/resuma");
  });

  it("wraps long text inside the content width", () => {
    const data = sampleResume();
    data.content.experience[0].description = "word ".repeat(200) + "Supercalifragilisticexpialidocious".repeat(8);
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    for (const p of doc.pages)
      for (const i of p.items) if (i.type === "text") expect(i.x + i.width).toBeLessThanOrEqual(595.28 - 40 + 0.01);
    expect(texts(doc).join("")).toContain("Supercali");
  });

  it("paginates and never leaves a heading at the bottom of a page", () => {
    const data = sampleResume();
    data.content.experience = Array.from({ length: 30 }, (_, i) => ({
      ...data.content.experience[0],
      jobTitle: `Role ${i}`,
    }));
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    expect(doc.pages.length).toBeGreaterThan(2);
    for (const p of doc.pages) {
      const textItems = p.items.filter((i) => i.type === "text");
      const last = textItems[textItems.length - 1] as { text: string };
      expect(["EXPERIENCE", "PROJECTS", "AWARDS", "SKILLS"]).not.toContain(last.text);
      for (const i of textItems) expect(i.y).toBeLessThan(841.89 - 40);
    }
  });

  it("keeps ids of unchanged items stable when other text changes", () => {
    const a = renderResume(sampleResume(), { format: "A4", language: "en", fonts });
    const changed = sampleResume();
    changed.content.experience[0].description += " Also more words here.";
    const b = renderResume(changed, { format: "A4", language: "en", fonts });
    const idsA = a.pages[0].items.map((i) => i.id);
    const idsB = new Set(b.pages[0].items.map((i) => i.id));
    expect(idsA.filter((id) => !idsB.has(id))).toEqual([]);
  });

  it("tolerates missing and malformed fields from old files", () => {
    const data = sampleResume();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = data.content as any;
    delete c.awards;
    c.education[0].courses = undefined;
    c.experience[0].date = undefined;
    c.skills[0].items = [null, "Go"];
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    expect(lineTexts(doc)).toContain("Go");
  });
});
