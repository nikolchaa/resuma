import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { ResumeData } from "@/lib/resumesStore";
import { normalizeResume } from "@/lib/resumeMigration";
import { checkTemplate, probeResume } from "@/renderer/check";
import { renderResume } from "@/renderer";
import { loadTestFonts, sampleResume } from "@/renderer/testing/fixtures";
import { BUILTIN_TEMPLATES } from "@/templates";
import { createResumaMcpServer, McpDeps, revisionOf, scrub } from "./server";
import { McpHub } from "./hub";

const fonts = loadTestFonts();
const opts = { format: "A4" as const, language: "en" as const, fonts };

const jane = (): ResumeData => normalizeResume({ ...sampleResume(), title: "Jane Doe — Engineer" })!;
const ocean = BUILTIN_TEMPLATES.modern.replace("default=#00d9cb", "default=#0369a1");

const deps = (shared: string[] = []): McpDeps => ({
  listResumes: async () => [jane(), { ...jane(), id: "lib", title: "Using a library template", templateSource: ocean }],
  loadResume: async (id) => (id === "jane" ? jane() : id === "lib" ? { ...jane(), id: "lib", templateSource: ocean } : null),
  listLibrary: async () => [{ id: "ocean", name: "Ocean", source: ocean }],
  checkTemplate: async (template, resume) => {
    const data = resume ?? probeResume();
    return {
      issues: checkTemplate(template, data, opts),
      pages: renderResume({ ...data, templateSource: template }, opts).pages.length,
    };
  },
  sharesPersonal: async (id) => shared.includes(id),
  version: "test",
});

async function connect(d: McpDeps) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createResumaMcpServer(d).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content ?? []).map((c) => c.text).join("\n");
const personal = Object.values(sampleResume().content.personal).filter((v) => typeof v === "string" && v.length > 1) as string[];

