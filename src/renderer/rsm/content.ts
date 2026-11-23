/**
 * The .rsm text form of resume content.
 *
 * `printContent` writes a canonical, line-per-field document; `parseContent`
 * reads it back. For any normalised `ResumeContent` the round trip is exact
 * (tested). Field commands are the JSON keys, string lists are `\item`s and
 * entries are `\entry`s, e.g.
 *
 *   \experience{
 *     \entry{
 *       \jobTitle{Software Engineer}
 *       \date{\from{2021-03}\to{}}
 *       \notes{
 *         \item{Cut invoice time by 40%.}
 *       }
 *     }
 *   }
 *
 * Two things don't survive the trip: an empty `custom: []` list (printed as
 * nothing, read back as absent) and fields outside the schema. Callers that
 * need those should merge the parsed content over the original.
 */
import type {
  CustomEntry,
  CustomSection,
  ResumeContent,
  ResumeLayout,
  SectionKey,
} from "@/lib/resumesStore";
import { Diagnostic, RsmCommand, RsmNode, parseRsm } from "./parse";

type FieldSpec = { name: string; kind: "text" | "date" | "list"; optional?: boolean };

const PERSONAL: FieldSpec[] = [
  { name: "fullName", kind: "text" },
  { name: "email", kind: "text" },
  { name: "location", kind: "text" },
  { name: "phone", kind: "text", optional: true },
  { name: "website", kind: "text", optional: true },
  { name: "linkedin", kind: "text", optional: true },
  { name: "github", kind: "text", optional: true },
];

const SECTIONS: Record<string, FieldSpec[]> = {
  education: [
    { name: "school", kind: "text" },
    { name: "degree", kind: "text" },
    { name: "location", kind: "text" },
    { name: "gpa", kind: "text" },
    { name: "date", kind: "date" },
    { name: "courses", kind: "list", optional: true },
  ],
  experience: [
    { name: "jobTitle", kind: "text" },
    { name: "company", kind: "text" },
    { name: "location", kind: "text" },
    { name: "description", kind: "text" },
    { name: "date", kind: "date" },
    { name: "notes", kind: "list", optional: true },
  ],
  projects: [
    { name: "name", kind: "text" },
    { name: "link", kind: "text", optional: true },
    { name: "date", kind: "date" },
    { name: "description", kind: "text" },
    { name: "technologies", kind: "list" },
  ],
  skills: [
    { name: "category", kind: "text" },
    { name: "items", kind: "list" },
  ],
  awards: [
    { name: "title", kind: "text" },
    { name: "organizer", kind: "text" },
    { name: "date", kind: "date" },
    { name: "description", kind: "text" },
    { name: "location", kind: "text" },
  ],
};

const CUSTOM_ENTRY: FieldSpec[] = [
  { name: "title", kind: "text" },
  { name: "subtitle", kind: "text" },
  { name: "location", kind: "text" },
  { name: "date", kind: "date" },
  { name: "description", kind: "text" },
  { name: "items", kind: "list" },
];

const SECTION_ORDER = ["education", "experience", "projects", "skills", "awards"] as const;

// ---- printing -------------------------------------------------------------

/** Escapes text so it parses back verbatim. */
export function escapeText(s: string): string {
  return s
    .replace(/[\\{}]/g, (c) => "\\" + c)
    .replace(/(^|\n)([ \t]*)%/g, (_m, nl, ws) => `${nl}${ws}\\%`);
}

const quote = (s: string) => `"${s.replace(/["\\]/g, (c) => "\\" + c)}"`;

