/**
 * Resuma Markup (.rsm) parser.
 *
 * Grammar:
 *
 *   document := node*
 *   node     := command | text | comment
 *   command  := "\" name options? group*      (groups must follow directly)
 *   options  := "[" option ("," option)* "]"
 *   option   := key ("=" value)?               (value: bare word or "quoted")
 *   group    := "{" node* "}"
 *   comment  := "%" … end of line              (only when % starts a line)
 *
 * Only `\`, `{` and `}` are special in text. `\\`, `\{`, `\}`, `\%`, `\[`
 * and `\]` are escapes; a backslash followed by anything else is literal.
 *
 * The parser never throws: it returns whatever it could build plus a list of
 * diagnostics with line/column positions, so editors can show every problem
 * at once and the renderer can keep showing the last valid document.
 */

export type Pos = { line: number; col: number; offset: number };

export type Diagnostic = {
  severity: "error" | "warning";
  message: string;
  line: number;
  col: number;
};

export type RsmOption = { key: string; value?: string; pos: Pos };

export type RsmText = { type: "text"; value: string; pos: Pos };

export type RsmCommand = {
  type: "command";
  name: string;
  options: RsmOption[];
  groups: RsmNode[][];
  pos: Pos;
};

export type RsmNode = RsmText | RsmCommand;

export type ParseResult = { nodes: RsmNode[]; diagnostics: Diagnostic[] };

export const LIMITS = {
  maxSourceBytes: 256 * 1024,
  maxDepth: 32,
  maxNodes: 20000,
};

const ESCAPABLE = new Set(["\\", "{", "}", "%", "[", "]"]);
const isLetter = (c: string) => /[A-Za-z]/.test(c);
const isNameChar = (c: string) => /[A-Za-z0-9-]/.test(c);

