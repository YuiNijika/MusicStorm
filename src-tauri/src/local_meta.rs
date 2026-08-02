// 本地音频内嵌元数据：lofty 读 tag、封面、歌词；容器不支持时返回空 meta，扫描仍入库

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::*;
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone, Default)]
pub struct FileMeta {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: u64,
    /// 落盘后的封面绝对路径
    pub cover_path: Option<String>,
    /// 内嵌歌词全文，大段写入 lrc 缓存
    pub lyric_text: Option<String>,
    /// sidecar 或缓存歌词路径
    pub lrc_path: Option<String>,
}

/// covers_dir 与 lyrics_dir 均为 cache 下子目录
pub fn read_audio_meta(path: &Path, covers_dir: &Path, lyrics_dir: &Path) -> FileMeta {
    let mut meta = FileMeta::default();

    // sidecar 优先：有正文才占 lyric_text，空文件留给内嵌
    if let Some(lrc) = find_sidecar_lrc(path) {
        meta.lrc_path = Some(lrc.to_string_lossy().into_owned());
        if let Some(text) = read_text_flexible(&lrc) {
            let t = text.trim();
            if !t.is_empty() {
                meta.lyric_text = Some(t.to_string());
            }
        }
    }

    // 同目录或父目录常见封面图
    if let Some(cover) = find_sidecar_cover(path) {
        meta.cover_path = Some(cover.to_string_lossy().into_owned());
    }

    let tagged = match Probe::open(path).and_then(|p| p.read()) {
        Ok(t) => t,
        Err(_) => return meta,
    };

    let props = tagged.properties();
    let duration = props.duration();
    if duration > Duration::ZERO {
        meta.duration_ms = duration.as_millis() as u64;
    }

    // 扫全部 tag：部分文件 primary 无图，图在另一套 tag
    let tags: Vec<_> = tagged.tags().iter().collect();
    if tags.is_empty() {
        return meta;
    }

    // 文本字段：primary 优先，否则取第一个有值
    let primary = tagged.primary_tag().or_else(|| tagged.first_tag());
    if let Some(tag) = primary {
        if meta.title.is_none() {
            if let Some(title) = nonempty(tag.title().as_deref()) {
                meta.title = Some(title);
            }
        }
        if meta.artist.is_none() {
            if let Some(artist) = nonempty(tag.artist().as_deref()) {
                meta.artist = Some(artist);
            }
        }
        if meta.album.is_none() {
            if let Some(album) = nonempty(tag.album().as_deref()) {
                meta.album = Some(album);
            }
        }
    }

    // 封面：CoverFront 优先，再任意 picture
    if meta.cover_path.is_none() {
        if let Some(picture) = pick_best_picture(&tags) {
            let mime = picture
                .mime_type()
                .cloned()
                .unwrap_or(MimeType::Jpeg);
            if let Some(cover_path) = write_cover_file(path, covers_dir, picture.data(), &mime) {
                meta.cover_path = Some(cover_path);
            }
        }
    }

    // 歌词：sidecar 已有有效文本则跳过，否则读内嵌
    let need_embedded = meta
        .lyric_text
        .as_ref()
        .map(|s| s.trim().is_empty())
        .unwrap_or(true);
    if need_embedded {
        if let Some(lyrics) = extract_lyrics_from_tags(&tags) {
            apply_embedded_lyrics(&mut meta, path, lyrics_dir, lyrics);
        }
    }

    meta
}

fn nonempty(s: Option<&str>) -> Option<String> {
    s.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn pick_best_picture<'a>(tags: &[&'a lofty::tag::Tag]) -> Option<&'a Picture> {
    let mut any: Option<&Picture> = None;
    for tag in tags {
        for pic in tag.pictures() {
            if pic.pic_type() == PictureType::CoverFront && !pic.data().is_empty() {
                return Some(pic);
            }
            if any.is_none() && !pic.data().is_empty() {
                any = Some(pic);
            }
        }
    }
    any
}

fn extract_lyrics_from_tags(tags: &[&lofty::tag::Tag]) -> Option<String> {
    for tag in tags {
        // ItemKey::Lyrics：USLT / Vorbis LYRICS / MP4 ©lyr
        if let Some(text) = tag
            .get_strings(&ItemKey::Lyrics)
            .map(str::trim)
            .find(|s| !s.is_empty())
        {
            if text.len() < 512 * 1024 {
                return Some(text.to_string());
            }
        }
        // 部分打标软件把歌词塞进 Comment / Description
        for key in [ItemKey::Comment, ItemKey::Description] {
            if let Some(text) = tag
                .get_strings(&key)
                .map(str::trim)
                .find(|s| looks_like_lyrics(s))
            {
                if text.len() < 512 * 1024 {
                    return Some(text.to_string());
                }
            }
        }
    }
    None
}

fn looks_like_lyrics(s: &str) -> bool {
    // LRC 时间戳，或多行较长纯文本
    if s.contains('[') && s.contains(']') && s.contains(':') {
        return true;
    }
    let lines = s.lines().filter(|l| !l.trim().is_empty()).count();
    lines >= 3 || s.chars().count() >= 40
}

