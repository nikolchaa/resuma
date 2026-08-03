use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, Nonce};
use dirs_next::data_dir;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const SERVICE: &str = "com.resuma.app";
const VAULT_FILE: &str = "secrets.enc";
const PROBE_ACCOUNT: &str = "__resuma_probe__";
/// Mixed into the derived key so the file is not interchangeable with another
/// app's vault that happens to use the same scheme.
const KEY_CONTEXT: &[u8] = b"resuma.api-keys.v1";

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Where a key actually ended up. Surfaced to the UI so the user is never
/// guessing how their key is protected.
#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Backend {
    /// Windows Credential Manager, macOS Keychain, or Linux Secret Service.
    Keyring,
    /// Encrypted file in the app data directory.
    EncryptedFile,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeystoreStatus {
    backend: Backend,
    /// False when keys are only as safe as the user's OS account.
    secure: bool,
    /// Present only for the file backend, so the UI can point at it.
    location: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Vault {
    salt: Vec<u8>,
    entries: BTreeMap<String, VaultEntry>,
}

#[derive(Serialize, Deserialize)]
struct VaultEntry {
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

fn vault_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

// === Credential store detection ===

fn keyring_entry(provider: &str) -> Result<Entry, String> {
    if provider.trim().is_empty() {
        return Err("Missing provider".to_string());
    }

    Entry::new(SERVICE, provider).map_err(|e| format!("Failed to access credential store: {e}"))
}

/// Probes the platform credential store once per run. A read of a
/// non-existent entry still round-trips to the OS (or to the D-Bus Secret
/// Service on Linux), so `NoEntry` proves the store is reachable.
fn keyring_available() -> bool {
    static AVAILABLE: OnceLock<bool> = OnceLock::new();

    *AVAILABLE.get_or_init(|| match Entry::new(SERVICE, PROBE_ACCOUNT) {
        Ok(entry) => !matches!(
            entry.get_password(),
            Err(keyring::Error::PlatformFailure(_)) | Err(keyring::Error::NoStorageAccess(_))
        ),
        Err(_) => false,
    })
}

pub fn active_backend() -> Backend {
    if keyring_available() {
        Backend::Keyring
    } else {
        Backend::EncryptedFile
    }
}

// === Encrypted file fallback ===

fn vault_path() -> Result<PathBuf, String> {
    let dir = data_dir()
        .ok_or("Failed to resolve platform-specific app data directory.")?
        .join(SERVICE);

    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data directory: {e}"))?;

    Ok(dir.join(VAULT_FILE))
}

/// Binds the vault to this machine and user account. Anyone able to run code
/// as this user can derive the same key - this protects against the file being
/// read out of a backup or copied elsewhere, not against a local attacker.
fn derive_key(salt: &[u8]) -> Key<Aes256Gcm> {
    let user = std::env::var("USER")
        .or_else(|_| std::env::var("USERNAME"))
        .unwrap_or_default();
    let host = sysinfo::System::host_name().unwrap_or_default();

    let mut hasher = Sha256::new();
    hasher.update(KEY_CONTEXT);
    hasher.update(salt);
    hasher.update(user.as_bytes());
    hasher.update(host.as_bytes());

    let digest = hasher.finalize();
    *Key::<Aes256Gcm>::from_slice(&digest)
}

fn load_vault(path: &Path) -> Result<Vault, String> {
    if !path.exists() {
        let mut salt = vec![0u8; 16];
        OsRng.fill_bytes(&mut salt);
        return Ok(Vault {
            salt,
            entries: BTreeMap::new(),
        });
    }

    let contents =
        fs::read_to_string(path).map_err(|e| format!("Failed to read stored keys: {e}"))?;

    serde_json::from_str(&contents).map_err(|e| format!("Stored keys are corrupted: {e}"))
}

fn save_vault(path: &Path, vault: &Vault) -> Result<(), String> {
    let contents =
        serde_json::to_string(vault).map_err(|e| format!("Failed to serialize keys: {e}"))?;

    fs::write(path, contents).map_err(|e| format!("Failed to write stored keys: {e}"))?;

    // Readable only by the owner; the OS store would have done this for us.
    #[cfg(unix)]
    {
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }

    Ok(())
}

fn vault_get(path: &Path, provider: &str) -> Result<Option<String>, String> {
    let _guard = vault_lock().lock().map_err(|_| "Key store is poisoned")?;
    let vault = load_vault(path)?;

    let Some(entry) = vault.entries.get(provider) else {
        return Ok(None);
    };

    let cipher = Aes256Gcm::new(&derive_key(&vault.salt));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&entry.nonce), entry.ciphertext.as_ref())
        .map_err(|_| {
            "Stored key could not be decrypted on this machine. Re-enter it to continue."
                .to_string()
        })?;

    String::from_utf8(plaintext)
        .map(Some)
        .map_err(|_| "Stored key is not valid text".to_string())
}

