// 本地扫描 / 存储 / 播放 / 网易云代理入口
mod audio;
mod cover_cache;
mod db;
mod ffmpeg;
mod local_meta;
mod netease_proxy;
mod tray;

use audio::{
    audio_get_output_mode, audio_list_devices, audio_load, audio_pause, audio_play, audio_probe,
    audio_seek, audio_set_device, audio_set_exclusive, audio_set_volume, audio_stop, AudioState,
};
use cover_cache::{
    cache_cover_data_url, cache_cover_url, clear_cover_cache, pick_cover_image,
    purge_cover_cache,
};
use db::{
    api_cache_clear, api_cache_get, api_cache_purge_expired, api_cache_set, db_end_play_session,
    db_get_listen_stats, db_get_setting, db_list_listen_stats, db_list_top_tracks,
    db_listen_source_breakdown, db_set_setting, db_start_play_session, db_upsert_folder,
    db_upsert_tracks, ensure_storage_paths, get_storage_paths, open_db, purge_expired_api_cache,
    DbState,
};
use netease_proxy::netease_http_post;
use ffmpeg::{ffmpeg_detect, ffmpeg_set_path, ffmpeg_validate, pick_ffmpeg_executable};
use rayon::prelude::*;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

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
const MIN_SCAN_THREADS: usize = 2;
const MAX_SCAN_THREADS: usize = 6;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalScanTrack {
    id: String,
    title: String,
    artist: String,
    album: String,
    path: String,
    duration_ms: u64,
    /// 封面原图缓存绝对路径
    cover_path: Option<String>,
    /// 列表缩略图缓存绝对路径
    cover_thumbnail_path: Option<String>,
    /// 内嵌或 sidecar 歌词全文
    lyric_text: Option<String>,
    /// sidecar lrc 路径
    lrc_path: Option<String>,
    /// 无扩展名文件名，统计归类
    file_name: Option<String>,
    /// 内容 MD5，相同文件合并听歌统计
    content_hash: Option<String>,
}

/// 打开 WebView DevTools；release 构建需启用 tauri "devtools" feature
#[tauri::command]
fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
    Ok(())
}

/// 系统文件夹选择器；取消时返回 null
#[tauri::command]
fn pick_music_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择音乐文件夹")
        .pick_folder();
    Ok(folder.map(|path| path.to_string_lossy().into_owned()))
}

/// 多选音频文件；取消时返回 null
#[tauri::command]
fn pick_music_files() -> Result<Option<Vec<String>>, String> {
    let files = rfd::FileDialog::new()
        .set_title("选择音乐文件")
        .add_filter("音频", AUDIO_EXTS)
        .pick_files();
    Ok(files.map(|paths| {
        paths
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect()
    }))
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
    local_meta::decode_text_bytes(&data).ok_or_else(|| "歌词文件为空或编码不受支持".into())
}

/// 递归扫描音频：先收集路径，再用有界线程池并行读取元数据
#[tauri::command]
async fn scan_music_folder(
    app: AppHandle,
    path: String,
) -> Result<Vec<LocalScanTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(path.trim());
        if !root.is_dir() {
            return Err("不是有效文件夹".into());
        }

        let (covers_dir, lyrics_dir) = media_cache_dirs(&app)?;
        let mut paths = Vec::new();
        collect_audio_paths(&root, &mut paths, 0)?;
        Ok(scan_audio_paths(
            paths,
            &root,
            &covers_dir,
            &lyrics_dir,
            Some(&app),
        ))
    })
    .await
    .map_err(|error| format!("扫描任务失败: {error}"))?
}

/// 扫描指定音频文件列表（不限同一文件夹）
#[tauri::command]
async fn scan_music_files(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<LocalScanTrack>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (covers_dir, lyrics_dir) = media_cache_dirs(&app)?;
        let paths = paths
            .into_iter()
            .take(MAX_TRACKS)
            .map(|raw| PathBuf::from(raw.trim()))
            .filter(|path| is_audio_file(path))
            .collect::<Vec<_>>();
        Ok(scan_audio_paths_with_parents(
            paths,
            &covers_dir,
            &lyrics_dir,
            Some(&app),
        ))
    })
    .await
    .map_err(|error| format!("扫描任务失败: {error}"))?
}