export function parseRsm(source: string): ParseResult {
  const diagnostics: Diagnostic[] = [];
  if (source.length > LIMITS.maxSourceBytes) {
    diagnostics.push({
      severity: "error",
      message: `Source is too large (${source.length} characters, limit ${LIMITS.maxSourceBytes}).`,
      line: 1,
      col: 1,
    });
    return { nodes: [], diagnostics };
  }

  let i = 0;
  let line = 1;
  let col = 1;
  let nodeCount = 0;

  const pos = (): Pos => ({ line, col, offset: i });
  const err = (message: string, p: Pos = pos()) =>
    diagnostics.push({ severity: "error", message, line: p.line, col: p.col });

  const advance = (n = 1) => {
    for (let k = 0; k < n && i < source.length; k++) {
      if (source[i] === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  /** True when only spaces/tabs precede index `at` on its line. */
  const atLineStart = (at: number) => {
    for (let k = at - 1; k >= 0; k--) {
      const c = source[k];
      if (c === "\n") return true;
      if (c !== " " && c !== "\t" && c !== "\r") return false;
    }
    return true;
  };

  const countNode = (p: Pos) => {
    nodeCount++;
    if (nodeCount === LIMITS.maxNodes + 1) {
      err(`Too many elements (limit ${LIMITS.maxNodes}).`, p);
    }
  };

  function parseOptions(): RsmOption[] {
    // assumes source[i] === "["
    const open = pos();
    advance();
    const options: RsmOption[] = [];
    for (;;) {
      while (i < source.length && /\s/.test(source[i])) advance();
      if (i >= source.length) {
        err("Unclosed `[` — options must end with `]`.", open);
        return options;
      }
      if (source[i] === "]") {
        advance();
        return options;
      }
      const keyPos = pos();
      let key = "";
      while (i < source.length && !/[\s,=\]]/.test(source[i])) {
        key += source[i];
        advance();
      }
      while (i < source.length && /[ \t]/.test(source[i])) advance();
      let value: string | undefined;
      if (source[i] === "=") {
        advance();
        while (i < source.length && /[ \t]/.test(source[i])) advance();
        if (source[i] === '"') {
          const qPos = pos();
          advance();
          value = "";
          let closed = false;
          while (i < source.length) {
            const c = source[i];
            if (c === "\\" && i + 1 < source.length) {
              const n = source[i + 1];
              value += n === "n" ? "\n" : n;
              advance(2);
              continue;
            }
            if (c === '"') {
              advance();
              closed = true;
              break;
            }
            if (c === "\n") break;
            value += c;
            advance();
          }
          if (!closed) err('Unclosed `"` in option value.', qPos);
        } else {
          value = "";
          while (i < source.length && source[i] !== "," && source[i] !== "]" && source[i] !== "\n") {
            value += source[i];
            advance();
          }
          value = value.trim();
        }
      }
      if (!key) {
        err("Empty option name.", keyPos);
      } else {
        options.push({ key, value, pos: keyPos });
      }
      while (i < source.length && /\s/.test(source[i])) advance();
      if (source[i] === ",") {
        advance();
      } else if (source[i] !== "]" && i < source.length) {
        err(`Unexpected \`${source[i]}\` in options — separate options with commas.`);
        // skip to the next separator to recover
        while (i < source.length && source[i] !== "," && source[i] !== "]") advance();
        if (source[i] === ",") advance();
      }
    }
  }

  /** Parses nodes until `}` (when inGroup) or end of input. */
  function parseNodes(depth: number, inGroup: boolean, openPos?: Pos): RsmNode[] {
    const nodes: RsmNode[] = [];
    let text = "";
    let textPos: Pos | null = null;

    const flush = () => {
      if (text) {
        nodes.push({ type: "text", value: text, pos: textPos! });
        countNode(textPos!);
      }
      text = "";
      textPos = null;
    };
    const addText = (s: string, p: Pos) => {
      if (!textPos) textPos = p;
      text += s;
    };

    while (i < source.length) {
      const c = source[i];

      if (c === "%" && atLineStart(i)) {
        // A comment line disappears entirely: its indentation, text and newline.
        text = text.replace(/[ \t]*$/, "");
        while (i < source.length && source[i] !== "\n") advance();
        advance();
        continue;
      }

      if (c === "}") {
        if (inGroup) {
          flush();
          advance();
          return nodes;
        }
        err("Unexpected `}` — there is no open `{` to close. Write `\\}` for a literal brace.");
        advance();
        continue;
      }

      if (c === "{") {
        err(
          "Unexpected `{` — groups must follow a command directly (no space), e.g. `\\p{...}`. Write `\\{` for a literal brace."
        );
        // Parse and keep its content as plain text to recover gracefully.
        const p = pos();
        advance();
        const inner = parseNodes(depth + 1, true, p);
        flush();
        nodes.push(...inner);
        continue;
      }

      if (c === "\\") {
        const next = source[i + 1];
        if (next !== undefined && ESCAPABLE.has(next)) {
          addText(next, pos());
          advance(2);
          continue;
        }
        if (next !== undefined && isLetter(next)) {
          flush();
          const p = pos();
          advance();
          let name = "";
          while (i < source.length && isNameChar(source[i])) {
            name += source[i];
            advance();
          }
          let options: RsmOption[] = [];
          if (source[i] === "[") options = parseOptions();
          const groups: RsmNode[][] = [];
          while (source[i] === "{") {
            const gPos = pos();
            if (depth + 1 > LIMITS.maxDepth) {
              err(`Nesting is too deep (limit ${LIMITS.maxDepth}).`, gPos);
              return nodes;
            }
            advance();
            groups.push(parseNodes(depth + 1, true, gPos));
          }
          nodes.push({ type: "command", name, options, groups, pos: p });
          countNode(p);
          continue;
        }
        // literal backslash
        addText("\\", pos());
        advance();
        continue;
      }

      addText(c, pos());
      advance();
    }

    flush();
    if (inGroup && openPos) {
      err("Unclosed `{` — every `{` needs a matching `}`.", openPos);
    }
    return nodes;
  }

  const nodes = parseNodes(0, false);
  return { nodes, diagnostics };
}

/** Convenience: the value of an option, or the first bare (valueless) option. */
export const optionValue = (cmd: RsmCommand, key: string): string | undefined =>
  cmd.options.find((o) => o.key === key)?.value;

export const flagOptions = (cmd: RsmCommand): RsmOption[] =>
  cmd.options.filter((o) => o.value === undefined);

/** Concatenated plain text of a group; commands inside are reported by the caller. */
export const groupText = (group: RsmNode[] | undefined): string =>
  (group ?? []).map((n) => (n.type === "text" ? n.value : "")).join("");
