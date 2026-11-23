/**
 * Thumbnail painter: draws page 1 of the laid-out document onto a canvas
 * (no PDF round-trip). Fonts must already be loaded via `loadFonts()`.
 */
import { cssFamily } from "../engine/fonts";
import type { RenderedDocument } from "../engine/types";

export function renderThumbnail(doc: RenderedDocument, scale = 1): string {
  const page = doc.pages[0];
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.width * scale);
  canvas.height = Math.round(page.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.textBaseline = "alphabetic";
  if ("fontKerning" in ctx) (ctx as CanvasRenderingContext2D & { fontKerning: string }).fontKerning = "none";

  for (const item of page.items) {
    if (item.type === "text") {
      ctx.font = `${item.size}px "${cssFamily(item.fontKey)}"`;
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y);
    } else if (item.type === "rect") {
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x, item.y, item.w, item.h);
    }
  }
  return canvas.toDataURL("image/png");
}
