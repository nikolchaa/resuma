import { invoke } from "@tauri-apps/api/core";

/**
 * Optional Discord Rich Presence.
 *
 * Off by default (`app.discordPresence`). While it is off nothing here talks
 * to Discord: no IPC connection is opened and activity updates are dropped.
 * Only generic, fixed strings are ever sent - never resume titles or any
 * other user content.
 */

let enabled = false;
let lastActivity: { details: string; state: string } = {
  details: "Idling",
  state: "Home",
};
// Serialises start/stop so a quick on -> off toggle can't leave a connection
// open after the setting was turned off.
let queue: Promise<void> = Promise.resolve();

const logDebug = (msg: string, error: unknown) =>
  // only for debugging, not shown to user
  console.log(msg, (error as Error)?.message ?? error);

export function setDiscordPresenceEnabled(value: boolean): Promise<void> {
  if (value === enabled) return queue;
  enabled = value;

  queue = queue.then(async () => {
    try {
      if (value) {
        await invoke("start_rpc");
        if (enabled) await invoke("set_activity", lastActivity);
      } else {
        await invoke("stop_rpc");
      }
    } catch (error) {
      logDebug("Discord presence unavailable", error);
    }
  });
  return queue;
}

export function updateDiscordPresence(details: string, state: string): void {
  lastActivity = { details, state };
  if (!enabled) return;

  queue = queue.then(async () => {
    if (!enabled) return;
    try {
      await invoke("set_activity", { details, state });
    } catch (error) {
      logDebug("Failed to update Discord presence", error);
    }
  });
}
