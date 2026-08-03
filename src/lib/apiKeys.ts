import { invoke } from "@tauri-apps/api/core";
import { ApiFlavor } from "./resolveProvider";

export interface RemoteModel {
  id: string;
  label: string;
}

export interface KeystoreStatus {
  /** "keyring" is the OS credential store; "encrypted-file" is the fallback. */
  backend: "keyring" | "encrypted-file";
  secure: boolean;
  location: string | null;
}

/**
 * Which store keys actually land in. Systems without a reachable credential
 * store (typically headless Linux with no Secret Service daemon) fall back to
 * an encrypted file, and the user is told so rather than left guessing.
 */
export async function getKeystoreStatus(): Promise<KeystoreStatus> {
  return await invoke<KeystoreStatus>("keystore_status");
}

/**
 * Keys live in the OS credential store (Windows Credential Manager, Keychain,
 * Secret Service) and are read only by the Rust side when a request is made,
 * so they never land in settings.resuma or an exported settings file.
 */
export async function setApiKey(provider: string, key: string): Promise<void> {
  await invoke("set_api_key", { provider, key });
}

export async function deleteApiKey(provider: string): Promise<void> {
  await invoke("delete_api_key", { provider });
}

export async function hasApiKey(provider: string): Promise<boolean> {
  return await invoke<boolean>("has_api_key", { provider });
}

export async function listRemoteModels(
  provider: string,
  api: ApiFlavor,
  baseUrl: string
): Promise<RemoteModel[]> {
  return await invoke<RemoteModel[]>("list_remote_models", {
    provider,
    api,
    baseUrl,
  });
}
