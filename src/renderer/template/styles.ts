/**
 * The CSS subset templates use for looks: `property: value;` declarations,
 * validated and clamped. Values may reference template options as `@name`.
 */
import { FONT_FAMILIES } from "./schema";

export type Weight = "normal" | "bold";

export type BoxStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: Weight;
  color?: string;
  textTransform?: "uppercase" | "none";
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  marginTop?: number;
  marginBottom?: number;
  paddingTop?: number;
  paddingBottom?: number;
  borderBottom?: { width: number; color: string } | null;
  keep?: "together" | "with-next";
  /** page only: top right bottom left */
  margin?: [number, number, number, number];
};

/** Raw declarations, still possibly containing `@option` references. */
export type Declarations = { prop: string; value: string; line: number; col: number }[];

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (message: string): Parsed<never> => ({ ok: false, message });

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const parseNumber = (raw: string, lo: number, hi: number): Parsed<number> => {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)(pt)?$/);
  if (!m) return fail(`expected a number in points, got \`${raw}\``);
  return ok(clamp(parseFloat(m[1]), lo, hi));
};

export const isHexColor = (raw: string) =>
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw.trim());

const parseColor = (raw: string): Parsed<string> =>
  isHexColor(raw) ? ok(raw.trim().toLowerCase()) : fail(`expected a hex colour like #1f2937, got \`${raw}\``);

const parseKeyword = <T extends string>(raw: string, allowed: readonly T[]): Parsed<T> => {
  const v = raw.trim() as T;
  return allowed.includes(v) ? ok(v) : fail(`expected one of ${allowed.join(", ")}, got \`${raw}\``);
};

export const parseFontFamily = (raw: string): Parsed<string> => {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  return FONT_FAMILIES[v]
    ? ok(FONT_FAMILIES[v])
    : fail(`unknown font \`${raw}\` (available: ${Object.keys(FONT_FAMILIES).join(", ")})`);
};

/** Property → parser. The keys are the only properties a template may use. */
export const PROPERTIES: Record<string, (raw: string) => Parsed<Partial<BoxStyle>>> = {
  "font-family": (r) => map(parseFontFamily(r), (fontFamily) => ({ fontFamily })),
  "font-size": (r) => map(parseNumber(r, 5, 48), (fontSize) => ({ fontSize })),
  "font-weight": (r) =>
    map(parseKeyword(r, ["normal", "light", "bold"] as const), (w) => ({
      // Only Light ("normal") and Bold files ship; light is the normal face.
      fontWeight: w === "bold" ? "bold" : "normal",
    })),
  color: (r) => map(parseColor(r), (color) => ({ color })),
  "text-transform": (r) =>
    map(parseKeyword(r, ["uppercase", "none"] as const), (textTransform) => ({ textTransform })),
  "text-align": (r) =>
    map(parseKeyword(r, ["left", "center", "right"] as const), (textAlign) => ({ textAlign })),
  "line-height": (r) => {
    const m = r.trim().match(/^(\d+(?:\.\d+)?)$/);
    return m ? ok({ lineHeight: clamp(parseFloat(m[1]), 0.8, 3) }) : fail(`expected a multiplier like 1.2, got \`${r}\``);
  },
  "margin-top": (r) => map(parseNumber(r, 0, 120), (marginTop) => ({ marginTop })),
  "margin-bottom": (r) => map(parseNumber(r, 0, 120), (marginBottom) => ({ marginBottom })),
  "padding-top": (r) => map(parseNumber(r, 0, 120), (paddingTop) => ({ paddingTop })),
  "padding-bottom": (r) => map(parseNumber(r, 0, 120), (paddingBottom) => ({ paddingBottom })),
  "border-bottom": (r) => {
    const v = r.trim();
    if (v === "none") return ok({ borderBottom: null });
    const parts = v.split(/\s+/);
    if (parts.length !== 2) return fail(`expected \`<width> <colour>\`, e.g. \`1 #d1d5db\`, got \`${r}\``);
    const w = parseNumber(parts[0], 0, 12);
    if (!w.ok) return w;
    const c = parseColor(parts[1]);
    if (!c.ok) return c;
    return ok({ borderBottom: { width: w.value, color: c.value } });
  },
  keep: (r) => map(parseKeyword(r, ["together", "with-next"] as const), (keep) => ({ keep })),
};

/** Page-only properties (`\page{...}`). */
export const PAGE_PROPERTIES: Record<string, (raw: string) => Parsed<Partial<BoxStyle>>> = {
  margin: (r) => {
    const parts = r.trim().split(/\s+/).map((p) => parseNumber(p, 0, 144));
    const bad = parts.find((p) => !p.ok);
    if (bad && !bad.ok) return bad;
    const n = parts.map((p) => (p as { ok: true; value: number }).value);
    if (n.length < 1 || n.length > 4) return fail("margin takes 1 to 4 numbers");
    const [t, rr = t, b = t, l = rr] = n;
    return ok({ margin: [t, rr, b, l] });
  },
  "font-family": PROPERTIES["font-family"],
  "font-size": PROPERTIES["font-size"],
  "font-weight": PROPERTIES["font-weight"],
  color: PROPERTIES.color,
  "line-height": PROPERTIES["line-height"],
};

function map<T, U>(p: Parsed<T>, f: (v: T) => U): Parsed<U> {
  return p.ok ? ok(f(p.value)) : p;
}

/** Splits `a: b; c: d` into declarations, tracking positions for diagnostics. */
export function splitDeclarations(
  text: string,
  startLine: number,
  startCol: number
): { decls: Declarations; errors: { message: string; line: number; col: number }[] } {
  const decls: Declarations = [];
  const errors: { message: string; line: number; col: number }[] = [];
  let line = startLine;
  let col = startCol;
  let buf = "";
  let bufLine = line;
  let bufCol = col;

  const flush = () => {
    const raw = buf.trim();
    if (raw) {
      const idx = raw.indexOf(":");
      if (idx < 0) {
        errors.push({ message: `Expected \`property: value\`, got \`${raw}\`.`, line: bufLine, col: bufCol });
      } else {
        decls.push({
          prop: raw.slice(0, idx).trim(),
          value: raw.slice(idx + 1).trim(),
          line: bufLine,
          col: bufCol,
        });
      }
    }
    buf = "";
  };

  for (const ch of text) {
    if (ch === ";") {
      flush();
    } else {
      if (!buf.trim() && /\S/.test(ch)) {
        bufLine = line;
        bufCol = col;
      }
      buf += ch;
    }
    if (ch === "\n") {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  flush();
  return { decls, errors };
}

/** Option references inside a value: `@accent`, `1 @accent`. */
export const OPTION_REF = /@([A-Za-z][A-Za-z0-9-]*)/g;

export function substituteOptions(value: string, options: Record<string, string>): string {
  return value.replace(OPTION_REF, (m, name) => (name in options ? options[name] : m));
}

/** Resolves declarations to a style, given option values. Invalid values are skipped. */
export function resolveDeclarations(
  decls: Declarations,
  options: Record<string, string>,
  table: Record<string, (raw: string) => Parsed<Partial<BoxStyle>>> = PROPERTIES
): BoxStyle {
  const style: BoxStyle = {};
  for (const d of decls) {
    const parser = table[d.prop];
    if (!parser) continue;
    const parsed = parser(substituteOptions(d.value, options));
    if (parsed.ok) Object.assign(style, parsed.value);
  }
  return style;
}
