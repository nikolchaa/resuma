import { useEffect } from "react";
import { startMcpBridge } from "@/lib/mcp/bridge";
import { createBridgeController } from "@/lib/mcp/controller";
import { getMcpSettings, onMcpSettings, setMcpState } from "@/lib/mcp/settings";
import { windowSingleton } from "@/lib/singleton";

/** One bridge controller per window, whatever mounts this component. */
const bridge = windowSingleton("mcpBridge", () => createBridgeController(startMcpBridge, setMcpState));

/**
 * Runs the MCP server for other AI apps while it's switched on in Settings,
 * and restarts it when the port changes. Renders nothing. The bridge lives
 * as long as the window; unmounting only stops listening to settings.
 */
export function McpBridge() {
  useEffect(() => {
    let active = true;
    getMcpSettings().then((s) => {
      if (active) void bridge.sync(s);
    });
    const unsubscribe = onMcpSettings((s) => void bridge.sync(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return null;
}
