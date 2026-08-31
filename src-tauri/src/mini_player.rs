use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniPlayerState {
    pub title: String,
    pub artist: String,
    pub cover_url: Option<String>,
    pub is_playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
}

pub struct MiniPlayerStateWrapper(Mutex<MiniPlayerState>);

impl MiniPlayerStateWrapper {
    pub fn new() -> Self {
        Self(Mutex::new(MiniPlayerState {
            title: String::new(),
            artist: String::new(),
            cover_url: None,
            is_playing: false,
            position_ms: 0,
            duration_ms: 0,
        }))
    }
}

const MINI_PLAYER_WINDOW_LABEL: &str = "mini-player";

pub fn create_mini_player_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let builder = WebviewWindowBuilder::new(
        app,
        MINI_PLAYER_WINDOW_LABEL,
        WebviewUrl::App("mini-player.html".into()),
    )
    .title("MusicStorm Mini Player")
    .inner_size(380.0, 110.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .visible(false);

    let window = builder
        .build()
        .map_err(|e| format!("create mini player window: {e}"))?;

    // 无显式定位时默认居中，避免窗口落在屏幕外被误判为「不生效」
    let _ = window.center();

    Ok(window)
}

#[tauri::command]
pub async fn show_mini_player(app: AppHandle) -> Result<(), String> {
    // 必须为 async：同步命令在主线程执行，WebviewWindowBuilder::build()
    // 会等事件循环泵消息，而事件循环正被 IPC 阻塞 → 整个应用死锁卡死
    let window = if let Some(window) = app.get_webview_window(MINI_PLAYER_WINDOW_LABEL) {
        window
    } else {
        create_mini_player_window(&app)?
    };

    window
        .show()
        .map_err(|e| format!("show mini player window: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn hide_mini_player(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MINI_PLAYER_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|e| format!("hide mini player window: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn is_mini_player_visible(app: AppHandle) -> Result<bool, String> {
    Ok(app
        .get_webview_window(MINI_PLAYER_WINDOW_LABEL)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false))
}

#[tauri::command]
pub async fn update_mini_player(app: AppHandle, state: MiniPlayerState) -> Result<(), String> {
    let wrapper = app.state::<MiniPlayerStateWrapper>();
    if let Ok(mut current) = wrapper.0.lock() {
        *current = state.clone();
    }

    app.emit("musicstorm:mini-player-state", state)
        .map_err(|e| format!("emit mini player state: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn get_mini_player_state(app: AppHandle) -> Result<MiniPlayerState, String> {
    let wrapper = app.state::<MiniPlayerStateWrapper>();
    if let Ok(current) = wrapper.0.lock() {
        return Ok(current.clone());
    }
    Ok(MiniPlayerState {
        title: String::new(),
        artist: String::new(),
        cover_url: None,
        is_playing: false,
        position_ms: 0,
        duration_ms: 0,
    })
}
