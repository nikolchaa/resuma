import professional from "./professional.rsm?raw";
import modern from "./modern.rsm?raw";
import compact from "./compact.rsm?raw";

// Windows checkouts may turn these files into CRLF; the code editor and the
// "is this still the built-in?" check work on LF text.
const lf = (s: string) => s.replace(/\r\n/g, "\n");

/** Built-in templates, keyed by the id stored in `ResumeData.theme`. */
export const BUILTIN_TEMPLATES: Record<string, string> = {
  professional: lf(professional),
  modern: lf(modern),
  compact: lf(compact),
};

export const DEFAULT_TEMPLATE_ID = "professional";

export const templateSourceFor = (id?: string): string =>
  BUILTIN_TEMPLATES[id ?? DEFAULT_TEMPLATE_ID] ?? BUILTIN_TEMPLATES[DEFAULT_TEMPLATE_ID];
