import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { listResumes, ResumeData } from "@/lib/resumesStore";
import { showError, showSuccess } from "@/lib/toastUtils";
import {
  DEFAULT_MCP_PORT,
  getMcpSettings,
  getMcpState,
  McpSettings,
  McpState,
  onMcpState,
  updateMcpSettings,
} from "@/lib/mcp/settings";

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Ready-to-paste setups for the common kinds of MCP clients. */
function snippets(url: string, token: string) {
  return {
    cli: `claude mcp add --transport http resuma ${url} --header "Authorization: Bearer ${token}"`,
    http: JSON.stringify(
      { mcpServers: { resuma: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } },
      null,
      2
    ),
    stdio: JSON.stringify(
      {
        mcpServers: {
          resuma: {
            command: "npx",
            args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
            env: { AUTH_HEADER: `Bearer ${token}` },
          },
        },
      },
      null,
      2
    ),
  };
}

/** Settings → AI: let other AI apps work with Resuma over MCP. */
export const ExternalAppsSettings = () => {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<McpSettings | null>(null);
  const [state, setState] = useState<McpState>(getMcpState());
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [port, setPort] = useState(String(DEFAULT_MCP_PORT));
  const [resumes, setResumes] = useState<ResumeData[]>([]);

  useEffect(() => {
    getMcpSettings().then((s) => {
      setSettings(s);
      setPort(String(s.port));
    });
    listResumes().then(setResumes).catch(() => setResumes([]));
    return onMcpState(setState);
  }, []);

  // The token is only read once the feature is on.
  useEffect(() => {
    if (settings?.enabled && !token) {
      invoke<string>("mcp_token").then(setToken).catch((e) => showError(t("mcp.failed"), String(e)));
    }
  }, [settings?.enabled]);

  if (!settings) return null;

  const update = async (patch: Partial<McpSettings>) => setSettings(await updateMcpSettings(patch));

  const url = `http://127.0.0.1:${settings.port}/mcp`;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(t("mcp.copied"));
    } catch (e) {
      showError(t("mcp.failed"), (e as Error).message);
    }
  };

  const regenerate = async () => {
    if (!(await ask(t("mcp.token.regenerateConfirm"), { kind: "warning" }))) return;
    try {
      setToken(await invoke<string>("mcp_regenerate_token"));
      showSuccess(t("mcp.token.regenerated"));
    } catch (e) {
      showError(t("mcp.failed"), String(e));
    }
  };

  const savePort = () => {
    const n = Number(port);
    if (Number.isInteger(n) && n >= 1024 && n <= 65535) {
      if (n !== settings.port) update({ port: n });
    } else {
      setPort(String(settings.port));
    }
  };

  const toggleShare = (id: string, on: boolean) =>
    update({
      sharePersonal: on ? [...new Set([...settings.sharePersonal, id])] : settings.sharePersonal.filter((s) => s !== id),
    });

  const statusText =
    state.state === "running"
      ? fill(t("mcp.status.running"), { url: `http://127.0.0.1:${state.port}/mcp` })
      : state.state === "starting"
      ? t("mcp.status.starting")
      : state.state === "error"
      ? fill(t("mcp.status.error"), { message: state.message })
      : t("mcp.status.off");

  const s = token ? snippets(url, token) : null;

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex items-start justify-between gap-4'>
        <div className='flex flex-col gap-1'>
          <Label htmlFor='mcp-enabled'>{t("mcp.enable")}</Label>
          <p className='text-sm text-muted-foreground'>{t("mcp.enable.description")}</p>
        </div>
        <Switch id='mcp-enabled' checked={settings.enabled} onCheckedChange={(on) => update({ enabled: on })} />
      </div>

      <p className={`text-sm ${state.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>{statusText}</p>

      {settings.enabled && (
        <>
          <div className='flex items-center justify-between gap-4'>
            <Label className='w-1/3' htmlFor='mcp-port'>
              {t("mcp.port")}
            </Label>
            <Input
              id='mcp-port'
              className='w-2/3 text-right'
              inputMode='numeric'
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              onBlur={savePort}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>

          <div className='flex items-center justify-between gap-4'>
            <Label className='w-1/3'>{t("mcp.token")}</Label>
            <div className='flex w-2/3 items-center gap-1'>
              <Input readOnly className='flex-1 font-mono text-xs' value={showToken ? token : "•".repeat(24)} />
              <Button size='icon' variant='ghost' onClick={() => setShowToken((v) => !v)} aria-label={t(showToken ? "mcp.token.hide" : "mcp.token.show")}>
                {showToken ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
              </Button>
              <Button size='icon' variant='ghost' onClick={() => copy(token)} aria-label={t("mcp.token.copy")} disabled={!token}>
                <Copy className='h-4 w-4' />
              </Button>
              <Button size='icon' variant='ghost' onClick={regenerate} aria-label={t("mcp.token.regenerate")}>
                <RefreshCw className='h-4 w-4' />
              </Button>
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>{t("mcp.token.description")}</p>

          <Separator />

          <div className='flex flex-col gap-3'>
            <Label>{t("mcp.connect")}</Label>
            {s &&
              (["cli", "http", "stdio"] as const).map((k) => (
                <div key={k} className='flex flex-col gap-1'>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm text-muted-foreground'>{t(`mcp.connect.${k}`)}</span>
                    <Button size='sm' variant='ghost' onClick={() => copy(s[k])}>
                      <Copy className='h-4 w-4 mr-1' /> {t("mcp.copy")}
                    </Button>
                  </div>
                  <pre className='overflow-x-auto rounded-md bg-muted p-2 text-xs'>
                    {showToken ? s[k] : s[k].split(token).join("•••")}
                  </pre>
                </div>
              ))}
          </div>

          <Separator />

          <div className='flex flex-col gap-3'>
            <div className='flex flex-col gap-1'>
              <Label>{t("mcp.personal")}</Label>
              <p className='text-sm text-muted-foreground'>{t("mcp.personal.description")}</p>
            </div>
            {resumes.length === 0 ? (
              <p className='text-sm text-muted-foreground'>{t("mcp.personal.none")}</p>
            ) : (
              resumes.map((r) => (
                <div key={r.id} className='flex items-center justify-between gap-4'>
                  <Label htmlFor={`mcp-share-${r.id}`} className='truncate font-normal'>
                    {r.title || r.id}
                  </Label>
                  <Switch
                    id={`mcp-share-${r.id}`}
                    checked={settings.sharePersonal.includes(r.id)}
                    onCheckedChange={(on) => toggleShare(r.id, on)}
                  />
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
