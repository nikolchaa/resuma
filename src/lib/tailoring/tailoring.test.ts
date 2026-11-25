import { describe, expect, it } from "vitest";
import type { ResumeContent } from "@/lib/resumesStore";
import { normalizeResume } from "@/lib/resumeMigration";
import { sampleResume } from "@/renderer/testing/sample";
import { leaveOutCandidates, protectedItems, readYesNo, relevanceItems, Verdict } from "./relevance";
import { applyExperienceReply, applyProjectReply } from "./rewrite";

const content = (): ResumeContent => {
  const c = normalizeResume(sampleResume())!.content;
  const acme = c.experience[0];
  c.experience = [
    { ...acme, jobTitle: "Barista", company: "Kafeterija", date: { from: "2019", to: "2021" } },
    { ...acme, jobTitle: "Software Engineer", company: "Acme", date: { from: "2022", to: "" } },
    { ...acme, jobTitle: "Intern", company: "Initech", date: { from: "2018", to: "2018" } },
  ];
  return c;
};

const verdicts = (c: ResumeContent, drop: string[]): Verdict[] =>
  relevanceItems(c, "en").map((item) => ({
    item,
    keep: !drop.includes(`${item.section}:${item.index}`),
    score: drop.includes(`${item.section}:${item.index}`) ? 0 : 1,
  }));

describe("relevance", () => {
  it("describes entries as prose, with the section name in the app's language", () => {
    const items = relevanceItems(content(), "rs");
    const barista = items.find((i) => i.label === "Barista, Kafeterija")!;
    expect(barista.text).toMatch(/^Iskustvo: Barista – Kafeterija \(2019 – 2021\)\./);
    expect(items.find((i) => i.section === "skills")!.text).toBe("Veštine – Languages: TypeScript, Rust, Go.");
  });

  it("never suggests leaving out the current job or the only degree", () => {
    const c = content();
    // The job without an end date is the current one, wherever it is listed.
    expect(protectedItems(c)).toEqual(new Set(["experience:1", "education:0"]));
    const out = leaveOutCandidates(verdicts(c, ["experience:0", "experience:1", "education:0"]), c);
    expect(out.map((i) => i.label)).toEqual(["Barista, Kafeterija"]);
  });

  it("never empties a section", () => {
    const c = content();
    c.experience[1].date = { from: "2020", to: "2021" };
    c.education.push({ ...c.education[0], degree: "MSc", school: "ETH" });
    const out = leaveOutCandidates(verdicts(c, ["skills:0", "education:0", "education:1"]), c);
    expect(out.filter((i) => i.section === "skills")).toEqual([]);
    expect(out.filter((i) => i.section === "education")).toHaveLength(1);
  });

  it("reads only a clear no as no", () => {
    expect(readYesNo("no")).toBe(false);
    expect(readYesNo("No.")).toBe(false);
    expect(readYesNo("Ne")).toBe(false);
    expect(readYesNo("yes")).toBe(true);
    expect(readYesNo("I'm not sure")).toBe(true);
    expect(readYesNo("")).toBe(true);
  });
});

describe("rewording", () => {
  const job = content().experience[1];

  it("takes only the wording from the reply, and keeps every other field", () => {
    const reply = '```json\n{"description": "Built web apps.", "notes": ["Led the move to TypeScript"], "company": "Evil Corp"}\n```';
    const after = applyExperienceReply({ ...job, notes: ["Moved the code to TypeScript"] }, reply)!;
    expect(after).toMatchObject({ company: "Acme", jobTitle: "Software Engineer", description: "Built web apps." });
    expect(after.notes).toEqual(["Led the move to TypeScript"]);
  });

  it("keeps the original bullet points when the reply drops some", () => {
    const original = { ...job, notes: ["One", "Two"] };
    const after = applyExperienceReply(original, '{"description": "New.", "notes": ["Only one"]}')!;
    expect(after.notes).toEqual(["One", "Two"]);
    expect(after.description).toBe("New.");
  });

  it("refuses replies that aren't usable", () => {
    expect(applyExperienceReply(job, "Sure! Here is a better version.")).toBeNull();
    const project = content().projects[0];
    expect(applyProjectReply(project, '{"description": ""}')).toBeNull();
    expect(applyProjectReply(project, 'Here: {"description": "A resume builder."} Hope it helps')).toMatchObject({
      name: project.name,
      description: "A resume builder.",
    });
  });
});
