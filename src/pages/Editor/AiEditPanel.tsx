import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAiEnabled } from "@/hooks/useAiEnabled";
import { EditResult, EditTarget, EditWarning, runSourceEdit } from "@/lib/aiSourceEdit";
import { runPrompt } from "@/lib/llmUtils";
import { lineDiff, withContext } from "@/lib/lineDiff";

type Props = {
  target: EditTarget;
  source: string;
  /** The source has errors: the model would get (and keep) a broken document. */
  hasErrors: boolean;
  jobDesc?: string;
  /** Applies the accepted source (one undo step). */
  onAccept: (text: string) => void;
};

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

export const AiEditPanel = ({ target, source, hasErrors, jobDesc, onAccept }: Props) => {
  const { t } = useLanguage();
  const aiEnabled = useAiEnabled();
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<EditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  // The source the request was made from; applying over newer edits would revert them.
  const [requestedFrom, setRequestedFrom] = useState<string | null>(null);
  const stale = result?.ok === true && requestedFrom !== source;

  if (aiEnabled === false) {
    return <p className='text-sm text-muted-foreground'>{t("ai.edit.off")}</p>;
  }

  const suggestions =
    target === "content"
      ? [t("ai.edit.suggest.content1"), t("ai.edit.suggest.content2")]
      : [t("ai.edit.suggest.template1"), t("ai.edit.suggest.template2")];

  const run = async () => {
    if (!instruction.trim() || hasErrors || busy) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setShowOutput(false);
    setRequestedFrom(source);
    try {
      setResult(await runSourceEdit({ target, instruction, source, jobDesc, call: runPrompt }));
    } catch (e) {
      setError((e as Error)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const warningText = (w: EditWarning) => {
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
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-2 font-semibold'>
        <Sparkles className='h-4 w-4 text-primary' /> {t("ai.edit.title")}
      </div>
      <Textarea
        rows={2}
        value={instruction}
        placeholder={t(`ai.edit.placeholder.${target}`)}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
        }}
        disabled={busy}
      />
      <div className='flex flex-wrap gap-2'>
        {suggestions.map((s) => (
          <button
            key={s}
            className='rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground'
            onClick={() => setInstruction(s)}
            disabled={busy}
          >
            {s}
          </button>
        ))}
      </div>
      {target === "content" && <p className='text-xs text-muted-foreground'>{t("ai.edit.privacy")}</p>}
      {hasErrors && <p className='text-xs text-destructive'>{t("ai.edit.fixFirst")}</p>}
      <Button onClick={run} disabled={busy || hasErrors || !instruction.trim()} className='self-start'>
        {busy ? <Loader2 className='h-4 w-4 animate-spin mr-1' /> : <Sparkles className='h-4 w-4 mr-1' />}
        {busy ? t("ai.edit.running") : t("ai.edit.run")}
      </Button>

      {error && (
        <p className='text-sm text-destructive'>
          {t("ai.edit.fail.error")} {error}
        </p>
      )}

      {result && !result.ok && (
        <div className='flex flex-col gap-2 text-sm'>
          <p className='text-destructive'>{t(`ai.edit.fail.${result.reason}`)}</p>
          {result.output.trim() && (
            <button className='self-start text-xs underline text-muted-foreground' onClick={() => setShowOutput((v) => !v)}>
              {t("ai.edit.showOutput")}
            </button>
          )}
          {showOutput && (
            <pre className='max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs whitespace-pre-wrap'>{result.output}</pre>
          )}
        </div>
      )}

      {result?.ok && (
        <div className='flex flex-col gap-2'>
          <p className='text-sm font-medium'>{t("ai.edit.review")}</p>
          {result.attempts > 1 && <p className='text-xs text-muted-foreground'>{t("ai.edit.attempts")}</p>}
          {result.warnings.length > 0 && (
            <ul className='list-disc pl-5 text-sm text-amber-600 dark:text-amber-400'>
              {result.warnings.map((w, i) => (
                <li key={i}>{warningText(w)}</li>
              ))}
            </ul>
          )}
          <div className='max-h-72 overflow-auto rounded-md border font-mono text-xs'>
            {withContext(lineDiff(result.before, result.text)).map((l, i) =>
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
          {stale && <p className='text-sm text-destructive'>{t("ai.edit.stale")}</p>}
          <div className='flex gap-2'>
            <Button
              disabled={stale}
              onClick={() => {
                onAccept(result.text);
                setResult(null);
                setInstruction("");
              }}
            >
              {t("ai.edit.accept")}
            </Button>
            <Button variant='outline' onClick={() => setResult(null)}>
              {t("ai.edit.discard")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
