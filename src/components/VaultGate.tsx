import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { ask, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { normalizeLanguage } from "@/lib/i18n";
import { getSection, reloadSettings } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toastUtils";
import {
  vaultAcknowledgeRecovery,
  vaultInit,
  vaultRecoveryCode,
  vaultReset,
  vaultStatus,
  VaultStatus,
  vaultUnlock,
} from "@/lib/vault";

const Screen = ({ children }: { children: React.ReactNode }) => (
  <div className='flex h-screen w-full items-center justify-center bg-background p-8 text-foreground'>
    <div className='flex w-full max-w-md flex-col gap-4'>{children}</div>
  </div>
);

/** Shows the recovery key, with copy and save-to-file. */
export const RecoveryCode = () => {
  const { t } = useLanguage();
  const [code, setCode] = useState("");
  useEffect(() => {
    vaultRecoveryCode().then(setCode).catch((e) => showError(t("vault.failed"), String(e)));
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    showSuccess(t("vault.recovery.copied"));
  };
  const saveFile = async () => {
    const path = await save({ defaultPath: "resuma-recovery-key.txt", filters: [{ name: "Text", extensions: ["txt"] }] });
    if (!path) return;
    await writeTextFile(path, `${t("vault.recovery.fileHeader")}\n\n${code}\n`);
    showSuccess(t("vault.recovery.saved"), path);
  };

  return (
    <div className='flex flex-col gap-2'>
      <code className='select-all break-all rounded-md border bg-muted p-3 text-center font-mono text-sm tracking-wide'>
        {code || "…"}
      </code>
      <div className='flex gap-2'>
        <Button size='sm' variant='outline' onClick={copy} disabled={!code}>
          <Copy className='h-4 w-4 mr-1' /> {t("vault.recovery.copy")}
        </Button>
        <Button size='sm' variant='outline' onClick={saveFile} disabled={!code}>
          {t("vault.recovery.saveFile")}
        </Button>
      </div>
    </div>
  );
};

/**
 * Holds the app until the user's data can be read: sets up encryption on
 * first run (and asks the user to keep the recovery key), or asks for the
 * recovery key when the data folder is locked on this computer.
 */
export const VaultGate = ({ children }: { children: React.ReactNode }) => {
  const { t, setLanguage } = useLanguage();
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const refresh = useCallback(async () => {
    try {
      let s = await vaultStatus();
      // First run, or encrypting data from before encryption existed.
      if (s.state === "new") s = await vaultInit();
      // Data from an interrupted migration is finished off on every start.
      else if (s.state === "ready") s = await vaultInit();
      if (s.state === "ready") {
        reloadSettings();
        const app = await getSection<{ language?: string }>("app").catch(() => undefined);
        if (app?.language) setLanguage(normalizeLanguage(app.language));
      }
      setStatus(s);
    } catch (e) {
      setStatus({ state: "error", message: typeof e === "string" ? e : (e as Error).message });
    }
  }, [setLanguage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const unlock = async () => {
    setBusy(true);
    try {
      await vaultUnlock(code);
      setCode("");
      await refresh();
    } catch (e) {
      showError(t("vault.unlock.failed"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const startOver = async () => {
    if (!(await ask(t("vault.reset.confirm"), { kind: "warning" }))) return;
    try {
      const aside = await vaultReset();
      showSuccess(t("vault.reset.done"), aside);
      await refresh();
    } catch (e) {
      showError(t("vault.failed"), String(e));
    }
  };

  if (!status) {
    return (
      <Screen>
        <Loader2 className='h-5 w-5 animate-spin self-center text-muted-foreground' />
      </Screen>
    );
  }

  if (status.state === "error") {
    return (
      <Screen>
        <h1 className='text-xl font-semibold'>{t("vault.error.title")}</h1>
        <p className='text-sm text-muted-foreground'>{t("vault.error.description")}</p>
        <p className='rounded-md bg-muted p-2 font-mono text-xs'>{status.message}</p>
        <Button className='self-start' onClick={refresh}>
          {t("vault.error.retry")}
        </Button>
      </Screen>
    );
  }

  if (status.state === "locked" || status.state === "new") {
    return (
      <Screen>
        <KeyRound className='h-8 w-8 text-primary' />
        <h1 className='text-xl font-semibold'>{t("vault.unlock.title")}</h1>
        <p className='text-sm text-muted-foreground'>{t("vault.unlock.description")}</p>
        <Input
          autoFocus
          aria-label={t("vault.unlock.placeholder")}
          placeholder={t("vault.unlock.placeholder")}
          className='font-mono'
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && code.trim() && unlock()}
        />
        <Button onClick={unlock} disabled={busy || !code.trim()}>
          {busy && <Loader2 className='h-4 w-4 mr-1 animate-spin' />} {t("vault.unlock.button")}
        </Button>
        <button className='self-start text-xs text-muted-foreground underline' onClick={startOver}>
          {t("vault.reset.button")}
        </button>
      </Screen>
    );
  }

  return (
    <>
      {children}
      {status.recoveryPending && (
        <div className='fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-6'>
          <div className='flex w-full max-w-lg flex-col gap-4 rounded-xl border bg-background p-6 shadow-2xl'>
            <div className='flex items-center gap-2'>
              <ShieldCheck className='h-5 w-5 text-primary' />
              <h2 className='text-lg font-semibold'>{t("vault.recovery.title")}</h2>
            </div>
            <p className='text-sm text-muted-foreground'>{t("vault.recovery.description")}</p>
            <RecoveryCode />
            <label className='flex items-center gap-2 text-sm'>
              <input type='checkbox' checked={saved} onChange={(e) => setSaved(e.target.checked)} />
              {t("vault.recovery.confirm")}
            </label>
            <Button
              className='self-end'
              disabled={!saved}
              onClick={async () => {
                await vaultAcknowledgeRecovery();
                await refresh();
              }}
            >
              {t("vault.recovery.continue")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
