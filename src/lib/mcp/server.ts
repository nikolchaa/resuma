/**
 * The MCP server other AI apps talk to.
 *
 * Tools list and read resumes and templates, validate Resuma Markup and
 * render-check templates. Changes are only ever proposals (proposals.ts):
 * the user applies or discards them in Resuma.
 *
 * Personal details (name, email, phone, links) are left out of everything a
 * client receives unless the user shared them for that resume; titles are
 * scrubbed of them too, since a title is often "Jane Doe — Engineer".
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResumeData } from "@/lib/resumesStore";
import { CONTENT_GUIDE, DESIGN_RULES, TEMPLATE_GUIDE } from "@/lib/aiSourceEdit";
import type { LibraryTemplate } from "@/lib/templateLibrary";
import { parseContent } from "@/renderer/rsm/content";
import { compileTemplate } from "@/renderer/template/template";
import type { Diagnostic } from "@/renderer/rsm/parse";
import type { RenderIssue } from "@/renderer/check";
import { BUILTIN_TEMPLATES } from "@/templates";
import { probeResume } from "@/renderer/check";
import type { ProposalStore, ProposalWarning, ProposeResult } from "./proposals";
import { resumeView, revisionOf } from "./views";

export { revisionOf } from "./views";

export type McpDeps = {
  listResumes: () => Promise<ResumeData[]>;
  /** The resume as the user sees it: the open editor's draft, else the saved file. */
  loadResume: (id: string) => Promise<ResumeData | null>;
  proposals: ProposalStore;
  listLibrary: () => Promise<LibraryTemplate[]>;
  /** Renders `template` with the resume (or a sample when none) and reports problems. */
  checkTemplate: (template: string, resume: ResumeData | null) => Promise<{ issues: RenderIssue[]; pages: number }>;
  /** Whether the user shared this resume's personal details with connected apps. */
  sharesPersonal: (id: string) => Promise<boolean>;
  /** A page as a PNG (base64), and the page count. */
  renderPreview: (data: ResumeData, templateSource: string | undefined, page: number) => Promise<{ png: string; pages: number }>;
  /** Records a tool call for the activity list in Settings. */
  logActivity?: (entry: { client: string; tool: string; target?: string }) => void;
  version: string;
};

const INSTRUCTIONS = `Resuma is a desktop resume builder. Resumes and templates are written in Resuma Markup (.rsm).
Read resuma://guide/content and resuma://guide/template before writing or checking .rsm.
You can list and read resumes and templates, validate .rsm and render-check templates.
You can't change anything directly: propose_edit and propose_template create proposals the user applies or discards in Resuma (some users let proposals without warnings apply automatically). Read the resume with get_resume first and pass its revision; use get_proposal to see what happened.
Personal details (name, email, phone, links) are hidden unless the user shared them for a resume; leave \\personal out of content you propose unless you were shown it.`;

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

/** What a client is told about a proposal. */
const proposalReport = (r: ProposeResult) =>
  r.ok
    ? json({
        proposal_id: r.proposal.id,
        status: r.proposal.status,
        warnings: r.proposal.warnings.map(describeWarning),
        note:
          r.proposal.status === "applied"
            ? "Applied automatically (the user allows changes without warnings to apply)."
            : "Waiting for the user to apply or discard it in Resuma.",
      })
    : { ...json({ proposed: false, reason: r.reason, message: r.message, diagnostics: diagnosticsOf(r.diagnostics ?? []) }), isError: true };

