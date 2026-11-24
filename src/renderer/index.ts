/**
 * Resuma renderer: resume data + .rsm template → laid-out pages.
 *
 * The same `RenderedDocument` is painted to the screen (SVG), to PDF
 * (pdf-lib) and to thumbnails (canvas), so all three always match.
 */
import type { ResumeData } from "@/lib/resumesStore";
import type { AppLanguage } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { templateSourceFor } from "@/templates";
import { compileTemplate, Template, TemplateResult } from "./template/template";
import type { Diagnostic } from "./rsm/parse";
import { compileDocument } from "./engine/compile";
import { layoutDocument } from "./engine/layout";
import { FontSet } from "./engine/fonts";
import { PAPER, RenderedDocument } from "./engine/types";

export type PaperFormat = keyof typeof PAPER;

const templateCache = new Map<string, TemplateResult>();

export function getTemplate(source: string): TemplateResult {
  let result = templateCache.get(source);
  if (!result) {
    result = compileTemplate(source);
    if (templateCache.size > 20) templateCache.clear();
    templateCache.set(source, result);
  }
  return result;
}

export type RenderOptions = {
  format: PaperFormat;
  language: AppLanguage;
  fonts: FontSet;
};

export type ResolvedTemplate = {
  template: Template;
  /** The source the template came from (the resume's own copy or a built-in). */
  source: string;
  /** True when the resume's own template is in use. */
  custom: boolean;
  /** Problems in the resume's own template (it then falls back to the built-in). */
  diagnostics: Diagnostic[];
};

/** The template a resume renders with: its own copy when valid, else its built-in theme. */
export function resolveTemplate(data: Pick<ResumeData, "theme" | "templateSource">): ResolvedTemplate {
  if (data.templateSource?.trim()) {
    const own = getTemplate(data.templateSource);
    if (own.template) return { template: own.template, source: data.templateSource, custom: true, diagnostics: own.diagnostics };
    const builtin = resolveTemplate({ theme: data.theme });
    return { ...builtin, diagnostics: own.diagnostics };
  }
  const source = templateSourceFor(data.theme);
  // Built-in templates are validated by tests; fall back defensively anyway.
  const template = getTemplate(source).template ?? getTemplate(templateSourceFor()).template!;
  return { template, source, custom: false, diagnostics: [] };
}

export function renderResume(data: ResumeData, { format, language, fonts }: RenderOptions): RenderedDocument {
  const { template } = resolveTemplate(data);

  const { boxes, margin, columns } = compileDocument({
    template,
    content: data.content,
    language,
    font: data.font,
    options: data.templateOptions,
  });
  const { pages, fontKeys } = layoutDocument({ boxes, page: PAPER[format], margin, fonts, columns });

  return {
    pages,
    fontKeys,
    meta: {
      title: data.title?.trim() || t(language, "template.document.title"),
      author: data.content?.personal?.fullName?.trim() || t(language, "template.document.author"),
      subject: t(language, "template.document.subject"),
      language,
    },
  };
}

export { FontSet } from "./engine/fonts";
export type { RenderedDocument, LaidOutPage, DisplayItem } from "./engine/types";
