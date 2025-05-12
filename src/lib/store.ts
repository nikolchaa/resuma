import { Store } from "@tauri-apps/plugin-store";

let storePromise: Promise<Store> | null = null;

// Lazily load and reuse store instance
async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load("settings.resuma");
  }
  return storePromise;
}

export async function getSection<T>(key: string): Promise<T | undefined> {
  const store = await getStore();
  return await store.get<T>(key);
}

export async function updateSection<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
}

export async function getSettings(): Promise<Record<string, any>> {
  const store = await getStore();
  const entries = await store.entries();
  const result: Record<string, any> = {};
  entries.forEach(([key, value]) => {
    result[key] = value;
  });
  return result;
}
