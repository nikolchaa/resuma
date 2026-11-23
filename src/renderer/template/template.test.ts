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
      ["awards", "education", "experience", "projects", "skills"]
    );
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

  it("only allows `.` inside \\each", () => {
    const { diagnostics } = compileTemplate(wrap("\\header{\\p{\\v{.}}}"));
    expect(diagnostics[0].message).toMatch(/only be used inside `\\each`/);
  });
});
