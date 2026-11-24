import { describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES } from "@/templates";
import { checkTemplate, contrast } from "./check";
import { loadTestFonts, sampleResume } from "./testing/fixtures";

const fonts = loadTestFonts();
const opts = { format: "A4" as const, language: "en" as const, fonts };

describe("checkTemplate", () => {
  it.each(Object.keys(BUILTIN_TEMPLATES))("finds nothing wrong with the built-in %s", (id) => {
    expect(checkTemplate(BUILTIN_TEMPLATES[id], sampleResume(), opts, BUILTIN_TEMPLATES.professional)).toEqual([]);
  });

  it("reports sections that render nothing, including custom sections", () => {
    const tpl = BUILTIN_TEMPLATES.modern
      .replace(/\\section\[awards\]\{[\s\S]*?\n\}\n/, "")
      .replace(/\\section\[\*\]\{[\s\S]*?\n\}\n/, "");
    // Without \section[*] custom sections still render through the fallback.
    expect(checkTemplate(tpl, sampleResume(), opts)).toEqual([{ kind: "missingSections", values: ["awards"] }]);
  });

  it("reports text that blends into the page or a column background", () => {
    const white = BUILTIN_TEMPLATES.professional.replace("color: #1f2937}", "color: #fafafa}");
    const issue = checkTemplate(white, sampleResume(), opts).find((i) => i.kind === "lowContrast");
    expect(issue).toMatchObject({ kind: "lowContrast" });
    expect((issue as { values: string[] }).values).toContain("Alex Example".toUpperCase());

    const dark = BUILTIN_TEMPLATES.sidebar.replace("default=#e5e7eb", "default=#2a3444");
    const side = checkTemplate(dark, sampleResume(), opts).find((i) => i.kind === "lowContrast") as {
      values: string[];
      pairs: { text: string; background: string }[];
    };
    // Examples are quoted from the probe resume, never from the user's own text.
    expect(side.values).toContain("alex@example.com");
    expect(side.pairs).toContainEqual({ text: "#2a3444", background: "#1f2937" });
  });

  it("never quotes the user's own text in any issue", () => {
    const data = sampleResume();
    const personal = Object.values(data.content.personal).filter(Boolean) as string[];
    const words = [...personal, "Acme", "Built the billing platform", "University of Belgrade"];
    // Unreadable everywhere, off the page and tiny: every kind of issue fires.
    const broken = BUILTIN_TEMPLATES.sidebar
      .replace("default=#e5e7eb", "default=#1f2937")
      .replace("\\page{margin: 36;", "\\page{margin: 0;")
      .replace("\\style[text]{font-size: 9.5;", "\\style[text]{font-size: 5;")
      .replace("\\style[heading]{font-size: 12;", "\\style[heading]{color: #ffffff; font-size: 12;");
    const issues = checkTemplate(broken, data, opts, BUILTIN_TEMPLATES.professional);
    expect(issues.map((i) => i.kind)).toEqual(expect.arrayContaining(["lowContrast", "tinyText"]));
    const text = JSON.stringify(issues);
    for (const w of words) expect(text).not.toContain(w);
  });

  it("reports tiny text and a resume that needs more pages", () => {
    const tiny = BUILTIN_TEMPLATES.professional.replace("\\style[small]{font-size: 9;", "\\style[small]{font-size: 5;");
    expect(checkTemplate(tiny, sampleResume(), opts)).toEqual([{ kind: "tinyText", size: 5 }]);

    const huge = BUILTIN_TEMPLATES.professional.replace("\\style[text]{font-size: 10;", "\\style[text]{font-size: 40;");
    expect(checkTemplate(huge, sampleResume(), opts, BUILTIN_TEMPLATES.professional)).toContainEqual({
      kind: "morePages",
      before: 1,
      after: 2,
    });
  });

  it("ignores invalid templates (the validator reports those)", () => {
    expect(checkTemplate("\\template[id=x]\n\\p{", sampleResume(), opts)).toEqual([]);
  });

  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrast("#777", "#777777")).toBeCloseTo(1);
  });
});
