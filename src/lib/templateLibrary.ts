/**
 * The user's own template library: `.rsm` files in `<app data>/templates`.
 *
 * Using a library template copies its source into the resume
 * (`templateSource`), so resumes stay self-contained: deleting or changing a
 * library template never changes a resume that already uses it.
 */
import { useEffect, useState } from "react";
import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { compileTemplate } from "@/renderer/template/template";
import { BUILTIN_TEMPLATES } from "@/templates";

const DIR = "templates";
const opts = { baseDir: BaseDirectory.AppData };

export type LibraryTemplate = {
  id: string;
  name: string;
  /** LF-normalised source. */
  source: string;
};

const lf = (s: string) => s.replace(/\r\n/g, "\n");

/** A file-safe template id from a display name ("My Sidebar!" → "my-sidebar"). */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return /^[a-z0-9]/.test(slug) ? slug : "template";
}

/** The id a name would be saved under; built-in ids are never shadowed. */
export function libraryIdFor(name: string): string {
  const id = slugify(name);
  return BUILTIN_TEMPLATES[id] ? `${id}-own` : id;
}

/**
 * Rewrites the `\template[...]` header with a new id and name, keeping the
 * rest of the source byte for byte.
 */
export function withHeader(source: string, id: string, name: string): string {
  const safeName = name.replace(/["\\[\]{}]/g, "").trim() || id;
  const header = `\\template[id=${id}, name="${safeName}", version=1]`;
  const text = lf(source);
  return /\\template\[[^\]]*\]/.test(text) ? text.replace(/\\template\[[^\]]*\]/, header) : `${header}\n${text}`;
}

async function ensureDir() {
  if (!(await exists(DIR, opts))) await mkdir(DIR, { ...opts, recursive: true });
}

/** Valid templates in the library, by name. Unreadable or invalid files are skipped. */
export async function listLibraryTemplates(): Promise<LibraryTemplate[]> {
  await ensureDir();
  const out: LibraryTemplate[] = [];
  for (const entry of await readDir(DIR, opts)) {
    if (!entry.isFile || !entry.name?.endsWith(".rsm")) continue;
    try {
      const source = lf(await readTextFile(await join(DIR, entry.name), opts));
      const { template } = compileTemplate(source);
      // The file name is the id; a file whose header says otherwise is still listed under its file name.
      const id = entry.name.slice(0, -".rsm".length);
      if (template && /^[a-z0-9][a-z0-9-]*$/.test(id)) out.push({ id, name: template.name || id, source });
    } catch {
      // skip unreadable files
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function libraryTemplateExists(id: string): Promise<boolean> {
  await ensureDir();
  return exists(await join(DIR, `${id}.rsm`), opts);
}

/**
 * Saves `source` under `name` (overwriting a template with the same id).
 * Returns the saved template; throws when the source isn't a valid template.
 */
export async function saveLibraryTemplate(source: string, name: string): Promise<LibraryTemplate> {
  const id = libraryIdFor(name);
  const text = withHeader(source, id, name);
  const { template, diagnostics } = compileTemplate(text);
  if (!template) {
    throw new Error(diagnostics.find((d) => d.severity === "error")?.message ?? "Invalid template");
  }
  await ensureDir();
  await writeTextFile(await join(DIR, `${id}.rsm`), text, opts);
  notify();
  return { id, name: template.name, source: text };
}

export async function deleteLibraryTemplate(id: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) return;
  await remove(await join(DIR, `${id}.rsm`), opts);
  notify();
}

// ---- React -----------------------------------------------------------------

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** The library, reloaded whenever a template is saved or deleted. */
export function useTemplateLibrary(): { templates: LibraryTemplate[]; error: Error | null } {
  const [templates, setTemplates] = useState<LibraryTemplate[]>([]);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      listLibraryTemplates()
        .then((t) => alive && (setTemplates(t), setError(null)))
        .catch((e) => alive && setError(e as Error));
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, []);
  return { templates, error };
}
