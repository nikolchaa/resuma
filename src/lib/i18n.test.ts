import { describe, expect, it } from "vitest";
import { LANGUAGES, languageTag, normalizeLanguage, translations } from "./i18n";

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("translations", () => {
  const english = translations.en;

  for (const { value } of LANGUAGES.filter((l) => l.value !== "en")) {
    it(`${value} has every English string, with the same placeholders`, () => {
      const strings = translations[value];
      expect(Object.keys(english).filter((key) => !(key in strings))).toEqual([]);
      expect(Object.keys(strings).filter((key) => !(key in english))).toEqual([]);
      const broken = Object.keys(english).filter(
        (key) => placeholders(english[key]).join() !== placeholders(strings[key]).join(),
      );
      expect(broken).toEqual([]);
    });
  }

  it("names every language in every language", () => {
    for (const { value } of LANGUAGES) {
      for (const { labelKey } of LANGUAGES) expect(translations[value][labelKey]).toBeTruthy();
    }
  });

  it("reads stored languages and tags PDFs", () => {
    expect(normalizeLanguage("ru")).toBe("ru");
    expect(normalizeLanguage("es")).toBe("es");
    expect(normalizeLanguage("de")).toBe("en");
    expect(normalizeLanguage(undefined)).toBe("en");
    // Serbian is stored as "rs" (a country code) but is "sr" in documents.
    expect(languageTag("rs")).toBe("sr");
    expect(languageTag("ru")).toBe("ru");
  });
});
