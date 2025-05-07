use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets},
    DiscordIpc, DiscordIpcClient,
};
use lazy_static::lazy_static;
use std::sync::Mutex;

lazy_static! {
    static ref DISCORD_CLIENT: Mutex<Option<DiscordIpcClient>> = Mutex::new(None);
}

#[tauri::command]
pub fn start_rpc(client_id: String) -> Result<(), String> {
    let mut client = DiscordIpcClient::new(&client_id).map_err(|e| e.to_string())?;
    client.connect().map_err(|e| e.to_string())?;
    *DISCORD_CLIENT.lock().unwrap() = Some(client);
    Ok(())
}

#[tauri::command]
pub fn set_activity(
    details: String,
    state: String,
    small_image: String,
    small_text: String,
) -> Result<(), String> {
    let payload = Activity::new()
        .details(&details)
        .state(&state)
        .activity_type(ActivityType::Playing)
        .assets(
            Assets::new()
                .large_image("resuma")
                .large_text("https://resuma.download")
                .small_image(&small_image)
                .small_text(&small_text),
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
