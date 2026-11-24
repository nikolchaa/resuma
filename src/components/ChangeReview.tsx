/**
 * Pieces for reviewing a proposed change before applying it: the line diff
 * and plain-language warnings. Shared by the AI panel and the suggestions
 * from connected apps, so both read the same.
 */
import { useLanguage } from "@/contexts/LanguageContext";
import type { EditWarning } from "@/lib/aiSourceEdit";
import { lineDiff, withContext } from "@/lib/lineDiff";
import type { ProposalWarning } from "@/lib/mcp/proposals";
import type { RenderIssue } from "@/renderer/check";

export const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Turns change warnings into sentences in the app's language. */
export function useWarningText() {
  const { t } = useLanguage();

  const sectionName = (key: string) => (key === "custom" ? t("editor.sidebar.custom") : t(`template.section.${key}`));

  const issueText = (issue: RenderIssue) => {
    switch (issue.kind) {
      case "missingSections":
        return fill(t("ai.edit.warn.missingSections"), { values: issue.values.map(sectionName).join(", ") });
      case "offPage":
        return fill(t("ai.edit.warn.offPage"), { n: issue.count });
      case "lowContrast":
        return issue.values.length
          ? fill(t("ai.edit.warn.lowContrast"), { values: issue.values.map((v) => `“${v}”`).join(", ") })
          : t("ai.edit.warn.lowContrastAny");
      case "tinyText":
        return fill(t("ai.edit.warn.tinyText"), { size: issue.size });
      case "morePages":
        return fill(t("ai.edit.warn.morePages"), { before: issue.before, after: issue.after });
    }
  };

  return (w: EditWarning | ProposalWarning): string => {
    switch (w.kind) {
      case "removed":
        return fill(t("ai.edit.warn.removed"), { n: w.count, section: w.section });
      case "added":
        return fill(t("ai.edit.warn.added"), { n: w.count, section: w.section });
      case "newDates":
        return fill(t("ai.edit.warn.newDates"), { values: w.values.join(", ") });
      case "newNames":
        return fill(t("ai.edit.warn.newNames"), { values: w.values.join(", ") });
      case "personalChanged":
        return fill(t("ai.edit.warn.personalChanged"), { values: w.fields.join(", ") });
      case "newNumbers":
        return fill(t("ai.edit.warn.newNumbers"), { values: w.values.join(", ") });
      case "sectionsDropped":
        return fill(t("ai.edit.warn.sectionsDropped"), { values: w.values.join(", ") });
      case "replacesTemplate":
        return fill(t("ai.edit.warn.replacesTemplate"), { name: w.name });
      case "render":
        return issueText(w.issue);
    }
  };
}

export const WarningList = ({ warnings }: { warnings: (EditWarning | ProposalWarning)[] }) => {
  const text = useWarningText();
  if (!warnings.length) return null;
  return (
    <ul className='list-disc pl-5 text-sm text-amber-600 dark:text-amber-400'>
      {warnings.map((w, i) => (
        <li key={i}>{text(w)}</li>
      ))}
    </ul>
  );
};

/** A line diff with a little context around each change. */
export const DiffView = ({ before, after, className = "max-h-72" }: { before: string; after: string; className?: string }) => {
  const { t } = useLanguage();
  return (
    <div className={`overflow-auto rounded-md border font-mono text-xs ${className}`}>
      {withContext(lineDiff(before, after)).map((l, i) =>
        l.type === "skip" ? (
          <div key={i} className='bg-muted px-2 py-0.5 text-muted-foreground italic'>
            {fill(t("source.diff.skip"), { n: l.count })}
          </div>
        ) : (
          <div
            key={i}
            className={`whitespace-pre-wrap px-2 ${
              l.type === "add"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : l.type === "del"
                ? "bg-red-500/15 text-red-700 dark:text-red-300 line-through"
                : ""
            }`}
          >
            {l.type === "add" ? "+ " : l.type === "del" ? "− " : "  "}
            {l.text}
          </div>
        )
      )}
    </div>
  );
};
