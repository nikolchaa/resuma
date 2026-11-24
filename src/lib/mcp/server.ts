/**
 * The MCP server other AI apps talk to: what they can see and check.
 *
 * Read-only: tools list and read resumes and templates, validate Resuma
 * Markup and render-check templates. Nothing here changes a resume.
 *
 * Personal details (name, email, phone, links) are left out of everything a
 * client receives unless the user shared them for that resume; titles are
 * scrubbed of them too, since a title is often "Jane Doe — Engineer".
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResumeData } from "@/lib/resumesStore";
import { normalizeContent } from "@/lib/resumeMigration";
import { CONTENT_GUIDE, DESIGN_RULES, TEMPLATE_GUIDE } from "@/lib/aiSourceEdit";
import type { LibraryTemplate } from "@/lib/templateLibrary";
import { parseContent, printContent } from "@/renderer/rsm/content";
import { compileTemplate } from "@/renderer/template/template";
import type { Diagnostic } from "@/renderer/rsm/parse";
import type { RenderIssue } from "@/renderer/check";
import { BUILTIN_TEMPLATES, templateSourceFor } from "@/templates";

export type McpDeps = {
  listResumes: () => Promise<ResumeData[]>;
  loadResume: (id: string) => Promise<ResumeData | null>;
  listLibrary: () => Promise<LibraryTemplate[]>;
  /** Renders `template` with the resume (or a sample when none) and reports problems. */
  checkTemplate: (template: string, resume: ResumeData | null) => Promise<{ issues: RenderIssue[]; pages: number }>;
  /** Whether the user shared this resume's personal details with connected apps. */
  sharesPersonal: (id: string) => Promise<boolean>;
  version: string;
};

const INSTRUCTIONS = `Resuma is a desktop resume builder. Resumes and templates are written in Resuma Markup (.rsm).
Read resuma://guide/content and resuma://guide/template before writing or checking .rsm.
This connection can list and read resumes and templates, validate .rsm and render-check templates. It can't change anything.
Personal details (name, email, phone, links) are hidden unless the user shared them for a resume.`;

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** Short, stable fingerprint of a text (FNV-1a), so a later change can be detected. */
export function revisionOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Personal values to keep out of what clients see (the name word by word). */
function personalValues(data: ResumeData): string[] {
  const p = (data.content?.personal ?? {}) as Record<string, unknown>;
  const values = Object.values(p).filter((v): v is string => typeof v === "string" && v.trim().length > 1);
  const nameWords = typeof p.fullName === "string" ? p.fullName.split(/\s+/).filter((w) => w.length > 1) : [];
  return [...values.map((v) => v.trim()), ...nameWords].sort((a, b) => b.length - a.length);
}

