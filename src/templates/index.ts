import professional from "./professional.rsm?raw";
import modern from "./modern.rsm?raw";
import compact from "./compact.rsm?raw";

/** Built-in templates, keyed by the id stored in `ResumeData.theme`. */
export const BUILTIN_TEMPLATES: Record<string, string> = {
  professional,
  modern,
  compact,
};

export const DEFAULT_TEMPLATE_ID = "professional";

export const templateSourceFor = (id?: string): string =>
  BUILTIN_TEMPLATES[id ?? DEFAULT_TEMPLATE_ID] ?? BUILTIN_TEMPLATES[DEFAULT_TEMPLATE_ID];