fn media_cache_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let storage = ensure_storage_paths(app)?;
    let covers_dir = storage.cache_dir.join("covers");
    let lyrics_dir = storage.cache_dir.join("lyrics");
    let _ = std::fs::create_dir_all(&covers_dir);
    let _ = std::fs::create_dir_all(&lyrics_dir);
    Ok((covers_dir, lyrics_dir))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArtistScanResult {
    /// 艺人文件夹名
    display_name: String,
    /// 直接子文件夹路径列表，每个子文件夹视为一个专辑
    group_folders: Vec<String>,
    /// 全部扫描曲目（扁平），前端按路径前缀分组
    tracks: Vec<LocalScanTrack>,
}

/// 艺人文件夹扫描：直接子文件夹 = 专辑，根目录散曲归入全部歌曲
/// 一次收集所有音频路径，复用并行扫描池
#[tauri::command]
async fn scan_music_artist_folder(
    app: AppHandle,
    path: String,
) -> Result<ArtistScanResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = PathBuf::from(path.trim());
        if !root.is_dir() {
            return Err("不是有效文件夹".into());
        }

        let (covers_dir, lyrics_dir) = media_cache_dirs(&app)?;
        let mut all_files: Vec<PathBuf> = Vec::new();
        let mut group_folders: Vec<String> = Vec::new();

        let entries =
            std::fs::read_dir(&root).map_err(|error| format!("无法读取目录: {error}"))?;
        for entry in entries.flatten() {
            let item = entry.path();
            let name = item
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("");
            if name.starts_with('.') {
                continue;
            }
            if item.is_dir() {
                let mut sub_paths = Vec::new();
                collect_audio_paths(&item, &mut sub_paths, 0)?;
                if sub_paths.is_empty() {
                    continue;
                }
                group_folders.push(item.to_string_lossy().into_owned());
                all_files.extend(sub_paths);
            } else if is_audio_file(&item) {
                all_files.push(item);
            }
        }

        let tracks = scan_audio_paths_with_parents(
            all_files,
            &covers_dir,
            &lyrics_dir,
            Some(&app),
        );
        let display_name = root
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("未命名艺人")
            .to_string();

        Ok(ArtistScanResult {
            display_name,
            group_folders,
            tracks,
        })
    })
    .await
    .map_err(|error| format!("扫描任务失败: {error}"))?
}

fn scan_thread_count(track_count: usize) -> usize {
    let available = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(MIN_SCAN_THREADS);
    available
        .clamp(MIN_SCAN_THREADS, MAX_SCAN_THREADS)
        .min(track_count.max(1))
}

fn scan_audio_paths(
    paths: Vec<PathBuf>,
    album_root: &Path,
    covers_dir: &Path,
    lyrics_dir: &Path,
    app: Option<&AppHandle>,
) -> Vec<LocalScanTrack> {
    scan_in_pool(paths, app, |path| {
        scan_audio_file(path, album_root, covers_dir, lyrics_dir)
    })
}

