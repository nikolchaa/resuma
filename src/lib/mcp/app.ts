/**
 * The app's wiring for connected AI apps: where resumes are read and written,
 * how templates are checked, and the one proposal store the UI shows.
 */
import { listResumes, loadResume, ResumeData, saveResume } from "@/lib/resumesStore";
import {
  deleteLibraryTemplate,
  libraryIdFor,
  listLibraryTemplates,
  saveLibraryTemplate,
} from "@/lib/templateLibrary";
import { getSection } from "@/lib/store";
import { normalizeLanguage } from "@/lib/i18n";
import type { SettingsType } from "@/contexts/OnboardingContext";
import { renderResume } from "@/renderer";
import { checkTemplate, probeResume, RenderIssue } from "@/renderer/check";
import { loadFonts } from "@/renderer/browser/loadFonts";
import { generateResumeThumbnail } from "@/renderer/browser/useRenderedResume";
import { getLiveDraft } from "./liveDrafts";
import { ProposalStore } from "./proposals";
import { getMcpSettings } from "./settings";

async function renderOptions() {
  const [fonts, app] = await Promise.all([loadFonts(), getSection<SettingsType["app"]>("app")]);
  return {
    fonts,
    format: app?.paperSize === "US" ? ("LETTER" as const) : ("A4" as const),
    language: normalizeLanguage(app?.language),
  };
}

/** Renders a template with a resume (or the probe resume) and reports problems and pages. */
export async function checkWithApp(template: string, resume: ResumeData | null): Promise<{ issues: RenderIssue[]; pages: number }> {
  const opts = await renderOptions();
  const data = resume ?? probeResume();
  return {
    issues: checkTemplate(template, data, opts),
    pages: renderResume({ ...data, templateSource: template }, opts).pages.length,
  };
}

/** The resume as the user sees it: the open editor's draft, else the saved file. */
export async function currentResume(id: string): Promise<ResumeData | null> {
  const live = getLiveDraft(id)?.get();
  return live ? structuredClone(live) : loadResume(id);
}

export async function sharesPersonal(id: string): Promise<boolean> {
  return (await getMcpSettings()).sharePersonal.includes(id);
}

export const appProposals = new ProposalStore({
  loadResume: currentResume,
  writeResume: async (id, next) => {
    const live = getLiveDraft(id);
    if (live) {
      live.update(next);
      return;
    }
    const { language } = await renderOptions();
    const image = await generateResumeThumbnail(next, language).catch(() => next.image);
    await saveResume({ ...next, updated: new Date().toISOString(), image });
  },
  sharesPersonal,
  checkTemplate: async (source, resume) => (await checkWithApp(source, resume)).issues,
  library: {
    get: async (id) => (await listLibraryTemplates()).find((t) => t.id === id),
    save: saveLibraryTemplate,
    remove: deleteLibraryTemplate,
    idFor: libraryIdFor,
  },
  autoApply: async () => (await getMcpSettings()).autoApply,
  now: () => new Date().toISOString(),
  newId: () => crypto.randomUUID(),
});

export { listResumes, listLibraryTemplates };
