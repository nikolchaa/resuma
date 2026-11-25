use futures_util::StreamExt;
use reqwest::Client;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::PathBuf;
use tauri::async_runtime::spawn;
use tauri::Emitter;
use zip::ZipArchive;
use tauri_plugin_prevent_default::Builder as PreventDefaultBuilder;

#[cfg(target_os = "windows")]
use tauri_plugin_prevent_default::PlatformOptions;

mod datavault;
mod gguf;
mod gpu_offload;
mod huggingface;
mod llm;
mod mcp;
mod remote;
mod reranker;
mod rpc;
mod secrets;
use huggingface::{get_huggingface_files, search_huggingface_models};
use datavault::{
    vault_acknowledge_recovery, vault_export_backup, vault_import_backup, vault_init, vault_list_resumes, vault_read,
    vault_recovery_code, vault_reset, vault_status, vault_unlock, vault_write,
};
use mcp::{mcp_regenerate_token, mcp_reply, mcp_start, mcp_status, mcp_stop, mcp_token};
use remote::list_remote_models;
use rpc::{set_activity, start_rpc, stop_rpc};
use secrets::{delete_api_key, has_api_key, keystore_status, set_api_key};
use gguf::asset_model_layers;

#[tauri::command]
async fn download_and_extract(
    window: tauri::Window,
    asset_name: String,
    asset_urls: Vec<String>,
    no_extract: bool,
    asset_type: String, // e.g., "runtimes", "models", etc.
    // Build tag recorded after extraction, e.g. "b12675" for runtimes.
    version: Option<String>,
) -> Result<(), String> {
    spawn(async move {
        if asset_urls.is_empty() {
            let _ = window.emit(
                &format!("download_error:{}", asset_name),
                "No download URLs provided".to_string(),
            );
            return;
        }

        if asset_name.is_empty()
            || asset_name.contains(['/', '\\'])
            || asset_name.contains("..")
        {
            let _ = window.emit(
                &format!("download_error:{}", asset_name),
                "Invalid asset name".to_string(),
            );
            return;
        }

        let base_dir = dirs::data_dir()
            .ok_or_else(|| "Failed to find data directory".to_string())
            .unwrap()
            .join("com.resuma.app")
            .join(&format!("{}s", asset_type)) // ← dynamic folder like runtimes, models, etc.
            .join(&asset_name);

        // Runtime archives download into a staging folder and only replace
        // the installed runtime once every archive has arrived, so a failed
        // update or repair leaves the previous install working. Models
        // download straight into their folder.
        let download_dir = if no_extract {
            base_dir.clone()
        } else {
            match dirs::data_dir() {
                Some(dir) => dir.join("com.resuma.app").join("downloads").join(&asset_name),
                None => {
                    let _ = window.emit(
                        &format!("download_error:{}", asset_name),
                        "Failed to find data directory".to_string(),
                    );
                    return;
                }
            }
        };
        let discard_staging = || {
            if !no_extract {
                let _ = fs::remove_dir_all(&download_dir);
                // Drop `downloads/` too once nothing else is staged in it;
                // remove_dir refuses non-empty folders.
                if let Some(parent) = download_dir.parent() {
                    let _ = fs::remove_dir(parent);
                }
            }
        };
        discard_staging();

        if let Err(e) = fs::create_dir_all(&download_dir) {
            let _ = window.emit(
                &format!("download_error:{}", asset_name),
                format!("Failed to create directory: {e}"),
            );
            return;
        }

        // Sharded models and multi-archive runtimes download several files
        // into one folder; progress is reported across every byte. Sizes are
        // asked for up front so the bar does not jump back when the next
        // file starts; any unknown size is added once its download begins.
        let client = Client::new();
        let mut known_sizes: Vec<Option<u64>> = Vec::with_capacity(asset_urls.len());
        for url in &asset_urls {
            let size = match client.head(url).send().await {
                Ok(res) if res.status().is_success() => res
                    .headers()
                    .get(reqwest::header::CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok()),
                _ => None,
            };
            known_sizes.push(size);
        }
        let mut grand_total: u64 = known_sizes.iter().flatten().sum();
        let mut downloaded_total: u64 = 0;
        let mut last_file_path: Option<PathBuf> = None;
        let mut downloaded_files: Vec<PathBuf> = Vec::new();

        for (index, url) in asset_urls.iter().enumerate() {
            let filename = url.split('/').last().unwrap_or("download.zip");
            let file_path = download_dir.join(filename);
            last_file_path = Some(file_path.clone());
            downloaded_files.push(file_path.clone());

            let response = match client.get(url).send().await {
                Ok(res) => res,
                Err(e) => {
                    let _ = window.emit(
                        &format!("download_error:{}", asset_name),
                        format!("Download failed: {e}"),
                    );
                    discard_staging();
                    return;
                }
            };

            if known_sizes[index].is_none() {
                grand_total += response.content_length().unwrap_or(0);
            }
            let mut stream = response.bytes_stream();
            let mut file = match File::create(&file_path) {
                Ok(f) => f,
                Err(e) => {
                    let _ = window.emit(
                        &format!("download_error:{}", asset_name),
                        format!("Failed to create file: {e}"),
                    );
                    discard_staging();
                    return;
                }
            };

            while let Some(item) = stream.next().await {
                match item {
                    Ok(chunk) => {
                        if let Err(e) = file.write_all(&chunk) {
                            let _ = window.emit(
                                &format!("download_error:{}", asset_name),
                                format!("Failed writing file: {e}"),
                            );
                            discard_staging();
                            return;
                        }
                        downloaded_total += chunk.len() as u64;
                        let progress = if grand_total > 0 {
                            (downloaded_total as f64 / grand_total as f64) * 100.0
                        } else {
                            0.0
                        };
                        let _ =
                            window.emit(&format!("download_progress:{}", asset_name), progress);
                    }
                    Err(e) => {
                        let _ = window.emit(
                            &format!("download_error:{}", asset_name),
                            format!("Download stream error: {e}"),
                        );
                        discard_staging();
                        return;
                    }
                }
            }
        }

        let _ = window.emit(
            &format!("download_complete:{}", asset_name),
            last_file_path
                .as_ref()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
        );

        // Runtimes may come as several archives extracted into one folder
        // (the CUDA build plus its cudart/cuBLAS DLLs); models are never
        // extracted, sharded or not.
        if !no_extract && !downloaded_files.is_empty() {
            // The new build goes into an empty folder: llama.cpp loads every
            // ggml-*.dll backend it finds, so leftovers from an older build
            // would be loaded into the new one.
            let replaced = (if base_dir.exists() {
                fs::remove_dir_all(&base_dir)
            } else {
                Ok(())
            })
            .and_then(|_| fs::create_dir_all(&base_dir));
            if let Err(e) = replaced {
                discard_staging();
                let _ = window.emit(
                    &format!("extract_error:{}", asset_name),
                    format!("Failed to replace the previous install: {e}"),
                );
                return;
            }

            for archive_path in &downloaded_files {
                if let Err(e) = extract_archive(archive_path, &base_dir) {
                    discard_staging();
                    let _ = window.emit(
                        &format!("extract_error:{}", asset_name),
                        format!("Extraction failed: {e}"),
                    );
                    return;
                }
            }
            discard_staging();
            // Lets check_asset_ready tell a current install from one made
            // with an older llama.cpp build.
            if let Some(version) = &version {
                if let Err(e) = fs::write(base_dir.join(VERSION_MARKER), version) {
                    let _ = window.emit(
                        &format!("extract_error:{}", asset_name),
                        format!("Failed to record the runtime version: {e}"),
                    );
                    return;
                }
            }
            let _ = window.emit(
                &format!("extract_complete:{}", asset_name),
                base_dir.to_string_lossy().to_string(),
            );
        }
    });

    Ok(())
}

