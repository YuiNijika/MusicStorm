use crate::db::ensure_storage_paths;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use md5::{Digest, Md5};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;

const MAX_COVER_BYTES: usize = 12 * 1024 * 1024;
const THUMBNAIL_SIZE: u32 = 192;
// 下载超时：CDN 挂死时快速放行阻塞线程，避免占满线程池拖垮其他 IPC
const COVER_CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const COVER_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(20);

/// 封面缓存上限：文件数与总大小，超出后按最旧清理
const MAX_COVER_FILES: usize = 4_000;
// 大小上限由前端传入（默认 400MB，可在设置中调整），Rust 侧不重复定义

// 文件名即内容 MD5，同一封面天然去重；清理按 hash 成对删除，避免孤儿文件堆积。
// keep：受引用保护的 hash（用户自选封面/本地库封面），容量清理也不能回收，
// 否则覆盖索引指向唯一副本被删，封面永久失效
pub fn purge_cover_cache(
    app: &AppHandle,
    max_bytes: u64,
    keep_hashes: Vec<String>,
) -> Result<u64, String> {
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    let keep: std::collections::HashSet<String> = keep_hashes.into_iter().collect();
    let (originals, thumbnails) = cover_dirs(app)?;
    // 按 hash 分组：同一封面的原图与缩略图成对存在
    let mut groups: HashMap<String, Vec<(PathBuf, SystemTime)>> = HashMap::new();
    let mut total: u64 = 0;
    for dir in [originals, thumbnails] {
        let entries = fs::read_dir(dir).map_err(|e| format!("read cover cache: {e}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                    if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                        groups
                            .entry(name.to_string())
                            .or_default()
                            .push((path, meta.modified().unwrap_or(UNIX_EPOCH)));
                    }
                }
            }
        }
    }
    let file_count: u64 = groups.values().map(|files| files.len() as u64).sum();
    if file_count <= MAX_COVER_FILES as u64 && total <= max_bytes {
        return Ok(0);
    }

    // 整组按最旧时间排序，整组一起删，保证原图/缩略图同步回收
    let mut group_list: Vec<(Vec<(PathBuf, SystemTime)>, SystemTime)> = groups
        .into_values()
        .map(|files| {
            let oldest = files.iter().map(|(_, t)| *t).min().unwrap_or(UNIX_EPOCH);
            (files, oldest)
        })
        .collect();
    group_list.sort_by_key(|(_, oldest)| *oldest);

    let mut removed: u64 = 0;
    for (files, _) in group_list {
        if file_count - removed <= MAX_COVER_FILES as u64 && total <= max_bytes {
            break;
        }
        for (path, _) in files {
            // 受引用保护的封面整组跳过
            if path
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|hash| keep.contains(hash))
            {
                continue;
            }
            if let Ok(meta) = fs::metadata(&path) {
                total = total.saturating_sub(meta.len());
            }
            if fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// 前端按设置阈值触发清理（设置页调整后立即执行一次）。
/// keepHashes 与 clear_cover_cache 同义：引用中的封面不回收
#[tauri::command]
pub fn purge_cover_cache_cmd(
    app: AppHandle,
    max_bytes: u64,
    keep_hashes: Vec<String>,
) -> Result<u64, String> {
    purge_cover_cache(&app, max_bytes, keep_hashes)
}

/// 批量检查封面文件是否仍在磁盘上。
/// 清理命令直接删文件，前端索引（cover.remote.v1）不随行失效，
/// 靠这个命令对账后把失效条目从索引中剪掉，封面才能重新回源下载。
#[tauri::command]
pub fn cover_paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths
        .iter()
        .map(|p| {
            let trimmed = p.trim();
            !trimmed.is_empty() && Path::new(trimmed).is_file()
        })
        .collect()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedCover {
    pub original_path: String,
    pub thumbnail_path: String,
}

fn cover_dirs_from_root(cache: &Path) -> Result<(PathBuf, PathBuf), String> {
    let originals = cache.join("originals");
    let thumbnails = cache.join("thumbnails");
    fs::create_dir_all(&originals).map_err(|error| format!("创建封面缓存失败: {error}"))?;
    fs::create_dir_all(&thumbnails).map_err(|error| format!("创建缩略图缓存失败: {error}"))?;
    Ok((originals, thumbnails))
}

fn cover_dirs(app: &AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let cache = ensure_storage_paths(app)?.cache_dir.join("covers");
    cover_dirs_from_root(&cache)
}

fn content_hash(data: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

fn image_extension(data: &[u8]) -> Result<&'static str, String> {
    let format = image::guess_format(data).map_err(|_| "不支持的封面图片格式".to_string())?;
    match format {
        image::ImageFormat::Jpeg => Ok("jpg"),
        image::ImageFormat::Png => Ok("png"),
        image::ImageFormat::WebP => Ok("webp"),
        _ => Err("封面仅支持 JPEG、PNG 或 WebP".into()),
    }
}

fn cache_cover_bytes_in_dirs(
    originals: &Path,
    thumbnails: &Path,
    data: &[u8],
) -> Result<CachedCover, String> {
    if data.is_empty() {
        return Err("封面图片为空".into());
    }
    if data.len() > MAX_COVER_BYTES {
        return Err("封面图片过大（超过 12MB）".into());
    }

    let extension = image_extension(data)?;
    let hash = content_hash(data);
    let original = originals.join(format!("{hash}.{extension}"));
    let thumbnail = thumbnails.join(format!("{hash}.jpg"));

    if !original.is_file() {
        fs::write(&original, data).map_err(|error| format!("写入封面缓存失败: {error}"))?;
    }
    if !thumbnail.is_file() {
        let decoded = image::load_from_memory(data)
            .map_err(|error| format!("解析封面图片失败: {error}"))?;
        let resized = decoded.resize_to_fill(
            THUMBNAIL_SIZE,
            THUMBNAIL_SIZE,
            FilterType::Triangle,
        );
        let mut encoded = Vec::new();
        JpegEncoder::new_with_quality(&mut encoded, 82)
            .encode_image(&resized)
            .map_err(|error| format!("生成封面缩略图失败: {error}"))?;
        fs::write(&thumbnail, encoded)
            .map_err(|error| format!("写入封面缩略图失败: {error}"))?;
    }

    Ok(CachedCover {
        original_path: original.to_string_lossy().into_owned(),
        thumbnail_path: thumbnail.to_string_lossy().into_owned(),
    })
}

// 被 keep_hashes（仍在引用的内容 MD5）命中的文件保留，避免清掉本地音乐补全/设置的封面。
// 磁盘空间即刻回收，未保留的封面下次访问时重新生成。
#[tauri::command]
pub fn clear_cover_cache(app: AppHandle, keep_hashes: Vec<String>) -> Result<(), String> {
    let keep: std::collections::HashSet<&str> =
        keep_hashes.iter().map(String::as_str).collect();
    let (originals, thumbnails) = cover_dirs(&app)?;
    for dir in [originals, thumbnails] {
        let entries = fs::read_dir(dir).map_err(|e| format!("read cover cache: {e}"))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let keep_file = path
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|hash| keep.contains(hash));
            if !keep_file {
                let _ = fs::remove_file(path);
            }
        }
    }
    Ok(())
}

