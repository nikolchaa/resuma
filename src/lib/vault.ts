/**
 * Encrypted storage for resumes and settings (src-tauri/src/datavault.rs).
 * The data key lives in the OS credential store; this side only ever sees
 * decrypted text it asked for, and the recovery code when the user does.
 */
import { invoke } from "@tauri-apps/api/core";

export type VaultStatus =
  | { state: "new" }
  | { state: "ready"; recoveryPending: boolean }
  | { state: "locked" }
  | { state: "error"; message: string };

export const vaultStatus = () => invoke<VaultStatus>("vault_status");
export const vaultInit = () => invoke<VaultStatus>("vault_init");
export const vaultRecoveryCode = () => invoke<string>("vault_recovery_code");
export const vaultAcknowledgeRecovery = () => invoke<void>("vault_acknowledge_recovery");
export const vaultUnlock = (code: string) => invoke<VaultStatus>("vault_unlock", { code });
/** Moves locked data aside (never deletes it); returns where it went. */
export const vaultReset = () => invoke<string>("vault_reset");

/** "settings" or "resumes/<id>.resume". `null` only when the file doesn't exist. */
export const vaultRead = (name: string) => invoke<string | null>("vault_read", { name });
export const vaultWrite = (name: string, text: string) => invoke<void>("vault_write", { name, text });
export const vaultListResumes = () =>
  invoke<{ name: string; text: string | null; error: string | null }[]>("vault_list_resumes");

/**
 * True for a file copied out of an encrypted data folder. It can't be
 * imported as a plain file: it only opens with that folder's key (use the
 * recovery key, or an encrypted backup, to move data between computers).
 */
export const isEncryptedDataFile = (text: string) => text.startsWith("RSMENC1");

export const vaultExportBackup = (path: string, password: string) =>
  invoke<number>("vault_export_backup", { path, password });
export const vaultImportBackup = (path: string, password: string) =>
  invoke<number>("vault_import_backup", { path, password });
