/**
 * App settings and the onboarding profile, kept encrypted (see vault.ts).
 *
 * One copy lives in memory; writes go out one at a time, in order. A
 * settings file that can't be decrypted is an error, never "no settings":
 * otherwise the app would send the user to onboarding and overwrite them.
 */
import { vaultRead, vaultWrite } from "./vault";
import { windowSingleton } from "./singleton";

type Settings = Record<string, unknown>;

const state = windowSingleton("settingsStore", () => ({
  loaded: null as Promise<Settings> | null,
  writes: Promise.resolve() as Promise<void>,
}));

async function load(): Promise<Settings> {
  if (!state.loaded) {
    state.loaded = vaultRead("settings").then((text) => {
      if (text === null) return {};
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Settings) : {};
    });
    // A failed load (locked, damaged) may be retried after unlocking.
    state.loaded.catch(() => {
      state.loaded = null;
    });
  }
  return state.loaded;
}

export async function getSection<T>(key: string): Promise<T | undefined> {
  const settings = await load();
  return structuredClone(settings[key]) as T | undefined;
}

export async function updateSection<T>(key: string, value: T): Promise<void> {
  const settings = await load();
  settings[key] = structuredClone(value);
  const snapshot = JSON.stringify(settings, null, 2);
  // Each write sends the whole file; queuing keeps the last one last.
  const write = state.writes.then(() => vaultWrite("settings", snapshot));
  state.writes = write.catch(() => {});
  await write;
}

export async function getSettings(): Promise<Record<string, any>> {
  return structuredClone(await load()) as Record<string, any>;
}

/** Forgets the in-memory copy, e.g. after a backup replaced the settings. */
export function reloadSettings() {
  state.loaded = null;
}
