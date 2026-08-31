use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopLyricState {
    pub position_ms: u64,
    pub lines: Vec<LyricLine>,
    pub track_title: String,
    pub track_artist: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricLine {
    pub time_ms: u64,
    pub text: String,
    pub translation: Option<String>,
}

pub struct DesktopLyricStateWrapper(Mutex<DesktopLyricState>);

impl DesktopLyricStateWrapper {
    pub fn new() -> Self {
        Self(Mutex::new(DesktopLyricState {
            position_ms: 0,
            lines: vec![],
            track_title: String::new(),
            track_artist: String::new(),
        }))
    }
}

const DESKTOP_LYRIC_WINDOW_LABEL: &str = "desktop-lyric";

pub fn create_desktop_lyric_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let builder = WebviewWindowBuilder::new(
        app,
        DESKTOP_LYRIC_WINDOW_LABEL,
        WebviewUrl::App("desktop-lyric.html".into()),
    )
    .title("Desktop Lyrics")
    .inner_size(400.0, 120.0)
    .resizable(true)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false);

    let window = builder
        .build()
        .map_err(|e| format!("create desktop lyric window: {e}"))?;

    // 无显式定位时默认居中，避免窗口落在屏幕外被误判为「不生效」
    let _ = window.center();

    Ok(window)
}

#[tauri::command]
pub async fn show_desktop_lyric(app: AppHandle) -> Result<(), String> {
    // 必须为 async：同步命令在主线程执行，WebviewWindowBuilder::build()
    // 会等事件循环泵消息，而事件循环正被 IPC 阻塞 → 整个应用死锁卡死
    let window = if let Some(window) = app.get_webview_window(DESKTOP_LYRIC_WINDOW_LABEL) {
        window
    } else {
        create_desktop_lyric_window(&app)?
    };

    window
        .show()
        .map_err(|e| format!("show desktop lyric window: {e}"))?;
    window
        .set_focus()
        .map_err(|e| format!("focus desktop lyric window: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn hide_desktop_lyric(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DESKTOP_LYRIC_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|e| format!("hide desktop lyric window: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn is_desktop_lyric_visible(app: AppHandle) -> Result<bool, String> {
    Ok(app
        .get_webview_window(DESKTOP_LYRIC_WINDOW_LABEL)
        .map(|w| w.is_visible().unwrap_or(false))
        .unwrap_or(false))
}

#[tauri::command]
pub async fn update_desktop_lyric(
    app: AppHandle,
    state: DesktopLyricState,
) -> Result<(), String> {
    let wrapper = app.state::<DesktopLyricStateWrapper>();
    if let Ok(mut current) = wrapper.0.lock() {
        *current = state.clone();
    }

    app.emit("musicstorm:desktop-lyric-update", state)
        .map_err(|e| format!("emit desktop lyric update: {e}"))?;

    Ok(())
}