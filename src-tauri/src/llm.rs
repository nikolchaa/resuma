use std::process::Command;
use std::path::PathBuf;
use serde_json::Value;
use dirs_next::data_dir;

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

    let model_path = app_data
        .join("models")
        .join(&normalized_model)
        .join(format!("{}.gguf", model));

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

    if !is_cpu_runtime {
        if settings.get("flashAttn").and_then(|v| v.as_bool()) == Some(true) {
            args.push("--flash-attn".to_string());
        }

        if let Some(gpu) = settings.get("gpuLayers").and_then(|v| v.as_u64()) {
            args.push("--gpu-layers".to_string());
            args.push(gpu.to_string());
        }
    }

    if settings.get("mlock").and_then(|v| v.as_bool()) == Some(true) {
        args.push("--mlock".to_string());
    }

    if settings.get("noMmap").and_then(|v| v.as_bool()) == Some(true) {
        args.push("--no-mmap".to_string());
    }

    let output = Command::new(runtime_path)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute process: {}", e))?;

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

fn get_app_data_path() -> Result<PathBuf, String> {
    data_dir()
        .map(|base| base.join("com.resuma.app"))
        .ok_or("Failed to resolve platform-specific app data directory.".to_string())
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
