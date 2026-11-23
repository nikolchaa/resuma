/**
 * PDF painter: writes the laid-out pages with pdf-lib. Fonts are the same
 * bytes used for measuring, embedded with the same OpenType
 * features, so text lands exactly where the preview shows it. Text stays
 * real text (selectable, ATS-readable), and links become URI annotations.
 */
import { PDFDocument, PDFFont, PDFName, PDFString, rgb } from "pdf-lib";
import { FONT_FEATURES, FontSet, fontkit } from "./engine/fonts";
import type { RenderedDocument } from "./engine/types";

const hexToRgb = (hex: string) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function writePdf(doc: RenderedDocument, fonts: FontSet): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit as never);

  pdf.setTitle(doc.meta.title);
  pdf.setAuthor(doc.meta.author);
  pdf.setSubject(doc.meta.subject);
  pdf.setCreator("Resuma");
  pdf.setProducer("Resuma PDF Renderer");
  pdf.setLanguage(doc.meta.language === "rs" ? "sr" : "en");
  const now = new Date();
  pdf.setCreationDate(now);
  pdf.setModificationDate(now);

  const embedded = new Map<string, PDFFont>();
  for (const f of fonts.all()) {
    if (!doc.fontKeys.includes(f.key)) continue;
    // Full embedding: pdf-lib's subsetter drops glyphs from Inter (verified
    // visually), and our fonts are small enough (≤ ~310 KB) to embed whole.
    embedded.set(f.key, await pdf.embedFont(f.bytes, { subset: false, features: FONT_FEATURES as never }));
  }

  for (const laid of doc.pages) {
    const page = pdf.addPage([laid.width, laid.height]);
    const H = laid.height;
    const annots = [];
    for (const item of laid.items) {
      if (item.type === "text") {
        const font = embedded.get(item.fontKey);
        if (!font) continue;
        page.drawText(item.text, {
          x: item.x,
          y: H - item.y,
          size: item.size,
          font,
          color: hexToRgb(item.color),
        });
      } else if (item.type === "rect") {
        page.drawRectangle({
          x: item.x,
          y: H - item.y - item.h,
          width: item.w,
          height: item.h,
          color: hexToRgb(item.color),
        });
      } else if (item.type === "link") {
        annots.push(
          pdf.context.register(
            pdf.context.obj({
              Type: "Annot",
              Subtype: "Link",
              Rect: [item.x, H - item.y - item.h, item.x + item.w, H - item.y],
              Border: [0, 0, 0],
              A: { Type: "Action", S: "URI", URI: PDFString.of(item.href) },
            })
          )
        );
      }
    }
    if (annots.length) page.node.set(PDFName.of("Annots"), pdf.context.obj(annots));
  }

  return pdf.save();
}
