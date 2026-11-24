//! Encryption at rest for the user's resumes and settings.
//!
//! A random 256-bit data key lives in the OS credential store (via
//! `secrets.rs`), so day to day nothing has to be typed. Every resume file and
//! the settings file are encrypted with it (AES-256-GCM). The key itself is
//! the recovery key, shown once as a readable code: with it the data folder
//! opens on another computer, or after the credential store lost the key.
//! One-file backups are encrypted with a key derived from a password
//! (Argon2id) instead, so they can move between computers on their own.
//!
//! Rules that keep data safe:
//! - A failure to reach the credential store is never "no key": a second key
//!   is only ever made when no encrypted data exists.
//! - While locked (encrypted data, no usable key) every write is refused.
//! - Files are written to a temporary file, checked by decrypting it, then
//!   renamed into place, so an interrupted write or migration loses nothing.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Header of an encrypted data file.
const MAGIC: &[u8] = b"RSMENC1\n";
/// Header of a password-protected backup.
const BACKUP_MAGIC: &[u8] = b"RSMBAK1\n";
/// The encrypted settings file. A new name, so older Resuma versions never
/// mistake it for (and overwrite) their plaintext `settings.resuma`.
const SETTINGS_FILE: &str = "settings.enc";
const LEGACY_SETTINGS_FILE: &str = "settings.resuma";
const RESUMES_DIR: &str = "resumes";
/// A small known text encrypted with the key, to tell a right key from a wrong one.
const CHECK_FILE: &str = "vault.check";
const CHECK_TEXT: &[u8] = b"resuma data key check v1";
/// Present until the user confirmed they saved the recovery key.
const PENDING_FILE: &str = "vault.recovery-pending";
const KEY_NAME: &str = "data-key";

// ---- key storage ------------------------------------------------------------

/// Where the data key is kept. The app uses the OS credential store; tests use memory.
pub trait KeyStore: Send + Sync {
    /// `Ok(None)` only when there is definitely no key; any failure is an error.
    fn get(&self) -> Result<Option<[u8; 32]>, String>;
    fn set(&self, key: &[u8; 32]) -> Result<(), String>;
}

struct CredentialStore;

impl KeyStore for CredentialStore {
    fn get(&self) -> Result<Option<[u8; 32]>, String> {
        match crate::secrets::get_api_key(KEY_NAME)? {
            None => Ok(None),
            Some(hex) => decode_hex(&hex).map(Some).ok_or_else(|| "The stored data key is damaged.".to_string()),
        }
    }
    fn set(&self, key: &[u8; 32]) -> Result<(), String> {
        crate::secrets::store_secret(KEY_NAME, &encode_hex(key))
    }
}

fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode_hex(s: &str) -> Option<[u8; 32]> {
    let s = s.trim();
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
        out[i] = u8::from_str_radix(std::str::from_utf8(chunk).ok()?, 16).ok()?;
    }
    Some(out)
}

// ---- recovery key -------------------------------------------------------------

/// Crockford base32: no I, L, O or U, so it reads and types back reliably.
const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// The data key as a recovery code: 52 characters plus a 4-character
/// checksum, in dash-separated groups of four.
pub fn recovery_code(key: &[u8; 32]) -> String {
    let mut chars = base32(key);
    let sum = checksum(key);
    chars.push_str(&base32(&sum)[..4]);
    chars.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join("-")
}

/// Reads a recovery code back, forgiving case, spaces, dashes and look-alike letters.
pub fn parse_recovery_code(code: &str) -> Option<[u8; 32]> {
    let clean: String = code
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| match c.to_ascii_uppercase() {
            'I' | 'L' => '1',
            'O' => '0',
            other => other,
        })
        .collect();
    if clean.len() != 56 {
        return None;
    }
    let bytes = unbase32(&clean[..52])?;
    let key: [u8; 32] = bytes.get(..32)?.try_into().ok()?;
    (base32(&checksum(&key))[..4] == clean[52..]).then_some(key)
}

