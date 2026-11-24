import { describe, expect, it } from "vitest";
import { normalizeResume } from "@/lib/resumeMigration";
import type { ResumeContent } from "@/lib/resumesStore";
import { sampleResume } from "../testing/sample";
import { escapeText, parseContent, printContent } from "./content";

const roundTrip = (content: ResumeContent) => {
  const text = printContent(content);
  const { content: back, diagnostics } = parseContent(text);
  expect(diagnostics).toEqual([]);
  return { text, back };
};

describe("content .rsm", () => {
  it("round-trips the sample resume exactly", () => {
    const content = normalizeResume(sampleResume())!.content;
    const { back } = roundTrip(content);
    expect(back).toEqual(content);
  });

  it("round-trips awkward text", () => {
    const content = normalizeResume(sampleResume())!.content;
    content.personal.fullName = "Đorđe {the} \\ Ćirić";
    content.experience[0].description = "Line one\n% not a comment\n  %also text\nCut costs 30% & R&D #1 $5_x ~^";
    content.experience[0].notes = ["  leading and trailing  ", "", "Ђорђе [brackets] \\item{x}"];
    content.skills[0].items = [];
    content.education[0].date = { from: "2015" }; // no `to`
    content.experience[0].date = { from: "2021", to: "" }; // empty `to`
    const { back } = roundTrip(content);
    expect(back).toEqual(content);
  });

  it("round-trips optional fields, custom sections and layout", () => {
    const content = normalizeResume({
      id: "x",
      content: {
        personal: { fullName: "A", email: "", location: "" }, // no phone/website/...
        experience: [{ jobTitle: "Dev", company: "Co", location: "", description: "", date: { from: "2020" } }], // no notes
        layout: {
          order: ["custom:langs", "skills"],
          hidden: [],
          titles: { experience: "Work", "custom:langs": 'Quote " and \\ backslash' },
        },
        custom: [
          {
            id: "langs",
            title: "Languages {}",
            entries: [{ title: "Serbian", subtitle: "Native", location: "", date: { from: "" }, description: "", items: ["Read", "Write"] }],
          },
          { id: "empty one", title: "", entries: [] },
        ],
      },
    })!.content;
    const { back } = roundTrip(content);
    expect(back).toEqual(content);
  });

  it("prints one field per line in a stable order", () => {
    const text = printContent(normalizeResume(sampleResume())!.content);
    expect(text).toMatch(/^\\personal\{\n  \\fullName\{Jane Marie Doe\}\n  \\email\{jane@doe.dev\}/);
    expect(text).toContain("\\experience{\n  \\entry{\n    \\jobTitle{Software Engineer}");
    expect(text).toContain("    \\notes{\n      \\item{Led a team of 4 engineers.}");
    expect(printContent(normalizeResume(sampleResume())!.content)).toBe(text);
  });

  it("escapes only what needs escaping", () => {
    expect(escapeText("30% & R&D $5 #1")).toBe("30% & R&D $5 #1");
    expect(escapeText("a{b}\\c")).toBe("a\\{b\\}\\\\c");
    expect(escapeText("%x\n  %y")).toBe("\\%x\n  \\%y");
  });

  it("accepts hand-written source with comments and missing fields", () => {
    const { content, diagnostics } = parseContent(`
% my resume
\\personal{ \\fullName{Ana} }
\\skills{
  \\entry{\\category{Web}\\items{\\item{React}}}
}
`);
    expect(diagnostics).toEqual([]);
    expect(content?.personal).toEqual({ fullName: "Ana", email: "", location: "" });
    expect(content?.skills).toEqual([{ category: "Web", items: ["React"] }]);
    expect(content?.experience).toEqual([]);
  });

  it("keeps fields outside the schema when merging parsed content", async () => {
    const { mergeParsedContent } = await import("./content");
    const current = normalizeResume(sampleResume())!.content;
    (current.personal as Record<string, unknown>).socials = ["x"];
    (current.experience[0] as Record<string, unknown>).internalId = 7;
    current.layout = { hidden: ["awards"] };
    const parsed = parseContent(printContent(current).replace("\\phone{+381 60 123 4567}\n", "")).content!;
    const merged = mergeParsedContent(current, parsed);
    expect((merged.personal as Record<string, unknown>).socials).toEqual(["x"]);
    expect((merged.experience[0] as Record<string, unknown>).internalId).toBe(7);
    expect(merged.personal.phone).toBeUndefined(); // removing a schema field in the text removes it
    expect(merged.layout).toEqual({ hidden: ["awards"] });
    const noLayout = parseContent(printContent({ ...current, layout: undefined })).content!;
    expect("layout" in mergeParsedContent(current, noLayout)).toBe(false);
  });

  it("reports mistakes with positions", () => {
    const { content, diagnostics } = parseContent(`\\personal{
  \\fullname{Ana}
}
\\experience{
  \\entry{\\jobTitle{Dev \\b{bold}}}
  stray text
}
\\hobbies{}
\\custom{\\title{X}}`);
    expect(content).toBeNull();
    expect(diagnostics.map((d) => [d.line, d.message])).toEqual([
      [2, expect.stringMatching(/Unknown field `\\fullname`.*fullName/)],
      [5, expect.stringMatching(/`\\b` isn't allowed inside `\\jobTitle`/)],
      [6, expect.stringMatching(/Text `stray text` must be inside a field/)],
      [8, expect.stringMatching(/Unknown section `\\hobbies`/)],
      [9, expect.stringMatching(/`\\custom` needs an id/)],
    ]);
  });
});
