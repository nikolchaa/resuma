import { useEffect, useState } from "react";
import { Check, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDownloadListeners } from "@/hooks/useDownloadListeners";
import { showError } from "@/lib/toastUtils";
import { deleteReranker, downloadReranker, RERANKER, rerankerInstalled } from "@/lib/tailoring/reranker";

type State = "checking" | "missing" | "downloading" | "ready" | "deleting";

/**
 * The optional job-matching model for local AI (AI Settings): download it
 * to make tailoring faster and more consistent, or remove it.
 */
export const JobMatchingModel = () => {
  const { t } = useLanguage();
  const [state, setState] = useState<State>("checking");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    rerankerInstalled().then((ready) => setState(ready ? "ready" : "missing"));
  }, []);

  useDownloadListeners(RERANKER.name, {
    onProgress: (p) => {
      setState("downloading");
      setProgress(p);
    },
    onComplete: () => rerankerInstalled().then((ready) => setState(ready ? "ready" : "missing")),
    onError: (error) => {
      setState("missing");
      showError(`${t("ai.downloadErrorPrefix")} ${RERANKER.label}`, error);
    },
    onExtractComplete: () => setState("ready"),
    onExtractError: (error) => {
      setState("missing");
      showError(`${t("ai.downloadErrorPrefix")} ${RERANKER.label}`, error);
    },
  });

  const download = async () => {
    setState("downloading");
    setProgress(0);
    try {
      await downloadReranker();
    } catch (error) {
      setState("missing");
      showError(`${t("ai.downloadErrorPrefix")} ${RERANKER.label}`, (error as Error).message);
    }
  };

  const remove = async () => {
    setState("deleting");
    try {
      await deleteReranker();
      setState("missing");
    } catch (error) {
      setState("ready");
      showError(t("ai.matching.deleteFailed"), (error as Error).message);
    }
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex flex-col gap-1.5 my-2'>
        <CardTitle className='text-2xl font-semibold'>{t("ai.matching")}</CardTitle>
        <CardDescription className='text-sm text-muted-foreground'>{t("ai.matching.description")}</CardDescription>
      </div>
      <div className='flex items-center justify-between border rounded-xl px-2 py-2 pl-4 shadow-sm'>
        <span className='font-medium'>
          {RERANKER.label} <span className='text-muted-foreground'>({RERANKER.size})</span>
        </span>
        <div className='flex gap-2'>
          {state === "ready" && (
            <Button
              variant='ghost'
              size='sm'
              className='text-destructive'
              onClick={remove}
              aria-label={t("ai.matching.delete")}
              title={t("ai.matching.delete")}
            >
              <Trash2 className='w-4 h-4' />
            </Button>
          )}
          <Button size='sm' variant='secondary' disabled={state !== "missing"} onClick={download}>
            {state === "ready" ? (
              <>
                <Check className='w-4 h-4 mr-1' />
                {t("common.ready")}
              </>
            ) : state === "downloading" ? (
              <>
                <Download className='w-4 h-4 mr-1' />
                {t("common.downloading")} ({Math.round(progress)}%)
              </>
            ) : (
              <>
                <Download className='w-4 h-4 mr-1' />
                {t("common.download")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
