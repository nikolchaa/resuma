import fs from "fs";
import path from "path";
import { FONT_FILES, FontSet } from "../engine/fonts";

/** Loads the app's TTFs from disk (tests run in Node). */
export function loadTestFonts(): FontSet {
  const set = new FontSet();
  for (const f of FONT_FILES) {
    const bytes = fs.readFileSync(path.resolve(__dirname, "../../assets/fonts", f.file));
    set.add(f.family, f.weight, new Uint8Array(bytes));
  }
  return set;
}

export { sampleResume } from "./sample";
