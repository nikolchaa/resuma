use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets},
    DiscordIpc, DiscordIpcClient,
};
use lazy_static::lazy_static;
use std::sync::Mutex;

lazy_static! {
    static ref DISCORD_CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);
}

const DISCORD_CLIENT_ID: &str = "1368618733454495855";

/// Connects to the local Discord client. Called only by the frontend when the
/// user has turned on "Discord presence" in settings (off by default), so no
/// IPC connection is made otherwise. Async so that connecting never blocks
/// the main thread.
#[tauri::command]
pub async fn start_rpc() -> Result<(), String> {
    if DISCORD_CLIENT.lock().unwrap().is_some() {
        return Ok(());
    }
    let mut client = DiscordIpcClient::new(DISCORD_CLIENT_ID).map_err(|e| e.to_string())?;
    client.connect().map_err(|e| e.to_string())?;
    *DISCORD_CLIENT.lock().unwrap() = Some(client);
    Ok(())
}

#[tauri::command]
pub fn set_activity(
    details: String,
    state: String,
) -> Result<(), String> {
    let payload = Activity::new()
        .details(&details)
        .state(&state)
        .activity_type(ActivityType::Playing)
        .assets(
            Assets::new()
                .large_image("resuma")
                .large_text("https://resuma.download/")
        );

    if let Some(client) = &mut *DISCORD_CLIENT.lock().unwrap() {
        client.set_activity(payload).map_err(|e| e.to_string())
    } else {
        Err("Discord client not connected".into())
    }
}

#[tauri::command]
pub fn stop_rpc() {
    let _ = DISCORD_CLIENT.lock().unwrap().take().map(|mut c| c.close());
}