fn checksum(key: &[u8; 32]) -> [u8; 3] {
    use sha2::{Digest, Sha256};
    let d = Sha256::digest(key);
    [d[0], d[1], d[2]]
}

fn base32(bytes: &[u8]) -> String {
    let mut out = String::new();
    let (mut buffer, mut bits) = (0u32, 0u32);
    for &b in bytes {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            out.push(ALPHABET[((buffer >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

fn unbase32(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let (mut buffer, mut bits) = (0u32, 0u32);
    for c in s.bytes() {
        let v = ALPHABET.iter().position(|&a| a == c)? as u32;
        buffer = (buffer << 5) | v;
        bits += 5;
        if bits >= 8 {
            out.push(((buffer >> (bits - 8)) & 0xff) as u8);
            bits -= 8;
        }
    }
    Some(out)
}

// ---- encryption -----------------------------------------------------------------

/// Which file a ciphertext belongs to; bound into it so files can't be swapped.
#[derive(Clone, Copy)]
enum Kind {
    Settings,
    Resume,
    Check,
}

impl Kind {
    fn aad(self) -> &'static [u8] {
        match self {
            Kind::Settings => b"resuma:settings",
            Kind::Resume => b"resuma:resume",
            Kind::Check => b"resuma:check",
        }
    }
}

fn seal(key: &[u8; 32], kind: Kind, plain: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce), Payload { msg: plain, aad: kind.aad() })
        .map_err(|_| "Encryption failed.".to_string())?;
    Ok([MAGIC, &nonce, &ct].concat())
}

fn open(key: &[u8; 32], kind: Kind, data: &[u8]) -> Result<Vec<u8>, String> {
    let body = data.strip_prefix(MAGIC).ok_or("Not an encrypted Resuma file.")?;
    if body.len() < 12 + 16 {
        return Err("The file is too short to be valid.".into());
    }
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    cipher
        .decrypt(Nonce::from_slice(&body[..12]), Payload { msg: &body[12..], aad: kind.aad() })
        .map_err(|_| "This file can't be decrypted with this key (wrong key, or the file was changed).".to_string())
}

fn is_encrypted(path: &Path) -> bool {
    fs::read(path).map(|d| d.starts_with(MAGIC)).unwrap_or(false)
}

// ---- the vault ----------------------------------------------------------------------

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Status {
    /// No encrypted data and no key yet: `init` sets it up.
    New,
    /// Unlocked. `recoveryPending` until the user confirmed saving the recovery key.
    #[serde(rename_all = "camelCase")]
    Ready { recovery_pending: bool },
    /// Encrypted data, but no usable key here: needs the recovery key.
    Locked,
    /// The credential store couldn't be read; nothing is touched.
    #[serde(rename_all = "camelCase")]
    Error { message: String },
}

pub struct Vault {
    dir: PathBuf,
    keys: Arc<dyn KeyStore>,
    lock: Mutex<()>,
}

impl Vault {
    pub fn new(dir: PathBuf, keys: Arc<dyn KeyStore>) -> Self {
        Self { dir, keys, lock: Mutex::new(()) }
    }

    fn path(&self, rel: &str) -> PathBuf {
        self.dir.join(rel)
    }

    fn resume_files(&self) -> Vec<PathBuf> {
        fs::read_dir(self.path(RESUMES_DIR))
            .map(|entries| {
                entries
                    .filter_map(|e| e.ok().map(|e| e.path()))
                    .filter(|p| p.extension().map_or(false, |x| x == "resume"))
                    .collect()
            })
            .unwrap_or_default()
    }

    fn any_encrypted(&self) -> bool {
        self.path(CHECK_FILE).exists()
            || self.path(SETTINGS_FILE).exists()
            || self.resume_files().iter().any(|p| is_encrypted(p))
    }

    /// The key, if there is one and it opens this data folder.
    fn usable_key(&self) -> Result<Option<[u8; 32]>, String> {
        let Some(key) = self.keys.get()? else { return Ok(None) };
        let check = self.path(CHECK_FILE);
        if check.exists() {
            let data = fs::read(&check).map_err(|e| e.to_string())?;
            if open(&key, Kind::Check, &data).ok().as_deref() != Some(CHECK_TEXT) {
                return Ok(None); // a key, but for other data
            }
        }
        Ok(Some(key))
    }

    pub fn status(&self) -> Status {
        let _g = self.lock.lock().unwrap();
        self.status_locked()
    }

    fn status_locked(&self) -> Status {
        match self.usable_key() {
            Err(message) => Status::Error { message },
            Ok(Some(_)) if self.path(CHECK_FILE).exists() => {
                Status::Ready { recovery_pending: self.path(PENDING_FILE).exists() }
            }
            // A key without a check file is from an interrupted set-up; `init` finishes it.
            Ok(_) if self.any_encrypted() => Status::Locked,
            Ok(_) => Status::New,
        }
    }

    fn ready_key(&self) -> Result<[u8; 32], String> {
        match self.status_locked() {
            Status::Ready { .. } => Ok(self.usable_key()?.expect("ready means a usable key")),
            Status::Locked => Err("Your data is locked: enter your recovery key first.".into()),
            Status::New => Err("Data encryption isn't set up yet.".into()),
            Status::Error { message } => Err(message),
        }
    }

    /// Writes `plain` encrypted to `path`: temp file, verified, renamed into place.
    fn write_encrypted(&self, key: &[u8; 32], kind: Kind, path: &Path, plain: &[u8]) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let sealed = seal(key, kind, plain)?;
        let tmp = path.with_extension(format!(
            "{}.tmp",
            path.extension().and_then(|e| e.to_str()).unwrap_or("dat")
        ));
        fs::write(&tmp, &sealed).map_err(|e| format!("Couldn't write {}: {e}", tmp.display()))?;
        let back = fs::read(&tmp).map_err(|e| e.to_string())?;
        if open(key, kind, &back)? != plain {
            let _ = fs::remove_file(&tmp);
            return Err("Verifying the encrypted file failed; nothing was changed.".into());
        }
        fs::rename(&tmp, path).map_err(|e| format!("Couldn't replace {}: {e}", path.display()))
    }

    /// Encrypts any plaintext data still around (first run, or an interrupted
    /// migration) and removes leftovers. Safe to run any number of times.
    fn migrate(&self, key: &[u8; 32]) -> Result<(), String> {
        for p in self.resume_files() {
            if !is_encrypted(&p) {
                let plain = fs::read(&p).map_err(|e| e.to_string())?;
                self.write_encrypted(key, Kind::Resume, &p, &plain)?;
            }
        }
        let legacy = self.path(LEGACY_SETTINGS_FILE);
        if legacy.exists() {
            if !self.path(SETTINGS_FILE).exists() {
                let plain = fs::read(&legacy).map_err(|e| e.to_string())?;
                self.write_encrypted(key, Kind::Settings, &self.path(SETTINGS_FILE), &plain)?;
            }
            fs::remove_file(&legacy).map_err(|e| e.to_string())?;
        }
        // Temp files from an interrupted write may hold plaintext's encrypted
        // twin or a partial write; the originals are intact, so drop them.
        if let Ok(entries) = fs::read_dir(self.path(RESUMES_DIR)) {
            for e in entries.flatten() {
                if e.path().to_string_lossy().ends_with(".tmp") {
                    let _ = fs::remove_file(e.path());
                }
            }
        }
        let _ = fs::remove_file(self.path("settings.enc.tmp"));
        Ok(())
    }

    /// First run: makes the data key, stores it, and encrypts existing data.
    /// Also finishes a set-up or migration that was interrupted.
    pub fn init(&self) -> Result<Status, String> {
        let _g = self.lock.lock().unwrap();
        let key = match self.status_locked() {
            Status::Ready { .. } => self.usable_key()?.expect("ready"),
            Status::Locked => return Err("Your data is locked: enter your recovery key instead.".into()),
            Status::Error { message } => return Err(message),
            Status::New => {
                // Reuse a key left by an interrupted set-up; otherwise make one.
                let key = match self.keys.get()? {
                    Some(k) => k,
                    None => {
                        let mut k = [0u8; 32];
                        OsRng.fill_bytes(&mut k);
                        self.keys.set(&k)?;
                        // Only encrypt anything once the key is known to be stored.
                        if self.keys.get()? != Some(k) {
                            return Err("The new key couldn't be stored in the credential store.".into());
                        }
                        k
                    }
                };
                fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
                fs::write(self.path(PENDING_FILE), b"").map_err(|e| e.to_string())?;
                self.write_encrypted(&key, Kind::Check, &self.path(CHECK_FILE), CHECK_TEXT)?;
                key
            }
        };
        self.migrate(&key)?;
        Ok(self.status_locked())
    }

    pub fn recovery_code(&self) -> Result<String, String> {
        let _g = self.lock.lock().unwrap();
        Ok(recovery_code(&self.ready_key()?))
    }

    pub fn acknowledge_recovery(&self) -> Result<(), String> {
        let _g = self.lock.lock().unwrap();
        self.ready_key()?;
        let _ = fs::remove_file(self.path(PENDING_FILE));
        Ok(())
    }

    /// Unlocks a locked data folder with its recovery code and keeps the key here.
    pub fn unlock(&self, code: &str) -> Result<Status, String> {
        let _g = self.lock.lock().unwrap();
        let key = parse_recovery_code(code).ok_or("That isn't a valid recovery key. Check for typos.")?;
        let check = fs::read(self.path(CHECK_FILE)).map_err(|_| "This data folder has no key check file.")?;
        if open(&key, Kind::Check, &check).ok().as_deref() != Some(CHECK_TEXT) {
            return Err("That recovery key belongs to different data.".into());
        }
        self.keys.set(&key)?;
        self.migrate(&key)?;
        Ok(self.status_locked())
    }

    /// Starts over on a locked folder: moves the encrypted data aside (never deletes it).
    pub fn reset(&self) -> Result<PathBuf, String> {
        let _g = self.lock.lock().unwrap();
        if self.status_locked() != Status::Locked {
            return Err("Only locked data can be set aside.".into());
        }
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let aside = self.path(&format!("locked-data-{stamp}"));
        fs::create_dir_all(&aside).map_err(|e| e.to_string())?;
        for name in [CHECK_FILE, SETTINGS_FILE, PENDING_FILE, RESUMES_DIR] {
            let p = self.path(name);
            if p.exists() {
                fs::rename(&p, aside.join(name)).map_err(|e| e.to_string())?;
            }
        }
        Ok(aside)
    }

    // ---- reading and writing --------------------------------------------------

    fn locate(&self, name: &str) -> Result<(PathBuf, Kind), String> {
        if name == "settings" {
            return Ok((self.path(SETTINGS_FILE), Kind::Settings));
        }
        let id = name
            .strip_prefix("resumes/")
            .and_then(|f| f.strip_suffix(".resume"))
            .ok_or_else(|| format!("Not a vault file: {name}"))?;
        let ok = !id.is_empty()
            && id.len() <= 200
            && id.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
            && !id.starts_with('.')
            && !id.contains("..");
        if !ok {
            return Err(format!("Invalid resume id: {id}"));
        }
        Ok((self.path(RESUMES_DIR).join(format!("{id}.resume")), Kind::Resume))
    }

    /// Reads "settings" or "resumes/<id>.resume". `None` only when the file
    /// doesn't exist; a file that can't be decrypted is an error.
    pub fn read(&self, name: &str) -> Result<Option<String>, String> {
        let _g = self.lock.lock().unwrap();
        let (path, kind) = self.locate(name)?;
        if !path.exists() {
            // Settings from before encryption, if migration hasn't run yet.
            let legacy = self.path(LEGACY_SETTINGS_FILE);
            if matches!(kind, Kind::Settings) && legacy.exists() {
                return fs::read_to_string(legacy).map(Some).map_err(|e| e.to_string());
            }
            return Ok(None);
        }
        let data = fs::read(&path).map_err(|e| e.to_string())?;
        if !data.starts_with(MAGIC) {
            return String::from_utf8(data).map(Some).map_err(|_| "File isn't valid text.".into());
        }
        let key = self.ready_key()?;
        let plain = open(&key, kind, &data)?;
        String::from_utf8(plain).map(Some).map_err(|_| "Decrypted file isn't valid text.".into())
    }

    pub fn write(&self, name: &str, text: &str) -> Result<(), String> {
        let _g = self.lock.lock().unwrap();
        let (path, kind) = self.locate(name)?;
        let key = self.ready_key()?;
        self.write_encrypted(&key, kind, &path, text.as_bytes())
    }

    /// All resumes as (file name, text). Unreadable files are reported, not skipped silently.
    pub fn list_resumes(&self) -> Result<Vec<(String, Result<String, String>)>, String> {
        let names: Vec<String> = {
            let _g = self.lock.lock().unwrap();
            self.resume_files()
                .iter()
                .filter_map(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
                .collect()
        };
        Ok(names
            .into_iter()
            .map(|n| {
                let text = self.read(&format!("resumes/{n}")).and_then(|t| t.ok_or_else(|| "missing".to_string()));
                (n, text)
            })
            .collect())
    }

    // ---- backups -------------------------------------------------------------

    /// Writes every resume and the settings to one file protected by `password`.
    pub fn export_backup(&self, dest: &Path, password: &str) -> Result<usize, String> {
        if password.chars().count() < 8 {
            return Err("Use a password of at least 8 characters.".into());
        }
        let mut resumes = serde_json::Map::new();
        for (name, text) in self.list_resumes()? {
            resumes.insert(name, Value::String(text?));
        }
        let count = resumes.len();
        let backup = Backup {
            format: "resuma-backup".into(),
            version: 1,
            settings: self.read("settings")?,
            resumes,
        };
        let plain = serde_json::to_vec(&backup).map_err(|e| e.to_string())?;
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        let key = password_key(password, &salt)?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let ct = cipher
            .encrypt(Nonce::from_slice(&nonce), Payload { msg: &plain, aad: BACKUP_MAGIC })
            .map_err(|_| "Encryption failed.".to_string())?;
        fs::write(dest, [BACKUP_MAGIC, &salt, &nonce, &ct].concat())
            .map_err(|e| format!("Couldn't write the backup: {e}"))?;
        Ok(count)
    }

    /// Restores a backup into this data folder: its resumes are added (same
    /// names replaced) and its settings replace the current ones.
    pub fn import_backup(&self, src: &Path, password: &str) -> Result<usize, String> {
        let data = fs::read(src).map_err(|e| format!("Couldn't read the backup: {e}"))?;
        let body = data.strip_prefix(BACKUP_MAGIC).ok_or("This isn't a Resuma backup file.")?;
        if body.len() < 16 + 12 + 16 {
            return Err("The backup file is damaged.".into());
        }
        let key = password_key(password, &body[..16])?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
        let plain = cipher
            .decrypt(Nonce::from_slice(&body[16..28]), Payload { msg: &body[28..], aad: BACKUP_MAGIC })
            .map_err(|_| "Wrong password, or the backup file is damaged.".to_string())?;
        let backup: Backup = serde_json::from_slice(&plain).map_err(|_| "The backup's contents are damaged.")?;
        if backup.format != "resuma-backup" || backup.version != 1 {
            return Err("This backup was made by a newer Resuma.".into());
        }
        // Check every name before writing anything.
        for name in backup.resumes.keys() {
            self.locate(&format!("resumes/{name}"))?;
        }
        if let Some(settings) = &backup.settings {
            self.write("settings", settings)?;
        }
        for (name, text) in &backup.resumes {
            self.write(&format!("resumes/{name}"), text.as_str().ok_or("The backup's contents are damaged.")?)?;
        }
        Ok(backup.resumes.len())
    }
}

#[derive(Serialize, Deserialize)]
struct Backup {
    format: String,
    version: u32,
    settings: Option<String>,
    resumes: serde_json::Map<String, Value>,
}

fn password_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    use argon2::{Algorithm, Argon2, Params, Version};
    let params = Params::new(64 * 1024, 3, 1, Some(32)).map_err(|e| e.to_string())?;
    let mut out = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, &mut out)
        .map_err(|e| e.to_string())?;
    Ok(out)
}

// ---- commands -------------------------------------------------------------------

fn vault() -> Result<&'static Vault, String> {
    static VAULT: std::sync::OnceLock<Vault> = std::sync::OnceLock::new();
    if let Some(v) = VAULT.get() {
        return Ok(v);
    }
    let dir = dirs_next::data_dir().ok_or("No app data folder.")?.join("com.resuma.app");
    Ok(VAULT.get_or_init(|| Vault::new(dir, Arc::new(CredentialStore))))
}

