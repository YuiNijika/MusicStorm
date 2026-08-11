// 系统托盘 + 全局媒体快捷键
// 托盘菜单 / 快捷键只负责发出指令事件，具体播放逻辑由前端监听执行，
// 避免 Rust 侧重复维护播放状态。
// 全局快捷键支持自定义（设置页录制），配置存 SQLite app_setting(global_shortcuts)。
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
// 仅 macOS 应用菜单用到，其它平台不编译避免 unused import
#[cfg(target_os = "macos")]
use tauri::menu::{MenuItemKind, Submenu};

/// 前端监听的事件名：payload 为 "toggle" | "previous" | "next" | "show"
const PLAYER_COMMAND_EVENT: &str = "musicstorm:player-command";
/// macOS 应用菜单「设置…」点击后广播，前端据此打开设置页
#[cfg(target_os = "macos")]
const OPEN_SETTINGS_EVENT: &str = "musicstorm:open-settings";
/// 全局快捷键配置的 DB key：JSON { "toggle": "Ctrl+Alt+Space", ... }
pub const SHORTCUT_SETTING_KEY: &str = "global_shortcuts";
/// 播放器控制动作（与前端 use-tray-commands 的 payload 一致）
pub const COMMANDS: [&str; 3] = ["toggle", "previous", "next"];
/// 默认快捷键（无自定义配置时）。macOS 默认不抢占系统级按键，
/// 播放快捷键由前台应用按 Apple Music 习惯处理。
#[cfg(target_os = "macos")]
const DEFAULT_SHORTCUTS: [(&str, &str); 3] = [("toggle", ""), ("previous", ""), ("next", "")];
#[cfg(not(target_os = "macos"))]
const DEFAULT_SHORTCUTS: [(&str, &str); 3] = [
    ("toggle", "Ctrl+Alt+Space"),
    ("previous", "Ctrl+Alt+Left"),
    ("next", "Ctrl+Alt+Right"),
];

/// 当前已注册的 action → Shortcut，供注销
pub struct ShortcutRegistry(Mutex<HashMap<String, tauri_plugin_global_shortcut::Shortcut>>);

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShortcutConfig {
    toggle: Option<String>,
    previous: Option<String>,
    next: Option<String>,
}

impl ShortcutConfig {
    fn combo_for(&self, action: &str) -> Option<&str> {
        match action {
            "toggle" => self.toggle.as_deref(),
            "previous" => self.previous.as_deref(),
            "next" => self.next.as_deref(),
            _ => None,
        }
    }

    fn set(&mut self, action: &str, combo: String) {
        match action {
            "toggle" => self.toggle = Some(combo),
            "previous" => self.previous = Some(combo),
            "next" => self.next = Some(combo),
            _ => {}
        }
    }
}

fn default_shortcut_config() -> ShortcutConfig {
    ShortcutConfig {
        toggle: Some(DEFAULT_SHORTCUTS[0].1.to_string()),
        previous: Some(DEFAULT_SHORTCUTS[1].1.to_string()),
        next: Some(DEFAULT_SHORTCUTS[2].1.to_string()),
    }
}

#[cfg(target_os = "macos")]
fn is_legacy_default_config(config: &ShortcutConfig) -> bool {
    config.toggle.as_deref() == Some("Ctrl+Alt+Space")
        && config.previous.as_deref() == Some("Ctrl+Alt+Left")
        && config.next.as_deref() == Some("Ctrl+Alt+Right")
}

pub(crate) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
pub fn setup_macos_menu(app: &AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let settings = MenuItem::with_id(app, "open-settings", "设置…", true, Some("Super+,"))?;

    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        // About 之后、Services 之前是 macOS 标准的 Settings 位置。
        app_menu.insert(&settings, 1)?;
    }

    // 播放按键由 WebView 在非输入控件聚焦时处理，避免原生菜单快捷键
    // 抢占搜索框中的空格、方向键，同时菜单仍提供完整可发现入口。
    let play_pause = MenuItem::with_id(app, "menu-play-pause", "播放 / 暂停", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "menu-previous", "上一首", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "menu-next", "下一首", true, None::<&str>)?;
    let seek_backward =
        MenuItem::with_id(app, "menu-seek-backward", "快退 5 秒", true, None::<&str>)?;
    let seek_forward =
        MenuItem::with_id(app, "menu-seek-forward", "快进 5 秒", true, None::<&str>)?;
    let volume_up = MenuItem::with_id(app, "menu-volume-up", "增大音量", true, None::<&str>)?;
    let volume_down = MenuItem::with_id(app, "menu-volume-down", "减小音量", true, None::<&str>)?;
    let playback_menu = Submenu::with_items(
        app,
        "播放",
        true,
        &[
            &play_pause,
            &previous,
            &next,
            &PredefinedMenuItem::separator(app)?,
            &seek_backward,
            &seek_forward,
            &PredefinedMenuItem::separator(app)?,
            &volume_up,
            &volume_down,
        ],
    )?;
    menu.insert(&playback_menu, 3)?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| match event.id().as_ref() {
        "open-settings" => {
            show_main_window(app);
            let _ = app.emit(OPEN_SETTINGS_EVENT, ());
        }
        "menu-play-pause" => emit_command(app, "toggle"),
        "menu-previous" => emit_command(app, "previous"),
        "menu-next" => emit_command(app, "next"),
        "menu-seek-backward" => emit_command(app, "seek-backward"),
        "menu-seek-forward" => emit_command(app, "seek-forward"),
        "menu-volume-up" => emit_command(app, "volume-up"),
        "menu-volume-down" => emit_command(app, "volume-down"),
        _ => {}
    });

    Ok(())
}

