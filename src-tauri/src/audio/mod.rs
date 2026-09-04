mod eq;
mod player;
#[cfg(target_os = "windows")]
mod wasapi_exclusive;

use crate::db::DbState;
use crate::ffmpeg::resolve_ffmpeg_path;
use cpal::traits::HostTrait;
use player::{PlayerHandle, PlayerInner};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDeviceInfo {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Default)]
pub struct AudioRuntime {
    pub exclusive: bool,
    pub device_id: Option<String>,
    pub last_error: Option<String>,
}

pub struct AudioState {
    pub runtime: Mutex<AudioRuntime>,
    pub player: Mutex<Option<Arc<PlayerHandle>>>,
}

impl Default for AudioState {
    fn default() -> Self {
        Self {
            runtime: Mutex::new(AudioRuntime::default()),
            player: Mutex::new(None),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioRuntimeDto {
    pub exclusive: bool,
    pub supports_exclusive: bool,
    pub device_id: String,
    pub last_error: Option<String>,
    pub backend: String,
    pub note: String,
}

#[cfg(target_os = "windows")]
const AUDIO_BACKEND: &str = "wasapi";
#[cfg(any(target_os = "macos", target_os = "ios"))]
const AUDIO_BACKEND: &str = "coreaudio";
#[cfg(target_os = "linux")]
const AUDIO_BACKEND: &str = "cpal";
#[cfg(not(any(
    target_os = "windows",
    target_os = "macos",
    target_os = "ios",
    target_os = "linux"
)))]
const AUDIO_BACKEND: &str = "cpal";

#[cfg(target_os = "windows")]
const AUDIO_BACKEND_NOTE: &str = "原生 cpal/WASAPI 输出（rodio）";
#[cfg(any(target_os = "macos", target_os = "ios"))]
const AUDIO_BACKEND_NOTE: &str = "原生 cpal/CoreAudio 输出（rodio）";
#[cfg(target_os = "linux")]
const AUDIO_BACKEND_NOTE: &str = "原生 cpal 音频输出（rodio）";
#[cfg(not(any(
    target_os = "windows",
    target_os = "macos",
    target_os = "ios",
    target_os = "linux"
)))]
const AUDIO_BACKEND_NOTE: &str = "原生 cpal 音频输出（rodio）";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioProbeResult {
    pub available: bool,
    pub backend: String,
    pub devices: Vec<AudioDeviceInfo>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTickPayload {
    pub position_ms: f64,
    pub duration_ms: f64,
    pub ended: bool,
}

fn ensure_player(
    state: &AudioState,
    db: &DbState,
    app: &AppHandle,
) -> Result<Arc<PlayerHandle>, String> {
    let mut guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
    if guard.is_none() {
        // 输出流创建时决定独占/共享，创建前读取当前标志
        let exclusive = state
            .runtime
            .lock()
            .map(|runtime| runtime.exclusive)
            .unwrap_or(false);
        let ffmpeg_path = resolve_ffmpeg_path(db).ok().flatten();
        let handle = Arc::new(PlayerInner::start(app.clone(), ffmpeg_path, exclusive)?);
        *guard = Some(Arc::clone(&handle));
        return Ok(handle);
    }
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "player missing".to_string())
}

/// 停掉旧播放器并按当前独占标志重建，让输出模式真正生效。
/// 必须先释放旧播放器：独占模式下旧流仍占用 WASAPI 设备，
/// 若先开新流会撞上 AUDCLNT_E_DEVICE_IN_USE 导致切换失败。
fn restart_player(state: &AudioState, db: &DbState, app: &AppHandle) -> Result<(), String> {
    let exclusive = state
        .runtime
        .lock()
        .map(|runtime| runtime.exclusive)
        .unwrap_or(false);
    let ffmpeg_path = resolve_ffmpeg_path(db).ok().flatten();
    // 释放旧播放器：worker 随 channel 关闭退出，独占流随之释放设备
    {
        let mut guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        *guard = None;
    }
    // 旧 worker 退出并释放 WASAPI 独占设备需要时间，稍等避免新流打开竞争
    std::thread::sleep(std::time::Duration::from_millis(150));
    let handle = Arc::new(PlayerInner::start(app.clone(), ffmpeg_path, exclusive)?);
    let mut guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
    *guard = Some(Arc::clone(&handle));
    Ok(())
}

fn is_remote_url(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

#[tauri::command]
pub fn audio_list_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    list_output_devices()
}

fn list_output_devices() -> Result<Vec<AudioDeviceInfo>, String> {
    use cpal::traits::{DeviceTrait, HostTrait};

    let host = cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let mut devices = vec![AudioDeviceInfo {
        id: "default".into(),
        name: "系统默认输出".into(),
        is_default: true,
    }];

    if let Ok(iter) = host.output_devices() {
        for (index, device) in iter.enumerate() {
            let name = device.name().unwrap_or_else(|_| format!("输出 {index}"));
            let is_default = !default_name.is_empty() && name == default_name;
            devices.push(AudioDeviceInfo {
                id: format!("out-{index}"),
                name,
                is_default,
            });
        }
    }

    Ok(devices)
}

