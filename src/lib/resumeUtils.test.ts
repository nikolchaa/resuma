import { describe, expect, it } from "vitest";
import { normalizeResume } from "./resumeMigration";
import { detectBuzzwords, formatResumeTxt } from "./resumeUtils";
import { orderedSections } from "./sectionLayout";
import { sampleResume } from "@/renderer/testing/sample";

const headings = (txt: string) =>
  txt
    .split("\n")
    .filter((l, i, a) => a[i - 1]?.startsWith("====") && a[i + 1]?.startsWith("====") && !l.startsWith("===="))
    .map((l) => l.trim());

const withCustom = () => {
  const c = normalizeResume(sampleResume())!.content;
  c.custom = [
    { id: "langs", title: "Languages", entries: [{ title: "Serbian", subtitle: "Native", location: "", date: { from: "" }, description: "", items: [] }] },
  ];
  return c;
};

describe("formatResumeTxt", () => {
  it("uses the default order with custom sections last", () => {
    expect(headings(formatResumeTxt(withCustom()))).toEqual([
      "PERSONAL", "EDUCATION", "EXPERIENCE", "PROJECTS", "SKILLS", "AWARDS", "LANGUAGES",
    ]);
  });

  it("follows the user's order, hidden sections and renamed titles", () => {
    const c = withCustom();
    c.layout = { order: ["custom:langs", "skills"], hidden: ["awards", "projects"], titles: { skills: "Toolbox" } };
    const txt = formatResumeTxt(c);
    expect(headings(txt)).toEqual(["PERSONAL", "LANGUAGES", "TOOLBOX", "EDUCATION", "EXPERIENCE"]);
    expect(txt).not.toContain("Hackathon winner");
    expect(txt).toContain("Serbian — Native");
  });

  it("keeps hidden sections out of the buzzword check", () => {
    const c = withCustom();
    c.awards[0].description = "A synergy-driven award.";
    expect(detectBuzzwords(c).map((b) => b.word)).toContain("synergy");
    c.layout = { hidden: ["awards"] };
    expect(detectBuzzwords(c).map((b) => b.word)).not.toContain("synergy");
  });
});

describe("orderedSections", () => {
  it("ignores unknown keys and keeps every section once", () => {
    const c = withCustom();
    c.layout = { order: ["custom:nope" as never, "awards", "awards"] };
    expect(orderedSections(c)).toEqual(["awards", "education", "experience", "projects", "skills", "custom:langs"]);
    expect(orderedSections({ ...c, layout: { hidden: ["skills"] } }, undefined, true)).toContain("skills");
  });
});
