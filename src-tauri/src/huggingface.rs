use serde::Serialize;
use std::time::Duration;

use reqwest::Client;

const HF_API_BASE: &str = "https://huggingface.co/api";
const LISTING_TIMEOUT_SECS: u64 = 20;
const SEARCH_LIMIT: u32 = 30;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfModel {
    /// Full repo id, e.g. "bartowski/Qwen_Qwen3-4B-GGUF".
    pub repo: String,
    pub author: String,
    pub likes: i64,
    pub downloads: i64,
    pub last_modified: String,
    /// Names of the .gguf files at the repo root (sizes come from the tree API).
    pub files: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HfFile {
    pub path: String,
    pub size_bytes: u64,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(LISTING_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Minimal percent-encoding for query values; reqwest does not encode URLs.
fn urlencode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char)
            }
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

/// True when a repo member is a mainline weight file. Sharded parts pass,
/// while projector (`mmproj`) and MTP draft files are not usable as the
/// primary model of a llama.cpp run.
fn is_main_weight_file(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    if !lower.ends_with(".gguf") {
        return false;
    }

    let base = lower.rsplit('/').next().unwrap_or(&lower);
    !base.starts_with('.') && !base.starts_with("mmproj") && !base.starts_with("mtp")
}

/// Searches Hugging Face for GGUF model repositories, most downloaded first.
/// An empty query returns the most downloaded GGUF repos overall, which keeps
/// first-run discovery working even before the user types anything.
#[tauri::command]
pub async fn search_huggingface_models(query: String) -> Result<Vec<HfModel>, String> {
    let trimmed = query.trim();

    let mut url = format!(
        "{HF_API_BASE}/models?filter=gguf&sort=downloads&direction=-1&limit={SEARCH_LIMIT}&full=true"
    );
    if !trimmed.is_empty() {
        url.push_str(&format!("&search={}", urlencode(trimmed)));
    }

    let response = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Hugging Face request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!("Hugging Face request failed ({status})"));
    }

    let json: Vec<serde_json::Value> =
        serde_json::from_str(&body).map_err(|e| format!("Invalid JSON response: {e}"))?;

    let mut models = Vec::new();
    for entry in json {
        let Some(repo) = entry["id"].as_str().map(|s| s.to_string()) else {
            continue;
        };

        // Only surface repos that actually ship GGUF weights.
        let files = entry["siblings"]
            .as_array()
            .map(|siblings| {
                siblings
                    .iter()
                    .filter_map(|s| s["rfilename"].as_str())
                    .filter(|name| is_main_weight_file(name))
                    .map(|name| name.to_string())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        if files.is_empty() {
            continue;
        }

        let author = repo.split('/').next().unwrap_or("").to_string();

        models.push(HfModel {
            repo,
            author,
            likes: entry["likes"].as_i64().unwrap_or(0),
            downloads: entry["downloads"].as_i64().unwrap_or(0),
            last_modified: entry["lastModified"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            files,
        });
    }

    Ok(models)
}

/// Lists the GGUF files of one repository together with their real sizes
/// (sharded multi-part models need all parts, so the UI can show totals).
#[tauri::command]
pub async fn get_huggingface_files(repo: String) -> Result<Vec<HfFile>, String> {
    let repo = repo.trim().trim_end_matches('/');
    if repo.is_empty() || !repo.chars().all(|c| c.is_alphanumeric() || "-_./".contains(c)) {
        return Err("Invalid repository id".to_string());
    }

    let url = format!("{HF_API_BASE}/models/{repo}/tree/main?recursive=true");

    let response = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Hugging Face request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    if !status.is_success() {
        return Err(format!(
            "Hugging Face request failed ({status}): {}",
            body.chars().take(200).collect::<String>()
        ));
    }

    let json: Vec<serde_json::Value> =
        serde_json::from_str(&body).map_err(|e| format!("Invalid JSON response: {e}"))?;

    let files = json
        .iter()
        .filter_map(|entry| {
            let path = entry["path"].as_str()?;
            if !is_main_weight_file(path) {
                return None;
            }
            Some(HfFile {
                path: path.to_string(),
                size_bytes: entry["lfs"]["size"]
                    .as_u64()
                    .or(entry["size"].as_u64())
                    .unwrap_or(0),
            })
        })
        .collect();

    Ok(files)
}