describe("Resuma MCP server", () => {
  it("offers read-only tools and the format guides", async () => {
    const client = await connect(deps());
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["check_template", "get_resume", "get_template", "list_resumes", "list_templates", "validate"].sort()
    );
    for (const t of tools) expect(t.annotations?.readOnlyHint).toBe(true);
    const resources = (await client.listResources()).resources.map((r) => r.uri);
    expect(resources).toEqual(["resuma://guide/content", "resuma://guide/template"]);
    const guide = await client.readResource({ uri: "resuma://guide/template" });
    expect(JSON.stringify(guide)).toContain("\\\\cols[widths=");
    expect(JSON.stringify(guide)).toContain("Design rules:");
  });

  it("never shows personal details unless the user shared them", async () => {
    const client = await connect(deps());
    const outputs = [
      text(await client.callTool({ name: "list_resumes", arguments: {} })),
      text(await client.callTool({ name: "get_resume", arguments: { id: "jane", part: "content" } })),
      text(await client.callTool({ name: "get_resume", arguments: { id: "jane", part: "template" } })),
      text(await client.callTool({ name: "check_template", arguments: { source: BUILTIN_TEMPLATES.sidebar.replace("default=#e5e7eb", "default=#1f2937"), resume_id: "jane" } })),
    ].join("\n");
    for (const value of [...personal, "Jane", "Marie", "\\personal"]) expect(outputs).not.toContain(value);
    expect(outputs).toContain("\\experience{");
    expect(outputs).toContain("… — Engineer");
    expect(outputs).toContain("hidden by the user's privacy settings");

    const sharing = await connect(deps(["jane"]));
    const content = text(await sharing.callTool({ name: "get_resume", arguments: { id: "jane", part: "content" } }));
    expect(content).toContain("\\fullName{Jane Marie Doe}");
    expect(text(await sharing.callTool({ name: "list_resumes", arguments: {} }))).toContain("Jane Doe — Engineer");
  });

  it("lists resumes with their template and section sizes", async () => {
    const client = await connect(deps());
    const list = JSON.parse(text(await client.callTool({ name: "list_resumes", arguments: {} })));
    expect(list).toEqual([
      expect.objectContaining({ id: "jane", template: "professional", sections: expect.objectContaining({ experience: 1, custom: 0 }) }),
      expect.objectContaining({ id: "lib", template: "library:ocean" }),
    ]);
  });

  it("reads a resume's template and gives a revision that follows the text", async () => {
    const client = await connect(deps());
    const r = await client.callTool({ name: "get_resume", arguments: { id: "lib", part: "template" } });
    const [source, meta] = (r.content as { text: string }[]).map((c) => c.text);
    expect(source).toBe(ocean);
    expect(JSON.parse(meta).revision).toBe(revisionOf(ocean));
    expect(revisionOf(ocean)).not.toBe(revisionOf(ocean + " "));
    const missing = await client.callTool({ name: "get_resume", arguments: { id: "nope", part: "content" } });
    expect(missing.isError).toBe(true);
  });

  it("validates content and templates", async () => {
    const client = await connect(deps());
    const bad = JSON.parse(text(await client.callTool({ name: "validate", arguments: { kind: "template", source: "\\template[id=x]\n\\style[a]{size: 3}" } })));
    expect(bad.valid).toBe(false);
    expect(bad.diagnostics[0]).toMatchObject({ severity: "error", line: 2, message: expect.stringMatching(/Unknown property `size`/) });
    const good = JSON.parse(text(await client.callTool({ name: "validate", arguments: { kind: "template", source: BUILTIN_TEMPLATES.sidebar } })));
    expect(good).toEqual({ valid: true, diagnostics: [] });
    const content = JSON.parse(text(await client.callTool({ name: "validate", arguments: { kind: "content", source: "\\skills{\\entry{\\category{X}\\items{\\item{Y}}}}" } })));
    expect(content.valid).toBe(true);
  });

  it("render-checks templates with a sample or a resume", async () => {
    const client = await connect(deps());
    const clean = JSON.parse(text(await client.callTool({ name: "check_template", arguments: { source: BUILTIN_TEMPLATES.sidebar } })));
    expect(clean).toMatchObject({ valid: true, pages: 1, issues: [] });
    const dark = BUILTIN_TEMPLATES.sidebar.replace("default=#e5e7eb", "default=#1f2937");
    const flagged = JSON.parse(text(await client.callTool({ name: "check_template", arguments: { source: dark, resume_id: "jane" } })));
    expect(flagged.issues).toEqual([expect.objectContaining({ kind: "lowContrast" })]);
    const invalid = JSON.parse(text(await client.callTool({ name: "check_template", arguments: { source: "\\template[id=x]\n\\p{" } })));
    expect(invalid.valid).toBe(false);
  });

  it("lists and reads built-in and library templates", async () => {
    const client = await connect(deps());
    const list = JSON.parse(text(await client.callTool({ name: "list_templates", arguments: {} })));
    expect(list).toContainEqual({ id: "sidebar", name: "Sidebar", kind: "built-in" });
    expect(list).toContainEqual({ id: "library:ocean", name: "Ocean", kind: "library" });
    expect(text(await client.callTool({ name: "get_template", arguments: { id: "library:ocean" } }))).toBe(ocean);
    expect(text(await client.callTool({ name: "get_template", arguments: { id: "compact" } }))).toBe(BUILTIN_TEMPLATES.compact);
    expect((await client.callTool({ name: "get_template", arguments: { id: "nope" } })).isError).toBe(true);
  });
});

describe("scrub", () => {
  it("removes personal values and name words from free text", () => {
    expect(scrub("Jane Doe — Engineer", jane())).toBe("… — Engineer");
    expect(scrub("CV for jane@doe.dev (+381 60 123 4567)", jane())).toBe("CV for … (…)");
    expect(scrub("Janet's resume", jane())).toBe("Janet's resume");
  });
});

describe("McpHub", () => {
  it("keeps sessions apart and turns away unknown ones", async () => {
    const replies: { session: string; message: JSONRPCMessage }[] = [];
    const hub = new McpHub(
      () => createResumaMcpServer(deps()),
      (session, _id, message) => replies.push({ session, message })
    );
    const init = (id: number): JSONRPCMessage => ({
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    expect(await hub.receive("a", init(1))).toBe("delivered");
    expect(await hub.receive("b", init(1))).toBe("delivered");
    expect(await hub.receive("c", { jsonrpc: "2.0", id: 2, method: "tools/list" })).toBe("unknownSession");
    await hub.receive("a", { jsonrpc: "2.0", method: "notifications/initialized" });
    await hub.receive("a", { jsonrpc: "2.0", id: 3, method: "tools/list" });
    await new Promise((r) => setTimeout(r, 20));
    expect(replies.filter((r) => r.session === "a").map((r) => (r.message as { id: number }).id)).toEqual([1, 3]);
    expect(replies.filter((r) => r.session === "b")).toHaveLength(1);
    expect(hub.sessionCount).toBe(2);
    await hub.end("a");
    expect(hub.sessionCount).toBe(1);
  });
});
