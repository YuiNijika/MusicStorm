// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// 本地扫描 / 存储 / 播放 / 网易云代理入口
mod audio;
mod db;
mod local_meta;
mod netease_proxy;

use audio::{
    audio_get_output_mode, audio_list_devices, audio_load, audio_pause, audio_play, audio_probe,
    audio_seek, audio_set_device, audio_set_exclusive, audio_set_volume, audio_stop, AudioState,
};
use db::{
    api_cache_clear, api_cache_get, api_cache_purge_expired, api_cache_set, db_end_play_session,
    db_get_listen_stats, db_get_setting, db_list_listen_stats, db_list_top_tracks,
    db_listen_source_breakdown, db_set_setting, db_start_play_session, db_upsert_folder,
    db_upsert_tracks, ensure_storage_paths, get_storage_paths, open_db, purge_expired_api_cache,
    DbState,
};
use netease_proxy::netease_http_post;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

const AUDIO_EXTS: &[&str] = &[
    // 常用
    "mp3", "wav", "aac", "m4a", "flac", "ogg", "wma",
    // 无损与高保真，diff 与 dff 均收录
    "aif", "aiff", "ape", "alac", "wv", "dsf", "dff", "diff", "tta",
    // 有损
    "mp2", "mp1", "ra", "rm", "ram", "m4p", "opus",
    // 模块与合成
    "mid", "midi", "mod", "xm", "s3m", "it",
    // 其他
    "au", "voc", "cda", "amr", "gsm", "raw", "pcm", "mpga", "3gp", "3g2",
];
const MAX_TRACKS: usize = 2_000;
const MAX_DEPTH: usize = 8;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalScanTrack {
    id: String,
    title: String,
    artist: String,
    album: String,
    path: String,
    duration_ms: u64,
    /// 内嵌封面落盘绝对路径
    cover_path: Option<String>,
    /// 内嵌或 sidecar 歌词全文
    lyric_text: Option<String>,
    /// sidecar lrc 路径
    lrc_path: Option<String>,
    /// 无扩展名文件名，统计归类
    file_name: Option<String>,
    /// 内容 MD5，相同文件合并听歌统计
    content_hash: Option<String>,
}

/// 系统文件夹选择器；取消时返回 null
#[tauri::command]
fn pick_music_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择音乐文件夹")
        .pick_folder();
    Ok(folder.map(|path| path.to_string_lossy().into_owned()))
}

/// 选择本地封面图片并返回 data URL
#[tauri::command]
fn pick_image_as_base64() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .set_title("选择封面图片")
        .add_filter("图片", &["png", "jpg", "jpeg", "webp", "gif", "bmp"])
        .pick_file();

    let Some(path) = file else {
        return Ok(None);
    };
    Ok(Some(read_image_as_data_url(&path)?))
}

/// 选择 .lrc / 文本并返回全文
#[tauri::command]
fn pick_text_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .set_title("选择歌词文件")
        .add_filter("歌词", &["lrc", "txt", "LRC", "TXT"])
        .pick_file();
    let Some(path) = file else {
        return Ok(None);
    };
    Ok(Some(read_text_file(path.to_string_lossy().into_owned())?))
}

/// 下载远程 URL 到用户选择的保存路径
#[tauri::command]
fn save_url_to_file(url: String, default_name: String) -> Result<Option<String>, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("下载地址为空".into());
    }
    let safe_name = default_name
        .chars()
        .map(|c| {
            if r#"<>:"/\|?*"#.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect::<String>();
    let name = if safe_name.trim().is_empty() {
        "track.mp3".into()
    } else {
        safe_name
    };

    let path = rfd::FileDialog::new()
        .set_title("保存歌曲")
        .set_file_name(&name)
        .save_file();
    let Some(path) = path else {
        return Ok(None);
    };

    let bytes = reqwest::blocking::get(url)
        .map_err(|e| format!("下载失败: {e}"))?
        .error_for_status()
        .map_err(|e| format!("下载失败: {e}"))?
        .bytes()
        .map_err(|e| format!("读取失败: {e}"))?;

    if bytes.is_empty() {
        return Err("文件为空".into());
    }
    if bytes.len() > 200 * 1024 * 1024 {
        return Err("文件过大".into());
    }

    std::fs::write(&path, &bytes).map_err(|e| format!("写入失败: {e}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

fn read_image_as_data_url(path: &Path) -> Result<String, String> {
    if !path.is_file() {
        return Err("图片文件不存在".into());
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| "jpg".into());

    let mime_type = match extension.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    };

    use base64::{engine::general_purpose, Engine as _};
    let data = std::fs::read(path).map_err(|error| format!("读取图片失败: {error}"))?;
    if data.len() > 4 * 1024 * 1024 {
        return Err("图片过大（超过 4MB）".into());
    }
    let b64 = general_purpose::STANDARD.encode(&data);
    Ok(format!("data:{mime_type};base64,{b64}"))
}

/// 读取本地文本，兼容 BOM 与常见编码
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path.trim());
    if !path.is_file() {
        return Err("文件不存在".into());
    }
    let data = std::fs::read(&path).map_err(|e| format!("读取失败: {e}"))?;
    if data.len() > 1024 * 1024 {
        return Err("文件过大".into());
    }
    // UTF-8 BOM
    if data.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return std::str::from_utf8(&data[3..])
            .map(|s| s.to_string())
            .map_err(|_| "不是有效 UTF-8 文本".into());
    }
    // UTF-16 LE
    if data.starts_with(&[0xFF, 0xFE]) && data.len() >= 4 {
        let u16s: Vec<u16> = data[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        return String::from_utf16(&u16s).map_err(|_| "不是有效 UTF-16 文本".into());
    }
    match String::from_utf8(data.clone()) {
        Ok(s) => Ok(s),
        Err(_) => Ok(String::from_utf8_lossy(&data).into_owned()),
    }
}

/// 递归扫描音频：tag 失败仍入库；后缀见 AUDIO_EXTS
#[tauri::command]
fn scan_music_folder(app: AppHandle, path: String) -> Result<Vec<LocalScanTrack>, String> {
    let root = PathBuf::from(path.trim());
    if !root.is_dir() {
        return Err("不是有效文件夹".into());
    }

    let storage = ensure_storage_paths(&app)?;
    let covers_dir = storage.cache_dir.join("covers");
    let lyrics_dir = storage.cache_dir.join("lyrics");
    let _ = std::fs::create_dir_all(&covers_dir);
    let _ = std::fs::create_dir_all(&lyrics_dir);

    let mut tracks = Vec::new();
    scan_dir(
        &root,
        &root,
        &covers_dir,
        &lyrics_dir,
        &mut tracks,
        0,
    )?;
    tracks.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then_with(|| a.artist.to_lowercase().cmp(&b.artist.to_lowercase()))
    });
    Ok(tracks)
}