/// File in a runtime folder holding the llama.cpp build it was extracted
/// from (e.g. "b12675").
const VERSION_MARKER: &str = "resuma-runtime-version.txt";

/// Extracts a .zip or .tar.gz into `extract_to` and deletes the archive.
/// Any other file is left where it is.
fn extract_archive(archive_path: &PathBuf, extract_to: &PathBuf) -> io::Result<()> {
    let name = archive_path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    if name.ends_with(".zip") {
        extract_zip(archive_path, extract_to)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        extract_tar_gz(archive_path, extract_to)
    } else {
        Ok(())
    }
}

fn extract_tar_gz(archive_path: &PathBuf, extract_to: &PathBuf) -> io::Result<()> {
    let file = File::open(archive_path)?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    // `unpack` refuses entries that would land outside `extract_to` and
    // keeps the executable bits and .so symlinks of the Linux/macOS builds.
    archive.unpack(extract_to)?;
    fs::remove_file(archive_path)?;
    Ok(())
}

// Helper function, NOT a tauri command
fn extract_zip(zip_path: &PathBuf, extract_to: &PathBuf) -> io::Result<()> {
    let file = File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() { // mangled_name -> enclosed_name, updated for zip 4.2.0
            Some(path) => extract_to.join(path),
            None => continue, // Skip paths with directory traversal risks
        };

        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }

    fs::remove_file(zip_path)?;

    Ok(())
}

