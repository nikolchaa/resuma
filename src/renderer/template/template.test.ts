import { describe, expect, it } from "vitest";
import { compileTemplate } from "./template";
import { BUILTIN_TEMPLATES } from "@/templates";

const wrap = (body: string) => `\\template[id=t, name=T]\n\\style[s]{font-size: 10}\n${body}`;

describe("compileTemplate", () => {
  it.each(Object.keys(BUILTIN_TEMPLATES))("built-in template %s is valid", (id) => {
    const { template, diagnostics } = compileTemplate(BUILTIN_TEMPLATES[id]);
    expect(diagnostics).toEqual([]);
    expect(template?.id).toBe(id);
    expect(template?.sections.map((s) => s.kind).sort()).toEqual(
      ["*", "awards", "education", "experience", "projects", "skills"]
    );
    const options = template?.options.map((o) => o.name) ?? [];
    expect(options[0]).toBe("font");
    expect(options).toContain("accent");
  });

  it.each(Object.keys(BUILTIN_TEMPLATES))("built-in template %s is valid with CRLF line endings", (id) => {
    // Windows checkouts may convert .rsm files to CRLF.
    const crlf = BUILTIN_TEMPLATES[id].replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    const lf = compileTemplate(BUILTIN_TEMPLATES[id].replace(/\r\n/g, "\n"));
    const { template, diagnostics } = compileTemplate(crlf);
    expect(diagnostics).toEqual([]);
    expect(template).toEqual(lf.template);
  });

  it("reads \\cols: widths, gap, column styles, headers and section placement", () => {
    const { template, diagnostics } = compileTemplate(
      wrap(
        "\\style[side]{background: #111111; padding-right: 12}\n" +
          "\\header{\\p{\\v{fullName}}}\n" +
          '\\cols[widths="30,70", gap=18, left=side]{\\header{\\p{\\v{email}}} \\section[skills]{\\p{\\sectiontitle}}}{\\section[experience]{\\p{\\sectiontitle}} \\section[*]{\\p{\\sectiontitle}}}'
      )
    );
    expect(diagnostics).toEqual([]);
    const cols = template!.columns!;
    expect(cols.widths[0]).toBeCloseTo(0.3);
    expect(cols.gap).toBe(18);
    expect(cols.classes).toEqual([["side"], []]);
    expect(cols.header[0]).toHaveLength(1);
    expect(template!.header).toHaveLength(1);
    expect(cols.placement).toEqual({ skills: 0, experience: 1, "*": 1 });
    expect(template!.sections.map((s) => s.kind)).toEqual(["skills", "experience", "*"]);
  });

  it("rejects misplaced or malformed \\cols", () => {
    const messages = (src: string) => compileTemplate(wrap(src)).diagnostics.map((d) => d.message).join("\n");
    expect(messages("\\section[skills]{} \\cols{}{}")).toMatch(/every `\\section` goes inside one of the two columns/);
    expect(messages("\\cols{}{} \\cols{}{}")).toMatch(/Only one `\\cols`/);
    expect(messages('\\cols[widths="40"]{}{}')).toMatch(/two positive numbers/);
    expect(messages("\\cols{\\p{x}}{}")).toMatch(/`\\p` isn't allowed inside `\\cols`/);
    expect(messages("\\cols{}{} \\header{}")).toMatch(/must come before `\\cols`/);
    expect(messages("\\cols[left=nope]{}{}")).toMatch(/Unknown style `nope`/);
    // background only means something on a column; elsewhere it's a warning
    const warn = compileTemplate(wrap("\\style[bg]{background: #000000}\n\\header{\\p[bg]{\\v{email}}}"));
    expect(warn.template).not.toBeNull();
    expect(warn.diagnostics).toEqual([expect.objectContaining({ severity: "warning", message: expect.stringMatching(/only works on a column style/) })]);
  });

  it("accepts CSS margin and padding shorthands, and single page margins", async () => {
    const { compileDocument } = await import("../engine/compile");
    const { sampleResume } = await import("../testing/sample");
    const { template, diagnostics } = compileTemplate(
      "\\template[id=t, name=T]\n\\page{margin: 30; margin-top: 60; margin-left: 20}\n" +
        "\\style[a]{margin: 4 8 6; padding: 1 2 3 5}\n\\header{\\p[a]{\\v{fullName}}}"
    );
    expect(diagnostics).toEqual([]);
    const doc = compileDocument({ template: template!, content: sampleResume().content, language: "en" });
    expect(doc.margin).toEqual([60, 30, 30, 20]);
    const para = (doc.boxes[0] as { children: { spacing: object }[] }).children[0];
    expect(para.spacing).toMatchObject({ marginTop: 4, marginBottom: 6, paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 5 });
  });

  it("accepts \\style[name=x] as \\style[x]", () => {
    const { template, diagnostics } = compileTemplate(
      "\\template[id=t, name=T]\n\\style[name=big]{font-size: 20}\n\\header{\\p[big]{\\v{fullName}}}"
    );
    expect(diagnostics).toEqual([]);
    expect(template?.styles.big).toHaveLength(1);
  });

  it("ignores a redeclared built-in font option with a warning", () => {
    const { template, diagnostics } = compileTemplate(
      wrap('\\option[font, type=choice, default=Inter, choices="Inter|Figtree"]\n\\header{\\p[s]{\\v{fullName}}}')
    );
    expect(template?.options.map((o) => o.name)).toEqual(["font"]);
    expect(template?.options[0].type).toBe("font");
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "warning", message: expect.stringMatching(/built in/) })]);
  });

  it("rejects unknown fields with the available ones listed", () => {
    const { template, diagnostics } = compileTemplate(wrap("\\header{\\p{\\v{nmae}}}"));
    expect(template).toBeNull();
    expect(diagnostics[0].message).toMatch(/Unknown field `nmae`.*fullName/);
    expect(diagnostics[0].line).toBe(3);
  });

  it("checks fields against the section kind", () => {
    const ok = compileTemplate(wrap("\\section[skills]{\\entries{\\p{\\list{items}}}}"));
    expect(ok.diagnostics).toEqual([]);
    const bad = compileTemplate(wrap("\\section[skills]{\\entries{\\p{\\v{jobTitle}}}}"));
    expect(bad.diagnostics[0].message).toMatch(/Unknown field `jobTitle`/);
  });

  it("requires list fields for \\list and date fields for \\range", () => {
    const { diagnostics } = compileTemplate(
      wrap("\\section[experience]{\\entries{\\p{\\list{company} \\range{location}}}}")
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringMatching(/needs a list field/),
      expect.stringMatching(/needs a date field/),
    ]);
  });

  it("rejects unknown commands, styles, labels and properties", () => {
    const { diagnostics } = compileTemplate(
      `\\template[id=t, name=T]
\\style[a]{font-size: 10; colour: red}
\\script{alert(1)}
\\header{\\p[missing]{\\label{nope}}}`
    );
    const messages = diagnostics.map((d) => d.message).join("\n");
    expect(messages).toMatch(/Unknown property `colour`/);
    expect(messages).toMatch(/`\\script` isn't allowed/);
    expect(messages).toMatch(/Unknown label `nope`/);
    expect(messages).toMatch(/Unknown style `missing`/);
  });

  it("validates style values and option references", () => {
    const { diagnostics } = compileTemplate(
      `\\template[id=t, name=T]
\\option[accent, type=color, default=#00d9cb]
\\style[a]{color: @accent; border-bottom: 1 @accent}
\\style[b]{color: red; font-weight: heavy; margin-top: @nope}`
    );
    expect(diagnostics.map((d) => d.message)).toEqual([
      expect.stringMatching(/`color`: expected a hex colour/),
      expect.stringMatching(/`font-weight`: expected one of normal, light, bold/),
      expect.stringMatching(/Unknown option `@nope`/),
    ]);
  });

  it("requires text to be inside paragraphs and blocks outside them", () => {
    const { diagnostics } = compileTemplate(wrap("\\header{loose text \\p{\\row{\\p{a}}{\\p{b}}}}"));
    const messages = diagnostics.map((d) => d.message).join("\n");
    expect(messages).toMatch(/must be inside a paragraph/);
    expect(messages).toMatch(/`\\row` is a block/);
  });

  it("checks custom-section fields and \\sectiontitle placement", () => {
    const ok = compileTemplate(wrap("\\section[*]{\\p{\\sectiontitle}\\entries{\\p{\\v{subtitle} \\lines{items}}}}"));
    expect(ok.diagnostics).toEqual([]);
    const bad = compileTemplate(wrap("\\header{\\p{\\sectiontitle}}\\section[*]{\\entries{\\p{\\v{jobTitle}}}}"));
    expect(bad.diagnostics.map((d) => d.message)).toEqual([
      expect.stringMatching(/`\\sectiontitle` can only be used inside a `\\section`/),
      expect.stringMatching(/Unknown field `jobTitle`/),
    ]);
  });

  it("only allows `.` inside \\each", () => {
    const { diagnostics } = compileTemplate(wrap("\\header{\\p{\\v{.}}}"));
    expect(diagnostics[0].message).toMatch(/only be used inside `\\each`/);
  });
});
