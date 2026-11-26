/**
 * Template + resume content → box tree (no positions yet).
 *
 * Pure and synchronous. Field values, labels, conditions and loops are all
 * resolved here; layout only sees styled paragraphs, stacks, rows and rules.
 */
import type { ResumeContent, SectionKey } from "@/lib/resumesStore";
import { orderedSections } from "@/lib/sectionLayout";
import { AppLanguage, t } from "@/lib/i18n";
import type { BlockNode, InlineNode, Template, TemplateColumns } from "../template/template";
import {
  ENTRY_FIELDS,
  FieldKind,
  LABELS,
  PERSONAL_FIELDS,
  RESUME_FONTS,
  SectionKind,
  TemplateSectionKind,
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
  /** Resume `font` setting: a `setting` from FONT_CATALOG (figtree, inter, ptSerif …). */
  font?: string;
  /** Overrides for the template's `\option`s. */
  options?: Record<string, string>;
};

export type ColumnFrame = {
  background?: string;
  paddingLeft: number;
  paddingRight: number;
  /** Space inside the column above and below its content, on every page. */
  paddingTop?: number;
  paddingBottom?: number;
};

export type CompiledColumns = {
  /** Fractions of the content width minus the gap. */
  widths: [number, number];
  gap: number;
  frames: [ColumnFrame, ColumnFrame];
  boxes: [Box[], Box[]];
};

