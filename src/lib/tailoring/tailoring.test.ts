import { describe, expect, it } from "vitest";
import type { ResumeContent } from "@/lib/resumesStore";
import { normalizeResume } from "@/lib/resumeMigration";
import { sampleResume } from "@/renderer/testing/sample";
import { leaveOutCandidates, protectedItems, readYesNo, relevanceItems, Verdict } from "./relevance";
import { applyExperienceReply, applyProjectReply, modelBillions } from "./rewrite";

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
  const reworded = "Built and ran the billing platform used by 2,000 customers; cut invoice time by 40%.";
  const ad =
    "Backend Developer (Python). Ledgerly builds invoicing and payment software for 40,000 small businesses across Europe. Design, build and maintain REST APIs in Python using Django and FastAPI.";

  it("takes only the wording from the reply, and keeps every other field", () => {
    const reply = `\`\`\`json\n{"description": "${reworded}", "notes": ["Led the move to TypeScript"], "company": "Evil Corp"}\n\`\`\``;
    const after = applyExperienceReply({ ...job, notes: ["Moved the code to TypeScript"] }, reply, ad)!;
    expect(after).toMatchObject({ company: "Acme", jobTitle: "Software Engineer", description: reworded });
    expect(after.notes).toEqual(["Led the move to TypeScript"]);
  });

  it("keeps the original bullet points when the reply drops some or comments on them", () => {
    const original = { ...job, notes: ["One thing", "Another thing"] };
    const dropped = applyExperienceReply(original, `{"description": "${reworded}", "notes": ["Only one"]}`, ad)!;
    expect(dropped.notes).toEqual(["One thing", "Another thing"]);
    expect(dropped.description).toBe(reworded);
    const commentary = applyExperienceReply(
      original,
      `{"description": "${reworded}", "notes": ["One thing", "The entry already aligns with the job description."]}`,
      ad
    )!;
    expect(commentary.notes).toEqual(["One thing", "Another thing"]);
  });

  it("refuses a description copied from the job ad, cut down, or padded out", () => {
    // Small models paste the ad into the entry.
    expect(applyExperienceReply(job, `{"description": "${ad}", "notes": []}`, ad)).toBeNull();
    // Using the ad's words for what the entry already says is the point.
    expect(applyExperienceReply(job, '{"description": "Designed and maintained the billing platform\'s REST APIs, used by 2,000 customers.", "notes": []}', ad)).not.toBeNull();
    expect(applyExperienceReply(job, '{"description": "Software Engineer, Acme", "notes": []}', ad)).toBeNull();
    expect(applyExperienceReply(job, `{"description": "${reworded.repeat(4)}", "notes": []}`, ad)).toBeNull();
  });

  it("refuses replies that aren't usable", () => {
    expect(applyExperienceReply(job, "Sure! Here is a better version.")).toBeNull();
    const project = content().projects[0];
    expect(applyProjectReply(project, '{"description": ""}')).toBeNull();
    expect(applyProjectReply(project, 'Here: {"description": "An open-source resume builder."} Hope it helps')).toMatchObject({
      name: project.name,
      description: "An open-source resume builder.",
    });
  });

  it("reads a model's size from its name", () => {
    expect(modelBillions("Qwen3-0.6B-Q8_0")).toBe(0.6);
    expect(modelBillions("Qwen3-0_6B-Q8_0")).toBe(0.6);
    expect(modelBillions("qwen3:0.6b")).toBe(0.6);
    expect(modelBillions("Qwen_Qwen3-8B-GGUF_Qwen3-8B-Q4_K_M_gguf")).toBe(8);
    expect(modelBillions("Llama-3.2-3B-Instruct")).toBe(3);
    expect(modelBillions("gpt-4.1-mini")).toBeNull();
    expect(modelBillions("claude-sonnet-5-5")).toBeNull();
  });
});
