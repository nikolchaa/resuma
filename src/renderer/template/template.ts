/**
 * Turns parsed .rsm template source into a validated Template IR.
 *
 * Every command, option, field, label and style property is checked here,
 * so the renderer only ever sees well-formed templates. Problems are
 * reported as diagnostics with line/column positions.
 */
import {
  Diagnostic,
  RsmCommand,
  RsmNode,
  optionValue,
  flagOptions,
  parseRsm,
} from "../rsm/parse";
import {
  ENTRY_FIELDS,
  FieldKind,
  LABELS,
  OptionType,
  PERSONAL_FIELDS,
  TEMPLATE_SECTION_KINDS,
  TemplateSectionKind,
} from "./schema";
import {
  Declarations,
  OPTION_REF,
  PAGE_PROPERTIES,
  PROPERTIES,
  isHexColor,
  parseFontFamily,
  splitDeclarations,
  substituteOptions,
} from "./styles";

export type InlineNode =
  | { t: "text"; value: string }
  | { t: "v"; field: string; link: boolean; part?: "first" | "rest" }
  | { t: "label"; key: string }
  | { t: "sectiontitle" }
  | { t: "range"; field: string; sep: string }
  | { t: "join"; sep: string; args: InlineNode[][] }
  | { t: "list"; field: string; sep: string }
  | { t: "lines"; field: string; prefix: string }
  | { t: "span"; classes: string[]; body: InlineNode[] }
  | { t: "if"; field: string; then: InlineNode[]; else: InlineNode[] }
  | { t: "each"; field: string; body: InlineNode[] };

export type BlockNode =
  | { t: "p"; id: string; classes: string[]; body: InlineNode[] }
  | { t: "block"; id: string; classes: string[]; body: BlockNode[] }
  | { t: "row"; id: string; classes: string[]; left: BlockNode[]; right: BlockNode[] }
  | { t: "hr"; id: string; classes: string[] }
  | { t: "entries"; id: string; classes: string[]; body: BlockNode[] }
  | { t: "if"; id: string; field: string; then: BlockNode[]; else: BlockNode[] }
  | { t: "each"; id: string; field: string; body: BlockNode[] };

export type TemplateOption = {
  name: string;
  type: OptionType;
  default: string;
  label?: string;
  choices?: string[];
};

/** Two-column layout from `\cols`: index 0 is the left column, 1 the right. */
export type TemplateColumns = {
  /** Column widths as fractions of the content width minus the gap; they sum to 1. */
  widths: [number, number];
  gap: number;
  /** Style classes applied to each column (text styles, padding, background). */
  classes: [string[], string[]];
  /** Personal-details blocks at the top of each column. */
  header: [BlockNode[], BlockNode[]];
  /** Which column each section kind renders in. */
  placement: Partial<Record<TemplateSectionKind, 0 | 1>>;
};

export type Template = {
  id: string;
  name: string;
  version: number;
  options: TemplateOption[];
  page: Declarations;
  styles: Record<string, Declarations>;
  /** Full-width header (above the columns when there are any). */
  header: BlockNode[];
  sections: { kind: TemplateSectionKind; body: BlockNode[] }[];
  columns?: TemplateColumns;
};

/** Style properties that only make sense on a whole column. */
const COLUMN_ONLY_PROPERTIES = ["background"];

export type TemplateResult = { template: Template | null; diagnostics: Diagnostic[] };

/** Built-in option every template gets: the resume's font setting. */
export const BUILTIN_OPTIONS: TemplateOption[] = [
  { name: "font", type: "font", default: "Figtree", label: "Font" },
];

type Scope =
  | { kind: "personal" }
  | { kind: "section"; section: TemplateSectionKind }
  | { kind: "entry"; section: TemplateSectionKind }
  | { kind: "none" };

type Ctx = { scope: Scope; inEach: boolean };

