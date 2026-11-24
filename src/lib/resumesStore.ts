import { remove, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { CURRENT_SCHEMA, normalizeResume } from "./resumeMigration";
import { vaultListResumes, vaultRead, vaultWrite } from "./vault";

// Types
export interface ResumeData {
  id: string;
  title: string;
  updated: string;
  content: ResumeContent;
  image?: string; // base64 or external
  jobDesc?: string; // optional job description for AI generation
  theme?: string; // optional theme for the resume
  font?: string; // optional font for the resume
  schema?: number; // file format version; missing = 1 (see resumeMigration.ts)
  templateOptions?: Record<string, string>; // values for the template's \option[...]s
  /** The resume's own copy of a template (.rsm source); overrides `theme` when valid. */
  templateSource?: string;
}

/** Section keys: the built-in sections, or `custom:<id>` for a custom section. */
export type SectionKey =
  | "education"
  | "experience"
  | "projects"
  | "skills"
  | "awards"
  | `custom:${string}`;

/** Optional, user-chosen arrangement of sections (Design mode). */
export interface ResumeLayout {
  order?: SectionKey[];
  hidden?: SectionKey[];
  titles?: Partial<Record<SectionKey, string>>;
}

export interface CustomEntry {
  title: string;
  subtitle: string;
  location: string;
  date: { from: string; to?: string };
  description: string;
  items: string[];
}

export interface CustomSection {
  id: string;
  title: string;
  entries: CustomEntry[];
}

export interface ResumeContent {
  personal: {
    fullName: string;
    email: string;
    location: string;
    phone?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  education: {
    school: string;
    degree: string;
    location: string;
    gpa: string;
    date: {
      from: string;
      to?: string;
    };
    courses?: string[];
  }[];
  experience: {
    jobTitle: string;
    company: string;
    location: string;
    description: string;
    date: {
      from: string;
      to?: string;
    };
    notes?: string[];
  }[];
  projects: {
    name: string;
    link?: string;
    date: {
      from: string;
    };
    description: string;
    technologies: string[];
  }[];
  skills: {
    category: string;
    items: string[];
  }[];
  awards: {
    title: string;
    organizer: string;
    date: {
      from: string;
    };
    description: string;
    location: string;
  }[];
  layout?: ResumeLayout;
  custom?: CustomSection[];
}

// Storage: resumes are encrypted at rest (see vault.ts).
const RESUMES_DIR = "resumes";
const vaultName = (id: string) => `resumes/${id}.resume`;

// CRUD
export async function saveResume(data: ResumeData): Promise<void> {
  await vaultWrite(
    vaultName(data.id),
    JSON.stringify(
      // Never downgrade the stamp of a file written by a newer Resuma.
      { ...data, schema: Math.max(data.schema ?? 0, CURRENT_SCHEMA) },
      null,
      2
    )
  );
}

export async function loadResume(id: string): Promise<ResumeData | null> {
  try {
    const raw = await vaultRead(vaultName(id));
    return raw === null ? null : normalizeResume(JSON.parse(raw));
  } catch (e) {
    console.error(`[resumes] couldn't read ${id}:`, e);
    return null;
  }
}

export async function deleteResume(id: string): Promise<void> {
  const path = await join(RESUMES_DIR, `${id}.resume`);
  if (await exists(path, { baseDir: BaseDirectory.AppData })) {
    await remove(path, { baseDir: BaseDirectory.AppData });
  }
}

export async function listResumes(): Promise<ResumeData[]> {
  const resumes: ResumeData[] = [];
  for (const file of await vaultListResumes()) {
    if (file.text === null) {
      console.error(`[resumes] couldn't read ${file.name}:`, file.error);
      continue;
    }
    try {
      const parsed = normalizeResume(JSON.parse(file.text));
      if (parsed) resumes.push(parsed);
    } catch {
      // skip corrupted files
    }
  }
  return resumes;
}
