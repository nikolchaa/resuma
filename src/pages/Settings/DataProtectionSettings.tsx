import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { InfoTip } from "@/components/InfoTip";
import { RecoveryCode } from "@/components/VaultGate";
import { useLanguage } from "@/contexts/LanguageContext";
import { listResumes, ResumeData } from "@/lib/resumesStore";
import { reloadSettings } from "@/lib/store";
import { showError, showSuccess } from "@/lib/toastUtils";
import { vaultExportBackup, vaultImportBackup } from "@/lib/vault";

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

const CheckRow = ({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean | "indeterminate";
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) => (
  <div className='flex items-center gap-2'>
    <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
    <Label htmlFor={id} className='font-normal hover:cursor-pointer min-w-0'>
      <span className='truncate'>{children}</span>
    </Label>
  </div>
);

/** Settings → App: encryption status, recovery key, encrypted backups. */
export const DataProtectionSettings = () => {
  const { t } = useLanguage();
  const [backend, setBackend] = useState<{ backend: string; secure: boolean; location?: string } | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [mode, setMode] = useState<"none" | "export" | "import">("none");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  // What an export holds: the settings (with the profile) and which resumes.
  const [resumes, setResumes] = useState<ResumeData[]>([]);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    invoke<{ backend: string; secure: boolean; location?: string }>("keystore_status").then(setBackend).catch(() => {});
  }, []);

  const reset = () => {
    setMode("none");
    setPassword("");
    setConfirm("");
  };

  const startExport = async () => {
    const all = await listResumes().catch(() => [] as ResumeData[]);
    setResumes(all);
    setPicked(new Set(all.map((r) => r.id)));
    setIncludeSettings(true);
    setMode("export");
  };

  const allPicked = resumes.length > 0 && picked.size === resumes.length;
  const resumesChecked: boolean | "indeterminate" = allPicked ? true : picked.size > 0 ? "indeterminate" : false;
  const nothingChosen = !includeSettings && picked.size === 0;

  const togglePicked = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const exportBackup = async () => {
    if (nothingChosen) return showError(t("vault.backup.nothing"));
    if (password.length < 8) return showError(t("vault.backup.short"));
    if (password !== confirm) return showError(t("vault.backup.mismatch"));
    const path = await save({
      defaultPath: `resuma-backup-${new Date().toISOString().slice(0, 10)}.resumabackup`,
      filters: [{ name: "Resuma backup", extensions: ["resumabackup"] }],
    });
    if (!path) return;
    setBusy(true);
    try {
      const n = await vaultExportBackup(path, password, {
        includeSettings,
        // Every resume, also ones added since the list was read.
        resumeIds: allPicked ? undefined : [...picked],
      });
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

      <div className='flex flex-col gap-4'>
        <div className='flex items-center justify-between gap-4'>
          <Label>
            {t("vault.recovery.label")} <InfoTip text={t("vault.recovery.tip")} />
          </Label>
          <Button variant='outline' onClick={() => setShowCode((v) => !v)}>
            {t(showCode ? "vault.recovery.hide" : "vault.recovery.show")}
          </Button>
        </div>
        {showCode && <RecoveryCode />}
      </div>

      <Separator />

      <div className='flex flex-col gap-4'>
        <Label>{t("vault.backup.label")}</Label>
        <span className='text-sm text-muted-foreground'>{t("vault.backup.tip")}</span>
        {mode === "none" ? (
          <div className='flex gap-4'>
            <Button variant='outline' onClick={() => setMode("import")}>
              {t("vault.backup.import")}
            </Button>
            <Button onClick={startExport}>{t("vault.backup.export")}</Button>
          </div>
        ) : (
          <div className='flex flex-col gap-4'>
            {mode === "export" && (
              <div className='flex flex-col gap-3 rounded-md border p-4'>
                <span className='text-sm font-medium'>{t("vault.backup.include")}</span>
                <CheckRow id='backup-settings' checked={includeSettings} onChange={setIncludeSettings}>
                  {t("vault.backup.includeSettings")}
                </CheckRow>
                <CheckRow
                  id='backup-resumes'
                  checked={resumesChecked}
                  onChange={(on) => setPicked(new Set(on ? resumes.map((r) => r.id) : []))}
                >
                  {fill(t("vault.backup.includeResumes"), { n: resumes.length })}
                </CheckRow>
                {resumes.length > 0 && (
                  <div className='ml-6 flex max-h-48 flex-col gap-3 overflow-y-auto'>
                    {resumes.map((r) => (
                      <CheckRow
                        key={r.id}
                        id={`backup-resume-${r.id}`}
                        checked={picked.has(r.id)}
                        onChange={(on) => togglePicked(r.id, on)}
                      >
                        {r.title || r.id}
                      </CheckRow>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            <div className='flex gap-4'>
              <Button variant='outline' onClick={reset}>
                {t("common.cancel")}
              </Button>
              <Button
                disabled={busy || !password || (mode === "export" && nothingChosen)}
                onClick={mode === "export" ? exportBackup : importBackup}
              >
                {t(mode === "export" ? "vault.backup.exportGo" : "vault.backup.importGo")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