fn vault_set(path: &Path, provider: &str, key: &str) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|_| "Key store is poisoned")?;
    let mut vault = load_vault(path)?;

    let cipher = Aes256Gcm::new(&derive_key(&vault.salt));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, key.as_bytes())
        .map_err(|_| "Failed to encrypt key".to_string())?;

    vault.entries.insert(
        provider.to_string(),
        VaultEntry {
            nonce: nonce.to_vec(),
            ciphertext,
        },
    );

    save_vault(path, &vault)
}

fn vault_delete(path: &Path, provider: &str) -> Result<(), String> {
    let _guard = vault_lock().lock().map_err(|_| "Key store is poisoned")?;
    let mut vault = load_vault(path)?;

    if vault.entries.remove(provider).is_none() {
        return Ok(());
    }

    save_vault(path, &vault)
}

// === Public API ===

/// Reads a stored key. Missing keys are `None` rather than an error, since
/// local servers (Ollama, LM Studio) usually don't need one.
pub fn get_api_key(provider: &str) -> Result<Option<String>, String> {
    if keyring_available() {
        match keyring_entry(provider)?.get_password() {
            Ok(key) => return Ok(Some(key)),
            Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(format!("Failed to read API key: {e}")),
        }
    }

    // Also covers keys written while the credential store was unreachable.
    vault_get(&vault_path()?, provider)
}

#[tauri::command]
pub async fn set_api_key(provider: String, key: String) -> Result<(), String> {
    let key = key.trim().to_string();

    if key.is_empty() {
        return delete_api_key(provider).await;
    }

    if keyring_available() {
        keyring_entry(&provider)?
            .set_password(&key)
            .map_err(|e| format!("Failed to store API key: {e}"))?;

        // Drop any copy left behind from a run without a credential store.
        if let Ok(path) = vault_path() {
            let _ = vault_delete(&path, &provider);
        }
        return Ok(());
    }

    vault_set(&vault_path()?, &provider, &key)
}

#[tauri::command]
pub async fn delete_api_key(provider: String) -> Result<(), String> {
    if keyring_available() {
        match keyring_entry(&provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(e) => return Err(format!("Failed to delete API key: {e}")),
        }
    }

    vault_delete(&vault_path()?, &provider)
}

#[tauri::command]
pub async fn has_api_key(provider: String) -> Result<bool, String> {
    Ok(get_api_key(&provider)?.is_some())
}

/// The encrypted fallback can't be reached on a machine that has a working
/// credential store, so it is covered here instead.
#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("resuma-vault-{name}.enc"));
        let _ = fs::remove_file(&path);
        path
    }

    #[test]
    fn round_trips_a_key() {
        let path = temp_vault("round-trip");

        vault_set(&path, "anthropic", "sk-test-value").unwrap();
        assert_eq!(
            vault_get(&path, "anthropic").unwrap(),
            Some("sk-test-value".to_string())
        );

        // The key must not be readable from the file itself.
        let raw = fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("sk-test-value"));

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn keeps_providers_separate_and_deletes() {
        let path = temp_vault("multi");

        vault_set(&path, "openai", "key-one").unwrap();
        vault_set(&path, "gemini", "key-two").unwrap();

        assert_eq!(vault_get(&path, "openai").unwrap(), Some("key-one".into()));
        assert_eq!(vault_get(&path, "gemini").unwrap(), Some("key-two".into()));
        assert_eq!(vault_get(&path, "kimi").unwrap(), None);

        vault_delete(&path, "openai").unwrap();
        assert_eq!(vault_get(&path, "openai").unwrap(), None);
        assert_eq!(vault_get(&path, "gemini").unwrap(), Some("key-two".into()));

        // Deleting something absent is not an error.
        vault_delete(&path, "kimi").unwrap();

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rejects_a_vault_from_another_machine() {
        let path = temp_vault("foreign");
        vault_set(&path, "openai", "key-one").unwrap();

        // Re-salting simulates the file being lifted off a different machine:
        // the derived key no longer matches, so decryption must fail loudly.
        let mut vault: Vault = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        vault.salt = vec![9u8; 16];
        save_vault(&path, &vault).unwrap();

        assert!(vault_get(&path, "openai").is_err());

        let _ = fs::remove_file(&path);
    }
}

#[tauri::command]
pub async fn keystore_status() -> Result<KeystoreStatus, String> {
    let backend = active_backend();

    Ok(KeystoreStatus {
        backend,
        secure: backend == Backend::Keyring,
        location: match backend {
            Backend::Keyring => None,
            Backend::EncryptedFile => vault_path().ok().map(|p| p.to_string_lossy().to_string()),
        },
    })
}
