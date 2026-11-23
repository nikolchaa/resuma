import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA, normalizeResume } from "./resumeMigration";

/** Shape of a file written by Resuma 1.0.x (no schema/theme/font, sparse optionals). */
const v1File = {
  id: "my-resume",
  title: "My Resume",
  updated: "2025-08-01T10:00:00.000Z",
  image: "data:image/png;base64,AAAA",
  jobDesc: "Frontend developer",
  content: {
    personal: { fullName: "Ana", email: "ana@x.rs", location: "Niš", socials: [] },
    education: [{ school: "ETF", degree: "BSc", location: "Beograd", gpa: "", date: { from: "2018" } }],
    experience: [
      { jobTitle: "Dev", company: "Co", location: "", description: "Did things", date: { from: "2022", to: "" }, notes: ["a", 3, null] },
    ],
    projects: [],
    skills: [{ category: "Web", items: ["React"] }],
    awards: [],
  },
};

describe("normalizeResume", () => {
  it("upgrades a v1 file without losing anything", () => {
    const out = normalizeResume(structuredClone(v1File))!;
    expect(out.schema).toBe(CURRENT_SCHEMA);
    expect(out.theme).toBe("professional");
    expect(out.font).toBe("figtree");
    expect(out.image).toBe(v1File.image);
    expect(out.jobDesc).toBe("Frontend developer");
    // unknown fields are kept (v1.0.x readers still see what they wrote)
    expect((out.content.personal as Record<string, unknown>).socials).toEqual([]);
    expect(out.content.education[0].date).toEqual({ from: "2018" });
    expect(out.content.experience[0].notes).toEqual(["a", "3"]);
    expect(out.content.skills[0].items).toEqual(["React"]);
  });

  it("keeps the chosen template and font", () => {
    const out = normalizeResume({ ...v1File, theme: "compact", font: "inter" })!;
    expect(out.theme).toBe("compact");
    expect(out.font).toBe("inter");
  });

  it("fills missing sections and fields", () => {
    const out = normalizeResume({ id: "x", content: { personal: {} } })!;
    expect(out.content.experience).toEqual([]);
    expect(out.content.awards).toEqual([]);
    expect(out.content.personal.fullName).toBe("");
    expect(out.title).toBe("");
  });

  it("drops malformed entries instead of crashing", () => {
    const out = normalizeResume({ id: "x", content: { experience: [null, "oops", { jobTitle: 5 }] } })!;
    expect(out.content.experience).toHaveLength(1);
    expect(out.content.experience[0].jobTitle).toBe("5");
  });

  it("is idempotent", () => {
    const once = normalizeResume(structuredClone(v1File));
    expect(normalizeResume(structuredClone(once))).toEqual(once);
  });

  it("normalises layout, custom sections and template options", () => {
    const out = normalizeResume({
      id: "x",
      templateOptions: { accent: "#ff0000", bad: 3 },
      content: {
        layout: {
          order: ["skills", "custom:langs", "nope", "skills", 4],
          hidden: ["awards"],
          titles: { skills: "Toolbox", nope: "x", experience: 5 },
        },
        custom: [
          { id: "langs", title: "Languages", entries: [{ title: "Serbian", items: ["native", 1] }] },
          { id: "langs", title: "Dupe" },
          null,
        ],
      },
    })!;
    expect(out.templateOptions).toEqual({ accent: "#ff0000" });
    expect(out.content.layout).toEqual({
      order: ["skills", "custom:langs"],
      hidden: ["awards"],
      titles: { skills: "Toolbox" },
    });
    expect(out.content.custom?.map((s) => s.id)).toEqual(["langs", "langs-1"]);
    expect(out.content.custom?.[0].entries[0]).toEqual({
      title: "Serbian",
      subtitle: "",
      location: "",
      date: { from: "" },
      description: "",
      items: ["native", "1"],
    });
    expect(out.content.custom?.[1].entries).toEqual([]);
  });

  it("does not add layout or custom to files that have none", () => {
    const out = normalizeResume(structuredClone(v1File))!;
    expect("layout" in out.content).toBe(false);
    expect("custom" in out.content).toBe(false);
    expect("templateOptions" in out).toBe(false);
  });

  it("rejects things that are not resumes", () => {
    expect(normalizeResume(null)).toBeNull();
    expect(normalizeResume("text")).toBeNull();
    expect(normalizeResume([1, 2])).toBeNull();
    expect(normalizeResume({ content: "nope" })).toBeNull();
  });

  it("leaves files from a newer schema untouched", () => {
    const future = { id: "f", schema: 99, content: { blocks: [] } };
    expect(normalizeResume(future)).toBe(future);
  });
});
