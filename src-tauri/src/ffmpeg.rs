use crate::db::DbState;
use rusqlite::params;
use serde::Serialize;
use std::env;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::State;

const FFMPEG_PATH_KEY: &str = "decoder.ffmpeg_path";
const VALIDATION_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FfmpegStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
    pub source: String,
    pub error: Option<String>,
}

fn configured_path(state: &DbState) -> Result<Option<PathBuf>, String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let value = match conn.query_row(
        "SELECT value FROM app_setting WHERE key = ?1",
        params![FFMPEG_PATH_KEY],
        |row| row.get::<_, String>(0),
    ) {
        Ok(value) => value,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    let trimmed = value.trim();
    Ok((!trimmed.is_empty()).then(|| PathBuf::from(trimmed)))
}

fn save_configured_path(state: &DbState, path: Option<&Path>) -> Result<(), String> {
    let value = path
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_default();
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    conn.execute(
        "INSERT INTO app_setting (key, value) VALUES (?1, ?2)\n         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![FFMPEG_PATH_KEY, value],
    )
    .map_err(|error| error.to_string())?;
    Ok(())
}

fn executable_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(path) = env::var_os("FFMPEG_PATH") {
        candidates.push(PathBuf::from(path));
    }
    if let Some(paths) = env::var_os("PATH") {
        for directory in env::split_paths(&paths) {
            #[cfg(windows)]
            candidates.push(directory.join("ffmpeg.exe"));
            #[cfg(not(windows))]
            candidates.push(directory.join("ffmpeg"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        // Finder 启动的 .app 通常拿不到 shell 的 Homebrew PATH。
        candidates.push(PathBuf::from("/opt/homebrew/bin/ffmpeg"));
        candidates.push(PathBuf::from("/usr/local/bin/ffmpeg"));
    }
    candidates
}

fn executable_file(path: &Path) -> bool {
    fs::metadata(path).map(|metadata| metadata.is_file()).unwrap_or(false)
}

fn version_line(path: &Path) -> Result<String, String> {
    if !executable_file(path) {
        return Err("FFmpeg 可执行文件不存在".into());
    }

    let mut child = Command::new(path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("无法启动 FFmpeg: {error}"))?;
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() < VALIDATION_TIMEOUT => {
                thread::sleep(Duration::from_millis(30));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("FFmpeg 检测超时".into());
            }
            Err(error) => return Err(format!("FFmpeg 检测失败: {error}")),
        }
    };

    let mut output = String::new();
    if let Some(mut stdout) = child.stdout.take() {
        let _ = stdout.read_to_string(&mut output);
    }
    if output.trim().is_empty() {
        if let Some(mut stderr) = child.stderr.take() {
            let _ = stderr.read_to_string(&mut output);
        }
    }
    if !status.success() {
        return Err(format!("FFmpeg 返回状态 {status}"));
    }
    output
        .lines()
        .find(|line| line.to_ascii_lowercase().starts_with("ffmpeg version"))
        .map(str::trim)
        .map(str::to_string)
        .ok_or_else(|| "该文件不是有效的 FFmpeg 可执行程序".to_string())
}

fn status_for(path: PathBuf, source: &str) -> FfmpegStatus {
    match version_line(&path) {
        Ok(version) => FfmpegStatus {
            available: true,
            path: Some(path.to_string_lossy().into_owned()),
            version: Some(version),
            source: source.into(),
            error: None,
        },
        Err(error) => FfmpegStatus {
            available: false,
            path: Some(path.to_string_lossy().into_owned()),
            version: None,
            source: source.into(),
            error: Some(error),
        },
    }
}

#[cfg(not(target_os = "android"))]
pub fn resolve_ffmpeg_path(state: &DbState) -> Result<Option<PathBuf>, String> {
    if let Some(path) = configured_path(state)? {
        if version_line(&path).is_ok() {
            return Ok(Some(path));
        }
    }
    for path in executable_candidates() {
        if executable_file(&path) && version_line(&path).is_ok() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn ffmpeg_detect(state: State<'_, DbState>) -> Result<FfmpegStatus, String> {
    let configured_error = if let Some(path) = configured_path(&state)? {
        let status = status_for(path, "configured");
        if status.available {
            return Ok(status);
        }
        status.error
    } else {
        None
    };
    for path in executable_candidates() {
        if !executable_file(&path) {
            continue;
        }
        let status = status_for(path, "environment");
        if status.available {
            return Ok(status);
        }
    }
    Ok(FfmpegStatus {
        available: false,
        path: None,
        version: None,
        source: "missing".into(),
        error: Some(configured_error.unwrap_or_else(|| {
            "未在环境变量或 PATH 中发现 FFmpeg".into()
        })),
    })
}

#[tauri::command]
pub fn ffmpeg_validate(path: String) -> Result<FfmpegStatus, String> {
    Ok(status_for(PathBuf::from(path.trim()), "manual"))
}

#[tauri::command]
pub fn ffmpeg_set_path(
    state: State<'_, DbState>,
    path: Option<String>,
) -> Result<FfmpegStatus, String> {
    let selected = path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    if let Some(path) = selected.as_deref() {
        version_line(path)?;
    }
    save_configured_path(&state, selected.as_deref())?;
    ffmpeg_detect(state)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn pick_ffmpeg_executable() -> Result<Option<String>, String> {
    let dialog = rfd::FileDialog::new().set_title("选择 FFmpeg 可执行文件");
    #[cfg(windows)]
    let dialog = dialog.add_filter("FFmpeg", &["exe"]);
    Ok(dialog
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned()))
}
