import {
  mkdir,
  readDir,
  readTextFile,
  writeFile,
  remove,
  exists,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

// Types
export interface ResumeData {
  id: string;
  title: string;
  updated: string;
  content?: ResumeContent;
  image?: string; // base64 or external
  jobDesc?: string; // optional job description for AI generation
}

export interface ResumeContent {
  personal: {
    fullName: string;
    email: string;
    location: string;
    headline: string;
    socials: string[];
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
}

// Storage Constants
const RESUMES_DIR = "resumes";

// Helpers
async function getResumePath(id: string): Promise<string> {
  return await join(RESUMES_DIR, `${id}.resume`);
}

async function ensureResumesDir(): Promise<void> {
  const dirExists = await exists(RESUMES_DIR, {
    baseDir: BaseDirectory.AppData,
  });
  if (!dirExists) {
    await mkdir(RESUMES_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });
  }
}

// CRUD
export async function saveResume(data: ResumeData): Promise<void> {
  await ensureResumesDir();
  const path = await getResumePath(data.id);
  await writeFile(
    path,
    new TextEncoder().encode(JSON.stringify(data, null, 2)),
    {
      baseDir: BaseDirectory.AppData,
    }
  );
}

export async function loadResume(id: string): Promise<ResumeData | null> {
  const path = await getResumePath(id);
  try {
    const raw = await readTextFile(path, {
      baseDir: BaseDirectory.AppData,
    });
    return JSON.parse(raw) as ResumeData;
  } catch {
    return null;
  }
}

export async function deleteResume(id: string): Promise<void> {
  const path = await getResumePath(id);
  await remove(path, { baseDir: BaseDirectory.AppData });
}

export async function listResumes(): Promise<ResumeData[]> {
  await ensureResumesDir();
  const files = await readDir(RESUMES_DIR, {
    baseDir: BaseDirectory.AppData,
  });
  const resumes: ResumeData[] = [];

  for (const file of files) {
    if (file.name?.endsWith(".resume")) {
      const fullPath = await join(RESUMES_DIR, file.name);
      try {
        const raw = await readTextFile(fullPath, {
          baseDir: BaseDirectory.AppData,
        });
        const parsed = JSON.parse(raw) as ResumeData;
        resumes.push(parsed);
      } catch {
        // skip unreadable or corrupted files
      }
    }
  }

  return resumes;
}
