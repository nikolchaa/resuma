/**
 * Loads the template fonts once in the webview: the TTF bytes feed fontkit
 * (metrics + PDF embedding) and are registered as FontFaces under unique
 * names so the SVG preview and canvas thumbnails draw the very same glyphs.
 */
import { FONT_FILES, FontSet, cssFamily } from "../engine/fonts";

/** Every bundled TTF, by file name. */
const URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("/src/assets/fonts/*.ttf", { eager: true, query: "?url", import: "default" })
  ).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url])
);

let pending: Promise<FontSet> | null = null;

export function loadFonts(): Promise<FontSet> {
  if (!pending) {
    pending = (async () => {
      const set = new FontSet();
      await Promise.all(
        FONT_FILES.map(async (f) => {
          const url = URLS[f.file];
          if (!url) throw new Error(`Font ${f.file} isn't bundled`);
          const res = await fetch(url);
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