/// True when the asset folder exists and holds every `required_files` entry
/// (e.g. the CUDA runtime's cudart DLLs, which ship in a separate archive
/// that older app versions never downloaded).
#[tauri::command]
async fn check_asset_ready(
    asset_type: String,
    asset_name: String,
    required_files: Option<Vec<String>>,
    version: Option<String>,
) -> Result<bool, String> {
    let base_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to find data directory".to_string())?
        .join("com.resuma.app")
        .join(asset_type)
        .join(asset_name);

    let version_matches = match version {
        Some(expected) => fs::read_to_string(base_dir.join(VERSION_MARKER))
            .map(|found| found.trim() == expected)
            .unwrap_or(false),
        None => true,
    };

    Ok(base_dir.exists()
        && version_matches
        && required_files
            .unwrap_or_default()
            .iter()
            .all(|file| base_dir.join(file).is_file()))
}

/// Total bytes on disk for one downloaded asset folder, following
/// `check_asset_ready`'s convention (`asset_type` is already plural, e.g.
/// "models"). Used to show the installed footprint of a model.
#[tauri::command]
async fn asset_disk_usage(asset_type: String, asset_name: String) -> Result<u64, String> {
    let base_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to find data directory".to_string())?
        .join("com.resuma.app")
        .join(asset_type)
        .join(asset_name);

    if !base_dir.exists() {
        return Ok(0);
    }

    fn dir_size(path: &std::path::Path) -> u64 {
        let mut total = 0u64;

        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    total += dir_size(&entry_path);
                } else if let Ok(metadata) = entry.metadata() {
                    total += metadata.len();
                }
            }
        }

        total
    }

    Ok(dir_size(&base_dir))
}

/// Stops an AI request started with `request_id`: kills the llama.cpp
/// process or drops the remote request. It then fails with "cancelled".
#[tauri::command]
fn cancel_llm(request_id: String) {
    llm::cancel(&request_id);
}

#[tauri::command]
async fn call_llm(
    prompt: String,
    llm_settings: serde_json::Value,
    // Lets cancel_llm stop this request; requests without one can't be stopped.
    request_id: Option<String>,
) -> Result<String, String> {
    // "No AI" provider: refuse outright so nothing is spawned or sent.
    if llm_settings["provider"].as_str() == Some("none") {
        return Err("AI features are turned off (No AI provider).".into());
    }

    // "local" runs the bundled llama.cpp binary; everything else is an HTTP
    // provider, cloud or self-hosted.
    let is_local = llm_settings["provider"].as_str().unwrap_or("local") == "local";

    if is_local {
        llm::call_llm(prompt, llm_settings, request_id).await
    } else {
        llm::run_remote_cancellable(request_id, remote::call_remote(prompt, llm_settings)).await
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    let prevent_default_plugin = PreventDefaultBuilder::new()
        .platform(PlatformOptions {
            general_autofill: false,
            password_autosave: false,
        })
        .build();

    #[cfg(not(target_os = "windows"))]
    let prevent_default_plugin = PreventDefaultBuilder::new().build();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_hwinfo::init())
        .plugin(prevent_default_plugin)
        .invoke_handler(tauri::generate_handler![
            call_llm,
            cancel_llm,
            reranker::rerank,
            reranker::reranker_stop,
            download_and_extract,
            check_asset_ready,
            asset_disk_usage,
            asset_model_layers,
            start_rpc,
            set_activity,
            stop_rpc,
            set_api_key,
            delete_api_key,
            has_api_key,
            keystore_status,
            list_remote_models,
            search_huggingface_models,
            get_huggingface_files,
            mcp_start,
            mcp_stop,
            mcp_status,
            mcp_token,
            mcp_regenerate_token,
            mcp_reply,
            vault_status,
            vault_init,
            vault_recovery_code,
            vault_acknowledge_recovery,
            vault_unlock,
            vault_reset,
            vault_read,
            vault_write,
            vault_list_resumes,
            vault_export_backup,
            vault_import_backup,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app, event| {
            // No llama.cpp process may outlive the app.
            if let tauri::RunEvent::Exit = event {
                llm::cancel_all();
                reranker::stop();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_tar_gz_runtimes_and_removes_the_archive() {
        let dir = std::env::temp_dir().join(format!("resuma-tar-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let archive = dir.join("llama-b12675-bin-ubuntu-x64.tar.gz");

        {
            let file = File::create(&archive).unwrap();
            let gz = flate2::write::GzEncoder::new(file, flate2::Compression::fast());
            let mut builder = tar::Builder::new(gz);
            let data = b"#!/bin/sh\n";
            let mut header = tar::Header::new_gnu();
            header.set_size(data.len() as u64);
            header.set_mode(0o755);
            header.set_cksum();
            builder
                .append_data(&mut header, "llama-b12675/llama-completion", &data[..])
                .unwrap();
            builder.into_inner().unwrap().finish().unwrap();
        }

        extract_archive(&archive, &dir).unwrap();
        assert!(dir.join("llama-b12675").join("llama-completion").is_file());
        assert!(!archive.exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
