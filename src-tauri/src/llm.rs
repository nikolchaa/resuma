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

    let runtime_dir = runtimes_root(&app_data).join(runtime);
    let (runtime_path, build) = find_runtime_binary(&runtime_dir).ok_or_else(|| {
        format!(
            "Runtime not found in {:?}",
            runtime_dir.to_string_lossy()
        )
    })?;

    // 🛠 Ensure binary is executable
    #[cfg(unix)]
    {
        if let Ok(metadata) = fs::metadata(&runtime_path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o755);
            let _ = fs::set_permissions(&runtime_path, perms);
        }
    }

    // The prompt goes to llama.cpp as a UTF-8 file, not as a command-line
    // argument: on Windows, arguments pass through the ANSI code page, which
    // turns Cyrillic, "—", "•" etc. into "?", and the command line is capped
    // at 32K characters, which a full resume prompt can approach.
    let prompt_file = PromptFile::create(&prompt)?;

    let mut args = vec![
        "--model".to_string(),
        model_path.to_string_lossy().to_string(),
        "--file".to_string(),
        prompt_file.path.to_string_lossy().to_string(),
        "--jinja".to_string(),
        "-st".to_string(),
        "--simple-io".to_string(),
        // Pass the prompt through verbatim. By default llama.cpp turns "\n",
        // "\t", "\\" etc. into control characters, which mangles JSON escapes
        // and every Resuma Markup command (\to, \notes, \template, \v …).
        "--no-escape".to_string(),
    ];

    // Current builds may colour the echoed prompt with ANSI codes, which
    // would end up in the returned text when no </think> marker is found.
    if build == LlamaBuild::Current {
        args.push("--color".to_string());
        args.push("off".to_string());
        // Only the reply on stdout. With the prompt echoed, a reply cut short
        // by the context limit (no </think>) came back as the prompt itself.
        args.push("--no-display-prompt".to_string());
    }

    let ctx_size = settings.get("ctxSize").and_then(|v| v.as_u64());
    if let Some(ctx) = ctx_size {
        args.push("--ctx-size".to_string());
        args.push(ctx.to_string());
    }

    // Thinking models (Qwen3) can spend the whole context reasoning and never
    // answer; cap the thinking so the answer still fits.
    if build == LlamaBuild::Current {
        args.push("--reasoning-budget".to_string());
        args.push(reasoning_budget(ctx_size).to_string());
    }

    let is_cpu_runtime = runtime.to_lowercase().contains("cpu");
    // Index of the `--gpu-layers` value when "auto" picked it, so a failed
    // load can be retried on the CPU.
    let mut auto_layers_arg: Option<usize> = None;

    if !is_cpu_runtime {
        let flash_attn = settings.get("flashAttn").and_then(|v| v.as_bool()) == Some(true);
        match build {
            LlamaBuild::Legacy => {
                if flash_attn {
                    args.push("--flash-attn".to_string());
                }
            }
            // Current builds take a value and default to "auto"; the switch
            // keeps meaning on/off as it did with the legacy default (off).
            LlamaBuild::Current => {
                args.push("--flash-attn".to_string());
                args.push(if flash_attn { "on" } else { "off" }.to_string());
            }
        }

        // gpu_layers may be -1 ("Auto offload", see gpu_offload.rs), 0
        // (CPU-only execution), or an explicit layer count.
        if let Some(gpu) = settings
            .get("gpuLayers")
            .and_then(|v| v.as_i64())
            .filter(|gpu| *gpu >= -1)
        {
            let layers = if gpu == -1 {
                let ctx = settings.get("ctxSize").and_then(|v| v.as_u64());
                let self_fitting = build == LlamaBuild::Current;
                match gpu_offload::resolve_auto(
                    runtime,
                    &runtime_path,
                    &model_dir,
                    &model_path,
                    ctx,
                    self_fitting,
                )? {
                    gpu_offload::AutoLayers::Count(count) => {
                        auto_layers_arg = Some(args.len() + 1);
                        count.to_string()
                    }
                    gpu_offload::AutoLayers::Fit => {
                        eprintln!("[llm] auto offload: --gpu-layers auto (llama.cpp fits layers to free memory)");
                        auto_layers_arg = Some(args.len() + 1);
                        "auto".to_string()
                    }
                    gpu_offload::AutoLayers::LlamaDefault => "-1".to_string(),
                }
            } else {
                gpu.to_string()
            };
            args.push("--gpu-layers".to_string());
            args.push(layers);
        }
    }

    let mlock = settings.get("mlock").and_then(|v| v.as_bool()) == Some(true);
    let no_mmap = settings.get("noMmap").and_then(|v| v.as_bool()) == Some(true);

    match build {
        LlamaBuild::Legacy => {
            if mlock {
                args.push("--mlock".to_string());
            }
            if no_mmap {
                args.push("--no-mmap".to_string());
            }
        }
        // --mlock and --no-mmap were folded into --load-mode, and the old
        // flags are now rejected as invalid arguments.
        LlamaBuild::Current => {
            let mode = match (mlock, no_mmap) {
                (true, false) => Some("mmap+mlock"),
                (true, true) => Some("mlock"),
                (false, true) => Some("none"),
                (false, false) => None,
            };
            if let Some(mode) = mode {
                args.push("--load-mode".to_string());
                args.push(mode.to_string());
            }
        }
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

    drop(prompt_file);

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

/// Thinking tokens allowed per request: a quarter of the context (prompt and
/// answer need the rest), at least 512; 2048 when the context size is unset.
fn reasoning_budget(ctx_size: Option<u64>) -> u64 {
    ctx_size.map(|ctx| (ctx / 4).max(512)).unwrap_or(2048)
}

/// A temporary UTF-8 file holding one prompt; removed when dropped, also on
/// early returns and errors.
struct PromptFile {
    path: PathBuf,
}

impl PromptFile {
    fn create(prompt: &str) -> Result<Self, String> {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "resuma-prompt-{}-{}.txt",
            std::process::id(),
            nanos
        ));
        std::fs::write(&path, prompt.as_bytes())
            .map_err(|e| format!("Failed to write the prompt file: {}", e))?;
        Ok(Self { path })
    }
}

