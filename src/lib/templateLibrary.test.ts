import { describe, expect, it } from "vitest";
import { compileTemplate } from "@/renderer/template/template";
import { BUILTIN_TEMPLATES } from "@/templates";
import { libraryIdFor, slugify, withHeader } from "./templateLibrary";

describe("template library helpers", () => {
  it("turns names into file-safe ids", () => {
    expect(slugify("My Sidebar!")).toBe("my-sidebar");
    expect(slugify("Šablon – Čist")).toBe("sablon-cist");
    expect(slugify("???")).toBe("template");
    expect(slugify("../../etc")).toBe("etc");
  });

  it("never shadows a built-in template", () => {
    expect(libraryIdFor("Modern")).toBe("modern-own");
    expect(libraryIdFor("Modern Blue")).toBe("modern-blue");
  });

  it("rewrites only the \\template header", () => {
    const out = withHeader(BUILTIN_TEMPLATES.sidebar, "dark-side", 'Dark "side" [v2]');
    const { template, diagnostics } = compileTemplate(out);
    expect(diagnostics).toEqual([]);
    expect(template).toMatchObject({ id: "dark-side", name: "Dark side v2" });
    expect(out.split("\n").slice(1)).toEqual(BUILTIN_TEMPLATES.sidebar.split("\n").slice(1));
  });
});