const BLOCK_COMMANDS = new Set(["p", "block", "row", "hr", "entries", "if", "each"]);
const INLINE_COMMANDS = new Set(["v", "label", "range", "join", "list", "lines", "span", "if", "each", "sectiontitle"]);

export function compileTemplate(source: string): TemplateResult {
  const { nodes, diagnostics } = parseRsm(source);
  const diag = (cmdOrPos: { line: number; col: number }, message: string, severity: "error" | "warning" = "error") =>
    diagnostics.push({ severity, message, line: cmdOrPos.line, col: cmdOrPos.col });

  const template: Template = {
    id: "",
    name: "",
    version: 1,
    options: [...BUILTIN_OPTIONS],
    page: [],
    styles: {},
    header: [],
    sections: [],
  };

  // ---- helpers --------------------------------------------------------

  const knownOptions = () => new Map(template.options.map((o) => [o.name, o]));

  const fieldsFor = (scope: Scope): Record<string, FieldKind> | null => {
    if (scope.kind === "personal") return PERSONAL_FIELDS;
    if (scope.kind === "entry") return ENTRY_FIELDS[scope.section];
    return null;
  };

  const checkField = (
    cmd: RsmCommand,
    field: string,
    ctx: Ctx,
    want?: FieldKind[]
  ): boolean => {
    if (field === ".") {
      if (!ctx.inEach) {
        diag(cmd.pos, "`.` (the current item) can only be used inside `\\each`.");
        return false;
      }
      return true;
    }
    const fields = fieldsFor(ctx.scope);
    if (!fields) {
      diag(
        cmd.pos,
        `\`\\${cmd.name}{${field}}\` has no fields to read here — fields are available in \`\\header\` and inside \`\\entries\`.`
      );
      return false;
    }
    const kind = fields[field];
    if (!kind) {
      diag(
        cmd.pos,
        `Unknown field \`${field}\` here. Available: ${Object.keys(fields).join(", ")}.`
      );
      return false;
    }
    if (want && !want.includes(kind)) {
      diag(cmd.pos, `\`\\${cmd.name}\` needs a ${want.join(" or ")} field, but \`${field}\` is ${kind}.`);
      return false;
    }
    return true;
  };

  const fieldArg = (cmd: RsmCommand, index = 0): string | null => {
    const g = cmd.groups[index];
    if (!g || g.length !== 1 || g[0].type !== "text" || !g[0].value.trim()) {
      diag(cmd.pos, `\`\\${cmd.name}\` needs a field name, e.g. \`\\${cmd.name}{email}\`.`);
      return null;
    }
    return g[0].value.trim();
  };

  const classesOf = (cmd: RsmCommand, allowed: string[] = []): string[] => {
    const classes: string[] = [];
    for (const o of cmd.options) {
      if (o.value === undefined && !allowed.includes(o.key)) {
        classes.push(o.key);
      } else if (o.value !== undefined && !allowed.includes(o.key)) {
        diag(o.pos, `Unknown option \`${o.key}\` on \`\\${cmd.name}\`.`);
      }
    }
    return classes;
  };

  const expectGroups = (cmd: RsmCommand, min: number, max: number) => {
    if (cmd.groups.length < min || cmd.groups.length > max) {
      diag(
        cmd.pos,
        min === max
          ? `\`\\${cmd.name}\` takes ${min} {group}${min === 1 ? "" : "s"}, got ${cmd.groups.length}.`
          : `\`\\${cmd.name}\` takes ${min}–${max} {groups}, got ${cmd.groups.length}.`
      );
    }
  };

  const usedClasses: { name: string; line: number; col: number }[] = [];
  const noteClasses = (cmd: RsmCommand, classes: string[]) =>
    classes.forEach((name) => usedClasses.push({ name, line: cmd.pos.line, col: cmd.pos.col }));

  // ---- inline ---------------------------------------------------------

  const inline = (nodes: RsmNode[], ctx: Ctx): InlineNode[] => {
    const out: InlineNode[] = [];
    for (const n of nodes) {
      if (n.type === "text") {
        const value = n.value.replace(/\s+/g, " ");
        if (value) out.push({ t: "text", value });
        continue;
      }
      const cmd = n;
      if (!INLINE_COMMANDS.has(cmd.name)) {
        diag(
          cmd.pos,
          BLOCK_COMMANDS.has(cmd.name)
            ? `\`\\${cmd.name}\` is a block and can't be used inside a paragraph.`
            : `Unknown command \`\\${cmd.name}\`.`
        );
        continue;
      }
      switch (cmd.name) {
        case "v": {
          expectGroups(cmd, 1, 1);
          const field = fieldArg(cmd);
          for (const o of cmd.options) {
            if (!["nolink", "first", "rest"].includes(o.key) || o.value !== undefined)
              diag(o.pos, `Unknown option \`${o.key}\` on \`\\v\` (use nolink, first or rest).`);
          }
          if (field && checkField(cmd, field, ctx)) {
            const flags = flagOptions(cmd).map((o) => o.key);
            out.push({
              t: "v",
              field,
              link: !flags.includes("nolink"),
              part: flags.includes("first") ? "first" : flags.includes("rest") ? "rest" : undefined,
            });
          }
          break;
        }
        case "sectiontitle": {
          expectGroups(cmd, 0, 0);
          rejectOptions(cmd, []);
          if (ctx.scope.kind !== "section" && ctx.scope.kind !== "entry") {
            diag(cmd.pos, "`\\sectiontitle` can only be used inside a `\\section`.");
          } else {
            out.push({ t: "sectiontitle" });
          }
          break;
        }
        case "label": {
          expectGroups(cmd, 1, 1);
          const key = fieldArg(cmd);
          if (key && !LABELS[key]) {
            diag(cmd.pos, `Unknown label \`${key}\`. Available: ${Object.keys(LABELS).join(", ")}.`);
          } else if (key) {
            out.push({ t: "label", key });
          }
          break;
        }
        case "range": {
          expectGroups(cmd, 1, 1);
          const field = fieldArg(cmd);
          rejectOptions(cmd, ["sep"]);
          if (field && checkField(cmd, field, ctx, ["date"])) {
            out.push({ t: "range", field, sep: optionValue(cmd, "sep") ?? " – " });
          }
          break;
        }
        case "join": {
          rejectOptions(cmd, ["sep"]);
          if (cmd.groups.length < 1) diag(cmd.pos, "`\\join` needs at least one {group}.");
          out.push({
            t: "join",
            sep: optionValue(cmd, "sep") ?? " | ",
            args: cmd.groups.map((g) => inline(g, ctx)),
          });
          break;
        }
        case "list": {
          expectGroups(cmd, 1, 1);
          rejectOptions(cmd, ["sep"]);
          const field = fieldArg(cmd);
          if (field && checkField(cmd, field, ctx, ["list"])) {
            out.push({ t: "list", field, sep: optionValue(cmd, "sep") ?? ", " });
          }
          break;
        }
        case "lines": {
          expectGroups(cmd, 1, 1);
          rejectOptions(cmd, ["prefix"]);
          const field = fieldArg(cmd);
          if (field && checkField(cmd, field, ctx, ["list"])) {
            out.push({ t: "lines", field, prefix: optionValue(cmd, "prefix") ?? "" });
          }
          break;
        }
        case "span": {
          expectGroups(cmd, 1, 1);
          const classes = classesOf(cmd);
          noteClasses(cmd, classes);
          out.push({ t: "span", classes, body: inline(cmd.groups[0] ?? [], ctx) });
          break;
        }
        case "if": {
          expectGroups(cmd, 2, 3);
          const field = fieldArg(cmd);
          if (field && checkField(cmd, field, ctx)) {
            out.push({
              t: "if",
              field,
              then: inline(cmd.groups[1] ?? [], ctx),
              else: inline(cmd.groups[2] ?? [], ctx),
            });
          }
          break;
        }
        case "each": {
          expectGroups(cmd, 2, 2);
          const field = fieldArg(cmd);
          if (field && checkField(cmd, field, ctx, ["list"])) {
            out.push({ t: "each", field, body: inline(cmd.groups[1] ?? [], { ...ctx, inEach: true }) });
          }
          break;
        }
      }
    }
    return out;
  };

  const rejectOptions = (cmd: RsmCommand, allowed: string[]) => {
    for (const o of cmd.options) {
      if (!allowed.includes(o.key) || o.value === undefined) {
        diag(
          o.pos,
          allowed.length
            ? `Unknown option \`${o.key}\` on \`\\${cmd.name}\` (allowed: ${allowed.map((a) => a + "=…").join(", ")}).`
            : `\`\\${cmd.name}\` takes no options.`
        );
      }
    }
  };

  // ---- blocks ---------------------------------------------------------

  const blocks = (nodes: RsmNode[], ctx: Ctx, idPrefix: string): BlockNode[] => {
    const out: BlockNode[] = [];
    let index = 0;
    for (const n of nodes) {
      if (n.type === "text") {
        if (n.value.trim()) {
          diag(
            n.pos,
            `Text \`${n.value.trim().slice(0, 30)}\` must be inside a paragraph, e.g. \`\\p{...}\`.`
          );
        }
        continue;
      }
      const cmd = n;
      const id = `${idPrefix}.${index++}`;
      if (!BLOCK_COMMANDS.has(cmd.name)) {
        diag(
          cmd.pos,
          INLINE_COMMANDS.has(cmd.name)
            ? `\`\\${cmd.name}\` is inline — wrap it in a paragraph: \`\\p{\\${cmd.name}{...}}\`.`
            : `Unknown command \`\\${cmd.name}\`.`
        );
        continue;
      }
      switch (cmd.name) {
        case "p": {
          expectGroups(cmd, 1, 1);
          const classes = classesOf(cmd);
          noteClasses(cmd, classes);
          out.push({ t: "p", id, classes, body: inline(cmd.groups[0] ?? [], ctx) });
          break;
        }
        case "block": {
          expectGroups(cmd, 1, 1);
          const classes = classesOf(cmd);
          noteClasses(cmd, classes);
          out.push({ t: "block", id, classes, body: blocks(cmd.groups[0] ?? [], ctx, id) });
          break;
        }
        case "row": {
          expectGroups(cmd, 2, 2);
          const classes = classesOf(cmd);
          noteClasses(cmd, classes);
          out.push({
            t: "row",
            id,
            classes,
            left: blocks(cmd.groups[0] ?? [], ctx, id + "L"),
            right: blocks(cmd.groups[1] ?? [], ctx, id + "R"),
          });
          break;
        }
        case "hr": {
          expectGroups(cmd, 0, 0);
          const classes = classesOf(cmd);
          noteClasses(cmd, classes);
          out.push({ t: "hr", id, classes });
          break;
        }
        case "entries": {
          expectGroups(cmd, 1, 1);
          const classes = classesOf(cmd);
          noteClasses(cmd, classes);
          if (ctx.scope.kind !== "section") {
            diag(cmd.pos, "`\\entries` can only be used directly inside a `\\section`.");
            break;
          }
          out.push({
            t: "entries",
            id,
            classes,
            body: blocks(cmd.groups[0] ?? [], { scope: { kind: "entry", section: ctx.scope.section }, inEach: false }, id),
          });
          break;
        }
        case "if": {
          expectGroups(cmd, 2, 3);
          const field = fieldArg(cmd);
          if (field && checkField(cmd, field, ctx)) {
            out.push({
              t: "if",
              id,
              field,
              then: blocks(cmd.groups[1] ?? [], ctx, id + "T"),
              else: blocks(cmd.groups[2] ?? [], ctx, id + "E"),
            });
          }
          break;
        }
        case "each": {
          expectGroups(cmd, 2, 2);
          const field = fieldArg(cmd);
          if (field && checkField(cmd, field, ctx, ["list"])) {
            out.push({ t: "each", id, field, body: blocks(cmd.groups[1] ?? [], { ...ctx, inEach: true }, id) });
          }
          break;
        }
      }
    }
    return out;
  };

  // ---- declarations ---------------------------------------------------

  const declarations = (
    cmd: RsmCommand,
    table: Record<string, (raw: string) => { ok: boolean; message?: string }>
  ): Declarations => {
    const group = cmd.groups[0] ?? [];
    for (const n of group) {
      if (n.type === "command") diag(n.pos, `Commands aren't allowed inside \`\\${cmd.name}\` — only \`property: value;\` pairs.`);
    }
    const first = group.find((n) => n.type === "text");
    const text = group.map((n) => (n.type === "text" ? n.value : "")).join("");
    const { decls, errors } = splitDeclarations(text, first?.pos.line ?? cmd.pos.line, first?.pos.col ?? cmd.pos.col);
    errors.forEach((e) => diag(e, e.message));
    const valid: Declarations = [];
    for (const d of decls) {
      const parser = table[d.prop];
      if (!parser) {
        diag(d, `Unknown property \`${d.prop}\`. Allowed: ${Object.keys(table).join(", ")}.`);
        continue;
      }
      // Check option references, then validate with defaults substituted.
      const options = knownOptions();
      let refsOk = true;
      for (const m of d.value.matchAll(OPTION_REF)) {
        if (!options.has(m[1])) {
          diag(d, `Unknown option \`@${m[1]}\` — declare it with \`\\option[${m[1]}, type=…, default=…]\`.`);
          refsOk = false;
        }
      }
      if (!refsOk) continue;
      const defaults = Object.fromEntries([...options.values()].map((o) => [o.name, o.default]));
      const parsed = parser(substituteOptions(d.value, defaults)) as { ok: boolean; message?: string };
      if (!parsed.ok) {
        diag(d, `\`${d.prop}\`: ${parsed.message}.`);
        continue;
      }
      valid.push(d);
    }
    return valid;
  };

  // ---- header and sections ---------------------------------------------

  let sawTemplate = false;
  const seenSections = new Set<string>();

  const headerBlocks = (cmd: RsmCommand, idPrefix: string): BlockNode[] => {
    expectGroups(cmd, 1, 1);
    rejectOptions(cmd, []);
    return blocks(cmd.groups[0] ?? [], { scope: { kind: "personal" }, inEach: false }, idPrefix);
  };

  /** Adds a `\section`; returns its kind, or null when it was rejected. */
  const addSection = (cmd: RsmCommand): TemplateSectionKind | null => {
    expectGroups(cmd, 1, 1);
    const kind = flagOptions(cmd)[0]?.key;
    if (!kind || !(TEMPLATE_SECTION_KINDS as readonly string[]).includes(kind)) {
      diag(cmd.pos, `\`\\section\` needs a kind: ${TEMPLATE_SECTION_KINDS.join(", ")} (* = custom sections).`);
      return null;
    }
    if (seenSections.has(kind)) {
      diag(cmd.pos, `Section \`${kind}\` is defined twice.`);
      return null;
    }
    seenSections.add(kind);
    template.sections.push({
      kind: kind as TemplateSectionKind,
      body: blocks(cmd.groups[0] ?? [], { scope: { kind: "section", section: kind as TemplateSectionKind }, inEach: false }, `s.${kind}`),
    });
    return kind as TemplateSectionKind;
  };

  const columnClasses: string[] = [];
  let sectionOutsideCols: RsmCommand | null = null;

  const addColumns = (cmd: RsmCommand) => {
    if (template.columns) {
      diag(cmd.pos, "Only one `\\cols` is allowed in a template.");
      return;
    }
    expectGroups(cmd, 2, 2);
    rejectOptions(cmd, ["widths", "gap", "left", "right"]);

    let widths: [number, number] = [0.5, 0.5];
    const rawWidths = optionValue(cmd, "widths");
    if (rawWidths !== undefined) {
      const parts = rawWidths.split(",").map((s) => Number(s.trim()));
      if (parts.length !== 2 || parts.some((p) => !Number.isFinite(p) || p <= 0)) {
        diag(cmd.pos, '`\\cols` needs `widths="<left>,<right>"` with two positive numbers, e.g. `widths="32,68"`.');
      } else {
        const total = parts[0] + parts[1];
        // Keep both columns usable: each gets at least 15% of the width.
        const left = Math.min(0.85, Math.max(0.15, parts[0] / total));
        widths = [left, 1 - left];
      }
    }

    let gap = 20;
    const rawGap = optionValue(cmd, "gap");
    if (rawGap !== undefined) {
      if (!/^\d+(\.\d+)?$/.test(rawGap.trim())) diag(cmd.pos, `\`gap\` must be a number of points, got \`${rawGap}\`.`);
      else gap = Math.min(72, Number(rawGap));
    }

    const classFor = (side: "left" | "right"): string[] => {
      const v = optionValue(cmd, side);
      if (v === undefined) return [];
      const classes = v.split(/\s+/).filter(Boolean);
      classes.forEach((name) => usedClasses.push({ name, line: cmd.pos.line, col: cmd.pos.col }));
      columnClasses.push(...classes);
      return classes;
    };

    const columns: TemplateColumns = {
      widths,
      gap,
      classes: [classFor("left"), classFor("right")],
      header: [[], []],
      placement: {},
    };

    ([0, 1] as const).forEach((col) => {
      for (const n of cmd.groups[col] ?? []) {
        if (n.type === "text") {
          if (n.value.trim()) diag(n.pos, "Text isn't allowed directly inside `\\cols`; put it in a `\\header` or `\\section`.");
          continue;
        }
        if (n.name === "header") {
          columns.header[col].push(...headerBlocks(n, col === 0 ? "hL" : "hR"));
        } else if (n.name === "section") {
          const kind = addSection(n);
          if (kind) columns.placement[kind] = col;
        } else {
          diag(n.pos, `\`\\${n.name}\` isn't allowed inside \`\\cols\`. A column holds \\header and \\section blocks.`);
        }
      }
    });
    template.columns = columns;
  };

  // ---- top level ------------------------------------------------------

  for (const n of nodes) {
    if (n.type === "text") {
      if (n.value.trim()) diag(n.pos, "Text isn't allowed at the top level of a template.");
      continue;
    }
    const cmd = n;
    if (!sawTemplate && cmd.name !== "template") {
      diag(cmd.pos, "A template must start with `\\template[id=…, name=…]`.");
      sawTemplate = true; // report once
    }
    switch (cmd.name) {
      case "template": {
        if (sawTemplate && template.id) diag(cmd.pos, "Only one `\\template` header is allowed.");
        sawTemplate = true;
        rejectOptions(cmd, ["id", "name", "version"]);
        const id = optionValue(cmd, "id") ?? "";
        if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) diag(cmd.pos, "`\\template` needs `id=` (lowercase letters, digits, dashes).");
        template.id = id;
        template.name = optionValue(cmd, "name") ?? id;
        const v = Number(optionValue(cmd, "version") ?? "1");
        if (v !== 1) diag(cmd.pos, `Unsupported template version \`${optionValue(cmd, "version")}\` (this app reads version 1).`);
        break;
      }
      case "option": {
        const flags = flagOptions(cmd);
        const name = flags[0]?.key;
        const type = optionValue(cmd, "type") as OptionType | undefined;
        const def = optionValue(cmd, "default");
        if (!name || !/^[A-Za-z][A-Za-z0-9-]*$/.test(name)) {
          diag(cmd.pos, "`\\option` needs a name first, e.g. `\\option[accent, type=color, default=#00d9cb]`.");
          break;
        }
        if (BUILTIN_OPTIONS.some((o) => o.name === name)) {
          // Harmless: the built-in always wins, so don't fail the whole template over it.
          diag(cmd.pos, `\`@${name}\` is built in (the resume's own setting); this \`\\option\` is ignored.`, "warning");
          break;
        }
        if (knownOptions().has(name)) {
          diag(cmd.pos, `Option \`${name}\` is already defined.`);
          break;
        }
        if (!type || !["color", "size", "font", "choice"].includes(type)) {
          diag(cmd.pos, "`\\option` needs `type=` color, size, font or choice.");
          break;
        }
        if (def === undefined) {
          diag(cmd.pos, "`\\option` needs `default=`.");
          break;
        }
        if (type === "color" && !isHexColor(def)) diag(cmd.pos, `Default \`${def}\` is not a hex colour.`);
        if (type === "size" && !/^\d+(\.\d+)?$/.test(def)) diag(cmd.pos, `Default \`${def}\` is not a number.`);
        if (type === "font" && !parseFontFamily(def).ok) diag(cmd.pos, `Default \`${def}\` is not an available font.`);
        const choices = optionValue(cmd, "choices")?.split("|").map((s) => s.trim());
        if (type === "choice" && (!choices || !choices.includes(def)))
          diag(cmd.pos, "A choice option needs `choices=\"a|b|c\"` that include its default.");
        template.options.push({ name, type, default: def, label: optionValue(cmd, "label"), choices });
        break;
      }
      case "page": {
        expectGroups(cmd, 1, 1);
        rejectOptions(cmd, []);
        template.page.push(...declarations(cmd, PAGE_PROPERTIES));
        break;
      }
      case "style": {
        expectGroups(cmd, 1, 1);
        const name = flagOptions(cmd)[0]?.key;
        if (!name || cmd.options.length !== 1) {
          diag(cmd.pos, "`\\style` needs exactly one name, e.g. `\\style[heading]{font-size: 12}`.");
          break;
        }
        if (template.styles[name]) diag(cmd.pos, `Style \`${name}\` is defined twice; the later one adds to the first.`, "warning");
        template.styles[name] = [...(template.styles[name] ?? []), ...declarations(cmd, PROPERTIES)];
        break;
      }
      case "header": {
        if (template.columns) {
          diag(cmd.pos, "A full-width `\\header` must come before `\\cols`; put it inside a column to place it there.");
          break;
        }
        template.header.push(...headerBlocks(cmd, "h"));
        break;
      }
      case "section": {
        sectionOutsideCols ??= cmd;
        addSection(cmd);
        break;
      }
      case "cols": {
        addColumns(cmd);
        break;
      }
      default:
        diag(
          cmd.pos,
          `\`\\${cmd.name}\` isn't allowed at the top level. Use \\template, \\option, \\page, \\style, \\header, \\section or \\cols.`
        );
    }
  }

  if (!sawTemplate) diag({ line: 1, col: 1 }, "A template must start with `\\template[id=…, name=…]`.");

  if (template.columns && sectionOutsideCols) {
    diag(sectionOutsideCols.pos, "With `\\cols`, every `\\section` goes inside one of the two columns.");
  }

  for (const c of usedClasses) {
    if (!template.styles[c.name]) diag(c, `Unknown style \`${c.name}\` — define it with \`\\style[${c.name}]{...}\`.`);
  }

  // Column-only properties on a block or paragraph style would do nothing.
  const warned = new Set<string>();
  for (const c of usedClasses) {
    if (columnClasses.includes(c.name) || warned.has(c.name)) continue;
    warned.add(c.name);
    for (const d of template.styles[c.name] ?? []) {
      if (COLUMN_ONLY_PROPERTIES.includes(d.prop)) {
        diag(d, `\`${d.prop}\` only works on a column style (\`\\cols[left=…]\` or \`right=…\`); it's ignored on \`${c.name}\`.`, "warning");
      }
    }
  }

  const hasErrors = diagnostics.some((d) => d.severity === "error");
  return { template: hasErrors ? null : template, diagnostics };
}
