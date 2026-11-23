import type { CustomEntry, CustomSection } from "./resumesStore";

export const emptyCustomEntry = (): CustomEntry => ({
  title: "",
  subtitle: "",
  location: "",
  date: { from: "" },
  description: "",
  items: [],
});

/** A new custom section with a unique `section-N` id and one empty entry. */
export const newCustomSection = (existing: CustomSection[], title: string): CustomSection => {
  const ids = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (ids.has(`section-${n}`)) n++;
  return { id: `section-${n}`, title, entries: [emptyCustomEntry()] };
};
