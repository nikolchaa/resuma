import { describe, expect, it } from "vitest";
import { parseRsm, RsmCommand } from "./parse";

const cmd = (n: unknown) => n as RsmCommand;

describe("parseRsm", () => {
  it("parses commands, options and groups", () => {
    const { nodes, diagnostics } = parseRsm('\\p[heading, sep=" | "]{Hello \\v{name}}');
    expect(diagnostics).toEqual([]);
    const p = cmd(nodes[0]);
    expect(p.name).toBe("p");
    expect(p.options.map((o) => [o.key, o.value])).toEqual([
      ["heading", undefined],
      ["sep", " | "],
    ]);
    expect(p.groups[0][0]).toMatchObject({ type: "text", value: "Hello " });
    expect(cmd(p.groups[0][1]).name).toBe("v");
  });

  it("treats % $ & # _ as plain text except % at line start", () => {
    const { nodes, diagnostics } = parseRsm("% a comment\nCut costs 30% & R&D #1 $5_x\n  % indented comment\nend");
    expect(diagnostics).toEqual([]);
    const text = nodes.map((n) => (n.type === "text" ? n.value : "")).join("");
    expect(text).toBe("Cut costs 30% & R&D #1 $5_x\nend");
  });

  it("handles escapes and literal backslashes", () => {
    const { nodes } = parseRsm("a \\{b\\} \\\\ c \\5 d");
    expect(nodes[0]).toMatchObject({ type: "text", value: "a {b} \\ c \\5 d" });
  });

  it("supports multiple adjacent groups and nested commands", () => {
    const { nodes, diagnostics } = parseRsm("\\row{\\p{a}}{\\p{b}}");
    expect(diagnostics).toEqual([]);
    expect(cmd(nodes[0]).groups).toHaveLength(2);
  });

  it("reports an unclosed group at its opening position", () => {
    const { diagnostics } = parseRsm("\\p{\n  hello");
    expect(diagnostics[0]).toMatchObject({ severity: "error", line: 1, col: 3 });
    expect(diagnostics[0].message).toMatch(/Unclosed `\{`/);
  });

  it("reports a stray closing brace", () => {
    const { diagnostics } = parseRsm("a } b");
    expect(diagnostics[0].message).toMatch(/Unexpected `\}`/);
    expect(diagnostics[0]).toMatchObject({ line: 1, col: 3 });
  });

  it("reports a detached group", () => {
    const { diagnostics } = parseRsm("\\p {x}");
    expect(diagnostics[0].message).toMatch(/groups must follow a command directly/);
  });

  it("reports unclosed options and quotes", () => {
    expect(parseRsm("\\p[a").diagnostics[0].message).toMatch(/Unclosed `\[`/);
    expect(parseRsm('\\p[sep="x]{a}').diagnostics[0].message).toMatch(/Unclosed `"`/);
  });

  it("enforces the nesting limit", () => {
    const deep = "\\b{".repeat(40) + "}".repeat(40);
    expect(parseRsm(deep).diagnostics.some((d) => /too deep/.test(d.message))).toBe(true);
  });

  it("enforces the size limit", () => {
    expect(parseRsm("x".repeat(300 * 1024)).diagnostics[0].message).toMatch(/too large/);
  });
});
