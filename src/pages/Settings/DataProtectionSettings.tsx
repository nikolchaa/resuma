import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { InfoTip } from "@/components/InfoTip";
import { RecoveryCode } from "@/components/VaultGate";
import { useLanguage } from "@/contexts/LanguageContext";
import { reloadSettings } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toastUtils";
import { vaultExportBackup, vaultImportBackup } from "@/lib/vault";

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Settings → App: encryption status, recovery key, encrypted backups. */
export const DataProtectionSettings = () => {
  const { t } = useLanguage();
  const [backend, setBackend] = useState<{ backend: string; secure: boolean; location?: string } | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [mode, setMode] = useState<"none" | "export" | "import">("none");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    invoke<{ backend: string; secure: boolean; location?: string }>("keystore_status").then(setBackend).catch(() => {});
  }, []);

  const reset = () => {
    setMode("none");
    setPassword("");
    setConfirm("");
  };

  const exportBackup = async () => {
    if (password.length < 8) return showError(t("vault.backup.short"));
    if (password !== confirm) return showError(t("vault.backup.mismatch"));
    const path = await save({
      defaultPath: `resuma-backup-${new Date().toISOString().slice(0, 10)}.resumabackup`,
      filters: [{ name: "Resuma backup", extensions: ["resumabackup"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      const n = await vaultExportBackup(path, password);
      showSuccess(fill(t("vault.backup.exported"), { n }), path);
      reset();
    } catch (e) {
      showError(t("vault.failed"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    const path = await open({ filters: [{ name: "Resuma backup", extensions: ["resumabackup"] }], multiple: false });
    if (!path || typeof path !== "string") return;
    if (!(await ask(t("vault.backup.importConfirm"), { kind: "warning" }))) return;
    setBusy(true);
    try {
      const n = await vaultImportBackup(path, password);
      showSuccess(fill(t("vault.backup.imported"), { n }));
      reset();
      // Everything on screen came from the old data: start fresh.
      reloadSettings();
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      showError(t("vault.failed"), String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-2 text-sm'>
        <ShieldCheck className='h-4 w-4 text-primary' />
        <span>
          {t(backend?.backend === "encrypted-file" ? "vault.status.file" : "vault.status.keyring")}
        </span>
        <InfoTip text={t("vault.status.description")} />
      </div>

      <Separator />

      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between gap-4'>
          <Label>
            {t("vault.recovery.label")} <InfoTip text={t("vault.recovery.tip")} />
          </Label>
          <Button size='sm' variant='outline' onClick={() => setShowCode((v) => !v)}>
            {t(showCode ? "vault.recovery.hide" : "vault.recovery.show")}
          </Button>
        </div>
        {showCode && <RecoveryCode />}
      </div>

      <Separator />

      <div className='flex flex-col gap-2'>
        <Label>
          {t("vault.backup.label")} <InfoTip text={t("vault.backup.tip")} />
        </Label>
        {mode === "none" ? (
          <div className='flex gap-2'>
            <Button size='sm' variant='outline' onClick={() => setMode("export")}>
              {t("vault.backup.export")}
            </Button>
            <Button size='sm' variant='outline' onClick={() => setMode("import")}>
              {t("vault.backup.import")}
            </Button>
          </div>
        ) : (
          <div className='flex flex-col gap-2'>
            <Input
              type='password'
              autoFocus
              placeholder={t(mode === "export" ? "vault.backup.newPassword" : "vault.backup.password")}
              aria-label={t(mode === "export" ? "vault.backup.newPassword" : "vault.backup.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "export" && (
              <Input
                type='password'
                placeholder={t("vault.backup.confirmPassword")}
                aria-label={t("vault.backup.confirmPassword")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            <div className='flex gap-2'>
              <Button size='sm' disabled={busy || !password} onClick={mode === "export" ? exportBackup : importBackup}>
                {t(mode === "export" ? "vault.backup.exportGo" : "vault.backup.importGo")}
              </Button>
              <Button size='sm' variant='ghost' onClick={reset}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