export type CompiledDocument = {
  /** Single-column body, or the full-width header above the columns. */
  boxes: Box[];
  margin: [number, number, number, number];
  columns?: CompiledColumns;
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
    ...(s.paddingLeft ? { paddingLeft: s.paddingLeft } : {}),
    ...(s.paddingRight ? { paddingRight: s.paddingRight } : {}),
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
        case "sectiontitle":
          if (currentSection?.title) out.push(run(currentSection.title, style));
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
          section.entries.forEach((entry, i) => {
            const entryScope: Scope = {
              obj: (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>,
              fields: ENTRY_FIELDS[section.kind],
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

  let currentSection: { kind: TemplateSectionKind; entries: unknown[]; title: string } | null = null;
  const personalScope: Scope = { obj: (content.personal ?? {}) as Record<string, unknown>, fields: PERSONAL_FIELDS };

  const headerBox = (nodes: BlockNode[], style: TextStyle, id: string): Box[] => {
    const children = blocks(nodes, style, personalScope, "");
    return children.length ? [{ kind: "stack", id, spacing: EMPTY_SPACING, children }] : [];
  };

  const bodies = new Map(template.sections.map((s) => [s.kind, s.body]));
  const customBody = bodies.get("*") ?? fallbackCustomBody(template);
  const titles = content.layout?.titles ?? {};

  /** Section boxes in the user's order, for the sections `include` accepts. */
  const sectionBoxes = (style: TextStyle, include: (kind: TemplateSectionKind) => boolean): Box[] => {
    const out: Box[] = [];
    for (const key of sectionOrder(template, content)) {
      const custom = key.startsWith("custom:")
        ? (content.custom ?? []).find((c) => `custom:${c.id}` === key)
        : undefined;
      const kind: TemplateSectionKind = custom ? "*" : (key as SectionKind);
      if (!include(kind)) continue;
      const body = custom ? customBody : bodies.get(kind);
      const entries = (custom ? custom.entries : content[key as SectionKind]) as unknown[] | undefined;
      if (!body || !Array.isArray(entries) || entries.length === 0) continue;

      const override = titles[key]?.trim();
      const title = override || (custom ? custom.title.trim() : label(key));
      currentSection = { kind, entries, title };
      // Custom sections share template nodes, so their ids get the section key.
      const children = blocks(body, style, { obj: null, fields: null }, custom ? `@${custom.id}` : "");
      currentSection = null;
      if (children.length) {
        out.push({ kind: "stack", id: `s.${key}`, spacing: EMPTY_SPACING, children });
      }
    }
    return out;
  };

  const [mt, mr, mb, ml] = pageStyle.margin ?? [40, 40, 40, 40];
  const margin: [number, number, number, number] = [
    pageStyle.marginTop ?? mt,
    pageStyle.marginRight ?? mr,
    pageStyle.marginBottom ?? mb,
    pageStyle.marginLeft ?? ml,
  ];
  const header = headerBox(template.header, baseText, "h");
  const cols = template.columns;
  if (!cols) {
    return { boxes: [...header, ...sectionBoxes(baseText, () => true)], margin };
  }

  const columnOf = (kind: TemplateSectionKind) => placementOf(cols, kind);

  const column = (col: 0 | 1) => {
    const s = merged(cols.classes[col]);
    const style = inherit(baseText, s);
    const frame: ColumnFrame = {
      background: s.background,
      paddingLeft: s.paddingLeft ?? 0,
      paddingRight: s.paddingRight ?? 0,
      ...(s.paddingTop ? { paddingTop: s.paddingTop } : {}),
      ...(s.paddingBottom ? { paddingBottom: s.paddingBottom } : {}),
    };
    const boxes = [
      ...headerBox(cols.header[col], style, col === 0 ? "hL" : "hR"),
      ...sectionBoxes(style, (kind) => columnOf(kind) === col),
    ];
    return { frame, boxes };
  };
  const left = column(0);
  const right = column(1);

  return {
    boxes: header,
    margin,
    columns: { widths: cols.widths, gap: cols.gap, frames: [left.frame, right.frame], boxes: [left.boxes, right.boxes] },
  };
}

/** The column (0 = left, 1 = right) a section renders in, or null for single-column templates. */
export function sectionColumn(template: Template, key: SectionKey): 0 | 1 | null {
  if (!template.columns) return null;
  return placementOf(template.columns, key.startsWith("custom:") ? "*" : (key as SectionKind));
}

/** Custom sections without their own `\section[*]` go to the wider column. */
function placementOf(cols: TemplateColumns, kind: TemplateSectionKind): 0 | 1 {
  return cols.placement[kind] ?? (cols.widths[0] > cols.widths[1] ? 0 : 1);
}

/**
 * The order sections render in: the user's `layout.order` first, then any
 * remaining sections in the template's order, then custom sections. Hidden
 * sections are dropped.
 */
export function sectionOrder(template: Template, content: ResumeContent, includeHidden = false): SectionKey[] {
  let builtins = template.sections.map((s) => s.kind).filter((k): k is SectionKind => k !== "*");
  const cols = template.columns;
  if (cols) {
    // The wider column's sections first: once the user reorders, this order
    // is saved, and it should still read naturally in a single-column template.
    const wide = cols.widths[0] > cols.widths[1] ? 0 : 1;
    builtins = [...builtins.filter((k) => placementOf(cols, k) === wide), ...builtins.filter((k) => placementOf(cols, k) !== wide)];
  }
  return orderedSections(content, builtins, includeHidden);
}

/** A plain custom-section body for templates without `\section[*]`, reusing their usual style names. */
function fallbackCustomBody(template: Template): BlockNode[] {
  const pick = (...names: string[]) => names.filter((n) => template.styles[n]).slice(0, 1);
  const v = (field: string): InlineNode => ({ t: "v", field, link: false });
  return [
    { t: "p", id: "s.*.0", classes: pick("heading"), body: [{ t: "sectiontitle" }] },
    {
      t: "entries",
      id: "s.*.1",
      classes: pick("entry"),
      body: [
        {
          t: "p",
          id: "s.*.1.0",
          classes: pick("strong", "title", "bold"),
          body: [{ t: "join", sep: " — ", args: [[v("title")], [v("subtitle")]] }],
        },
        {
          t: "p",
          id: "s.*.1.1",
          classes: pick("small", "subtitle", "sub", "meta"),
          body: [{ t: "join", sep: " | ", args: [[v("location")], [{ t: "range", field: "date", sep: " – " }]] }],
        },
        { t: "p", id: "s.*.1.2", classes: pick("text", "desc", "body", "sub"), body: [v("description")] },
        {
          t: "p",
          id: "s.*.1.3",
          classes: pick("text", "desc", "body", "sub"),
          body: [{ t: "lines", field: "items", prefix: "• " }],
        },
      ],
    },
  ];
}
