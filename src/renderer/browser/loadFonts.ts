/**
 * Loads the template fonts once in the webview: the TTF bytes feed fontkit
 * (metrics + PDF embedding) and are registered as FontFaces under unique
 * names so the SVG preview and canvas thumbnails draw the very same glyphs.
 */
import figtreeLight from "@/assets/fonts/Figtree-Light.ttf";
import figtreeBold from "@/assets/fonts/Figtree-Bold.ttf";
import interLight from "@/assets/fonts/Inter-Light.ttf";
import interBold from "@/assets/fonts/Inter-Bold.ttf";
import spaceGroteskLight from "@/assets/fonts/SpaceGrotesk-Light.ttf";
import spaceGroteskBold from "@/assets/fonts/SpaceGrotesk-Bold.ttf";
import { FONT_FILES, FontSet, cssFamily } from "../engine/fonts";

const URLS: Record<string, string> = {
  "Figtree-Light.ttf": figtreeLight,
  "Figtree-Bold.ttf": figtreeBold,
  "Inter-Light.ttf": interLight,
  "Inter-Bold.ttf": interBold,
  "SpaceGrotesk-Light.ttf": spaceGroteskLight,
  "SpaceGrotesk-Bold.ttf": spaceGroteskBold,
};

let pending: Promise<FontSet> | null = null;

export function loadFonts(): Promise<FontSet> {
  if (!pending) {
    pending = (async () => {
      const set = new FontSet();
      await Promise.all(
        FONT_FILES.map(async (f) => {
          const res = await fetch(URLS[f.file]);
          if (!res.ok) throw new Error(`Could not load font ${f.file} (${res.status})`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          const loaded = set.add(f.family, f.weight, bytes);
          const face = new FontFace(cssFamily(loaded.key), bytes.slice().buffer);
          await face.load();
          document.fonts.add(face);
        })
      );
      return set;
    })();
    pending.catch(() => {
      pending = null; // allow a retry after a failure
    });
  }
  return pending;
}