pub fn cache_cover_bytes(app: &AppHandle, data: &[u8]) -> Result<CachedCover, String> {
    let (originals, thumbnails) = cover_dirs(app)?;
    cache_cover_bytes_in_dirs(&originals, &thumbnails, data)
}

pub fn cache_cover_bytes_at(
    covers_dir: &Path,
    data: &[u8],
) -> Result<CachedCover, String> {
    let (originals, thumbnails) = cover_dirs_from_root(covers_dir)?;
    cache_cover_bytes_in_dirs(&originals, &thumbnails, data)
}

pub fn cache_cover_file_at(
    covers_dir: &Path,
    path: &Path,
) -> Result<CachedCover, String> {
    if !path.is_file() {
        return Err("封面文件不存在".into());
    }
    let data = fs::read(path).map_err(|error| format!("读取封面失败: {error}"))?;
    cache_cover_bytes_at(covers_dir, &data)
}

#[cfg(not(target_os = "android"))]
pub fn cache_cover_file(app: &AppHandle, path: &Path) -> Result<CachedCover, String> {
    if !path.is_file() {
        return Err("封面文件不存在".into());
    }
    let data = fs::read(path).map_err(|error| format!("读取封面失败: {error}"))?;
    cache_cover_bytes(app, &data)
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn pick_cover_image(app: AppHandle) -> Result<Option<CachedCover>, String> {
    let selected = rfd::FileDialog::new()
        .set_title("选择封面图片")
        .add_filter("图片", &["png", "jpg", "jpeg", "webp"])
        .pick_file();
    selected
        .as_deref()
        .map(|path| cache_cover_file(&app, path))
        .transpose()
}

#[tauri::command]
pub async fn cache_cover_url(app: AppHandle, url: String) -> Result<CachedCover, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let url = url.trim();
        if url.is_empty() {
            return Err("封面地址为空".into());
        }
        let client = reqwest::blocking::Client::builder()
            .connect_timeout(COVER_CONNECT_TIMEOUT)
            .timeout(COVER_DOWNLOAD_TIMEOUT)
            .build()
            .map_err(|error| format!("创建封面下载客户端失败: {error}"))?;
        let response = client
            .get(url)
            .send()
            .map_err(|error| format!("下载封面失败: {error}"))?
            .error_for_status()
            .map_err(|error| format!("下载封面失败: {error}"))?;
        if let Some(length) = response.content_length() {
            if length > MAX_COVER_BYTES as u64 {
                return Err("封面图片过大（超过 12MB）".into());
            }
        }
        let bytes = response
            .bytes()
            .map_err(|error| format!("读取封面失败: {error}"))?;
        cache_cover_bytes(&app, &bytes)
    })
    .await
    .map_err(|error| format!("封面缓存任务失败: {error}"))?
}

#[tauri::command]
pub fn cache_cover_data_url(app: AppHandle, data_url: String) -> Result<CachedCover, String> {
    use base64::{engine::general_purpose, Engine as _};

    let (_, payload) = data_url
        .split_once(',')
        .ok_or_else(|| "旧封面数据无效".to_string())?;
    let data = general_purpose::STANDARD
        .decode(payload.trim().as_bytes())
        .map_err(|error| format!("解码旧封面失败: {error}"))?;
    cache_cover_bytes(&app, &data)
}