import { describe, expect, it } from "vitest";
import { renderResume } from "..";
import { PAPER, RenderedDocument } from "./types";
import { loadTestFonts, sampleResume } from "../testing/fixtures";
import { BUILTIN_TEMPLATES } from "@/templates";

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

  it("paginates", () => {
    const data = sampleResume();
    data.content.experience = Array.from({ length: 30 }, (_, i) => ({
      ...data.content.experience[0],
      jobTitle: `Role ${i}`,
    }));
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    expect(doc.pages.length).toBeGreaterThan(2);
    for (const p of doc.pages)
      for (const i of p.items) if (i.type === "text") expect(i.y).toBeLessThan(841.89 - 40);
  });

  it.each(["professional", "modern", "compact"])("%s never leaves a heading at the bottom of a page", (theme) => {
    const headings = ["EDUCATION", "EXPERIENCE", "PROJECTS", "AWARDS", "SKILLS"];
    // Sweep entry counts so page breaks land at many different points.
    for (let n = 1; n <= 40; n++) {
      const data = { ...sampleResume(), theme };
      data.content.experience = Array.from({ length: n }, (_, i) => ({
        ...data.content.experience[0],
        jobTitle: `Role ${i}`,
      }));
      const doc = renderResume(data, { format: "A4", language: "en", fonts });
      for (const p of doc.pages) {
        const textItems = p.items.filter((i) => i.type === "text") as { text: string }[];
        expect(headings, `n=${n}, page ${p.index + 1}`).not.toContain(textItems[textItems.length - 1].text);
      }
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

  const headingOrder = (doc: RenderedDocument) =>
    lineTexts(doc).filter((l) => /^[A-ZĐŠČĆŽ ]{4,}$/.test(l) && l !== "JANE MARIE DOE");

  it("follows the user's section order, hidden sections and renamed titles", () => {
    const data = sampleResume();
    data.content.layout = {
      order: ["skills", "experience"],
      hidden: ["awards"],
      titles: { skills: "Toolbox", experience: "  " },
    };
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    expect(headingOrder(doc)).toEqual(["TOOLBOX", "EXPERIENCE", "EDUCATION", "PROJECTS"]);
  });

  it.each(["professional", "modern", "compact"])("%s renders custom sections", (theme) => {
    const data = { ...sampleResume(), theme };
    data.content.custom = [
      {
        id: "langs",
        title: "Languages",
        entries: [
          { title: "Serbian", subtitle: "Native", location: "", date: { from: "" }, description: "", items: [] },
          { title: "German", subtitle: "B2", location: "Goethe", date: { from: "2019", to: "2020" }, description: "Certificate.", items: ["Reading", "Writing"] },
        ],
      },
      { id: "empty", title: "Nothing", entries: [] },
    ];
    data.content.layout = { order: ["custom:langs"] };
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    const lines = lineTexts(doc);
    expect(headingOrder(doc)[0]).toBe("LANGUAGES");
    expect(headingOrder(doc)).not.toContain("NOTHING");
    expect(lines.join("\n")).toMatch(/German/);
    expect(lines.join("\n")).toMatch(/2019 . 2020/);
    expect(lines.join("\n")).toMatch(/• Writing/);
    // ids are unique even though custom sections share template nodes
    const ids = doc.pages.flatMap((p) => p.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders custom sections with a fallback when the template has no \\section[*]", async () => {
    const { compileTemplate } = await import("../template/template");
    const { compileDocument } = await import("./compile");
    const { template } = compileTemplate(
      "\\template[id=t, name=T]\n\\style[heading]{font-weight: bold}\n\\section[skills]{\\p[heading]{\\sectiontitle}}"
    );
    const data = sampleResume();
    data.content.custom = [
      { id: "x", title: "Volunteering", entries: [{ title: "Mentor", subtitle: "Code Club", location: "", date: { from: "" }, description: "", items: [] }] },
    ];
    const { boxes } = compileDocument({ template: template!, content: data.content, language: "en" });
    const text = JSON.stringify(boxes);
    expect(text).toContain("Volunteering");
    expect(text).toContain("Mentor");
  });

  it("applies template option overrides and ignores invalid ones", () => {
    const base = renderResume({ ...sampleResume(), theme: "modern" }, { format: "A4", language: "en", fonts });
    const tinted = renderResume(
      { ...sampleResume(), theme: "modern", templateOptions: { accent: "#ff0000", headings: "not-a-colour" } },
      { format: "A4", language: "en", fonts }
    );
    const rects = (d: RenderedDocument) => d.pages[0].items.filter((i) => i.type === "rect").map((i) => (i as { color: string }).color);
    expect(new Set(rects(base))).toEqual(new Set(["#00d9cb"]));
    expect(new Set(rects(tinted))).toEqual(new Set(["#ff0000"]));
    const heading = (d: RenderedDocument) =>
      d.pages[0].items.find((i) => i.type === "text" && i.text === "EXPERIENCE") as { color: string };
    expect(heading(tinted).color).toBe(heading(base).color);
  });

  it("falls back to Inter for characters the chosen font lacks (Cyrillic)", () => {
    const data = { ...sampleResume(), font: "figtree" };
    data.content.personal.fullName = "Ана Петровић";
    data.content.experience[0].description = "Радио на платформи — Belgrade office";
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    const items = doc.pages[0].items.filter((i) => i.type === "text") as { text: string; fontKey: string }[];
    const name = items.find((i) => i.text === "АНА ПЕТРОВИЋ");
    expect(name?.fontKey).toBe("Inter|bold");
    // Latin parts of a mixed line stay in Figtree
    const latin = items.find((i) => i.text.includes("Belgrade"));
    expect(latin?.fontKey).toBe("Figtree|normal");
    const cyr = items.find((i) => i.text.includes("Радио"));
    expect(cyr?.fontKey).toBe("Inter|normal");
    expect(doc.fontKeys).toEqual(expect.arrayContaining(["Inter|bold", "Inter|normal", "Figtree|normal"]));
  });

  it("renders with the resume's own template and falls back when it is invalid", async () => {
    const { resolveTemplate } = await import("..");
    const { BUILTIN_TEMPLATES } = await import("@/templates");
    const own = BUILTIN_TEMPLATES.compact.replace("\\style[name]{font-size: 18;", "\\style[name]{font-size: 30;");
    const doc = renderResume({ ...sampleResume(), theme: "modern", templateSource: own }, { format: "A4", language: "en", fonts });
    const name = doc.pages[0].items.find((i) => i.type === "text" && i.text === "JANE MARIE DOE") as { size: number };
    expect(name.size).toBe(30);

    const broken = resolveTemplate({ theme: "modern", templateSource: "\\template[id=x]\n\\p{oops" });
    expect(broken.custom).toBe(false);
    expect(broken.source).toBe(BUILTIN_TEMPLATES.modern);
    expect(broken.diagnostics.length).toBeGreaterThan(0);
  });

  describe("two columns (Sidebar)", () => {
    const sidebar = { ...sampleResume(), theme: "sidebar" };
    // Geometry of the built-in: margin 36, widths 32/68, gap 22, sidebar padding-right 16.
    const geometry = (width: number) => {
      const avail = width - 72 - 22;
      return { side: [36, 36 + avail * 0.32 - 16], main: [36 + avail * 0.32 + 22, width - 36] };
    };
    const textItems = (p: { items: RenderedDocument["pages"][number]["items"] }) =>
      p.items.filter((i) => i.type === "text") as Extract<RenderedDocument["pages"][number]["items"][number], { type: "text" }>[];

    it("keeps each column's text inside its own column and the page", () => {
      for (const format of ["A4", "LETTER"] as const) {
        const { width, height } = PAPER[format];
        const g = geometry(width);
        const doc = renderResume(sidebar, { format, language: "en", fonts });
        expect(doc.pages).toHaveLength(1);
        const items = textItems(doc.pages[0]);
        const inSide = items.filter((i) => i.x < g.main[0] - 1);
        expect(inSide.map((i) => i.text)).toEqual(expect.arrayContaining(["Jane Marie Doe", "SKILLS", "jane@doe.dev"]));
        for (const i of items) {
          const [lo, hi] = i.x < g.main[0] - 1 ? g.side : g.main;
          expect(i.x).toBeGreaterThanOrEqual(lo - 0.01);
          expect(i.x + i.width).toBeLessThanOrEqual(hi + 0.01);
          expect(i.y).toBeGreaterThan(36);
          expect(i.y).toBeLessThan(height - 36);
        }
        // Experience, education and projects are in the main column.
        const main = items.filter((i) => i.x >= g.main[0] - 1).map((i) => i.text);
        expect(main).toEqual(expect.arrayContaining(["EXPERIENCE", "EDUCATION", "PROJECTS"]));
      }
    });

    it("paints the sidebar background under the text, to the page edge, on every page", () => {
      const data = { ...sidebar, content: { ...sidebar.content } };
      data.content.experience = Array.from({ length: 14 }, (_, i) => ({ ...sidebar.content.experience[0], jobTitle: `Role ${i}` }));
      const doc = renderResume(data, { format: "A4", language: "en", fonts });
      expect(doc.pages.length).toBeGreaterThan(1);
      const g = geometry(PAPER.A4.width);
      for (const p of doc.pages) {
        expect(p.items[0]).toMatchObject({ type: "rect", id: "cols/bg0", x: 0, y: 0, h: PAPER.A4.height, color: "#1f2937" });
        expect((p.items[0] as { w: number }).w).toBeCloseTo(g.side[1] + 16);
        const ids = p.items.map((i) => i.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
      // The sidebar text colour comes from the column style.
      const email = textItems(doc.pages[0]).find((i) => i.text === "jane@doe.dev");
      expect(email?.color).toBe("#e5e7eb");
    });

    it("breaks each column across pages on its own and never strands a heading", () => {
      const g = geometry(PAPER.A4.width);
      const headings = ["EDUCATION", "EXPERIENCE", "PROJECTS", "AWARDS", "SKILLS"];
      for (let n = 1; n <= 30; n++) {
        const data = { ...sidebar, content: { ...sidebar.content } };
        data.content.experience = Array.from({ length: n }, (_, i) => ({ ...sidebar.content.experience[0], jobTitle: `Role ${i}` }));
        data.content.skills = Array.from({ length: Math.ceil(n / 2) }, (_, i) => ({ category: `Group ${i}`, items: ["Rust", "TypeScript", "SQL"] }));
        const doc = renderResume(data, { format: "A4", language: "en", fonts });
        for (const p of doc.pages) {
          for (const [lo] of [g.side, g.main]) {
            const col = textItems(p).filter((i) => (lo === g.side[0] ? i.x < g.main[0] - 1 : i.x >= g.main[0] - 1));
            if (!col.length) continue;
            const last = col.reduce((a, b) => (b.y > a.y ? b : a));
            expect(headings, `n=${n}, page ${p.index + 1}`).not.toContain(last.text);
            for (const i of col) expect(i.y).toBeLessThan(PAPER.A4.height - 36);
          }
        }
        const all = doc.pages.flatMap((p) => textItems(p).map((i) => i.text)).join("\n");
        expect(all).toContain(`Role ${n - 1}`);
        expect(all).toContain(`Group ${Math.ceil(n / 2) - 1}`);
      }
    });

    it("puts custom sections where \\section[*] is and follows the user's order within a column", () => {
      const data = { ...sidebar, content: { ...sidebar.content } };
      data.content.custom = [{ id: "langs", title: "Languages", entries: [{ title: "German", subtitle: "B2", location: "", date: { from: "" }, description: "", items: [] }] }];
      data.content.layout = { order: ["custom:langs", "awards", "projects"] };
      const doc = renderResume(data, { format: "A4", language: "en", fonts });
      const g = geometry(PAPER.A4.width);
      const items = textItems(doc.pages[0]);
      const sideHeadings = items.filter((i) => i.x < g.main[0] - 1 && ["SKILLS", "AWARDS"].includes(i.text)).map((i) => i.text);
      const mainHeadings = items.filter((i) => i.x >= g.main[0] - 1 && /^[A-Z]{5,}$/.test(i.text)).map((i) => i.text);
      expect(sideHeadings).toEqual(["AWARDS", "SKILLS"]);
      expect(mainHeadings).toEqual(["LANGUAGES", "PROJECTS", "EXPERIENCE", "EDUCATION"]);
    });

    it("orders sections main column first, so a saved order suits single-column templates too", async () => {
      const { sectionOrder } = await import("./compile");
      const { resolveTemplate } = await import("..");
      const { template } = resolveTemplate({ theme: "sidebar" });
      expect(sectionOrder(template, sidebar.content)).toEqual(["experience", "education", "projects", "skills", "awards"]);
    });

    it("closes the gap when both columns have a background", () => {
      const both = BUILTIN_TEMPLATES.sidebar.replace(
        '\\cols[widths="32,68", gap=22, left=side]',
        '\\style[mainbg]{background: #f9fafb}\n\\cols[widths="32,68", gap=22, left=side, right=mainbg]'
      );
      const doc = renderResume({ ...sidebar, templateSource: both }, { format: "A4", language: "en", fonts });
      const [bg0, bg1] = doc.pages[0].items.slice(0, 2) as { x: number; w: number }[];
      expect(bg0.x + bg0.w).toBeCloseTo(bg1.x);
      expect(bg1.x + bg1.w).toBeCloseTo(PAPER.A4.width);
    });

    it("localises the sidebar labels", () => {
      const doc = renderResume(sidebar, { format: "A4", language: "rs", fonts });
      expect(texts(doc)).toEqual(expect.arrayContaining(["TELEFON", "VEŠTINE"]));
    });
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
