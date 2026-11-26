/**
 * The fonts resumes can use. Everything else (the files the renderer loads,
 * the families templates may name, the resume `font` setting, the editor's
 * font pickers) is derived from this list, so a font is added here once.
 *
 * Every file is a static TTF in `src/assets/fonts/`, shipped unmodified
 * (see THIRD_PARTY.md). Variable fonts won't do: pdf-lib embeds only their
 * default instance. "normal" is a Light cut where the family has a good one,
 * as for the original three; the serifs use Regular, which reads better.
 */
export type FontEntry = {
  /** Family name templates write (`font-family: "IBM Plex Sans"`). */
  family: string;
  /** Value of a resume's `font` setting. */
  setting: string;
  kind: "sans" | "serif";
  /** False for Figtree and Space Grotesk: their Cyrillic falls back to Inter. */
  cyrillic: boolean;
  files: { normal: string; bold: string };
};

export const FONT_CATALOG: FontEntry[] = [
  { family: "Figtree", setting: "figtree", kind: "sans", cyrillic: false, files: { normal: "Figtree-Light.ttf", bold: "Figtree-Bold.ttf" } },
  { family: "Inter", setting: "inter", kind: "sans", cyrillic: true, files: { normal: "Inter-Light.ttf", bold: "Inter-Bold.ttf" } },
  { family: "Space Grotesk", setting: "spaceGrotesk", kind: "sans", cyrillic: false, files: { normal: "SpaceGrotesk-Light.ttf", bold: "SpaceGrotesk-Bold.ttf" } },
  { family: "IBM Plex Sans", setting: "ibmPlexSans", kind: "sans", cyrillic: true, files: { normal: "IBMPlexSans-Light.ttf", bold: "IBMPlexSans-Bold.ttf" } },
  { family: "Montserrat", setting: "montserrat", kind: "sans", cyrillic: true, files: { normal: "Montserrat-Light.ttf", bold: "Montserrat-Bold.ttf" } },
  { family: "Open Sans", setting: "openSans", kind: "sans", cyrillic: true, files: { normal: "OpenSans-Light.ttf", bold: "OpenSans-Bold.ttf" } },
  { family: "Lora", setting: "lora", kind: "serif", cyrillic: true, files: { normal: "Lora-Regular.ttf", bold: "Lora-Bold.ttf" } },
  { family: "PT Serif", setting: "ptSerif", kind: "serif", cyrillic: true, files: { normal: "PTSerif-Regular.ttf", bold: "PTSerif-Bold.ttf" } },
];
