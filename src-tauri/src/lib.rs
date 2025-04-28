use std::process::{Command, Stdio};
use tauri_plugin_hwinfo;
use std::fs::File;
use zip::ZipArchive;
use std::path::PathBuf;

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

#[tauri::command]
async fn unzip_file(source: String, target: String) -> Result<(), String> {
    let file = File::open(&source).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = PathBuf::from(&target).join(file.name());

        if (&*file.name()).ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_hwinfo::init())
        .invoke_handler(tauri::generate_handler![run_llama, unzip_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