impl Drop for PromptFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// Which generation of llama.cpp a runtime folder holds; their command
/// lines differ.
#[derive(Debug, Clone, Copy, PartialEq)]
enum LlamaBuild {
    /// b5588 and similar, as downloaded by earlier app versions: one-shot
    /// `llama-cli`, `--gpu-layers -1` means 0 layers, `--mlock`/`--no-mmap`.
    Legacy,
    /// The pinned current build (b12675): the one-shot tool is
    /// `llama-completion` (`llama-cli` became an interactive chat), layers
    /// default to `auto` with `--fit`, and loading is set by `--load-mode`.
    Current,
}

/// Finds the one-shot binary in a runtime folder. Windows archives are flat;
/// Linux/macOS archives have used `build/bin/` and a top-level
/// `llama-<tag>/` folder, so a couple of levels are searched.
fn find_runtime_binary(runtime_dir: &Path) -> Option<(PathBuf, LlamaBuild)> {
    let exe = |name: &str| {
        if cfg!(target_os = "windows") {
            format!("{name}.exe")
        } else {
            name.to_string()
        }
    };

    let mut dirs = vec![runtime_dir.to_path_buf()];
    let mut nested = vec![runtime_dir.to_path_buf()];
    if let Ok(entries) = std::fs::read_dir(runtime_dir) {
        let mut subdirs: Vec<PathBuf> = entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        subdirs.sort();
        dirs.extend(subdirs.iter().cloned());
        nested.extend(subdirs);
    }
    for base in nested {
        dirs.push(base.join("bin"));
        dirs.push(base.join("build").join("bin"));
    }

    for (name, build) in [
        ("llama-completion", LlamaBuild::Current),
        ("llama-cli", LlamaBuild::Legacy),
    ] {
        let file = exe(name);
        if let Some(path) = dirs.iter().map(|d| d.join(&file)).find(|p| p.is_file()) {
            return Some((path, build));
        }
    }
    None
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

/// `<app data>/runtimes`; tests may point at runtimes outside the app's
/// folder with `RESUMA_TEST_RUNTIMES_DIR`.
fn runtimes_root(app_data: &Path) -> PathBuf {
    #[cfg(test)]
    if let Ok(dir) = std::env::var("RESUMA_TEST_RUNTIMES_DIR") {
        return PathBuf::from(dir);
    }
    app_data.join("runtimes")
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
        let ctx_size: u64 = std::env::var("RESUMA_TEST_CTX")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8192);

        let settings = serde_json::json!({
            "provider": "local",
            "runtime": runtime,
            "model": model,
            "settings": {
                "ctxSize": ctx_size,
                "gpuLayers": gpu_layers,
                // What Settings defaults to on an 8 GB+ GPU, plus flash
                // attention, so every build-specific flag is exercised.
                "flashAttn": true,
                "mlock": true,
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

    fn scratch_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "resuma-llm-test-{}-{}",
            name,
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(path: &Path) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, b"").unwrap();
    }

    fn exe(name: &str) -> String {
        if cfg!(target_os = "windows") {
            format!("{name}.exe")
        } else {
            name.to_string()
        }
    }

    #[test]
    fn caps_thinking_at_a_quarter_of_the_context() {
        assert_eq!(reasoning_budget(Some(8192)), 2048);
        assert_eq!(reasoning_budget(Some(1024)), 512);
        assert_eq!(reasoning_budget(None), 2048);
    }

    #[test]
    fn prefers_llama_completion_over_the_new_interactive_cli() {
        let dir = scratch_dir("flat");
        touch(&dir.join(exe("llama-cli")));
        touch(&dir.join(exe("llama-completion")));
        let (path, build) = find_runtime_binary(&dir).unwrap();
        assert_eq!(path, dir.join(exe("llama-completion")));
        assert_eq!(build, LlamaBuild::Current);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn legacy_installs_keep_llama_cli_in_build_bin() {
        let dir = scratch_dir("legacy");
        touch(&dir.join("build").join("bin").join(exe("llama-cli")));
        let (path, build) = find_runtime_binary(&dir).unwrap();
        assert_eq!(path, dir.join("build").join("bin").join(exe("llama-cli")));
        assert_eq!(build, LlamaBuild::Legacy);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn finds_binaries_under_a_top_level_release_folder() {
        let dir = scratch_dir("nested");
        touch(&dir.join("llama-b12675").join(exe("llama-completion")));
        let (path, build) = find_runtime_binary(&dir).unwrap();
        assert_eq!(path, dir.join("llama-b12675").join(exe("llama-completion")));
        assert_eq!(build, LlamaBuild::Current);
        assert!(find_runtime_binary(&dir.join("missing")).is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
