use std::process::Command;
use std::path::{Path, PathBuf};
use serde_json::Value;
use dirs_next::data_dir;

use crate::gpu_offload;

#[cfg(unix)]
use std::fs;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

pub async fn call_llm(prompt: String, llm_settings: Value) -> Result<String, String> {
    let model = llm_settings["model"]
        .as_str()
        .ok_or("Missing model")?;
    let runtime = llm_settings["runtime"]
        .as_str()
        .ok_or("Missing runtime")?;
    let settings = &llm_settings["settings"];

    let app_data = get_app_data_path()?;
    let normalized_model = model.replace(".", "_");

    // The model id is just the download folder; the actual weights file name
    // varies per source (Hugging Face uploads, sharded multi-part models), so
    // scan for GGUF files and take the first shard lexicographically.
    let model_dir = app_data.join("models").join(&normalized_model);
    let model_path = find_gguf_file(&model_dir).ok_or_else(|| {
        format!(
            "No .gguf model file found in {:?}",
            model_dir.to_string_lossy()
        )
    })?;

    #[cfg(target_os = "windows")]
    let runtime_path = app_data
        .join("runtimes")
        .join(runtime)
        .join("llama-cli.exe");

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    let runtime_path = app_data
        .join("runtimes")
        .join(runtime)
        .join("build/bin/llama-cli");

    if !runtime_path.exists() {
        return Err(format!("Runtime not found at {:?}", runtime_path));
    }

    // 🛠 Ensure binary is executable
    #[cfg(unix)]
    {
        if let Ok(metadata) = fs::metadata(&runtime_path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&runtime_path, perms);
        }
    }

    let mut args = vec![
        "--model".to_string(),
        model_path.to_string_lossy().to_string(),
        "--prompt".to_string(),
        prompt.clone(),
        "--jinja".to_string(),
        "-st".to_string(),
        "--simple-io".to_string(),
    ];

    if let Some(ctx) = settings.get("ctxSize").and_then(|v| v.as_u64()) {
        args.push("--ctx-size".to_string());
        args.push(ctx.to_string());
    }

    let is_cpu_runtime = runtime.to_lowercase().contains("cpu");
    // Index of the `--gpu-layers` value when "auto" picked it, so a failed
    // load can be retried on the CPU.
    let mut auto_layers_arg: Option<usize> = None;

    if !is_cpu_runtime {
        if settings.get("flashAttn").and_then(|v| v.as_bool()) == Some(true) {
            args.push("--flash-attn".to_string());
        }

        // gpu_layers may be -1 ("Auto offload", sized from the free device
        // memory - see gpu_offload.rs), 0 (CPU-only execution), or an
        // explicit layer count.
        if let Some(gpu) = settings
            .get("gpuLayers")
            .and_then(|v| v.as_i64())
            .filter(|gpu| *gpu >= -1)
        {
            let layers = if gpu == -1 {
                let ctx = settings.get("ctxSize").and_then(|v| v.as_u64());
                match gpu_offload::resolve_auto(runtime, &runtime_path, &model_dir, &model_path, ctx)? {
                    gpu_offload::AutoLayers::Count(count) => {
                        auto_layers_arg = Some(args.len() + 1);
                        count as i64
                    }
                    gpu_offload::AutoLayers::LlamaDefault => -1,
                }
            } else {
                gpu
            };
            args.push("--gpu-layers".to_string());
            args.push(layers.to_string());
        }
    }

    if settings.get("mlock").and_then(|v| v.as_bool()) == Some(true) {
        args.push("--mlock".to_string());
    }

    if settings.get("noMmap").and_then(|v| v.as_bool()) == Some(true) {
        args.push("--no-mmap".to_string());
    }

    let mut output = llama_command(&runtime_path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute process: {}", e))?;

    // Auto offload is an estimate; if the GPU still ran out of memory, the
    // request must not fail where a CPU run would have worked.
    if let Some(index) = auto_layers_arg {
        if !output.status.success() && args[index] != "0" {
            eprintln!(
                "[llm] run with {} GPU layers failed, retrying on the CPU",
                args[index]
            );
            args[index] = "0".to_string();
            output = llama_command(&runtime_path)
                .args(&args)
                .output()
                .map_err(|e| format!("Failed to execute process: {}", e))?;
        }
    }

    // Surfaces where the weights went ("offloaded 37/37 layers to GPU").
    if let Some(line) = String::from_utf8_lossy(&output.stderr)
        .lines()
        .find(|line| line.contains("offloaded"))
    {
        eprintln!("[llm] {}", line.trim());
    }

    if !output.status.success() {
        return Err(format!(
            "LLM process exited with error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    if let Some(extracted) = extract_think_to_end(&stdout) {
        Ok(extracted)
    } else {
        Ok(stdout.trim().to_string())
    }
}

/// A `llama-cli` invocation with the runtime's own libraries on the search
/// path and, on Windows, no console window.
pub(crate) fn llama_command(runtime_path: &Path) -> Command {
    let mut command = Command::new(runtime_path);

    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW

    #[cfg(not(target_os = "windows"))]
    if let Some(lib_dir) = runtime_path.parent() {
        command.env("LD_LIBRARY_PATH", lib_dir);
    }

    command
}

fn get_app_data_path() -> Result<PathBuf, String> {
    data_dir()
        .map(|base| base.join("com.resuma.app"))
        .ok_or("Failed to resolve platform-specific app data directory.".to_string())
}

/// Sharded GGUFs load from their first part ("-00001-of-…"), which sorts
/// first alphabetically, so the lexicographically smallest file is correct
/// for both single-file and sharded models.
fn find_gguf_file(model_dir: &PathBuf) -> Option<PathBuf> {
    let mut ggufs: Vec<PathBuf> = std::fs::read_dir(model_dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("gguf"))
                    .unwrap_or(false)
        })
        .collect();

    ggufs.sort();
    ggufs.into_iter().next()
}

pub fn extract_think_to_end(text: &str) -> Option<String> {
    let start = text.find("</think>")?;
    let end = text.find("[end of text]")?;

    if start < end {
        let content = &text[start + "</think>".len()..end];
        Some(content.trim().to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One real request against an installed runtime and model, with the
    /// app's own argument building. Run with:
    /// `RESUMA_TEST_RUNTIME=llama-vulkan-win RESUMA_TEST_MODEL=<model id>
    /// cargo test real_local_request -- --ignored --nocapture`
    /// and look for "[llm] auto offload" and "offloaded N/M layers".
    #[test]
    #[ignore]
    fn real_local_request() {
        let runtime = std::env::var("RESUMA_TEST_RUNTIME").expect("RESUMA_TEST_RUNTIME");
        let model = std::env::var("RESUMA_TEST_MODEL").expect("RESUMA_TEST_MODEL");
        let gpu_layers: i64 = std::env::var("RESUMA_TEST_GPU_LAYERS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(-1);

        let settings = serde_json::json!({
            "provider": "local",
            "runtime": runtime,
            "model": model,
            "settings": {
                "ctxSize": 8192,
                "gpuLayers": gpu_layers,
                "flashAttn": false,
                "mlock": false,
                "noMmap": false,
            },
        });

        let started = std::time::Instant::now();
        let result = tauri::async_runtime::block_on(call_llm(
            "Reply with the single word: ready /no_think".to_string(),
            settings,
        ));
        eprintln!("took {:?}: {:?}", started.elapsed(), result);
        result.expect("request failed");
    }
}
