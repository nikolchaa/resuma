use std::process::{Command, Stdio};
use tauri_plugin_hwinfo;
// use sysinfo::System;

#[tauri::command]
async fn run_llama(prompt: String) -> Result<String, String> {
    // Insert prompt into ChatML format
    let chatml_prompt = format!(
        "<|im_start|>system\nYou are a helpful AI assistant.<|im_end|>\n\
<|im_start|>user\n{prompt}<|im_end|>\n\
<|im_start|>assistant"
    );

    // Run the llama-cli binary
    let child = Command::new("llama/llama-cli.exe")
        .args(&[
            "-m",
            "models/model.gguf",
            "-p",
            &chatml_prompt,
            "--gpu-layers",
            "32",
            "--mlock",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start llama-cli.exe: {}", e))?;

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Failed to run llama-cli.exe: {}", e))?;

    let raw_output = String::from_utf8_lossy(&output.stdout).to_string();

    // Formatting the output to extract the assistant's response
    // This assumes the output is in the format "<|im_start|> assistant\n<response>"
    let response = raw_output
        .split("<|im_start|> assistant")
        .nth(1)
        .unwrap_or("")
        .replace("[end of text]", "")
        .trim()
        .to_string();

    Ok(response)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_hwinfo::init())
        .invoke_handler(tauri::generate_handler![run_llama])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