export function printContent(content: ResumeContent): string {
  const out: string[] = [];
  const line = (depth: number, s: string) => out.push("  ".repeat(depth) + s);

  const fields = (obj: Record<string, unknown>, specs: FieldSpec[], depth: number) => {
    for (const f of specs) {
      const v = obj[f.name];
      if (v === undefined) {
        if (!f.optional && f.kind !== "list") line(depth, `\\${f.name}{}`);
        continue;
      }
      if (f.kind === "text") {
        line(depth, `\\${f.name}{${escapeText(String(v))}}`);
      } else if (f.kind === "date") {
        const d = (v ?? {}) as { from?: string; to?: string };
        const to = d.to !== undefined ? `\\to{${escapeText(d.to)}}` : "";
        line(depth, `\\${f.name}{\\from{${escapeText(d.from ?? "")}}${to}}`);
      } else {
        const items = Array.isArray(v) ? (v as string[]) : [];
        if (!items.length) {
          line(depth, `\\${f.name}{}`);
        } else {
          line(depth, `\\${f.name}{`);
          for (const it of items) line(depth + 1, `\\item{${escapeText(it)}}`);
          line(depth, "}");
        }
      }
    }
  };

  line(0, "\\personal{");
  fields((content.personal ?? {}) as Record<string, unknown>, PERSONAL, 1);
  line(0, "}");

  for (const key of SECTION_ORDER) {
    const entries = (content[key] ?? []) as unknown as Record<string, unknown>[];
    out.push("");
    if (!entries.length) {
      line(0, `\\${key}{}`);
      continue;
    }
    line(0, `\\${key}{`);
    for (const e of entries) {
      line(1, "\\entry{");
      fields(e, SECTIONS[key], 2);
      line(1, "}");
    }
    line(0, "}");
  }

  for (const s of content.custom ?? []) {
    out.push("");
    line(0, `\\custom[id=${quote(s.id)}]{`);
    line(1, `\\title{${escapeText(s.title)}}`);
    for (const e of s.entries) {
      line(1, "\\entry{");
      fields(e as unknown as Record<string, unknown>, CUSTOM_ENTRY, 2);
      line(1, "}");
    }
    line(0, "}");
  }

  if (content.layout) {
    const l = content.layout;
    out.push("");
    line(0, "\\layout{");
    const list = (name: string, keys: SectionKey[] | undefined) => {
      if (!keys) return;
      if (!keys.length) return line(1, `\\${name}{}`);
      line(1, `\\${name}{`);
      for (const k of keys) line(2, `\\item{${escapeText(k)}}`);
      line(1, "}");
    };
    list("order", l.order);
    list("hidden", l.hidden);
    if (l.titles) {
      const entries = Object.entries(l.titles);
      if (!entries.length) line(1, "\\titles{}");
      else {
        line(1, "\\titles{");
        for (const [k, v] of entries) line(2, `\\title[section=${quote(k)}]{${escapeText(v ?? "")}}`);
        line(1, "}");
      }
    }
    line(0, "}");
  }

  return out.join("\n") + "\n";
}

// ---- parsing --------------------------------------------------------------

export type ContentParseResult = { content: ResumeContent | null; diagnostics: Diagnostic[] };

