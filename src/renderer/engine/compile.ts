/**
 * Template + resume content → box tree (no positions yet).
 *
 * Pure and synchronous. Field values, labels, conditions and loops are all
 * resolved here; layout only sees styled paragraphs, stacks, rows and rules.
 */
import type { ResumeContent } from "@/lib/resumesStore";
import { AppLanguage, t } from "@/lib/i18n";
import type { BlockNode, InlineNode, Template } from "../template/template";
import {
  ENTRY_FIELDS,
  FieldKind,
  LABELS,
  PERSONAL_FIELDS,
  RESUME_FONTS,
  SectionKind,
} from "../template/schema";
import {
  BoxStyle,
  Declarations,
  PAGE_PROPERTIES,
  isHexColor,
  parseFontFamily,
  resolveDeclarations,
} from "../template/styles";
import type { Box, Run, Spacing, TextStyle } from "./types";

export type CompileInput = {
  template: Template;
  content: ResumeContent;
  language: AppLanguage;
  /** Resume `font` setting (figtree | inter | spaceGrotesk). */
  font?: string;
  /** Overrides for the template's `\option`s. */
  options?: Record<string, string>;
};

export type CompiledDocument = {
  boxes: Box[];
  margin: [number, number, number, number];
};

type Scope = {
  /** Object fields resolve against (personal or an entry). */
  obj: Record<string, unknown> | null;
  fields: Record<string, FieldKind> | null;
  /** Current `\each` item. */
  item?: string;
};

const EMPTY_SPACING: Spacing = {
  marginTop: 0,
  marginBottom: 0,
  paddingTop: 0,
  paddingBottom: 0,
  border: null,
};

const PHONE_RE = /^\+?[0-9()\s\-]+$/;

export function hrefFor(kind: FieldKind | undefined, value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (kind === "email") return v.includes("@") && !v.startsWith("http") ? `mailto:${v}` : undefined;
  if (kind === "phone") return PHONE_RE.test(v) ? `tel:${v.replace(/\s+/g, "")}` : undefined;
  if (kind === "url") return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  return undefined;
}

const asText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return asList(value).join(", ");
  return "";
};

const asList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean)
    : [];

const getPath = (obj: Record<string, unknown> | null, path: string): unknown => {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
};

/** Validated option values: template defaults, then resume overrides. */
export function resolveOptionValues(
  template: Template,
  font: string | undefined,
  overrides: Record<string, string> = {}
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const o of template.options) {
    let v = overrides[o.name];
    if (o.name === "font" && font) v = RESUME_FONTS[font] ?? v;
    const valid =
      v !== undefined &&
      (o.type === "color"
        ? isHexColor(v)
        : o.type === "size"
        ? /^\d+(\.\d+)?$/.test(v)
        : o.type === "font"
        ? parseFontFamily(v).ok
        : o.choices?.includes(v));
    values[o.name] = valid ? v! : o.default;
  }
  return values;
}

