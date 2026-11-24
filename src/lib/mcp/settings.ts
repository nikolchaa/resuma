/**
 * Settings for connecting other AI apps (MCP), and the server's live status.
 * Changes apply at once: the bridge (McpBridge) listens and restarts.
 */
import { getSection, updateSection } from "@/lib/store";

export type McpSettings = {
  enabled: boolean;
  port: number;
  /** Resume ids whose personal details connected apps may see. */
  sharePersonal: string[];
  /** Apply proposals that raise no warnings without asking. */
  autoApply: boolean;
};

export const DEFAULT_MCP_PORT = 47821;

const DEFAULTS: McpSettings = { enabled: false, port: DEFAULT_MCP_PORT, sharePersonal: [], autoApply: false };

const validPort = (p: unknown): p is number => Number.isInteger(p) && (p as number) >= 1024 && (p as number) <= 65535;

export async function getMcpSettings(): Promise<McpSettings> {
  const raw = (await getSection<Partial<McpSettings>>("mcp")) ?? {};
  return {
    enabled: raw.enabled === true,
    port: validPort(raw.port) ? raw.port : DEFAULT_MCP_PORT,
    sharePersonal: Array.isArray(raw.sharePersonal) ? raw.sharePersonal.filter((s) => typeof s === "string") : [],
    autoApply: raw.autoApply === true,
  };
}

const settingsListeners = new Set<(s: McpSettings) => void>();

export async function updateMcpSettings(patch: Partial<McpSettings>): Promise<McpSettings> {
  const next = { ...DEFAULTS, ...(await getMcpSettings()), ...patch };
  if (!validPort(next.port)) next.port = DEFAULT_MCP_PORT;
  await updateSection("mcp", next);
  settingsListeners.forEach((l) => l(next));
  return next;
}

export function onMcpSettings(listener: (s: McpSettings) => void): () => void {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
}

// ---- status -------------------------------------------------------------------

export type McpState =
  | { state: "off" }
  | { state: "starting" }
  | { state: "running"; port: number }
  | { state: "error"; message: string };

let current: McpState = { state: "off" };
const statusListeners = new Set<(s: McpState) => void>();

export function setMcpState(next: McpState) {
  current = next;
  statusListeners.forEach((l) => l(next));
}

export function getMcpState(): McpState {
  return current;
}

export function onMcpState(listener: (s: McpState) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}
