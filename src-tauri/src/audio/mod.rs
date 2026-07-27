// 原生音频：设备枚举与 rodio 回放

mod player;

use player::{PlayerHandle, PlayerInner};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use cpal::traits::HostTrait;

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
    pub device_id: String,
    pub last_error: Option<String>,
    pub backend: String,
    pub note: String,
}

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

fn ensure_player(state: &AudioState, app: &AppHandle) -> Result<Arc<PlayerHandle>, String> {
    let mut guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
    if guard.is_none() {
        let handle = Arc::new(PlayerInner::start(app.clone())?);
        *guard = Some(Arc::clone(&handle));
        return Ok(handle);
    }
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "player missing".to_string())
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
        exclusive: guard.exclusive,
        device_id: guard.device_id.clone().unwrap_or_else(|| "default".into()),
        last_error: guard.last_error.clone(),
        backend: "wasapi-rodio".into(),
        note: "原生 cpal/WASAPI 输出（rodio）".into(),
    })
}

#[tauri::command]
pub fn audio_set_device(state: State<'_, AudioState>, device_id: String) -> Result<(), String> {
    let mut guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
    guard.device_id = Some(device_id);
    Ok(())
}

#[tauri::command]
pub fn audio_set_exclusive(state: State<'_, AudioState>, exclusive: bool) -> Result<(), String> {
    let mut guard = state.runtime.lock().map_err(|_| "audio lock".to_string())?;
    guard.exclusive = exclusive;
    if exclusive {
        guard.last_error = Some("独占模式将尽力启用；不支持时回退共享".into());
    } else {
        guard.last_error = None;
    }
    Ok(())
}

#[tauri::command]
pub fn audio_probe() -> Result<AudioProbeResult, String> {
    let devices = list_output_devices().unwrap_or_default();
    let host_ok = cpal::default_host().default_output_device().is_some();
    Ok(AudioProbeResult {
        available: host_ok,
        backend: if host_ok {
            "wasapi".into()
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
pub fn audio_load(
    app: AppHandle,
    state: State<'_, AudioState>,
    url_or_path: String,
    kind: String,
) -> Result<(), String> {
    if kind == "remote" || is_remote_url(&url_or_path) {
        return Err("原生引擎仅支持本地文件".into());
    }
    let player = ensure_player(&state, &app)?;
    player.load(url_or_path, false)
}

#[tauri::command]
pub fn audio_play(
    app: AppHandle,
    state: State<'_, AudioState>,
    url_or_path: String,
    kind: String,
) -> Result<(), String> {
    if kind == "remote" || is_remote_url(&url_or_path) {
        return Err("原生引擎仅支持本地文件".into());
    }
    let player = ensure_player(&state, &app)?;
    player.play(url_or_path, false)
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
pub fn audio_seek(
    state: State<'_, AudioState>,
    position_ms: f64,
    resume: Option<bool>,
) -> Result<(), String> {
    let player = {
        let guard = state.player.lock().map_err(|_| "audio lock".to_string())?;
        guard.as_ref().cloned()
    };
    if let Some(player) = player {
        player.seek(position_ms, resume.unwrap_or(false))?;
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

/// 启动 tick 广播，由 PlayerInner 内部线程调用
pub fn emit_tick(app: &AppHandle, payload: AudioTickPayload) {
    let _ = app.emit("audio://tick", payload);
}