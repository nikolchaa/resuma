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
    expect((issue as { values: string[] }).values.length).toBeGreaterThan(0);

    const dark = BUILTIN_TEMPLATES.sidebar.replace("default=#e5e7eb", "default=#2a3444");
    const side = checkTemplate(dark, sampleResume(), opts).find((i) => i.kind === "lowContrast") as {
      values: string[];
      pairs: { text: string; background: string }[];
    };
    expect(side.values).toContain("jane@doe.dev");
    expect(side.pairs).toContainEqual({ text: "#2a3444", background: "#1f2937" });
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
