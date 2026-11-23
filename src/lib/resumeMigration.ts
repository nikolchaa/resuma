/**
 * Brings any .resume file up to the current schema.
 *
 * v1 files (everything before the new renderer) have no `schema` field and
 * may miss optional pieces. Migration only fills defaults and adds
 * `schema: 2`; it never removes fields, so migrated files keep opening in
 * older Resuma versions.
 */
import type { ResumeContent, ResumeData } from "./resumesStore";

export const CURRENT_SCHEMA = 2;

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" || typeof x === "number").map(String) : [];

const date = (v: unknown, withTo: boolean) => {
  const d = isObj(v) ? v : {};
  const out: Obj = { ...d, from: str(d.from) };
  if (withTo && d.to !== undefined) out.to = str(d.to);
  return out;
};

/** Normalises each entry of a section, keeping unknown fields. */
const entries = (v: unknown, fill: (e: Obj) => Obj): Obj[] =>
  Array.isArray(v) ? v.filter(isObj).map((e) => ({ ...e, ...fill(e) })) : [];

export function normalizeContent(raw: unknown): ResumeContent {
  const c = isObj(raw) ? raw : {};
  const p = isObj(c.personal) ? c.personal : {};
  return {
    ...c,
    personal: {
      ...p,
      fullName: str(p.fullName),
      email: str(p.email),
      location: str(p.location),
      ...(p.phone !== undefined && { phone: str(p.phone) }),
      ...(p.website !== undefined && { website: str(p.website) }),
      ...(p.linkedin !== undefined && { linkedin: str(p.linkedin) }),
      ...(p.github !== undefined && { github: str(p.github) }),
    },
    education: entries(c.education, (e) => ({
      school: str(e.school),
      degree: str(e.degree),
      location: str(e.location),
      gpa: str(e.gpa),
      date: date(e.date, true),
      ...(e.courses !== undefined && { courses: strList(e.courses) }),
    })),
    experience: entries(c.experience, (e) => ({
      jobTitle: str(e.jobTitle),
      company: str(e.company),
      location: str(e.location),
      description: str(e.description),
      date: date(e.date, true),
      ...(e.notes !== undefined && { notes: strList(e.notes) }),
    })),
    projects: entries(c.projects, (e) => ({
      name: str(e.name),
      ...(e.link !== undefined && { link: str(e.link) }),
      date: date(e.date, false),
      description: str(e.description),
      technologies: strList(e.technologies),
    })),
    skills: entries(c.skills, (e) => ({ category: str(e.category), items: strList(e.items) })),
    awards: entries(c.awards, (e) => ({
      title: str(e.title),
      organizer: str(e.organizer),
      date: date(e.date, false),
      description: str(e.description),
      location: str(e.location),
    })),
  } as ResumeContent;
}

/**
 * Returns a current-schema copy of `raw`, or null if it isn't a resume at
 * all (not an object, or no usable content).
 */
export function normalizeResume(raw: unknown): ResumeData | null {
  if (!isObj(raw)) return null;
  if (raw.content !== undefined && !isObj(raw.content)) return null;
  if (typeof raw.schema === "number" && raw.schema > CURRENT_SCHEMA) {
    // Written by a newer Resuma: keep it as-is rather than guessing.
    return raw as unknown as ResumeData;
  }
  return {
    ...raw,
    id: str(raw.id),
    title: str(raw.title),
    updated: str(raw.updated) || new Date(0).toISOString(),
    content: normalizeContent(raw.content),
    theme: str(raw.theme) || "professional",
    font: str(raw.font) || "figtree",
    schema: CURRENT_SCHEMA,
  } as ResumeData;
}
