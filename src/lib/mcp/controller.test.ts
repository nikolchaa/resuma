import { describe, expect, it } from "vitest";
import { createBridgeController } from "./controller";
import type { McpState } from "./settings";

function setup(fail = false) {
  const started: number[] = [];
  const stopped: number[] = [];
  const states: McpState[] = [];
  const controller = createBridgeController(
    async (port) => {
      await new Promise((r) => setTimeout(r, 5));
      if (fail) throw new Error(`port ${port} is in use`);
      started.push(port);
      return async () => void stopped.push(port);
    },
    (s) => states.push(s)
  );
  return { controller, started, stopped, states };
}

describe("bridge controller", () => {
  it("starts one bridge however often the same settings arrive, even at the same time", async () => {
    const { controller, started } = setup();
    await Promise.all([
      controller.sync({ enabled: true, port: 4000 }),
      controller.sync({ enabled: true, port: 4000 }),
      controller.sync({ enabled: true, port: 4000 }),
    ]);
    await controller.sync({ enabled: true, port: 4000 });
    expect(started).toEqual([4000]);
  });

  it("restarts on a new port and stops when switched off", async () => {
    const { controller, started, stopped, states } = setup();
    await controller.sync({ enabled: true, port: 4000 });
    await controller.sync({ enabled: true, port: 4001 });
    await controller.sync({ enabled: false, port: 4001 });
    expect(started).toEqual([4000, 4001]);
    expect(stopped).toEqual([4000, 4001]);
    expect(states.at(-1)).toEqual({ state: "off" });
  });

  it("reports a failed start and tries again next time", async () => {
    const { controller, states } = setup(true);
    await controller.sync({ enabled: true, port: 4000 });
    expect(states.at(-1)).toEqual({ state: "error", message: "port 4000 is in use" });
    await controller.sync({ enabled: true, port: 4000 });
    expect(states.filter((s) => s.state === "starting")).toHaveLength(2);
  });
});
