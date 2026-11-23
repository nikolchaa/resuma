/**
 * Font metrics shared by layout, the PDF writer and the screen painters.
 *
 * The same TTF bytes are measured here (fontkit), embedded in the PDF
 * (pdf-lib, same fontkit fork) and registered in the DOM (FontFace), with
 * kerning and ligatures off everywhere so glyph advances match exactly.
 */
import * as fontkitModule from "@pdf-lib/fontkit";
import type { Weight } from "../template/styles";

/**
 * The ES build of @pdf-lib/fontkit only has a default export, while Node
 * resolves the UMD build's named exports; accept both.
 */
export const fontkit: typeof fontkitModule =
  (fontkitModule as unknown as { default?: typeof fontkitModule }).default ?? fontkitModule;

/** OpenType features used for measuring *and* PDF embedding. */
export const FONT_FEATURES = { liga: false, kern: false, calt: false };

/** CSS that makes the browser shape text the same way. */
export const DOM_TEXT_CSS =
  'font-kerning: none; font-variant-ligatures: none; font-feature-settings: "kern" 0, "liga" 0, "calt" 0;';

export const FALLBACK_FAMILY = "Figtree";

/** Font files shipped with the app. "normal" is the Light cut (as before). */
export const FONT_FILES: { family: string; weight: Weight; file: string }[] = [
  { family: "Figtree", weight: "normal", file: "Figtree-Light.ttf" },
  { family: "Figtree", weight: "bold", file: "Figtree-Bold.ttf" },
  { family: "Inter", weight: "normal", file: "Inter-Light.ttf" },
  { family: "Inter", weight: "bold", file: "Inter-Bold.ttf" },
  { family: "Space Grotesk", weight: "normal", file: "SpaceGrotesk-Light.ttf" },
  { family: "Space Grotesk", weight: "bold", file: "SpaceGrotesk-Bold.ttf" },
];

export const fontKey = (family: string, weight: Weight) => `${family}|${weight}`;

/** Unique, CSS-safe family name used for DOM/canvas painting. */
export const cssFamily = (key: string) => "rsm-" + key.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase();

export type LoadedFont = {
  key: string;
  family: string;
  weight: Weight;
  bytes: Uint8Array;
  font: fontkitModule.Font;
  /** Per-em metrics (already divided by unitsPerEm). */
  ascent: number;
  descent: number;
  lineGap: number;
};

export class FontSet {
  private fonts = new Map<string, LoadedFont>();
  private widthCache = new Map<string, number>();

  add(family: string, weight: Weight, bytes: Uint8Array): LoadedFont {
    const font = fontkit.create(bytes);
    const upm = font.unitsPerEm;
    const loaded: LoadedFont = {
      key: fontKey(family, weight),
      family,
      weight,
      bytes,
      font,
      ascent: font.ascent / upm,
      descent: font.descent / upm,
      lineGap: font.lineGap / upm,
    };
    this.fonts.set(loaded.key, loaded);
    return loaded;
  }

  /** Resolves a family/weight to a loaded font, falling back to Figtree. */
  get(family: string, weight: Weight): LoadedFont {
    return (
      this.fonts.get(fontKey(family, weight)) ??
      this.fonts.get(fontKey(family, "normal")) ??
      this.fonts.get(fontKey(FALLBACK_FAMILY, weight)) ??
      this.fonts.get(fontKey(FALLBACK_FAMILY, "normal")) ??
      [...this.fonts.values()][0]
    );
  }

  all(): LoadedFont[] {
    return [...this.fonts.values()];
  }

  /** Advance width of `text` at 1pt, in points. Cached. */
  private unitWidth(f: LoadedFont, text: string): number {
    const cacheKey = f.key + "\u0000" + text;
    let w = this.widthCache.get(cacheKey);
    if (w === undefined) {
      const run = f.font.layout(text, FONT_FEATURES as never);
      let units = 0;
      for (const g of run.glyphs) units += g.advanceWidth;
      w = units / f.font.unitsPerEm;
      if (this.widthCache.size > 50000) this.widthCache.clear();
      this.widthCache.set(cacheKey, w);
    }
    return w;
  }

  measure(f: LoadedFont, text: string, size: number): number {
    return text ? this.unitWidth(f, text) * size : 0;
  }
}
