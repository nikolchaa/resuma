import type { ResumeContent, SectionKey } from "./resumesStore";

/** Built-in sections in their default order. */
export const BUILTIN_SECTION_KEYS = ["education", "experience", "projects", "skills", "awards"] as const;

/**
 * The order sections appear in, shared by the renderer and text export:
 * the user's `layout.order` first, then the remaining built-ins in
 * `defaults` order, then custom sections. Hidden sections are dropped
 * unless `includeHidden` is set.
 */
export function orderedSections(
  content: ResumeContent,
  defaults: readonly string[] = BUILTIN_SECTION_KEYS,
  includeHidden = false
): SectionKey[] {
  const builtins = [...defaults];
  for (const k of BUILTIN_SECTION_KEYS) if (!builtins.includes(k)) builtins.push(k);
  const customs = (content.custom ?? []).map((c) => `custom:${c.id}`);
  const all = [...builtins, ...customs] as SectionKey[];
  const known = new Set<string>(all);
  const preferred = (content.layout?.order ?? []).filter((k) => known.has(k));
  const ordered = [...new Set([...preferred, ...all])];
  if (includeHidden) return ordered;
  const hidden = new Set(content.layout?.hidden ?? []);
  return ordered.filter((k) => !hidden.has(k));
}
