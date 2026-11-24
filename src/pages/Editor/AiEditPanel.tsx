import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAiEnabled } from "@/hooks/useAiEnabled";
import { EditResult, EditTarget, runSourceEdit } from "@/lib/aiSourceEdit";
import { runPrompt } from "@/lib/llmUtils";
import type { RenderIssue } from "@/renderer/check";
import { DiffView, WarningList } from "@/components/ChangeReview";

type Props = {
  target: EditTarget;
  source: string;
  /** The source has errors: the model would get (and keep) a broken document. */
  hasErrors: boolean;
  jobDesc?: string;
  /** Templates: renders a candidate and reports problems before it is shown. */
  check?: (template: string) => RenderIssue[];
  /** Applies the accepted source (one undo step). */
  onAccept: (text: string) => void;
};

export const AiEditPanel = ({ target, source, hasErrors, jobDesc, check, onAccept }: Props) => {
  const { t } = useLanguage();
  const aiEnabled = useAiEnabled();
  const [instruction, setInstruction] = useState("");
  // Templates: change the current one, or design a new one from a description.
  const [generate, setGenerate] = useState(false);
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
      : generate
      ? [t("ai.edit.suggest.generate1"), t("ai.edit.suggest.generate2")]
      : [t("ai.edit.suggest.template1"), t("ai.edit.suggest.template2")];

  const run = async () => {
    if (!instruction.trim() || hasErrors || busy) return;
    setBusy(true);
    setResult(null);
    setError(null);
    setShowOutput(false);
    setRequestedFrom(source);
    try {
      setResult(await runSourceEdit({ target, instruction, source, jobDesc, call: runPrompt, generate, check }));
    } catch (e) {
      setError((e as Error)?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-2 font-semibold'>
        <Sparkles className='h-4 w-4 text-primary' /> {t("ai.edit.title")}
      </div>
      {target === "template" && (
        <div role='radiogroup' aria-label={t("ai.edit.title")} className='grid grid-cols-2 gap-1 rounded-lg bg-muted p-1'>
          {([false, true] as const).map((g) => (
            <button
              key={String(g)}
              role='radio'
              aria-checked={generate === g}
              disabled={busy}
              onClick={() => {
                setGenerate(g);
                setResult(null);
              }}
              className={`rounded-md px-3 py-1 text-sm ${
                generate === g ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t(g ? "ai.edit.mode.generate" : "ai.edit.mode.edit")}
            </button>
          ))}
        </div>
      )}
      <Textarea
        rows={2}
        value={instruction}
        placeholder={t(generate && target === "template" ? "ai.edit.placeholder.generate" : `ai.edit.placeholder.${target}`)}
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
      {target === "template" && generate && (
        <p className='text-xs text-muted-foreground'>{t("ai.edit.generate.note")}</p>
      )}
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
          <WarningList warnings={result.warnings} />
          <DiffView before={result.before} after={result.text} />
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
