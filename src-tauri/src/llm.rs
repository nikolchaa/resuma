use std::process::Command;
use std::path::PathBuf;
use std::env;
use serde_json::Value;

#[cfg(target_os = "windows")]
pub async fn call_llm(prompt: String, llm_settings: Value) -> Result<String, String> {
    let model = llm_settings["model"].as_str().ok_or("Missing model")?;
    let runtime = llm_settings["runtime"].as_str().ok_or("Missing runtime")?;
    let settings = &llm_settings["settings"];

    let appdata = env::var("APPDATA").map_err(|e| format!("Failed to get APPDATA: {}", e))?;
    let model_path = PathBuf::from(&appdata)
        .join("com.resuma.app/models")
        .join(model)
        .join(format!("{}.gguf", model));

    let runtime_path = PathBuf::from(&appdata)
        .join("com.resuma.app/runtimes")
        .join(runtime)
        .join("llama-cli.exe");

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

    if settings.get("flashAttn").and_then(|v| v.as_bool()) == Some(true) {
        args.push("--flash-attn".to_string());
    }

    if let Some(gpu) = settings.get("gpuLayers").and_then(|v| v.as_u64()) {
        args.push("--gpu-layers".to_string());
        args.push(gpu.to_string());
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

#[cfg(not(target_os = "windows"))]
pub async fn call_llm(_prompt: String, _llm_settings: Value) -> Result<String, String> {
    Err("LLM integration is only implemented for Windows in this build.".to_string())
}