fn scan_dir(
    root: &Path,
    dir: &Path,
    covers_dir: &Path,
    lyrics_dir: &Path,
    out: &mut Vec<LocalScanTrack>,
    depth: usize,
) -> Result<(), String> {
    if depth > MAX_DEPTH || out.len() >= MAX_TRACKS {
        return Ok(());
    }

    let entries = std::fs::read_dir(dir).map_err(|error| format!("无法读取目录: {error}"))?;
    for entry in entries.flatten() {
        if out.len() >= MAX_TRACKS {
            break;
        }

        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            scan_dir(root, &path, covers_dir, lyrics_dir, out, depth + 1)?;
            continue;
        }

        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .unwrap_or_default();

        if !AUDIO_EXTS.contains(&ext.as_str()) {
            continue;
        }

        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("未知曲目");
        let (fallback_artist, fallback_title) = parse_filename(stem);
        let fallback_album = path
            .parent()
            .filter(|parent| *parent != root)
            .and_then(|parent| parent.file_name())
            .and_then(|value| value.to_str())
            .unwrap_or("本地文件")
            .to_string();

        let file_meta = local_meta::read_audio_meta(&path, covers_dir, lyrics_dir);
        let absolute = path.to_string_lossy().into_owned();
        // 归类键用 stem，不带后缀
        let file_name = {
            let s = stem.trim();
            if s.is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        };
        let content_hash = file_content_md5(&path);

        out.push(LocalScanTrack {
            id: format!("local:{absolute}"),
            title: file_meta.title.unwrap_or(fallback_title),
            artist: file_meta.artist.unwrap_or(fallback_artist),
            album: file_meta.album.unwrap_or(fallback_album),
            path: absolute,
            duration_ms: file_meta.duration_ms,
            cover_path: file_meta.cover_path,
            lyric_text: file_meta.lyric_text,
            lrc_path: file_meta.lrc_path,
            file_name,
            content_hash,
        });
    }

    Ok(())
}

// 流式哈希：大文件不全量读入内存；失败不阻断扫描
fn file_content_md5(path: &Path) -> Option<String> {
    use md5::{Digest, Md5};
    use std::io::Read;

    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = Md5::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Some(format!("{:x}", hasher.finalize()))
}

// 常见 `艺人 - 曲名` 命名；无分隔则整段当标题
fn parse_filename(stem: &str) -> (String, String) {
    let separators = [" - ", " – ", " — ", " _ "];
    for sep in separators {
        if let Some((left, right)) = stem.split_once(sep) {
            let artist = left.trim();
            let title = right.trim();
            if !artist.is_empty() && !title.is_empty() {
                return (artist.to_string(), title.to_string());
            }
        }
    }
    ("未知艺人".into(), stem.trim().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = open_db(app.handle())?;
            let _ = purge_expired_api_cache(app.handle(), &conn);
            app.manage(DbState(Mutex::new(conn)));
            app.manage(AudioState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_music_folder,
            pick_image_as_base64,
            pick_text_file,
            save_url_to_file,
            read_text_file,
            scan_music_folder,
            get_storage_paths,
            db_upsert_folder,
            db_upsert_tracks,
            db_start_play_session,
            db_end_play_session,
            db_get_listen_stats,
            db_list_listen_stats,
            db_list_top_tracks,
            db_listen_source_breakdown,
            db_get_setting,
            db_set_setting,
            api_cache_get,
            api_cache_set,
            api_cache_clear,
            api_cache_purge_expired,
            audio_list_devices,
            audio_get_output_mode,
            audio_set_device,
            audio_set_exclusive,
            audio_probe,
            audio_load,
            audio_play,
            audio_pause,
            audio_seek,
            audio_set_volume,
            audio_stop,
            netease_http_post,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}