export function compileDocument(input: CompileInput): CompiledDocument {
  const { template, content, language } = input;
  const optionValues = resolveOptionValues(template, input.font, input.options);

  const styleCache = new Map<string, BoxStyle>();
  const classStyle = (name: string): BoxStyle => {
    let s = styleCache.get(name);
    if (!s) {
      s = resolveDeclarations(template.styles[name] ?? [], optionValues);
      styleCache.set(name, s);
    }
    return s;
  };
  const merged = (classes: string[]): BoxStyle =>
    Object.assign({}, ...classes.map(classStyle));

  const pageStyle = resolveDeclarations(template.page as Declarations, optionValues, PAGE_PROPERTIES);
  const baseText: TextStyle = {
    family: pageStyle.fontFamily ?? optionValues.font ?? "Figtree",
    weight: pageStyle.fontWeight ?? "normal",
    size: pageStyle.fontSize ?? 11,
    color: pageStyle.color ?? "#000000",
    uppercase: false,
    align: "left",
    lineHeight: pageStyle.lineHeight,
  };

  const inherit = (parent: TextStyle, s: BoxStyle): TextStyle => ({
    family: s.fontFamily ?? parent.family,
    weight: s.fontWeight ?? parent.weight,
    size: s.fontSize ?? parent.size,
    color: s.color ?? parent.color,
    uppercase: s.textTransform ? s.textTransform === "uppercase" : parent.uppercase,
    align: s.textAlign ?? parent.align,
    lineHeight: s.lineHeight ?? parent.lineHeight,
  });

  const spacingOf = (s: BoxStyle): Spacing => ({
    marginTop: s.marginTop ?? 0,
    marginBottom: s.marginBottom ?? 0,
    paddingTop: s.paddingTop ?? 0,
    paddingBottom: s.paddingBottom ?? 0,
    border: s.borderBottom ?? null,
    keep: s.keep,
  });

  const label = (key: string) => t(language, LABELS[key]);

  const resolve = (scope: Scope, field: string): unknown =>
    field === "." ? scope.item : getPath(scope.obj, field);

  const isFilled = (scope: Scope, field: string): boolean => {
    const v = resolve(scope, field);
    return Array.isArray(v) ? asList(v).length > 0 : asText(v).length > 0;
  };

  const run = (text: string, style: TextStyle, href?: string): Run => ({
    text: style.uppercase ? text.toUpperCase() : text,
    style,
    href,
  });

  const runsText = (runs: Run[]) => runs.map((r) => ("text" in r ? r.text : "\n")).join("");

  // ---- inline -----------------------------------------------------------

  const inline = (nodes: InlineNode[], style: TextStyle, scope: Scope): Run[] => {
    const out: Run[] = [];
    for (const n of nodes) {
      switch (n.t) {
        case "text":
          out.push(run(n.value, style));
          break;
        case "v": {
          let value = asText(resolve(scope, n.field));
          if (n.part) {
            const words = value.split(/\s+/).filter(Boolean);
            value = n.part === "first" ? words[0] ?? "" : words.slice(1).join(" ");
          }
          if (value) {
            const kind = n.field === "." ? undefined : scope.fields?.[n.field];
            out.push(run(value, style, n.link ? hrefFor(kind, value) : undefined));
          }
          break;
        }
        case "label":
          out.push(run(label(n.key), style));
          break;
        case "range": {
          const from = asText(getPath(scope.obj, `${n.field}.from`));
          const to = asText(getPath(scope.obj, `${n.field}.to`));
          const text = from ? `${from}${n.sep}${to || label("present")}` : to;
          if (text) out.push(run(text, style));
          break;
        }
        case "join": {
          const parts = n.args
            .map((a) => inline(a, style, scope))
            .filter((r) => runsText(r).trim().length > 0);
          parts.forEach((p, i) => {
            if (i > 0) out.push(run(n.sep, style));
            out.push(...p);
          });
          break;
        }
        case "list": {
          const items = asList(resolve(scope, n.field));
          if (items.length) out.push(run(items.join(n.sep), style));
          break;
        }
        case "lines": {
          asList(resolve(scope, n.field)).forEach((item, i) => {
            if (i > 0) out.push({ br: true, style });
            out.push(run(n.prefix + item, style));
          });
          break;
        }
        case "span":
          out.push(...inline(n.body, inherit(style, merged(n.classes)), scope));
          break;
        case "if":
          out.push(...inline(isFilled(scope, n.field) ? n.then : n.else, style, scope));
          break;
        case "each":
          for (const item of asList(resolve(scope, n.field))) {
            out.push(...inline(n.body, style, { ...scope, item }));
          }
          break;
      }
    }
    return out;
  };

  /** Trims a paragraph's outer whitespace; returns null when nothing visible remains. */
  const trimRuns = (runs: Run[]): Run[] | null => {
    const out = runs.filter((r) => !("text" in r) || r.text.length > 0);
    while (out.length && "br" in out[0]) out.shift();
    while (out.length && "br" in out[out.length - 1]) out.pop();
    if (!out.length) return null;
    const first = out[0];
    if ("text" in first) out[0] = { ...first, text: first.text.replace(/^\s+/, "") };
    const lastIdx = out.length - 1;
    const last = out[lastIdx];
    if ("text" in last) out[lastIdx] = { ...last, text: last.text.replace(/\s+$/, "") };
    return runsText(out).trim() ? out : null;
  };

  // ---- blocks -----------------------------------------------------------

  const blocks = (nodes: BlockNode[], style: TextStyle, scope: Scope, suffix: string): Box[] => {
    const out: Box[] = [];
    for (const n of nodes) {
      const id = n.id + suffix;
      switch (n.t) {
        case "p": {
          const s = merged(n.classes);
          const ts = inherit(style, s);
          const runs = trimRuns(inline(n.body, ts, scope));
          if (runs) out.push({ kind: "para", id, style: ts, spacing: spacingOf(s), runs });
          break;
        }
        case "block": {
          const s = merged(n.classes);
          const children = blocks(n.body, inherit(style, s), scope, suffix);
          if (children.length) out.push({ kind: "stack", id, spacing: spacingOf(s), children });
          break;
        }
        case "row": {
          const s = merged(n.classes);
          const ts = inherit(style, s);
          const left = blocks(n.left, ts, scope, suffix);
          const right = blocks(n.right, ts, scope, suffix);
          if (left.length || right.length) out.push({ kind: "row", id, spacing: spacingOf(s), left, right });
          break;
        }
        case "hr": {
          const s = merged(n.classes);
          out.push({ kind: "rule", id, spacing: { ...spacingOf(s), border: s.borderBottom ?? { width: 1, color: style.color } } });
          break;
        }
        case "entries": {
          const s = merged(n.classes);
          const ts = inherit(style, s);
          const section = scope.fields === null && currentSection ? currentSection : null;
          if (!section) break;
          const entries = (content[section] ?? []) as unknown[];
          entries.forEach((entry, i) => {
            const entryScope: Scope = {
              obj: (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>,
              fields: ENTRY_FIELDS[section],
            };
            const children = blocks(n.body, ts, entryScope, `${suffix}#${i}`);
            if (children.length) {
              out.push({ kind: "stack", id: `${id}#${i}`, spacing: spacingOf(s), children });
            }
          });
          break;
        }
        case "if":
          out.push(...blocks(isFilled(scope, n.field) ? n.then : n.else, style, scope, suffix));
          break;
        case "each":
          asList(resolve(scope, n.field)).forEach((item, i) => {
            out.push(...blocks(n.body, style, { ...scope, item }, `${suffix}#${i}`));
          });
          break;
      }
    }
    return out;
  };

  let currentSection: SectionKind | null = null;
  const boxes: Box[] = [];

  const header = blocks(
    template.header,
    baseText,
    { obj: (content.personal ?? {}) as Record<string, unknown>, fields: PERSONAL_FIELDS },
    ""
  );
  if (header.length) boxes.push({ kind: "stack", id: "h", spacing: EMPTY_SPACING, children: header });

  for (const section of template.sections) {
    const entries = content[section.kind];
    if (!Array.isArray(entries) || entries.length === 0) continue;
    currentSection = section.kind;
    const children = blocks(section.body, baseText, { obj: null, fields: null }, "");
    currentSection = null;
    if (children.length) {
      boxes.push({ kind: "stack", id: `s.${section.kind}`, spacing: EMPTY_SPACING, children });
    }
  }

  return { boxes, margin: pageStyle.margin ?? [40, 40, 40, 40] };
}
