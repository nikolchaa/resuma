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

mod gguf;
mod huggingface;
mod llm;
mod remote;
mod rpc;
mod secrets;
use huggingface::{get_huggingface_files, search_huggingface_models};
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
) -> Result<(), String> {
    spawn(async move {
        if asset_urls.is_empty() {
            let _ = window.emit(
                &format!("download_error:{}", asset_name),
                "No download URLs provided".to_string(),
            );
            return;
        }

        let base_dir = dirs::data_dir()
            .ok_or_else(|| "Failed to find data directory".to_string())
            .unwrap()
            .join("com.resuma.app")
            .join(&format!("{}s", asset_type)) // ← dynamic folder like runtimes, models, etc.
            .join(&asset_name);

        if let Err(e) = fs::create_dir_all(&base_dir) {
            let _ = window.emit(
                &format!("download_error:{}", asset_name),
                format!("Failed to create directory: {e}"),
            );
            return;
        }

        // Sharded models download several files into one folder; progress is
        // reported across every known byte so the bar stays meaningful.
        let mut grand_total: u64 = 0;
        let mut downloaded_total: u64 = 0;
        let mut last_file_path: Option<PathBuf> = None;

        for url in &asset_urls {
            let filename = url.split('/').last().unwrap_or("download.zip");
            let file_path = base_dir.join(filename);
            last_file_path = Some(file_path.clone());

            let client = Client::new();
            let response = match client.get(url).send().await {
                Ok(res) => res,
                Err(e) => {
                    let _ = window.emit(
                        &format!("download_error:{}", asset_name),
                        format!("Download failed: {e}"),
                    );
                    return;
                }
            };

            grand_total += response.content_length().unwrap_or(0);
            let mut stream = response.bytes_stream();
            let mut file = match File::create(&file_path) {
                Ok(f) => f,
                Err(e) => {
                    let _ = window.emit(
                        &format!("download_error:{}", asset_name),
                        format!("Failed to create file: {e}"),
                    );
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

        // A multi-part model has several zip-less files; extraction only ever
        // makes sense for the single-file runtime archives.
        if !no_extract && asset_urls.len() == 1 && last_file_path.is_some() {
            if let Err(e) = extract_zip(&last_file_path.unwrap(), &base_dir) {
                let _ = window.emit(
                    &format!("extract_error:{}", asset_name),
                    format!("Extraction failed: {e}"),
                );
                return;
            }
            let _ = window.emit(
                &format!("extract_complete:{}", asset_name),
                base_dir.to_string_lossy().to_string(),
            );
        }
    });

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

#[tauri::command]
async fn check_asset_ready(asset_type: String, asset_name: String) -> Result<bool, String> {
    let base_dir = dirs::data_dir()
        .ok_or_else(|| "Failed to find data directory".to_string())?
        .join("com.resuma.app")
        .join(asset_type)
        .join(asset_name);

    Ok(base_dir.exists())
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

#[tauri::command]
async fn call_llm(prompt: String, llm_settings: serde_json::Value) -> Result<String, String> {
    // "local" runs the bundled llama.cpp binary; everything else is an HTTP
    // provider, cloud or self-hosted.
    let is_local = llm_settings["provider"].as_str().unwrap_or("local") == "local";

    if is_local {
        llm::call_llm(prompt, llm_settings).await
    } else {
        remote::call_remote(prompt, llm_settings).await
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    const DISCORD_CLIENT_ID: &str = "1368618733454495855";

    if let Err(e) = start_rpc(DISCORD_CLIENT_ID.to_string()) {
        eprintln!("Discord RPC failed to start: {e}");
    }

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
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_hwinfo::init())
        .plugin(prevent_default_plugin)
        .invoke_handler(tauri::generate_handler![
            call_llm,
            download_and_extract,
            check_asset_ready,
            asset_disk_usage,
            asset_model_layers,
            set_activity,
            stop_rpc,
            set_api_key,
            delete_api_key,
            has_api_key,
            keystore_status,
            list_remote_models,
            search_huggingface_models,
            get_huggingface_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
