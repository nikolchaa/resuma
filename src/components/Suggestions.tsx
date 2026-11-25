import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion as m } from "motion/react";
import { Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { appProposals } from "@/lib/mcp/app";
import type { Proposal } from "@/lib/mcp/proposals";
import { getMcpState, onMcpState } from "@/lib/mcp/settings";
import { showError, showSuccess } from "@/lib/toastUtils";
import { DiffView, fill, WarningList } from "./ChangeReview";
import { windowSingleton } from "@/lib/singleton";

// ---- shared state -------------------------------------------------------------

const panel = windowSingleton("suggestionsPanel", () => ({ open: false, listeners: new Set<() => void>() }));
const panelListeners = panel.listeners;

export function openSuggestions() {
  panel.open = true;
  panelListeners.forEach((l) => l());
}

function closeSuggestions() {
  panel.open = false;
  panelListeners.forEach((l) => l());
}

const subscribePanel = (l: () => void) => {
  panelListeners.add(l);
  return () => panelListeners.delete(l);
};

/** Every proposal of this session, oldest first. */
export function useProposals(): Proposal[] {
  return useSyncExternalStore(
    (l) => appProposals.subscribe(l),
    () => appProposals.list()
  );
}

function useMcpRunning(): boolean {
  const [running, setRunning] = useState(getMcpState().state === "running");
  useEffect(() => onMcpState((s) => setRunning(s.state === "running")), []);
  return running;
}

// ---- one proposal -------------------------------------------------------------

const ProposalCard = ({ p }: { p: Proposal }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [showDiff, setShowDiff] = useState(p.status === "pending");

  const what =
    p.target.kind === "template"
      ? fill(t("suggest.target.library"), { name: p.target.name })
      : fill(t(`suggest.target.${p.target.part}`), { title: p.target.title || t("mcp.personal.untitled") });

  const act = async (fn: () => Promise<Proposal | undefined> | Proposal | undefined, done: string) => {
    setBusy(true);
    try {
      const after = await fn();
      if (after?.status === "stale") showError(t("suggest.staleToast"), after.message);
      else if (after?.message) showError(t("suggest.undoFailed"), after.message);
      else showSuccess(done);
    } catch (e) {
      showError(t("suggest.failed"), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 rounded-md border p-3 ${p.status === "pending" ? "" : "opacity-80"}`}>
      <div className='flex items-start justify-between gap-2'>
        <div className='flex min-w-0 flex-col'>
          <span className='truncate text-sm font-medium'>{what}</span>
          <span className='text-xs text-muted-foreground'>
            {fill(t("suggest.from"), { client: p.client })} ·{" "}
            {new Date(p.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <span className='shrink-0 rounded-full border px-2 py-0.5 text-xs'>
          {t(`suggest.status.${p.status}`)}
          {p.autoApplied ? ` · ${t("suggest.auto")}` : ""}
        </span>
      </div>
      {p.summary && <p className='text-sm'>{p.summary}</p>}
      {p.labels && p.labels.length > 0 && (
        <ul className='list-disc pl-5 text-sm text-muted-foreground'>
          {p.labels.map((label, i) => (
            <li key={i}>{label}</li>
          ))}
        </ul>
      )}
      <WarningList warnings={p.warnings} />
      {p.message && <p className='text-sm text-destructive'>{p.message}</p>}
      <button className='self-start text-xs underline text-muted-foreground' onClick={() => setShowDiff((v) => !v)}>
        {t(showDiff ? "suggest.hideChanges" : "suggest.showChanges")}
      </button>
      {showDiff && <DiffView before={p.before} after={p.after} className='max-h-64' />}
      <div className='flex flex-wrap gap-2'>
        {p.status === "pending" && (
          <>
            <Button size='sm' disabled={busy} onClick={() => act(() => appProposals.apply(p.id), t("suggest.appliedToast"))}>
              {t("ai.edit.accept")}
            </Button>
            <Button size='sm' variant='outline' disabled={busy} onClick={() => act(() => appProposals.discard(p.id), t("suggest.discardedToast"))}>
              {t("ai.edit.discard")}
            </Button>
          </>
        )}
        {p.status === "applied" && (
          <Button size='sm' variant='outline' disabled={busy} onClick={() => act(() => appProposals.undo(p.id), t("suggest.undoneToast"))}>
            {t("editor.undo")}
          </Button>
        )}
        {p.target.kind === "resume" && (
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              closeSuggestions();
              navigate(`/editor/${(p.target as { resumeId: string }).resumeId}`);
            }}
          >
            {t("suggest.openResume")}
          </Button>
        )}
      </div>
    </div>
  );
};

// ---- button, panel and notifications --------------------------------------------

/**
 * Changes proposed by connected AI apps: a button beside the window controls
 * (with the number waiting), a panel to review them, and a toast when one
 * arrives or is applied automatically.
 */
export const Suggestions = () => {
  const { t } = useLanguage();
  const proposals = useProposals();
  const open = useSyncExternalStore(subscribePanel, () => panel.open);
  const running = useMcpRunning();
  const pending = proposals.filter((p) => p.status === "pending").length;
  // Waiting suggestions nothing flagged, for "Apply all without warnings".
  const quiet = proposals.filter((p) => p.status === "pending" && p.warnings.length === 0);
  const [applyingAll, setApplyingAll] = useState(false);
  const applyQuiet = async () => {
    setApplyingAll(true);
    try {
      const { applied, stale } = await appProposals.applyAll(quiet.map((p) => p.id));
      if (stale > 0) showError(fill(t("suggest.applyQuietStale"), { n: stale }));
      if (applied > 0) showSuccess(fill(t("suggest.applyQuietDone"), { n: applied }));
    } catch (e) {
      showError(t("suggest.failed"), (e as Error).message);
    } finally {
      setApplyingAll(false);
    }
  };

  // Toasts for new proposals (not for ones already there when this mounted).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(proposals.map((p) => p.id));
      return;
    }
    for (const p of proposals) {
      if (seen.current.has(p.id)) continue;
      seen.current.add(p.id);
      // Resuma's own suggestions arrive in batches; their job announces them.
      if (p.origin === "app") continue;
      if (p.autoApplied) showSuccess(fill(t("suggest.autoAppliedToast"), { client: p.client }), p.summary || undefined);
      else if (p.status === "pending") showSuccess(fill(t("suggest.newToast"), { client: p.client }), p.summary || undefined);
    }
  }, [proposals]);

  if (!running && proposals.length === 0) return null;

  return (
    <>
      <button
        className='fixed top-0 right-[6.5rem] z-[60] flex h-8 items-center gap-1 px-2 text-foreground hover:bg-primary hover:text-primary-foreground'
        onClick={() => (open ? closeSuggestions() : openSuggestions())}
        aria-label={t("suggest.title")}
        title={t("suggest.title")}
      >
        <Inbox strokeWidth='1.5px' className='h-4 w-4' />
        {pending > 0 && (
          <span className='min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground'>{pending}</span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <m.aside
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            // A floating card, clear of the window bar and every edge.
            className='fixed top-11 right-3 bottom-3 z-[55] flex w-[30rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl'
          >
            <div className='flex items-center justify-between border-b p-4'>
              <div className='flex flex-col'>
                <span className='font-semibold'>{t("suggest.title")}</span>
                <span className='text-xs text-muted-foreground'>{t("suggest.description")}</span>
              </div>
              <Button size='icon' variant='ghost' onClick={closeSuggestions} aria-label={t("common.close")}>
                <X className='h-4 w-4' />
              </Button>
            </div>
            <div className='flex flex-1 flex-col gap-3 overflow-y-auto p-4'>
              {quiet.length > 1 && (
                <Button size='sm' variant='outline' className='self-start' disabled={applyingAll} onClick={applyQuiet}>
                  {fill(t("suggest.applyQuiet"), { n: quiet.length })}
                </Button>
              )}
              {proposals.length === 0 ? (
                <p className='text-sm text-muted-foreground'>{t("suggest.empty")}</p>
              ) : (
                [...proposals].reverse().map((p) => <ProposalCard key={p.id} p={p} />)
              )}
            </div>
          </m.aside>
        )}
      </AnimatePresence>
    </>
  );
};