fn emit_command(app: &AppHandle, command: &str) {
    let _ = app.emit(PLAYER_COMMAND_EVENT, command);
}

fn load_config(app: &AppHandle) -> ShortcutConfig {
    if let Ok(conn) = crate::db::open_db(app) {
        let stored: Option<String> = conn
            .query_row(
                "SELECT value FROM app_setting WHERE key = ?1",
                [SHORTCUT_SETTING_KEY],
                |row| row.get(0),
            )
            .ok();
        if let Some(raw) = stored {
            if let Ok(config) = serde_json::from_str::<ShortcutConfig>(&raw) {
                #[cfg(target_os = "macos")]
                if is_legacy_default_config(&config) {
                    return default_shortcut_config();
                }
                return config;
            }
        }
    }
    default_shortcut_config()
}

fn persist_config(app: &AppHandle, config: &ShortcutConfig) {
    if let Ok(conn) = crate::db::open_db(app) {
        if let Ok(json) = serde_json::to_string(config) {
            let _ = conn.execute(
                "INSERT INTO app_setting (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [SHORTCUT_SETTING_KEY, &json],
            );
        }
    }
}

pub fn setup_global_shortcuts(app: &AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    let config = load_config(app);
    let mut registry = HashMap::new();
    for action in COMMANDS {
        let combo = config.combo_for(action).unwrap_or("").trim().to_string();
        if combo.is_empty() {
            continue;
        }
        let shortcut: tauri_plugin_global_shortcut::Shortcut = combo
            .parse()
            .map_err(|error| format!("快捷键解析失败: {error}"))?;
        let action_owned = action.to_string();
        app.global_shortcut()
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                // 前台触发时优先把窗口带回，符合「媒体键唤醒」直觉
                show_main_window(app);
                emit_command(app, &action_owned);
            })
            .map_err(|error| format!("注册快捷键 {combo} 失败: {error}"))?;
        registry.insert(action.to_string(), shortcut);
    }
    // 保存平台默认值，也负责把旧的 Windows 默认组合迁移出 macOS。
    persist_config(app, &config);
    app.manage(ShortcutRegistry(Mutex::new(registry)));
    Ok(())
}

#[tauri::command]
pub fn update_global_shortcut(
    app: AppHandle,
    registry: State<'_, ShortcutRegistry>,
    action: String,
    combo: String,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    if !COMMANDS.contains(&action.as_str()) {
        return Err("未知快捷键动作".into());
    }

    let mut guard = registry
        .0
        .lock()
        .map_err(|_| "快捷键状态锁冲突".to_string())?;

    // 注销旧的（如已注册）
    if let Some(old) = guard.remove(&action) {
        let _ = app.global_shortcut().unregister(old);
    }

    // 空串 = 关闭该动作的快捷键
    if combo.trim().is_empty() {
        let mut config = load_config(&app);
        config.set(&action, String::new());
        persist_config(&app, &config);
        return Ok(());
    }

    let shortcut: tauri_plugin_global_shortcut::Shortcut = combo
        .trim()
        .parse()
        .map_err(|error| format!("无效快捷键组合: {error}"))?;

    let action_owned = action.clone();
    app.global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            show_main_window(app);
            emit_command(app, &action_owned);
        })
        .map_err(|error| format!("注册失败，可能与其他应用或本应用冲突: {error}"))?;

    guard.insert(action.clone(), shortcut);
    let mut config = load_config(&app);
    config.set(&action, combo.trim().to_string());
    persist_config(&app, &config);
    Ok(())
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let play_pause = MenuItem::with_id(app, "play-pause", "播放 / 暂停", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "上一首", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "下一首", true, None::<&str>)?;
    let quit = PredefinedMenuItem::quit(app, Some("退出"))?;
    let menu = Menu::with_items(app, &[&show, &play_pause, &previous, &next, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("icon".into()))?;

    let tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("MusicStorm")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "play-pause" => emit_command(app, "toggle"),
            "previous" => emit_command(app, "previous"),
            "next" => emit_command(app, "next"),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    tray.set_visible(true)?;
    Ok(())
}