fn apply_embedded_lyrics(meta: &mut FileMeta, audio_path: &Path, lyrics_dir: &Path, text: String) {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return;
    }
    // 超过 4KB 只写缓存路径，避免整库塞进 localStorage
    if trimmed.len() > 4 * 1024 {
        if let Some(path) = write_lyrics_cache(audio_path, lyrics_dir, trimmed) {
            meta.lrc_path = Some(path);
        }
        // 仍保留一段短预览无意义；前端靠 lrcPath 读全文
        return;
    }
    meta.lyric_text = Some(trimmed.to_string());
    // 同步落盘，播放时即使 localStorage 丢字段也能 read_text_file
    if let Some(path) = write_lyrics_cache(audio_path, lyrics_dir, trimmed) {
        meta.lrc_path = Some(path);
    }
}

fn find_sidecar_lrc(audio_path: &Path) -> Option<PathBuf> {
    let parent = audio_path.parent()?;
    let stem = audio_path.file_stem()?.to_str()?;
    let candidates = [
        parent.join(format!("{stem}.lrc")),
        parent.join(format!("{stem}.LRC")),
        parent.join(format!("{stem}.lrc.zh")),
        parent.join(format!("{stem}.zh.lrc")),
        parent.join(format!("{stem}.cht.lrc")),
        parent.join(format!("{stem}.chs.lrc")),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn find_sidecar_cover(audio_path: &Path) -> Option<PathBuf> {
    let parent = audio_path.parent()?;
    // 常见专辑封面文件名
    const NAMES: &[&str] = &[
        "cover.jpg",
        "cover.jpeg",
        "cover.png",
        "cover.webp",
        "folder.jpg",
        "folder.png",
        "front.jpg",
        "front.png",
        "album.jpg",
        "album.png",
        "Cover.jpg",
        "Cover.png",
        "Folder.jpg",
        "AlbumArt.jpg",
        "AlbumArtSmall.jpg",
    ];
    for name in NAMES {
        let p = parent.join(name);
        if p.is_file() {
            return Some(p);
        }
    }
    // 与音频同名的图片
    if let Some(stem) = audio_path.file_stem().and_then(|s| s.to_str()) {
        for ext in ["jpg", "jpeg", "png", "webp"] {
            let p = parent.join(format!("{stem}.{ext}"));
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn write_cover_file(
    audio_path: &Path,
    covers_dir: &Path,
    data: &[u8],
    mime: &MimeType,
) -> Option<String> {
    if data.is_empty() || data.len() > 8 * 1024 * 1024 {
        return None;
    }
    let _ = fs::create_dir_all(covers_dir);
    let ext = mime.ext().unwrap_or("jpg");
    let hash = path_hash(&audio_path.to_string_lossy());
    let out = covers_dir.join(format!("{hash}.{ext}"));
    // 已存在且大小一致则复用
    if let Ok(meta) = fs::metadata(&out) {
        if meta.len() == data.len() as u64 {
            return Some(out.to_string_lossy().into_owned());
        }
    }
    if fs::write(&out, data).is_err() {
        return None;
    }
    Some(out.to_string_lossy().into_owned())
}

fn write_lyrics_cache(audio_path: &Path, lyrics_dir: &Path, text: &str) -> Option<String> {
    let _ = fs::create_dir_all(lyrics_dir);
    let hash = path_hash(&audio_path.to_string_lossy());
    let out = lyrics_dir.join(format!("{hash}.lrc"));
    if fs::write(&out, text).is_err() {
        return None;
    }
    Some(out.to_string_lossy().into_owned())
}

fn path_hash(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    // 统一分隔符，避免 \\ / 导致哈希不一致
    path.replace('\\', "/").to_lowercase().hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// 按 UTF-8、BOM、UTF-16、GB18030 解码歌词文本。
pub fn decode_text_bytes(data: &[u8]) -> Option<String> {
    if data.is_empty() || data.len() > 1024 * 1024 {
        return None;
    }

    let decoded = if data.starts_with(&[0xEF, 0xBB, 0xBF]) {
        std::str::from_utf8(&data[3..]).ok().map(str::to_string)
    } else if data.starts_with(&[0xFF, 0xFE]) && data.len() >= 4 {
        let u16s: Vec<u16> = data[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16(&u16s).ok()
    } else if data.starts_with(&[0xFE, 0xFF]) && data.len() >= 4 {
        let u16s: Vec<u16> = data[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16(&u16s).ok()
    } else if let Ok(text) = std::str::from_utf8(data) {
        Some(text.to_string())
    } else {
        let (text, _, _) = encoding_rs::GB18030.decode(data);
        Some(text.into_owned())
    };

    decoded
        .map(|text| text.trim().trim_start_matches('\u{feff}').to_string())
        .filter(|text| !text.is_empty())
}

fn read_text_flexible(path: &Path) -> Option<String> {
    let data = fs::read(path).ok()?;
    decode_text_bytes(&data)
}

#[cfg(test)]
mod tests {
    use super::decode_text_bytes;

    #[test]
    fn decodes_utf8_lyrics() {
        let text = decode_text_bytes("[00:01.00]你好".as_bytes());
        assert_eq!(text.as_deref(), Some("[00:01.00]你好"));
    }

    #[test]
    fn decodes_utf16_le_lyrics() {
        let mut data = vec![0xFF, 0xFE];
        for unit in "[00:01.00]你好".encode_utf16() {
            data.extend_from_slice(&unit.to_le_bytes());
        }
        let text = decode_text_bytes(&data);
        assert_eq!(text.as_deref(), Some("[00:01.00]你好"));
    }

    #[test]
    fn decodes_gb18030_lyrics() {
        let (data, _, _) = encoding_rs::GB18030.encode("[00:01.00]你好");
        let text = decode_text_bytes(&data);
        assert_eq!(text.as_deref(), Some("[00:01.00]你好"));
    }
}
