// In-memory stand-ins for the app's storage, for tests.
import type { ResumeData } from "@/lib/resumesStore";
import { normalizeResume } from "@/lib/resumeMigration";
import type { LibraryTemplate } from "@/lib/templateLibrary";
import { sampleResume } from "@/renderer/testing/sample";
import { ProposalStore } from "./proposals";

/** A store over in-memory resumes, an in-memory library and an optional "open editor". */
export function memoryStore(opts: { autoApply?: boolean; shared?: string[]; issues?: boolean; openInEditor?: string[] } = {}) {
  const files = new Map<string, ResumeData>([["jane", normalizeResume(sampleResume())!]]);
  const editor = new Map<string, ResumeData>();
  for (const id of opts.openInEditor ?? []) editor.set(id, structuredClone(files.get(id)!));
  const library = new Map<string, LibraryTemplate>();
  let n = 0;
  const store = new ProposalStore({
    loadResume: async (id) => structuredClone(editor.get(id) ?? files.get(id) ?? null),
    writeResume: async (id, next) => {
      if (editor.has(id)) editor.set(id, next);
      else files.set(id, next);
    },
    sharesPersonal: async (id) => (opts.shared ?? []).includes(id),
    checkTemplate: async () => (opts.issues ? [{ kind: "tinyText", size: 5 }] : []),
    library: {
      get: async (id) => library.get(id),
      save: async (name, source) => {
        const t = { id: name.toLowerCase().replace(/\W+/g, "-"), name, source };
        library.set(t.id, t);
        return t;
      },
      remove: async (id) => void library.delete(id),
      idFor: (name) => name.toLowerCase().replace(/\W+/g, "-"),
    },
    autoApply: async () => opts.autoApply === true,
    now: () => "2026-11-24T12:00:00.000Z",
    newId: () => `p${++n}`,
  });
  return { store, files, editor, library };
}

