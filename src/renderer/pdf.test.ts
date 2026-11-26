import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFName } from "pdf-lib";
import { renderResume } from ".";
import { writePdf } from "./pdf";
import { loadTestFonts, sampleResume } from "./testing/fixtures";

const fonts = loadTestFonts();

async function readPdf(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = (await page.getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join("\n");
    const links = (await page.getAnnotations()).map((a) => a.url).filter(Boolean);
    pages.push({ text, links, view: page.view });
  }
  const meta = (await pdf.getMetadata()).info as Record<string, string>;
  return { pages, meta };
}

describe("writePdf", () => {
  it("writes extractable text, links, metadata and the right page size", async () => {
    const data = sampleResume();
    data.content.personal.fullName = "Đorđe Šćekić";
    const doc = renderResume(data, { format: "LETTER", language: "en", fonts });
    const { pages, meta } = await readPdf(await writePdf(doc, fonts));

    expect(pages).toHaveLength(1);
    expect(pages[0].view).toEqual([0, 0, 612, 792]);
    expect(pages[0].text).toContain("ĐORĐE ŠĆEKIĆ");
    expect(pages[0].text).toContain("• Led a team of 4 engineers.");
    // pdf.js normalises URLs, hence the trailing slash
    expect(pages[0].links).toEqual(
      expect.arrayContaining(["mailto:jane@doe.dev", "tel:+381601234567", "https://jane.dev/"])
    );
    expect(meta.Title).toBe("Jane Doe — Engineer");
    expect(meta.Author).toBe("Đorđe Šćekić");
    expect(meta.Creator).toBe("Resuma");
    expect(meta.Producer).toBe("Resuma PDF Renderer");
  });

  it("writes Cyrillic text through the fallback font", async () => {
    const data = { ...sampleResume(), font: "spaceGrotesk" };
    data.content.personal.fullName = "Ђорђе Ћирић";
    const doc = renderResume(data, { format: "A4", language: "rs", fonts });
    const { pages } = await readPdf(await writePdf(doc, fonts));
    expect(pages[0].text).toContain("ЂОРЂЕ ЋИРИЋ");
  });

  it("writes Russian section headings in a Latin-only font and tags the PDF", async () => {
    // Figtree has no Cyrillic; the headings come from the Russian strings.
    const data = { ...sampleResume(), font: "figtree" };
    const doc = renderResume(data, { format: "A4", language: "ru", fonts });
    const bytes = await writePdf(doc, fonts);
    const { pages } = await readPdf(bytes);
    expect(pages[0].text.toUpperCase()).toContain("ОПЫТ РАБОТЫ");
    const pdf = await PDFDocument.load(bytes);
    expect(String(pdf.catalog.get(PDFName.of("Lang")))).toContain("ru");
  });

  it("writes one PDF page per laid-out page", async () => {
    const data = sampleResume();
    data.content.experience = Array.from({ length: 30 }, () => data.content.experience[0]);
    const doc = renderResume(data, { format: "A4", language: "en", fonts });
    const { pages } = await readPdf(await writePdf(doc, fonts));
    expect(pages).toHaveLength(doc.pages.length);
  });
});
