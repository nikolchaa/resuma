/**
 * Connects the app's MCP endpoint (src-tauri/src/mcp.rs) to the MCP server
 * running here, with the real data sources behind its tools.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { appProposals, checkWithApp, currentResume, listLibraryTemplates, listResumes, sharesPersonal } from "./app";
import { McpHub } from "./hub";
import { createResumaMcpServer, McpDeps } from "./server";

/** What the endpoint sends for each message (see `Forward` in mcp.rs). */
type Forward = { session: string; key: string | null; message: JSONRPCMessage & { method?: string; id?: string | number } };

async function appDeps(): Promise<McpDeps> {
  const version = await getVersion().catch(() => "unknown");
  return {
    listResumes,
    loadResume: currentResume,
    proposals: appProposals,
    listLibrary: listLibraryTemplates,
    checkTemplate: checkWithApp,
    sharesPersonal,
    version,
  };
}

/** Starts the endpoint on `port` and answers its messages; returns a stop function. */
export async function startMcpBridge(port: number): Promise<() => Promise<void>> {
  const deps = await appDeps();
  // Reply keys from the endpoint, by session and JSON-RPC id.
  const keys = new Map<string, string>();
  const keyOf = (session: string, id: unknown) => `${session}\u0000${JSON.stringify(id)}`;

  const hub = new McpHub(
    () => createResumaMcpServer(deps),
    (session, id, message) => {
      const k = keyOf(session, id);
      const key = keys.get(k);
      keys.delete(k);
      if (key) void invoke("mcp_reply", { key, message, unknownSession: false });
    }
  );

  const unlisten = await listen<Forward>("mcp://message", async ({ payload }) => {
    const { session, key, message } = payload;
    if (message.method === "$/end") return void hub.end(session);
    if (key) keys.set(keyOf(session, message.id), key);
    const delivery = await hub.receive(session, message);
    if (delivery === "unknownSession" && key) {
      keys.delete(keyOf(session, message.id));
      void invoke("mcp_reply", { key, message: null, unknownSession: true });
    }
  });

  try {
    await invoke("mcp_start", { port });
  } catch (e) {
    unlisten();
    throw e;
  }

  return async () => {
    unlisten();
    await hub.endAll();
    await invoke("mcp_stop");
  };
}