export function parseContent(source: string): ContentParseResult {
  const { nodes, diagnostics } = parseRsm(source);
  const diag = (p: { line: number; col: number }, message: string) =>
    diagnostics.push({ severity: "error", message, line: p.line, col: p.col });

  /** Commands inside a structural group; stray non-blank text is an error. */
  const commandsIn = (group: RsmNode[] | undefined, where: string): RsmCommand[] => {
    const cmds: RsmCommand[] = [];
    for (const n of group ?? []) {
      if (n.type === "command") cmds.push(n);
      else if (n.value.trim()) {
        // Point at the first visible character, not the whitespace before it.
        const lead = n.value.match(/^\s*/)![0];
        const newlines = lead.split("\n").length - 1;
        const pos = newlines
          ? { line: n.pos.line + newlines, col: lead.length - lead.lastIndexOf("\n") }
          : { line: n.pos.line, col: n.pos.col + lead.length };
        diag(pos, `Text \`${n.value.trim().slice(0, 30)}\` must be inside a field in ${where}.`);
      }
    }
    return cmds;
  };

  /** The exact text of a leaf `{...}`. */
  const leafText = (cmd: RsmCommand): string => {
    if (cmd.groups.length !== 1) diag(cmd.pos, `\`\\${cmd.name}\` takes one {value}.`);
    let s = "";
    for (const n of cmd.groups[0] ?? []) {
      if (n.type === "text") s += n.value;
      else diag(n.pos, `\`\\${n.name}\` isn't allowed inside \`\\${cmd.name}\` — content fields hold plain text.`);
    }
    return s;
  };

  const itemList = (cmd: RsmCommand): string[] =>
    commandsIn(cmd.groups[0], `\`\\${cmd.name}\``).flatMap((c) => {
      if (c.name !== "item") {
        diag(c.pos, `Only \`\\item{...}\` is allowed inside \`\\${cmd.name}\`.`);
        return [];
      }
      return [leafText(c)];
    });

  const readFields = (group: RsmNode[] | undefined, specs: FieldSpec[], where: string) => {
    const obj: Record<string, unknown> = {};
    for (const c of commandsIn(group, where)) {
      const spec = specs.find((s) => s.name === c.name);
      if (!spec) {
        diag(c.pos, `Unknown field \`\\${c.name}\` in ${where}. Available: ${specs.map((s) => s.name).join(", ")}.`);
        continue;
      }
      if (c.name in obj) diag(c.pos, `\`\\${c.name}\` appears twice in ${where}.`);
      if (spec.kind === "text") obj[c.name] = leafText(c);
      else if (spec.kind === "list") obj[c.name] = itemList(c);
      else {
        const date: { from: string; to?: string } = { from: "" };
        for (const d of commandsIn(c.groups[0], "`\\date`")) {
          if (d.name === "from") date.from = leafText(d);
          else if (d.name === "to") date.to = leafText(d);
          else diag(d.pos, "Only `\\from{...}` and `\\to{...}` are allowed inside `\\date`.");
        }
        obj[c.name] = date;
      }
    }
    // Required fields default to empty values.
    for (const s of specs) {
      if (s.optional || s.name in obj) continue;
      obj[s.name] = s.kind === "text" ? "" : s.kind === "list" ? [] : { from: "" };
    }
    return obj;
  };

  const entriesOf = (cmd: RsmCommand, specs: FieldSpec[], where: string, skip: string[] = []) =>
    commandsIn(cmd.groups[0], where).flatMap((c) => {
      if (skip.includes(c.name)) return [];
      if (c.name !== "entry") {
        diag(c.pos, `Only \`\\entry{...}\` is allowed inside ${where}.`);
        return [];
      }
      return [readFields(c.groups[0], specs, `an entry of ${where}`)];
    });

  const content: Record<string, unknown> = {
    personal: readFields([], PERSONAL, "`\\personal`"),
    education: [],
    experience: [],
    projects: [],
    skills: [],
    awards: [],
  };
  const seen = new Set<string>();
  const custom: CustomSection[] = [];

  for (const cmd of commandsIn(nodes, "the document")) {
    if (cmd.name !== "custom" && seen.has(cmd.name)) diag(cmd.pos, `\`\\${cmd.name}\` appears twice.`);
    seen.add(cmd.name);
    if (cmd.name === "personal") {
      content.personal = readFields(cmd.groups[0], PERSONAL, "`\\personal`");
    } else if ((SECTION_ORDER as readonly string[]).includes(cmd.name)) {
      content[cmd.name] = entriesOf(cmd, SECTIONS[cmd.name], `\`\\${cmd.name}\``);
    } else if (cmd.name === "custom") {
      const id = cmd.options.find((o) => o.key === "id")?.value?.trim();
      if (!id) {
        diag(cmd.pos, '`\\custom` needs an id, e.g. `\\custom[id="languages"]{...}`.');
        continue;
      }
      if (custom.some((s) => s.id === id)) diag(cmd.pos, `Custom section id \`${id}\` is used twice.`);
      const titleCmd = commandsIn(cmd.groups[0], "`\\custom`").find((c) => c.name === "title");
      custom.push({
        id,
        title: titleCmd ? leafText(titleCmd) : "",
        entries: entriesOf(cmd, CUSTOM_ENTRY, `\`\\custom[id=${id}]\``, ["title"]) as unknown as CustomEntry[],
      });
    } else if (cmd.name === "layout") {
      const layout: ResumeLayout = {};
      for (const c of commandsIn(cmd.groups[0], "`\\layout`")) {
        if (c.name === "order" || c.name === "hidden") layout[c.name] = itemList(c) as SectionKey[];
        else if (c.name === "titles") {
          const titles: Partial<Record<SectionKey, string>> = {};
          for (const t of commandsIn(c.groups[0], "`\\titles`")) {
            const section = t.options.find((o) => o.key === "section")?.value;
            if (t.name !== "title" || !section) {
              diag(t.pos, 'Use `\\title[section="skills"]{New title}` inside `\\titles`.');
              continue;
            }
            titles[section as SectionKey] = leafText(t);
          }
          layout.titles = titles;
        } else diag(c.pos, "Only `\\order`, `\\hidden` and `\\titles` are allowed inside `\\layout`.");
      }
      content.layout = layout;
    } else {
      diag(
        cmd.pos,
        `Unknown section \`\\${cmd.name}\`. Use \\personal, \\${SECTION_ORDER.join(", \\")}, \\custom or \\layout.`
      );
    }
  }
  if (custom.length) content.custom = custom;

  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  const ok = !diagnostics.some((d) => d.severity === "error");
  return { content: ok ? (content as unknown as ResumeContent) : null, diagnostics };
}