#[tauri::command]
pub fn audio_get_output_mode(state: State<'_, AudioState>) -> Result<AudioRuntimeDto, String> {
    let guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
    Ok(AudioRuntimeDto {
        exclusive: cfg!(target_os = "windows") && guard.exclusive,
        supports_exclusive: cfg!(target_os = "windows"),
        device_id: guard.device_id.clone().unwrap_or_else(|| "default".into()),
        last_error: guard.last_error.clone(),
        backend: AUDIO_BACKEND.into(),
        note: AUDIO_BACKEND_NOTE.into(),
    })
}

#[tauri::command]
pub fn audio_set_device(state: State<'_, AudioState>, device_id: String) -> Result<(), String> {
    let mut guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
    guard.device_id = Some(device_id);
    Ok(())
}

#[tauri::command]
pub fn audio_set_exclusive(
    app: AppHandle,
    state: State<'_, AudioState>,
    db: State<'_, DbState>,
    exclusive: bool,
) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (state, db, app, exclusive);
        return Err("当前平台不支持 WASAPI 独占模式".into());
    }

    #[cfg(target_os = "windows")]
    {
        let same = {
            let guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
            guard.exclusive == exclusive
        };
        if !same {
            // 输出流创建时读取运行时标志，必须先落新标志再重建播放器，
            // 否则重建时读到的仍是旧值，独占/共享切换永远不生效
            {
                let mut guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
                guard.exclusive = exclusive;
            }
            // 重建失败时回滚标志，保证界面状态与真实输出一致
            if let Err(error) = restart_player(&state, &db, &app) {
                let mut guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
                guard.exclusive = !exclusive;
                guard.last_error = Some(error.clone());
                return Err(error);
            }
            let mut guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
            guard.last_error = if exclusive {
                Some("独占模式将尽力启用；不支持时回退共享".into())
            } else {
                None
            };
        }
        Ok(())
    }
}

#[tauri::command]
pub fn audio_probe() -> Result<AudioProbeResult, String> {
    let devices = list_output_devices().unwrap_or_default();
    let host_ok = cpal::default_host().default_output_device().is_some();
    Ok(AudioProbeResult {
        available: host_ok,
        backend: if host_ok {
            AUDIO_BACKEND.into()
        } else {
            "none".into()
        },
        devices,
        message: if host_ok {
            None
        } else {
            Some("无可用输出设备".into())
        },
    })
}

#[tauri::command]
pub async fn audio_load(
    app: AppHandle,
    state: State<'_, AudioState>,
    db: State<'_, DbState>,
    url_or_path: String,
    kind: String,
) -> Result<(), String> {
    if kind == "remote" || is_remote_url(&url_or_path) {
        return Err("原生引擎仅支持本地文件".into());
    }
    let player = ensure_player(&state, &db, &app)?;
    player.set_ffmpeg_path(resolve_ffmpeg_path(&db).ok().flatten());
    // 等待 worker 打开解码源可能耗时（慢盘/大文件），移到阻塞线程池，避免卡主线程冻结 UI
    tauri::async_runtime::spawn_blocking(move || player.load(url_or_path, false))
        .await
        .map_err(|e| format!("音频任务失败: {e}"))?
}

#[tauri::command]
pub async fn audio_play(
    app: AppHandle,
    state: State<'_, AudioState>,
    db: State<'_, DbState>,
    url_or_path: String,
    kind: String,
) -> Result<(), String> {
    if kind == "remote" || is_remote_url(&url_or_path) {
        return Err("原生引擎仅支持本地文件".into());
    }
    let player = ensure_player(&state, &db, &app)?;
    player.set_ffmpeg_path(resolve_ffmpeg_path(&db).ok().flatten());
    // 等待 worker 解码打开可能耗时（probe + 预建索引），阻塞线程池执行，UI 保持响应
    tauri::async_runtime::spawn_blocking(move || player.play(url_or_path, false))
        .await
        .map_err(|e| format!("音频任务失败: {e}"))?
}

#[tauri::command]
pub fn audio_pause(state: State<'_, AudioState>) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        player.pause();
    }
    Ok(())
}

#[tauri::command]
pub async fn audio_seek(
    state: State<'_, AudioState>,
    position_ms: f64,
    resume: Option<bool>,
) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        // 无缓冲时 seek 会重开解码源（symphonia 容器 seek），阻塞线程池执行避免卡 UI
        let result = tauri::async_runtime::spawn_blocking(move || {
            player.seek(position_ms, resume.unwrap_or(false))
        })
        .await
        .map_err(|e| format!("音频任务失败: {e}"))?;
        result?;
    }
    Ok(())
}

#[tauri::command]
pub fn audio_set_volume(state: State<'_, AudioState>, volume: f32) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        player.set_volume(volume);
    }
    Ok(())
}

#[tauri::command]
pub fn audio_set_speed(state: State<'_, AudioState>, rate: f32) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        player.set_speed(rate);
    }
    Ok(())
}

/// 设置 10 段均衡器增益；enabled 关闭时等效平直
#[tauri::command]
pub fn audio_set_eq(
    state: State<'_, AudioState>,
    gains: Vec<f32>,
    enabled: bool,
) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        player.set_eq(&gains, enabled);
    }
    Ok(())
}

#[tauri::command]
pub fn audio_stop(state: State<'_, AudioState>) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        player.stop();
    }
    Ok(())
}

pub fn emit_tick(app: &AppHandle, payload: AudioTickPayload) {
    let _ = app.emit("audio://tick", payload);
}

pub fn emit_ended(app: &AppHandle) {
    let _ = app.emit("audio://ended", ());
}
