import { useEffect } from "react";
import { startMcpBridge } from "@/lib/mcp/bridge";
import { getMcpSettings, McpSettings, onMcpSettings, setMcpState } from "@/lib/mcp/settings";

/**
 * Runs the MCP server for other AI apps while it's switched on in Settings,
 * and restarts it when the port changes. Renders nothing.
 */
export function McpBridge() {
  useEffect(() => {
    let stop: (() => Promise<void>) | null = null;
    let running: { enabled: boolean; port: number } = { enabled: false, port: 0 };
    let queue = Promise.resolve();

    const apply = (s: McpSettings) => {
      // One change at a time: stopping and starting overlap otherwise.
      queue = queue.then(async () => {
        if (s.enabled === running.enabled && s.port === running.port) return;
        if (stop) {
          await stop().catch(() => {});
          stop = null;
        }
        running = { enabled: s.enabled, port: s.port };
        if (!s.enabled) return setMcpState({ state: "off" });
        setMcpState({ state: "starting" });
        try {
          stop = await startMcpBridge(s.port);
          setMcpState({ state: "running", port: s.port });
        } catch (e) {
          running = { enabled: false, port: 0 };
          setMcpState({ state: "error", message: typeof e === "string" ? e : (e as Error).message });
        }
      });
    };

    getMcpSettings().then(apply);
    const unsubscribe = onMcpSettings(apply);
    return () => {
      unsubscribe();
      queue = queue.then(async () => {
        if (stop) await stop().catch(() => {});
      });
    };
  }, []);

  return null;
}
