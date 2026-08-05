use crate::db::ensure_storage_paths;
use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use md5::{Digest, Md5};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const MAX_COVER_BYTES: usize = 12 * 1024 * 1024;
const THUMBNAIL_SIZE: u32 = 192;

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

pub fn cache_cover_file(app: &AppHandle, path: &Path) -> Result<CachedCover, String> {
    if !path.is_file() {
        return Err("封面文件不存在".into());
    }
    let data = fs::read(path).map_err(|error| format!("读取封面失败: {error}"))?;
    cache_cover_bytes(app, &data)
}

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
        let response = reqwest::blocking::get(url)
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