#[tauri::command]
pub async fn vault_status() -> Result<Status, String> {
    Ok(vault()?.status())
}

#[tauri::command]
pub async fn vault_init() -> Result<Status, String> {
    vault()?.init()
}

#[tauri::command]
pub async fn vault_recovery_code() -> Result<String, String> {
    vault()?.recovery_code()
}

#[tauri::command]
pub async fn vault_acknowledge_recovery() -> Result<(), String> {
    vault()?.acknowledge_recovery()
}

#[tauri::command]
pub async fn vault_unlock(code: String) -> Result<Status, String> {
    vault()?.unlock(&code)
}

#[tauri::command]
pub async fn vault_reset() -> Result<String, String> {
    vault()?.reset().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn vault_read(name: String) -> Result<Option<String>, String> {
    vault()?.read(&name)
}

#[tauri::command]
pub async fn vault_write(name: String, text: String) -> Result<(), String> {
    vault()?.write(&name, &text)
}

#[derive(Serialize)]
pub struct ListedResume {
    name: String,
    text: Option<String>,
    error: Option<String>,
}

#[tauri::command]
pub async fn vault_list_resumes() -> Result<Vec<ListedResume>, String> {
    Ok(vault()?
        .list_resumes()?
        .into_iter()
        .map(|(name, r)| match r {
            Ok(text) => ListedResume { name, text: Some(text), error: None },
            Err(e) => ListedResume { name, text: None, error: Some(e) },
        })
        .collect())
}

#[tauri::command]
pub async fn vault_export_backup(path: String, password: String) -> Result<usize, String> {
    vault()?.export_backup(Path::new(&path), &password)
}

#[tauri::command]
pub async fn vault_import_backup(path: String, password: String) -> Result<usize, String> {
    vault()?.import_backup(Path::new(&path), &password)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryKeys {
        key: Mutex<Option<[u8; 32]>>,
        broken: Mutex<bool>,
    }

    impl KeyStore for MemoryKeys {
        fn get(&self) -> Result<Option<[u8; 32]>, String> {
            if *self.broken.lock().unwrap() {
                return Err("credential store unavailable".into());
            }
            Ok(*self.key.lock().unwrap())
        }
        fn set(&self, key: &[u8; 32]) -> Result<(), String> {
            *self.key.lock().unwrap() = Some(*key);
            Ok(())
        }
    }

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("resuma-vault-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join(RESUMES_DIR)).unwrap();
        dir
    }

    fn vault_in(dir: &Path) -> (Vault, Arc<MemoryKeys>) {
        let keys = Arc::new(MemoryKeys::default());
        (Vault::new(dir.to_path_buf(), keys.clone()), keys)
    }

    #[test]
    fn migrates_plaintext_data_and_round_trips() {
        let dir = folder("migrate");
        fs::write(dir.join(LEGACY_SETTINGS_FILE), r#"{"personal":{"fullName":"Ana"}}"#).unwrap();
        fs::write(dir.join("resumes/cv.resume"), r#"{"id":"cv","title":"CV"}"#).unwrap();
        let (v, _) = vault_in(&dir);
        assert_eq!(v.status(), Status::New);

        assert_eq!(v.init().unwrap(), Status::Ready { recovery_pending: true });
        // Nothing readable is left on disk.
        assert!(!dir.join(LEGACY_SETTINGS_FILE).exists());
        assert!(is_encrypted(&dir.join("resumes/cv.resume")));
        assert!(is_encrypted(&dir.join(SETTINGS_FILE)));
        let raw = fs::read(dir.join("resumes/cv.resume")).unwrap();
        assert!(!String::from_utf8_lossy(&raw).contains("CV"));

        assert_eq!(v.read("settings").unwrap().unwrap(), r#"{"personal":{"fullName":"Ana"}}"#);
        assert_eq!(v.read("resumes/cv.resume").unwrap().unwrap(), r#"{"id":"cv","title":"CV"}"#);
        v.write("resumes/new.resume", "hello").unwrap();
        assert_eq!(v.read("resumes/new.resume").unwrap().unwrap(), "hello");
        assert_eq!(v.read("resumes/missing.resume").unwrap(), None);

        v.acknowledge_recovery().unwrap();
        assert_eq!(v.status(), Status::Ready { recovery_pending: false });
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn never_makes_a_second_key_and_refuses_writes_while_locked() {
        let dir = folder("locked");
        let (v, keys) = vault_in(&dir);
        v.init().unwrap();
        v.write("resumes/a.resume", "secret").unwrap();
        let code = v.recovery_code().unwrap();

        // The credential store fails: report it, touch nothing.
        *keys.broken.lock().unwrap() = true;
        assert!(matches!(v.status(), Status::Error { .. }));
        assert!(v.init().is_err());
        *keys.broken.lock().unwrap() = false;

        // The key is gone (new computer): locked, not new; no writes, no new key.
        *keys.key.lock().unwrap() = None;
        assert_eq!(v.status(), Status::Locked);
        assert!(v.init().is_err());
        assert!(v.write("settings", "{}").is_err());
        assert!(v.read("resumes/a.resume").is_err());
        assert!(keys.key.lock().unwrap().is_none());

        // A wrong or mistyped code is refused; the right one (sloppily typed) unlocks.
        let mut other = [7u8; 32];
        other[0] = 1;
        assert!(v.unlock(&recovery_code(&other)).is_err());
        assert!(v.unlock("ABCD-EFGH").is_err());
        let sloppy = code.to_lowercase().replace('-', " ").replace('0', "o");
        assert_eq!(v.unlock(&sloppy).unwrap(), Status::Ready { recovery_pending: true });
        assert_eq!(v.read("resumes/a.resume").unwrap().unwrap(), "secret");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn detects_tampering_and_a_key_for_other_data() {
        let dir = folder("tamper");
        let (v, keys) = vault_in(&dir);
        v.init().unwrap();
        v.write("resumes/a.resume", "secret").unwrap();
        let path = dir.join("resumes/a.resume");
        let mut data = fs::read(&path).unwrap();
        let last = data.len() - 1;
        data[last] ^= 1;
        fs::write(&path, &data).unwrap();
        assert!(v.read("resumes/a.resume").unwrap_err().contains("can't be decrypted"));

        // A resume file can't be passed off as the settings file.
        v.write("resumes/b.resume", "x").unwrap();
        fs::copy(dir.join("resumes/b.resume"), dir.join(SETTINGS_FILE)).unwrap();
        assert!(v.read("settings").is_err());

        // A key that doesn't open this folder counts as no key.
        *keys.key.lock().unwrap() = Some([9u8; 32]);
        assert_eq!(v.status(), Status::Locked);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn finishes_an_interrupted_migration() {
        let dir = folder("interrupted");
        fs::write(dir.join("resumes/one.resume"), "one").unwrap();
        fs::write(dir.join("resumes/two.resume"), "two").unwrap();
        let (v, _) = vault_in(&dir);
        v.init().unwrap();
        // Simulate a crash: one file back in plaintext, a stray temp file.
        fs::write(dir.join("resumes/two.resume"), "two").unwrap();
        fs::write(dir.join("resumes/one.resume.tmp"), "partial").unwrap();
        // Reading a plaintext leftover still works; the next init encrypts it.
        assert_eq!(v.read("resumes/two.resume").unwrap().unwrap(), "two");
        v.init().unwrap();
        assert!(is_encrypted(&dir.join("resumes/two.resume")));
        assert!(!dir.join("resumes/one.resume.tmp").exists());
        assert_eq!(v.read("resumes/one.resume").unwrap().unwrap(), "one");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_paths_outside_the_vault() {
        let dir = folder("paths");
        let (v, _) = vault_in(&dir);
        v.init().unwrap();
        for bad in ["resumes/../settings.resume", "resumes/a/b.resume", "../x", "resumes/.resume", "resumes/C:\\x.resume", "other.txt"] {
            assert!(v.write(bad, "x").is_err(), "{bad} should be refused");
        }
        assert!(v.write("resumes/Jane Doe - CV_2.resume", "ok").is_ok());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn backups_move_between_data_folders_with_their_password() {
        let a = folder("backup-a");
        let (va, _) = vault_in(&a);
        va.init().unwrap();
        va.write("settings", r#"{"app":{}}"#).unwrap();
        va.write("resumes/cv.resume", "my resume").unwrap();
        let file = a.join("backup.resumabackup");
        assert!(va.export_backup(&file, "short").is_err());
        assert_eq!(va.export_backup(&file, "correct horse").unwrap(), 1);
        assert!(!String::from_utf8_lossy(&fs::read(&file).unwrap()).contains("my resume"));

        // Another computer: its own key, then the backup.
        let b = folder("backup-b");
        let (vb, _) = vault_in(&b);
        vb.init().unwrap();
        assert!(vb.import_backup(&file, "wrong password").unwrap_err().contains("Wrong password"));
        assert_eq!(vb.import_backup(&file, "correct horse").unwrap(), 1);
        assert_eq!(vb.read("resumes/cv.resume").unwrap().unwrap(), "my resume");
        assert_eq!(vb.read("settings").unwrap().unwrap(), r#"{"app":{}}"#);
        let _ = fs::remove_dir_all(&a);
        let _ = fs::remove_dir_all(&b);
    }

    #[test]
    fn sets_aside_locked_data_instead_of_deleting_it() {
        let dir = folder("reset");
        let (v, keys) = vault_in(&dir);
        v.init().unwrap();
        v.write("resumes/a.resume", "old").unwrap();
        *keys.key.lock().unwrap() = None;
        let aside = v.reset().unwrap();
        assert!(aside.join("resumes/a.resume").exists());
        assert_eq!(v.status(), Status::New);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn recovery_codes_round_trip_and_catch_typos() {
        let key = [42u8; 32];
        let code = recovery_code(&key);
        assert_eq!(code.len(), 56 + 13);
        assert_eq!(parse_recovery_code(&code), Some(key));
        let mut typo = code.clone().into_bytes();
        typo[3] = if typo[3] == b'A' { b'B' } else { b'A' };
        assert_eq!(parse_recovery_code(std::str::from_utf8(&typo).unwrap()), None);
    }
}
