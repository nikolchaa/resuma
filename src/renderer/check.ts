/**
 * Checks a template by rendering it, for problems the validator can't see:
 * sections that never show, text off the page, text that blends into its
 * background, tiny text, and a resume that suddenly needs more pages.
 *
 * Used on AI-written templates before the user is asked to accept them.
 */
import type { ResumeData } from "@/lib/resumesStore";
import type { AppLanguage } from "@/lib/i18n";
import { SECTION_KINDS } from "./template/schema";
import { getTemplate, renderResume, PaperFormat } from ".";
import type { FontSet } from "./engine/fonts";
import type { DisplayItem, RenderedDocument } from "./engine/types";

export type RenderIssue =
  /** Sections with entries that render nothing (custom sections as "custom"). */
  | { kind: "missingSections"; values: string[] }
  /** Text items that run off the page. */
  | { kind: "offPage"; count: number }
  /** Text too close in colour to what is behind it (a few examples, and the colour pairs involved). */
  | { kind: "lowContrast"; values: string[]; pairs?: { text: string; background: string }[] }
  /** Smallest text size, when it is below a readable size. */
  | { kind: "tinyText"; size: number }
  /** The user's resume needs more pages than with the previous template. */
  | { kind: "morePages"; before: number; after: number };

export type CheckOptions = {
  format: PaperFormat;
  language: AppLanguage;
  fonts: FontSet;
};

/**
 * Catches text that all but disappears (white on white, dark on a dark
 * sidebar), not WCAG compliance: light accent colours like Modern's cyan
 * (about 1.8:1) are a deliberate design choice.
 */
const MIN_CONTRAST = 1.6;
const MIN_SIZE = 6.5;

/** A resume with every kind of section, so a template's gaps show up even when the user's resume is short. */
export const probeResume = (font?: string): ResumeData => ({
  id: "probe",
  title: "Probe",
  updated: "",
  font,
  content: {
    personal: {
      fullName: "Alex Example",
      email: "alex@example.com",
      location: "Belgrade, Serbia",
      phone: "+381 60 000 0000",
      website: "example.com",
      linkedin: "linkedin.com/in/example",
      github: "github.com/example",
    },
    education: [
      { school: "University", degree: "BSc", location: "City", gpa: "9.0", date: { from: "2015", to: "2019" }, courses: ["Algorithms"] },
    ],
    experience: [
      { jobTitle: "Engineer", company: "Company", location: "City", description: "Built things.", date: { from: "2020" }, notes: ["Did work."] },
    ],
    projects: [{ name: "Project", link: "example.com/p", date: { from: "2021" }, description: "A project.", technologies: ["Rust"] }],
    skills: [{ category: "Languages", items: ["TypeScript", "Rust"] }],
    awards: [{ title: "Award", organizer: "Organiser", date: { from: "2018" }, description: "First place.", location: "City" }],
    custom: [
      {
        id: "probe",
        title: "Volunteering",
        entries: [{ title: "Mentor", subtitle: "Club", location: "", date: { from: "2022" }, description: "Taught.", items: [] }],
      },
    ],
  },
});

type TextItem = Extract<DisplayItem, { type: "text" }>;

/**
 * Renders `templateSource` with the user's resume and the probe resume.
 * `previousSource` (the template being replaced) enables the page-count check.
 */
export function checkTemplate(
  templateSource: string,
  data: ResumeData,
  opts: CheckOptions,
  previousSource?: string
): RenderIssue[] {
  if (!getTemplate(templateSource).template) return [];
  const render = (d: ResumeData, source: string) =>
    renderResume({ ...d, templateSource: source }, opts);

  const issues: RenderIssue[] = [];
  const mine = render(data, templateSource);
  const probe = render(probeResume(data.font), templateSource);

  const missing = missingSections(probe);
  if (missing.length) issues.push({ kind: "missingSections", values: missing });

  const texts = [mine, probe].flatMap((doc) => doc.pages.map((p) => ({ page: p, items: p.items })));
  let offPage = 0;
  const lowContrast = new Set<string>();
  const pairs = new Map<string, { text: string; background: string }>();
  let smallest = Infinity;
  for (const { page, items } of texts) {
    for (const [item, background] of withBackgrounds(items)) {
      if (item.x < -0.5 || item.x + item.width > page.width + 0.5 || item.y > page.height || item.y - item.size < -0.5) {
        offPage++;
      }
      if (item.text.trim() && contrast(item.color, background) < MIN_CONTRAST) {
        if (lowContrast.size < 3) lowContrast.add(item.text.trim().slice(0, 40));
        if (pairs.size < 4) pairs.set(`${item.color}/${background}`, { text: item.color, background });
      }
      if (item.text.trim()) smallest = Math.min(smallest, item.size);
    }
  }
  if (offPage) issues.push({ kind: "offPage", count: offPage });
  if (lowContrast.size) issues.push({ kind: "lowContrast", values: [...lowContrast], pairs: [...pairs.values()] });
  if (smallest < MIN_SIZE) issues.push({ kind: "tinyText", size: smallest });

  if (previousSource && getTemplate(previousSource).template) {
    const before = render(data, previousSource).pages.length;
    if (mine.pages.length > before) issues.push({ kind: "morePages", before, after: mine.pages.length });
  }
  return issues;
}

/** Section kinds of the probe resume that produced no text. */
function missingSections(doc: RenderedDocument): string[] {
  const ids = doc.pages.flatMap((p) => p.items.filter((i) => i.type === "text").map((i) => i.id));
  const missing: string[] = SECTION_KINDS.filter((k) => !ids.some((id) => id.startsWith(`s.${k}.`)));
  // Custom sections render from `\section[*]` (or a fallback) with the section id as a suffix.
  if (!ids.some((id) => id.includes("@probe"))) missing.push("custom");
  return missing;
}

/** Each text item with the colour behind it: the last filled area painted under it, or white paper. */
function withBackgrounds(items: DisplayItem[]): [TextItem, string][] {
  const out: [TextItem, string][] = [];
  const fills: Extract<DisplayItem, { type: "rect" }>[] = [];
  for (const item of items) {
    if (item.type === "rect") fills.push(item);
    if (item.type !== "text") continue;
    const x = item.x + Math.min(item.width, 2);
    const y = item.y - item.size / 3;
    let background = "#ffffff";
    for (const r of fills) {
      // Thin rects are rules and borders, not backgrounds.
      if (r.h >= item.size * 0.8 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) background = r.color;
    }
    out.push([item, background]);
  }
  return out;
}

/** WCAG contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function luminance(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