/** Removes personal values from free text such as a resume title. */
export function scrub(text: string, data: ResumeData): string {
  let out = text;
  for (const value of personalValues(data)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(?<![\\p{L}\\d])${escaped}(?![\\p{L}\\d])`, "giu"), "…");
  }
  return out.replace(/…(\s*…)+/g, "…").trim();
}

const diagnosticsOf = (list: Diagnostic[]) =>
  list.map((d) => ({ severity: d.severity, line: d.line, column: d.col, message: d.message }));

export function createResumaMcpServer(deps: McpDeps): McpServer {
  const server = new McpServer({ name: "resuma", version: deps.version }, { instructions: INSTRUCTIONS });

  const titleOf = async (r: ResumeData) => {
    const title = r.title?.trim() || "Untitled resume";
    return (await deps.sharesPersonal(r.id)) ? title : scrub(title, r);
  };

  const templateLabel = async (r: ResumeData) => {
    if (!r.templateSource?.trim()) return r.theme ?? "professional";
    const own = r.templateSource.replace(/\r\n/g, "\n");
    const library = (await deps.listLibrary()).find((t) => t.source === own);
    return library ? `library:${library.id}` : "own";
  };

  // ---- resources: the format, so a client can learn it first --------------

  server.registerResource(
    "content-guide",
    "resuma://guide/content",
    { title: "Resume content format", description: "How resume content is written in Resuma Markup.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: CONTENT_GUIDE }] })
  );
  server.registerResource(
    "template-guide",
    "resuma://guide/template",
    { title: "Template format and design rules", description: "How templates are written, and rules for readable designs.", mimeType: "text/markdown" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: `${TEMPLATE_GUIDE}\n\n${DESIGN_RULES}` }] })
  );

  // ---- tools ----------------------------------------------------------------

  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

  server.registerTool(
    "list_resumes",
    {
      title: "List resumes",
      description: "Lists the user's resumes: id, title, last change, template and how many entries each section has.",
      annotations: readOnly,
    },
    async () => {
      const resumes = await deps.listResumes();
      const list = await Promise.all(
        resumes.map(async (r) => {
          const c = r.content;
          return {
            id: r.id,
            title: await titleOf(r),
            updated: r.updated,
            template: await templateLabel(r),
            sections: {
              education: c.education?.length ?? 0,
              experience: c.experience?.length ?? 0,
              projects: c.projects?.length ?? 0,
              skills: c.skills?.length ?? 0,
              awards: c.awards?.length ?? 0,
              custom: c.custom?.length ?? 0,
            },
          };
        })
      );
      return json(list);
    }
  );

  server.registerTool(
    "get_resume",
    {
      title: "Read a resume",
      description:
        "Returns a resume's content or its template as Resuma Markup, with a revision id. Content leaves out personal details unless the user shared them.",
      inputSchema: {
        id: z.string().describe("Resume id from list_resumes"),
        part: z.enum(["content", "template"]).describe("content: the resume text; template: how it looks"),
      },
      annotations: readOnly,
    },
    async ({ id, part }) => {
      const data = await deps.loadResume(id);
      if (!data) return fail(`No resume with id "${id}".`);
      let text: string;
      let note = "";
      if (part === "template") {
        text = data.templateSource?.trim() ? data.templateSource.replace(/\r\n/g, "\n") : templateSourceFor(data.theme);
      } else {
        const shares = await deps.sharesPersonal(id);
        text = printContent(normalizeContent(data.content), { omitPersonal: !shares });
        if (!shares) note = "Personal details are hidden by the user's privacy settings.";
      }
      return {
        content: [
          { type: "text" as const, text },
          { type: "text" as const, text: JSON.stringify({ id, part, revision: revisionOf(text), ...(note ? { note } : {}) }) },
        ],
      };
    }
  );

  server.registerTool(
    "validate",
    {
      title: "Validate Resuma Markup",
      description: "Checks resume content or a template written in Resuma Markup and lists problems with line and column.",
      inputSchema: {
        kind: z.enum(["content", "template"]),
        source: z.string().max(256 * 1024).describe("The Resuma Markup to check"),
      },
      annotations: readOnly,
    },
    async ({ kind, source }) => {
      const diagnostics = kind === "content" ? parseContent(source).diagnostics : compileTemplate(source).diagnostics;
      return json({ valid: !diagnostics.some((d) => d.severity === "error"), diagnostics: diagnosticsOf(diagnostics) });
    }
  );

  server.registerTool(
    "check_template",
    {
      title: "Render-check a template",
      description:
        "Renders a template (with a resume, or a sample resume) and reports what the validator can't see: sections that show nothing, text off the page, text that blends into its background, tiny text. Also returns the page count.",
      inputSchema: {
        source: z.string().max(256 * 1024).describe("The template, in Resuma Markup"),
        resume_id: z.string().optional().describe("Render with this resume instead of a sample"),
      },
      annotations: readOnly,
    },
    async ({ source, resume_id }) => {
      const compiled = compileTemplate(source);
      if (!compiled.template) {
        return json({ valid: false, diagnostics: diagnosticsOf(compiled.diagnostics) });
      }
      let resume: ResumeData | null = null;
      if (resume_id) {
        resume = await deps.loadResume(resume_id);
        if (!resume) return fail(`No resume with id "${resume_id}".`);
      }
      const { issues, pages } = await deps.checkTemplate(source, resume);
      return json({ valid: true, pages, issues, warnings: diagnosticsOf(compiled.diagnostics) });
    }
  );

  server.registerTool(
    "list_templates",
    {
      title: "List templates",
      description: "Lists the built-in templates and the ones the user saved to their library.",
      annotations: readOnly,
    },
    async () => {
      const builtins = Object.entries(BUILTIN_TEMPLATES).map(([id, source]) => ({
        id,
        name: compileTemplate(source).template?.name ?? id,
        kind: "built-in",
      }));
      const library = (await deps.listLibrary()).map((t) => ({ id: `library:${t.id}`, name: t.name, kind: "library" }));
      return json([...builtins, ...library]);
    }
  );

  server.registerTool(
    "get_template",
    {
      title: "Read a template",
      description: "Returns a template's Resuma Markup by id (a built-in id, or library:<id> from list_templates).",
      inputSchema: { id: z.string() },
      annotations: readOnly,
    },
    async ({ id }) => {
      if (id.startsWith("library:")) {
        const found = (await deps.listLibrary()).find((t) => `library:${t.id}` === id);
        return found ? { content: [{ type: "text" as const, text: found.source }] } : fail(`No template "${id}".`);
      }
      const source = BUILTIN_TEMPLATES[id];
      return source ? { content: [{ type: "text" as const, text: source }] } : fail(`No template "${id}".`);
    }
  );

  return server;
}