fn scan_audio_paths_with_parents(
    paths: Vec<PathBuf>,
    covers_dir: &Path,
    lyrics_dir: &Path,
    app: Option<&AppHandle>,
) -> Vec<LocalScanTrack> {
    scan_in_pool(paths, app, |path| {
        let album_root = path.parent().unwrap_or(path.as_path());
        scan_audio_file(path, album_root, covers_dir, lyrics_dir)
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanProgressPayload {
    done: usize,
    total: usize,
    current_path: String,
}

/// 向主窗口广播扫描进度；失败静默（如窗口未就绪）
fn emit_scan_progress(app: &AppHandle, done: usize, total: usize, current_path: &str) {
    let _ = app.emit(
        "musicstorm:scan-progress",
        ScanProgressPayload {
            done,
            total,
            current_path: current_path.to_string(),
        },
    );
}

fn scan_in_pool<F>(paths: Vec<PathBuf>, app: Option<&AppHandle>, scan: F) -> Vec<LocalScanTrack>
where
    F: Fn(&PathBuf) -> Option<LocalScanTrack> + Sync + Send,
{
    if paths.is_empty() {
        return Vec::new();
    }

    let thread_count = scan_thread_count(paths.len());
    let total = paths.len();
    let done = AtomicUsize::new(0);
    // 每约 25 次更新一次进度，避免高频 IPC
    let emit_every = (total / 25).max(1);
    let app_owned = app.cloned();
    let mut tracks = rayon::ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .thread_name(|index| format!("music-scan-{index}"))
        .build()
        .map(|pool| {
            pool.install(|| {
                paths
                    .par_iter()
                    .filter_map(|path| {
                        let result = scan(path);
                        let current = done.fetch_add(1, Ordering::Relaxed) + 1;
                        if let Some(ref handle) = app_owned {
                            if current % emit_every == 0 || current == total {
                                emit_scan_progress(
                                    handle,
                                    current,
                                    total,
                                    &path.to_string_lossy(),
                                );
                            }
                        }
                        result
                    })
                    .collect::<Vec<LocalScanTrack>>()
            })
        })
        .unwrap_or_else(|_| {
            // 线程池构建失败时串行兜底，仍发最终进度
            if let Some(ref handle) = app_owned {
                let current = total;
                emit_scan_progress(handle, current, total, "");
            }
            paths.iter().filter_map(scan).collect()
        });

    sort_scan_tracks(&mut tracks);
    tracks
}

fn sort_scan_tracks(tracks: &mut [LocalScanTrack]) {
    tracks.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then_with(|| a.artist.to_lowercase().cmp(&b.artist.to_lowercase()))
            .then_with(|| a.path.cmp(&b.path))
    });
}

fn collect_audio_paths(
    dir: &Path,
    out: &mut Vec<PathBuf>,
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
            collect_audio_paths(&path, out, depth + 1)?;
        } else if is_audio_file(&path) {
            out.push(path);
        }
    }

    Ok(())
}

fn is_audio_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .is_some_and(|extension| AUDIO_EXTS.contains(&extension.as_str()))
}

/// 单文件 → LocalScanTrack；非音频或失败返回 None
fn scan_audio_file(
    path: &Path,
    album_root: &Path,
    covers_dir: &Path,
    lyrics_dir: &Path,
) -> Option<LocalScanTrack> {
    if !path.is_file() {
        return None;
    }

    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    if !AUDIO_EXTS.contains(&ext.as_str()) {
        return None;
    }

    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("未知曲目");
    let (fallback_artist, fallback_title) = parse_filename(stem);
    let fallback_album = path
        .parent()
        .filter(|parent| *parent != album_root)
        .and_then(|parent| parent.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("本地文件")
        .to_string();

    let file_meta = local_meta::read_audio_meta(path, covers_dir, lyrics_dir);
    let absolute = path.to_string_lossy().into_owned();
    let file_name = {
        let s = stem.trim();
        if s.is_empty() {
            None
        } else {
            Some(s.to_string())
        }
    };
    let content_hash = file_content_md5(path);

    Some(LocalScanTrack {
        id: format!("local:{absolute}"),
        title: file_meta.title.unwrap_or(fallback_title),
        artist: file_meta.artist.unwrap_or(fallback_artist),
        album: file_meta.album.unwrap_or(fallback_album),
        path: absolute,
        duration_ms: file_meta.duration_ms,
        cover_path: file_meta.cover_path,
        cover_thumbnail_path: file_meta.cover_thumbnail_path,
        lyric_text: file_meta.lyric_text,
        lrc_path: file_meta.lrc_path,
        file_name,
        content_hash,
    })
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

/// 版本升级时清理 WebView2 可再生缓存（磁盘缓存 / JS 编译缓存 / GPU 缓存 / Service Worker）。
/// 保留 Local Storage / Cookies / Network —— 网易云登录态依赖它们。
/// 同版本重复启动不清理；升级或首次安装（无记录）才触发一次。
/// 在后台线程执行，不阻塞首帧。
fn purge_webview_caches_on_upgrade(app: &AppHandle) -> Result<u64, String> {
    // 版本以 tauri.conf.json 为准（用户可见版本号），不用 Cargo.toml 的
    let version = app.package_info().version.to_string();
    let conn = open_db(app)?;

    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_setting WHERE key = 'app_version'",
            rusqlite::params![],
            |row| row.get(0),
        )
        .ok();
    if stored.as_deref() == Some(version.as_str()) {
        return Ok(0);
    }
    conn.execute(
        "INSERT INTO app_setting (key, value) VALUES ('app_version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![version],
    )
    .map_err(|e| e.to_string())?;

    let local_data = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let ebwebview = local_data.join("EBWebView");
    if !ebwebview.exists() {
        return Ok(0);
    }

    // 只删可再生的缓存子目录；登录态（Local Storage / Cookies / Network）保留
    const REMOVABLE_DIRS: [&str; 9] = [
        "Default/Cache",
        "Default/Code Cache",
        "Default/GPUCache",
        "Default/DawnCache",
        "Default/DawnGraphiteCache",
        "Default/DawnWebGPUCache",
        "Default/ShaderCache",
        "Default/GrShaderCache",
        "Default/Service Worker",
    ];
    let mut removed = 0u64;
    for rel in REMOVABLE_DIRS {
        let dir = ebwebview.join(rel);
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
            removed += 1;
        }
    }
    Ok(removed)
}

