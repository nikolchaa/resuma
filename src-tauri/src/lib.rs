use futures_util::StreamExt;
use reqwest::Client;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::PathBuf;
use tauri::async_runtime::spawn;
use tauri::Emitter;
use zip::ZipArchive;
use tauri_plugin_prevent_default::{Builder as PreventDefaultBuilder, PlatformOptions};

mod rpc;
use rpc::{set_activity, start_rpc, stop_rpc};

use dotenvy::dotenv;

#[tauri::command]
async fn download_and_extract(
    window: tauri::Window,
    asset_name: String,
    asset_url: String,
    no_extract: bool,
    asset_type: String, // e.g., "runtimes", "models", etc.
) -> Result<(), String> {
    spawn(async move {
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

        let filename = asset_url.split('/').last().unwrap_or("download.zip");
        let file_path = base_dir.join(filename);

        let client = Client::new();
        let response = match client.get(&asset_url).send().await {
            Ok(res) => res,
            Err(e) => {
                let _ = window.emit(
                    &format!("download_error:{}", asset_name),
                    format!("Download failed: {e}"),
                );
                return;
            }
        };

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;
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
                    downloaded += chunk.len() as u64;
                    let progress = if total_size > 0 {
                        (downloaded as f64 / total_size as f64) * 100.0
                    } else {
                        0.0
                    };
                    let _ = window.emit(&format!("download_progress:{}", asset_name), progress);
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

        let _ = window.emit(
            &format!("download_complete:{}", asset_name),
            file_path.to_string_lossy().to_string(),
        );

        if !no_extract {
            if let Err(e) = extract_zip(&file_path, &base_dir) {
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
        let outpath = extract_to.join(file.mangled_name());

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenv().ok(); // Load .env
    let client_id = std::env::var("DISCORD_CLIENT_ID").expect("DISCORD_CLIENT_ID not set");

    start_rpc(client_id).expect("Failed to start Discord RPC");

    let prevent_default_plugin = PreventDefaultBuilder::new()
        .platform(PlatformOptions {
            general_autofill: false,
            password_autosave: false,
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_hwinfo::init())
        .plugin(prevent_default_plugin)
        .invoke_handler(tauri::generate_handler![
            download_and_extract,
            check_asset_ready,
            set_activity,
            stop_rpc,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
