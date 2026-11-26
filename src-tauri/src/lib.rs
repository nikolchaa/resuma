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
    // Per-GPU-architecture archive, with "{target}" standing for e.g.
    // "gfx1030"; fetched for each GPU the extracted runtime lists.
    gpu_target_download: Option<String>,
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
            // The ROCm build needs rocBLAS kernels for the GPU's own
            // architecture, which only the installed runtime can tell.
            if let Some(template) = &gpu_target_download {
                if let Err(e) = install_gpu_kernels(&client, &base_dir, &download_dir, template).await {
                    discard_staging();
                    let _ = window.emit(&format!("extract_error:{}", asset_name), e);
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
    } else if name.ends_with(".whl") {
        extract_rocm_wheel(archive_path, extract_to)
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

/// The parts of AMD's ROCm wheels llama.cpp's HIP backend needs:
/// `ggml-hip.dll` links hipBLAS, which pulls in rocSOLVER, rocBLAS,
/// hipBLASLt and origami, and rocBLAS/hipBLASLt load their GPU kernels from
/// `library/` folders and `.kpack` archives next to them. Everything else
/// (MIOpen alone is several hundred MB) is left out.
fn keep_rocm_wheel_entry(path: &str) -> bool {
    const DLLS: [&str; 5] = ["hipblas.dll", "rocblas.dll", "rocsolver.dll", "libhipblaslt.dll", "origami.dll"];
    let Some(rest) = path.strip_prefix(&format!("{}/", llm::ROCM_LIBS_DIR)) else {
        return false;
    };
    if let Some(file) = rest.strip_prefix("bin/") {
        return DLLS.contains(&file) || file.starts_with("rocblas/library/") || file.starts_with("hipblaslt/library/");
    }
    rest.strip_prefix(".kpack/").map_or(false, |file| file.starts_with("blas_lib_"))
}

/// Extracts the needed parts of a ROCm wheel (a zip), keeping its
/// `_rocm_sdk_libraries/` layout: rocBLAS finds its kernels relative to
/// its own DLL. `llm::llama_command` puts the DLL folder on PATH.
fn extract_rocm_wheel(wheel_path: &PathBuf, extract_to: &PathBuf) -> io::Result<()> {
    let mut archive = ZipArchive::new(File::open(wheel_path)?)?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        if file.is_dir() || !keep_rocm_wheel_entry(file.name()) {
            continue;
        }
        let Some(path) = file.enclosed_name() else { continue };
        let outpath = extract_to.join(path);
        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent)?;
        }
        io::copy(&mut file, &mut File::create(&outpath)?)?;
    }
    fs::remove_file(wheel_path)?;
    Ok(())
}

/// Written once the GPU kernels are in place; the HIP runtime lists it in
/// `requiredFiles`, so an install whose kernels failed reads as incomplete.
const GPU_KERNELS_MARKER: &str = "resuma-gpu-kernels.txt";

/// Asks the freshly extracted runtime which GPU architectures it sees and
/// installs the kernel archive for each one.
async fn install_gpu_kernels(client: &Client, base_dir: &PathBuf, download_dir: &PathBuf, template: &str) -> Result<(), String> {
    let (binary, _) = llm::find_runtime_binary(base_dir).ok_or("The downloaded runtime has no llama.cpp binary.")?;
    let output = tauri::async_runtime::spawn_blocking(move || llm::llama_command(&binary).args(["--verbose", "--list-devices"]).output())
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("Could not start the downloaded runtime: {e}"))?;
    let listing = format!("{}\n{}", String::from_utf8_lossy(&output.stdout), String::from_utf8_lossy(&output.stderr));
    let targets = gpu_offload::parse_gpu_targets(&listing);
    if targets.is_empty() {
        return Err(gpu_offload::HIP_NO_DEVICE_ERROR.to_string());
    }

    let mut installed = Vec::new();
    for target in &targets {
        let url = template.replace("{target}", target);
        let file = download_dir.join(url.rsplit('/').next().unwrap_or("kernels.whl"));
        let response = client.get(&url).send().await.map_err(|e| format!("Download failed: {e}"))?;
        // An architecture AMD publishes no kernels for (another GPU in the
        // computer, say) is skipped; one is enough.
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            eprintln!("[runtime] no GPU kernels published for {target}");
            continue;
        }
        let bytes = response
            .error_for_status()
            .map_err(|e| format!("Download failed: {e}"))?
            .bytes()
            .await
            .map_err(|e| format!("Download failed: {e}"))?;
        fs::write(&file, &bytes).map_err(|e| format!("Failed writing file: {e}"))?;
        extract_archive(&file, base_dir).map_err(|e| format!("Extraction failed: {e}"))?;
        installed.push(target.clone());
    }
    if installed.is_empty() {
        return Err(format!(
            "AMD publishes no ROCm kernels for this GPU ({}). Use the Vulkan runtime instead.",
            targets.join(", ")
        ));
    }
    fs::write(base_dir.join(llm::ROCM_LIBS_DIR).join(GPU_KERNELS_MARKER), installed.join("\n"))
        .map_err(|e| format!("Failed to record the GPU kernels: {e}"))
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

