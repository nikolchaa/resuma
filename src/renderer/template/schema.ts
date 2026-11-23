/**
 * What a template is allowed to reference: content fields per section,
 * localised labels and style properties. The validator checks templates
 * against this so a typo (or an AI hallucination) is reported instead of
 * silently rendering nothing.
 */

export type FieldKind = "text" | "email" | "phone" | "url" | "date" | "list";

export const SECTION_KINDS = [
  "education",
  "experience",
  "projects",
  "awards",
  "skills",
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export const PERSONAL_FIELDS: Record<string, FieldKind> = {
  fullName: "text",
  email: "email",
  location: "text",
  phone: "phone",
  website: "url",
  linkedin: "url",
  github: "url",
};

export const ENTRY_FIELDS: Record<SectionKind, Record<string, FieldKind>> = {
  education: {
    school: "text",
    degree: "text",
    location: "text",
    gpa: "text",
    date: "date",
    "date.from": "text",
    "date.to": "text",
    courses: "list",
  },
  experience: {
    jobTitle: "text",
    company: "text",
    location: "text",
    description: "text",
    date: "date",
    "date.from": "text",
    "date.to": "text",
    notes: "list",
  },
  projects: {
    name: "text",
    link: "url",
    date: "date",
    "date.from": "text",
    description: "text",
    technologies: "list",
  },
  skills: {
    category: "text",
    items: "list",
  },
  awards: {
    title: "text",
    organizer: "text",
    location: "text",
    date: "date",
    "date.from": "text",
    description: "text",
  },
};

/** `\label{key}` → i18n key. */
export const LABELS: Record<string, string> = {
  education: "template.section.education",
  experience: "template.section.experience",
  projects: "template.section.projects",
  awards: "template.section.awards",
  skills: "template.section.skills",
  gpa: "template.label.gpa",
  courses: "template.label.courses",
  relevantCoursework: "template.label.relevantCoursework",
  tech: "template.label.tech",
  present: "common.present",
};

/** Families a template may use; keys are the names written in templates. */
export const FONT_FAMILIES: Record<string, string> = {
  Figtree: "Figtree",
  Inter: "Inter",
  "Space Grotesk": "Space Grotesk",
};

/** Resume `font` setting → family. */
export const RESUME_FONTS: Record<string, string> = {
  figtree: "Figtree",
  inter: "Inter",
  spaceGrotesk: "Space Grotesk",
};

export type OptionType = "color" | "size" | "font" | "choice";
