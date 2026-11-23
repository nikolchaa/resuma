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
import { compileTemplate, TemplateResult } from "./template/template";
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

export function renderResume(data: ResumeData, { format, language, fonts }: RenderOptions): RenderedDocument {
  let { template } = getTemplate(templateSourceFor(data.theme));
  // Built-in templates are validated by tests; fall back defensively anyway.
  if (!template) template = getTemplate(templateSourceFor()).template!;

  const { boxes, margin } = compileDocument({
    template,
    content: data.content,
    language,
    font: data.font,
    options: data.templateOptions,
  });
  const { pages, fontKeys } = layoutDocument({ boxes, page: PAPER[format], margin, fonts });

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