/// 后台清理过期 API 缓存；开独立连接避免锁主线程 DB
fn purge_expired_api_cache_in_background(app: &AppHandle) -> Result<u64, String> {
    let conn = open_db(app)?;
    purge_expired_api_cache(app, &conn)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 单实例：二次启动唤起已有窗口，而不是再开一个进程
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // 窗口在 Rust 里创建（而非 conf 注册），以便按「性能模式」动态注入浏览器参数
            let conn = open_db(app.handle())?;

            // 性能模式开启 → 禁用 GPU 相关进程（毛玻璃/动画在前端关闭）
            let perf_mode: Option<String> = conn
                .query_row(
                    "SELECT value FROM app_setting WHERE key = 'performance_mode'",
                    rusqlite::params![],
                    |row| row.get(0),
                )
                .ok();
            let performance = perf_mode.as_deref() == Some("1");

            const BASE_ARGS: &str = "--disk-cache-size=524288 --disable-remote-fonts \
                --disable-background-networking --disable-sync --disable-default-apps \
                --disable-extensions --disable-component-update --disable-pdf-viewer \
                --disable-breakpad --disable-hang-monitor --disable-speech-api --no-pings \
                --aggressive-cache-discard \
                --disable-features=TranslateUI,AutofillServerCommunication,CalculateNativeWinOcclusion,AudioServiceOutOfProcess \
                --enable-aggressive-domstorage-flushing \
                --enable-features=DestroyProfileOnBrowserClose \
                --js-flags=--max-old-space-size=160";
            let browser_args = if performance {
                format!(
                    "{BASE_ARGS} --disable-gpu --disable-gpu-compositing --disable-software-rasterizer"
                )
            } else {
                BASE_ARGS.to_string()
            };

            tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("MusicStorm")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 640.0)
            .decorations(false)
            .center()
            .additional_browser_args(&browser_args)
            .build()
            .map_err(|e| format!("create main window: {e}"))?;

            app.manage(DbState(Mutex::new(conn)));
            app.manage(AudioState::default());

            // 过期缓存清理移到后台线程，不阻塞窗口创建
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 版本升级时先清 WebView2 旧缓存，避免膨胀随版本迁移
                let _ = purge_webview_caches_on_upgrade(&app_handle);
                let _ = purge_expired_api_cache_in_background(&app_handle);
                let _ = purge_cover_cache(&app_handle);
            });

            // 系统托盘 + 全局媒体快捷键（失败不阻断启动）
            if let Err(error) = tray::setup_tray(app.handle()) {
                eprintln!("setup tray failed: {error}");
            }
            if let Err(error) = tray::setup_global_shortcuts(app.handle()) {
                eprintln!("setup global shortcuts failed: {error}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_devtools,
            pick_music_folder,
            pick_music_files,
            pick_image_as_base64,
            pick_cover_image,
            cache_cover_url,
            cache_cover_data_url,
            clear_cover_cache,
            pick_text_file,
            save_url_to_file,
            read_text_file,
            scan_music_folder,
            scan_music_files,
            scan_music_artist_folder,
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
            ffmpeg_detect,
            ffmpeg_validate,
            ffmpeg_set_path,
            pick_ffmpeg_executable,
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
            tray::update_global_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}