/** Plain-language warnings for clients. */
function describeWarning(w: ProposalWarning): string {
  switch (w.kind) {
    case "removed":
      return `Removes ${w.count} entr${w.count === 1 ? "y" : "ies"} from ${w.section}.`;
    case "added":
      return `Adds ${w.count} entr${w.count === 1 ? "y" : "ies"} to ${w.section}.`;
    case "newDates":
      return `Dates that weren't in the resume: ${w.values.join(", ")}.`;
    case "newNames":
      return `Names that weren't in the resume: ${w.values.join(", ")}.`;
    case "newNumbers":
      return `Numbers that weren't in the resume: ${w.values.join(", ")}.`;
    case "personalChanged":
      return `Changes personal details: ${w.fields.join(", ")}.`;
    case "sectionsDropped":
      return `The template no longer shows: ${w.values.join(", ")}.`;
    case "replacesTemplate":
      return `Replaces the saved template "${w.name}".`;
    case "partsRemoved":
      return `Removes: ${w.values.join(", ")}.`;
    case "render":
      return `Render check: ${w.issue.kind}.`;
  }
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
  const clientName = () => server.server.getClientVersion()?.name?.trim() || "An AI app";

  // Every tool call is recorded for the activity list in Settings (tool name
  // and which resume or template, never the content).
  const register = server.registerTool.bind(server);
  server.registerTool = ((name: string, config: unknown, callback: (...args: unknown[]) => unknown) =>
    register(name, config as never, ((...args: unknown[]) => {
      const input = (args.length > 1 ? args[0] : {}) as Record<string, unknown>;
      const target = [input.resume_id, input.id, input.name, input.proposal_id].find((v) => typeof v === "string") as string | undefined;
      deps.logActivity?.({ client: clientName(), tool: name, target });
      return callback(...args);
    }) as never)) as typeof server.registerTool;

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
      const shares = await deps.sharesPersonal(id);
      const text = resumeView(data, part, shares);
      const note = part === "content" && !shares ? "Personal details are hidden by the user's privacy settings." : "";
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

  server.registerTool(
    "render_preview",
    {
      title: "Preview a page",
      description:
        "Renders a page as an image: a resume (optionally with another template), or a sample resume with a template. Personal details show as placeholders unless the user shared them.",
      inputSchema: {
        resume_id: z.string().optional().describe("Render this resume; leave out to use a sample resume"),
        template: z.string().max(256 * 1024).optional().describe("Template source to render with instead of the resume's own"),
        page: z.number().int().min(1).optional().describe("Page number, from 1"),
      },
      annotations: readOnly,
    },
    async ({ resume_id, template, page = 1 }) => {
      if (template) {
        const compiled = compileTemplate(template);
        if (!compiled.template) return { ...json({ valid: false, diagnostics: diagnosticsOf(compiled.diagnostics) }), isError: true };
      }
      let data: ResumeData;
      if (resume_id) {
        const resume = await deps.loadResume(resume_id);
        if (!resume) return fail(`No resume with id "${resume_id}".`);
        // The picture must not show more than the text would.
        data = (await deps.sharesPersonal(resume_id))
          ? resume
          : { ...resume, content: { ...resume.content, personal: probeResume().content.personal } };
      } else {
        if (!template) return fail("Give a resume_id, a template, or both.");
        data = probeResume();
      }
      const { png, pages } = await deps.renderPreview(data, template, page);
      return {
        content: [
          { type: "image" as const, data: png, mimeType: "image/png" },
          { type: "text" as const, text: JSON.stringify({ page: Math.min(page, pages), pages }) },
        ],
      };
    }
  );

  // ---- prompts: ready-made tasks a client can offer its user ----------------

  server.registerPrompt(
    "design_template",
    {
      title: "Design a resume template",
      description: "Design a new Resuma template from a description and propose it.",
      argsSchema: { description: z.string().describe("What the template should look like") },
    },
    ({ description }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Design a new Resuma resume template: ${description}

1. Read resuma://guide/template (format and design rules). Look at a built-in with get_template for a working example.
2. Write the complete template. Check it with validate, then check_template, and look at it with render_preview; fix every problem they report.
3. Propose it with propose_template (to save it to the user's templates) and say in one sentence what you made.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "tailor_resume",
    {
      title: "Tailor a resume to a job",
      description: "Rework a resume's content for a job description and propose the changes.",
      argsSchema: {
        resume_id: z.string().describe("Resume id from list_resumes"),
        job_description: z.string().describe("The job posting"),
      },
    },
    ({ resume_id, job_description }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Tailor resume "${resume_id}" to this job:

${job_description}

1. Read resuma://guide/content, then the resume with get_resume (part: content); keep its revision.
2. Rework wording, order and emphasis for this job. Never invent employers, schools, titles, dates, numbers or achievements; keep every section.
3. Check the result with validate, then propose it with propose_edit (part: content, base_revision from step 1) and a one-sentence summary of what changed.`,
          },
        },
      ],
    })
  );

  // ---- proposals: the user decides ------------------------------------------

  const proposing = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

  server.registerTool(
    "propose_edit",
    {
      title: "Propose a change to a resume",
      description:
        "Proposes new content or a new template for a resume, as the complete Resuma Markup text of that part. The user applies or discards it in Resuma. Pass the revision from get_resume; if the resume changed since, read it again. A section you leave out is removed (the user sees a warning), so include every section you want to keep; leave out \\personal if you weren't shown it.",
      inputSchema: {
        resume_id: z.string(),
        part: z.enum(["content", "template"]),
        source: z.string().max(256 * 1024).describe("The complete new text of that part"),
        base_revision: z.string().describe("The revision get_resume returned"),
        summary: z.string().max(500).describe("One sentence for the user: what changes and why"),
      },
      annotations: proposing,
    },
    async ({ resume_id, part, source, base_revision, summary }) =>
      proposalReport(
        await deps.proposals.proposeResume({
          client: clientName(),
          resumeId: resume_id,
          part,
          source,
          baseRevision: base_revision,
          summary,
        })
      )
  );

  server.registerTool(
    "propose_template",
    {
      title: "Propose saving a template",
      description: "Proposes saving a template to the user's library (My templates) under a name. The user applies or discards it in Resuma.",
      inputSchema: {
        name: z.string().min(1).max(80),
        source: z.string().max(256 * 1024).describe("The template, in Resuma Markup"),
        summary: z.string().max(500).describe("One sentence for the user"),
      },
      annotations: proposing,
    },
    async ({ name, source, summary }) =>
      proposalReport(await deps.proposals.proposeTemplate({ client: clientName(), name, source, summary }))
  );

  server.registerTool(
    "get_proposal",
    {
      title: "Check a proposal",
      description: "Tells whether a proposal is still pending, was applied, discarded, undone, or went stale (the resume changed before it was applied).",
      inputSchema: { proposal_id: z.string() },
      annotations: readOnly,
    },
    async ({ proposal_id }) => {
      const p = deps.proposals.get(proposal_id);
      if (!p) return fail(`No proposal "${proposal_id}" (proposals last until Resuma is closed).`);
      return json({
        proposal_id: p.id,
        status: p.status,
        ...(p.autoApplied ? { applied_automatically: true } : {}),
        ...(p.message ? { message: p.message } : {}),
        warnings: p.warnings.map(describeWarning),
      });
    }
  );

  return server;
}
