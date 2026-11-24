/**
 * Keeps the MCP bridge in the state the settings ask for: one bridge per
 * window at most, changes applied one at a time, and asking twice for the
 * same state does nothing. (React mounts components twice in development,
 * and a reload can mount them again; neither may start a second bridge, or
 * every request would be answered, and every suggestion made, twice.)
 */
import type { McpState } from "./settings";

export type StartBridge = (port: number) => Promise<() => Promise<void>>;

export function createBridgeController(start: StartBridge, report: (state: McpState) => void) {
  let port: number | null = null;
  let stop: (() => Promise<void>) | null = null;
  let queue: Promise<void> = Promise.resolve();

  return {
    /** Brings the bridge to the wanted state; resolves once it got there. */
    sync(settings: { enabled: boolean; port: number }): Promise<void> {
      queue = queue.then(async () => {
        const want = settings.enabled ? settings.port : null;
        if (want === port && (want === null || stop)) return;
        if (stop) {
          await stop().catch(() => {});
          stop = null;
          port = null;
        }
        if (want === null) return report({ state: "off" });
        report({ state: "starting" });
        try {
          stop = await start(want);
          port = want;
          report({ state: "running", port: want });
        } catch (e) {
          report({ state: "error", message: typeof e === "string" ? e : (e as Error).message });
        }
      });
      return queue;
    },
  };
}