/// Set once the frontend has called in, for the start-up check below.
static FRONTEND_UP: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The CPU architecture this build of the app runs as: "x64", "arm64", or
/// Rust's own name for anything else. llama.cpp runtimes must match it.
/// The frontend asks for it as soon as it starts, so it also marks the
/// frontend as up.
#[tauri::command]
fn app_arch() -> &'static str {
    FRONTEND_UP.store(true, std::sync::atomic::Ordering::SeqCst);
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
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
        .setup(|app| {
            // Start-up check for CI (RESUMA_SMOKE_TEST set): exit with 0 once
            // the frontend has loaded and called in, or with 1 if it hasn't
            // within a minute (a missing library, a WebView that won't start).
            if std::env::var_os("RESUMA_SMOKE_TEST").is_some() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let started = std::time::Instant::now();
                    while started.elapsed() < std::time::Duration::from_secs(60) {
                        if FRONTEND_UP.load(std::sync::atomic::Ordering::SeqCst) {
                            println!("[smoke] the frontend started");
                            handle.exit(0);
                            return;
                        }
                        std::thread::sleep(std::time::Duration::from_millis(200));
                    }
                    eprintln!("[smoke] the frontend didn't start within a minute");
                    handle.exit(1);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_arch,
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

    /// Completes a HIP runtime the way a download does, on a real AMD GPU:
    /// `RESUMA_TEST_HIP_DIR` holds the extracted llama.cpp ROCm zip,
    /// `RESUMA_TEST_ROCM_WHEEL` the rocm_sdk_libraries wheel. Then run
    /// llm's `real_local_request` against that folder.
    #[test]
    #[ignore]
    fn real_hip_kernel_install() {
        let dir = PathBuf::from(std::env::var("RESUMA_TEST_HIP_DIR").expect("RESUMA_TEST_HIP_DIR"));
        let wheel = PathBuf::from(std::env::var("RESUMA_TEST_ROCM_WHEEL").expect("RESUMA_TEST_ROCM_WHEEL"));
        let staged = dir.join("libraries.whl");
        fs::copy(&wheel, &staged).unwrap();
        extract_archive(&staged, &dir).unwrap();
        let template = "https://stable.repo.amd.com/rocm/core/whl-next/rocm-sdk-device-{target}/rocm_sdk_device_{target}-10.0.0-py3-none-win_amd64.whl";
        tauri::async_runtime::block_on(install_gpu_kernels(&Client::new(), &dir, &dir, template)).unwrap();
        let marker = fs::read_to_string(dir.join(llm::ROCM_LIBS_DIR).join(GPU_KERNELS_MARKER)).unwrap();
        eprintln!("installed kernels for: {marker}");
    }

    #[test]
    fn rocm_wheels_keep_only_what_the_hip_backend_loads() {
        for kept in [
            "_rocm_sdk_libraries/bin/hipblas.dll",
            "_rocm_sdk_libraries/bin/rocblas.dll",
            "_rocm_sdk_libraries/bin/rocsolver.dll",
            "_rocm_sdk_libraries/bin/libhipblaslt.dll",
            "_rocm_sdk_libraries/bin/origami.dll",
            "_rocm_sdk_libraries/bin/rocblas/library/TensileLibrary_lazy_gfx1030.dat",
            "_rocm_sdk_libraries/bin/hipblaslt/library/gfx1201/TensileLibrary_lazy_gfx1201.dat",
            "_rocm_sdk_libraries/.kpack/blas_lib_gfx1030.kpack",
        ] {
            assert!(keep_rocm_wheel_entry(kept), "{kept}");
        }
        for dropped in [
            "_rocm_sdk_libraries/bin/MIOpen.dll",
            "_rocm_sdk_libraries/bin/MIOpenCKGroupedConv_gfx1100.dll",
            "_rocm_sdk_libraries/bin/test_plugins/hipdnn_test_plugin1.dll",
            "_rocm_sdk_libraries/.kpack/fft_lib_gfx1030.kpack",
            "_rocm_sdk_libraries/.devel_links/gfx1030.json",
            "rocm_sdk_libraries/_dist_info.py",
            "rocm_sdk_libraries-10.0.0.dist-info/RECORD",
        ] {
            assert!(!keep_rocm_wheel_entry(dropped), "{dropped}");
        }
    }
}
