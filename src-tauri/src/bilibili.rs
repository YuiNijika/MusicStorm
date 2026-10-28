use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine as _};
use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, COOKIE, REFERER, USER_AGENT};
use reqwest::redirect::{Attempt, Policy};
use reqwest::Url;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::db::ensure_storage_paths;

const BILIBILI_REFERER: &str = "https://www.bilibili.com";
const BILIBILI_ORIGIN: &str = "https://www.bilibili.com";
const USER_AGENT_VALUE: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const LOGIN_USER_AGENT_VALUE: &str = "Mozilla/5.0 BiliDroid/2.0.1 (bbcallen@gmail.com) os/android model/android_hd mobi_app/android_hd build/2001100 channel/master innerVer/2001100 osVer/15 network/2";
const LOGIN_TRACE_ID: &str = "11111111111111111111111111111111:1111111111111111:0:0";
const MAX_JSON_BYTES: u64 = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 1024 * 1024 * 1024;
const CONNECT_TIMEOUT_SECONDS: u64 = 12;
const JSON_TIMEOUT_SECONDS: u64 = 15;
const REQUEST_TIMEOUT_SECONDS: u64 = 900;
const COOKIE_VERSION: &str = "v1";
const PASSPORT_HOST: &str = "passport.bilibili.com";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BilibiliAudioCache {
    path: String,
    reused: bool,
}

fn api_path_allowed(path: &str) -> bool {
    matches!(
        path,
        "/x/web-interface/nav"
            | "/x/member/web/account"
            | "/x/web-interface/wbi/search/type"
            | "/x/web-interface/popular"
            | "/x/web-interface/card"
            | "/x/web-interface/view"
            | "/x/web-interface/ranking/v2"
            | "/x/polymer/web-space/seasons_series_list"
            | "/x/polymer/web-space/seasons_archives_list"
            | "/x/series/archives"
            | "/x/player/wbi/playurl"
            | "/x/v3/fav/folder/created/list-all"
            | "/x/v3/fav/folder/created/list"
            | "/x/v3/fav/folder/info"
            | "/x/v3/fav/resource/list"
    )
}

fn validate_api_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "哔哩哔哩接口地址无效".to_string())?;
    let host = url.host_str().unwrap_or_default();
    if url.scheme() != "https"
        || (host != "api.bilibili.com" && host != PASSPORT_HOST)
        || (host == "api.bilibili.com" && !api_path_allowed(url.path()))
        || (host == PASSPORT_HOST && !passport_path_allowed(url.path()))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("哔哩哔哩接口地址不受信任".into());
    }
    Ok(url)
}

fn passport_path_allowed(path: &str) -> bool {
    matches!(
        path,
        "/x/passport-tv-login/qrcode/auth_code"
            | "/x/passport-tv-login/qrcode/poll"
            | "/x/passport-login/web/key"
            | "/x/passport-login/oauth2/login"
            | "/x/passport-login/sms/send"
            | "/x/passport-login/login/sms"
            | "/x/passport-login/oauth2/access_token"
            | "/x/safecenter/user/info"
            | "/x/safecenter/captcha/pre"
            | "/x/safecenter/common/sms/send"
            | "/x/safecenter/login/tel/verify"
    )
}

fn validate_risk_referer(raw: Option<&str>) -> Result<Option<Url>, String> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let referer = Url::parse(raw.trim()).map_err(|_| "安全验证来源地址无效".to_string())?;
    if referer.scheme() != "https"
        || referer.host_str() != Some(PASSPORT_HOST)
        || referer.path() != "/h5-app/passport/risk/verify"
        || !referer.username().is_empty()
        || referer.password().is_some()
    {
        return Err("安全验证来源地址不受信任".into());
    }
    Ok(Some(referer))
}

fn cookie_path(app: &AppHandle) -> Result<PathBuf, String> {
    let paths = ensure_storage_paths(app)?;
    Ok(paths.config_dir.join("bilibili-cookie.bin"))
}

fn xor_cookie(bytes: &[u8], seed: u8) -> Vec<u8> {
    bytes
        .iter()
        .enumerate()
        .map(|(index, byte)| byte ^ seed.rotate_left((index % 8) as u32))
        .collect()
}

fn read_cookie(app: &AppHandle) -> Option<String> {
    let path = cookie_path(app).ok()?;
    let encoded = fs::read(path).ok()?;
    if encoded.len() < 5 || &encoded[..3] != COOKIE_VERSION.as_bytes() {
        return None;
    }
    let seed = encoded[3];
    let plain = xor_cookie(&encoded[4..], seed);
    String::from_utf8(plain)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn write_cookie(app: &AppHandle, cookie: &str) -> Result<(), String> {
    let path = cookie_path(app)?;
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.subsec_nanos() as u8)
        .unwrap_or(0x5a);
    let mut encoded = Vec::with_capacity(4 + cookie.len());
    encoded.extend_from_slice(COOKIE_VERSION.as_bytes());
    encoded.push(seed);
    encoded.extend_from_slice(&xor_cookie(cookie.as_bytes(), seed));
    fs::write(path, encoded).map_err(|error| format!("保存B站登录状态失败 {error}"))
}

#[tauri::command]
pub fn bilibili_set_cookie(app: AppHandle, cookie: String) -> Result<(), String> {
    if cookie.trim().is_empty() {
        return Err("登录信息为空".into());
    }
    write_cookie(&app, cookie.trim())
}

#[tauri::command]
pub fn bilibili_clear_cookie(app: AppHandle) -> Result<(), String> {
    let path = cookie_path(&app)?;
    let _ = fs::remove_file(path);
    Ok(())
}

fn media_host_allowed(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "bilivideo.com"
        || host.ends_with(".bilivideo.com")
        || host == "bilivideo.cn"
        || host.ends_with(".bilivideo.cn")
        || host == "hdslb.com"
        || host.ends_with(".hdslb.com")
        || host == "szbdyd.com"
        || host.ends_with(".szbdyd.com")
        || (host.starts_with("upos-") && host.ends_with(".akamaized.net"))
}

fn validate_media_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "音频地址无效".to_string())?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("音频地址不受信任".into());
    }
    let host = url
        .host_str()
        .ok_or_else(|| "音频地址缺少主机名".to_string())?;
    if !media_host_allowed(host) {
        return Err("音频地址不在哔哩哔哩媒体域名内".into());
    }
    Ok(url)
}

fn redirect_policy_for(validator: fn(&str) -> Result<Url, String>) -> Policy {
    Policy::custom(move |attempt: Attempt| {
        if attempt.previous().len() >= 4 {
            return attempt.stop();
        }
        if validator(attempt.url().as_str()).is_ok() {
            attempt.follow()
        } else {
            attempt.stop()
        }
    })
}

fn build_client(
    validator: fn(&str) -> Result<Url, String>,
    timeout: Duration,
) -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS))
        .timeout(timeout)
        .redirect(redirect_policy_for(validator))
        .build()
        .map_err(|error| format!("创建哔哩哔哩网络客户端失败 {error}"))
}

fn json_client() -> Result<Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| build_client(validate_api_url, Duration::from_secs(JSON_TIMEOUT_SECONDS)))
        .clone()
}

fn media_client() -> Result<Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            build_client(
                validate_media_url,
                Duration::from_secs(REQUEST_TIMEOUT_SECONDS),
            )
        })
        .clone()
}

fn bilibili_headers(
    request: reqwest::blocking::RequestBuilder,
) -> reqwest::blocking::RequestBuilder {
    request
        .header(REFERER, BILIBILI_REFERER)
        .header("Origin", BILIBILI_ORIGIN)
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header("env", "prod")
        .header("app-key", "android64")
        .header("x-bili-aurora-zone", "sh001")
}

fn login_headers(
    request: reqwest::blocking::RequestBuilder,
    buvid: Option<&str>,
) -> reqwest::blocking::RequestBuilder {
    let request = request
        .header(REFERER, BILIBILI_REFERER)
        .header("Origin", BILIBILI_ORIGIN)
        .header(USER_AGENT, LOGIN_USER_AGENT_VALUE)
        .header("env", "prod")
        .header("app-key", "android_hd")
        .header("x-bili-trace-id", LOGIN_TRACE_ID)
        .header("x-bili-aurora-eid", "")
        .header("x-bili-aurora-zone", "")
        .header("bili-http-engine", "cronet")
        .header("Sec-Fetch-Site", "same-site")
        .header("Sec-Fetch-Mode", "cors");
    if let Some(value) = buvid.filter(|value| !value.trim().is_empty()) {
        request.header("buvid", value)
    } else {
        request
    }
}

fn request_cookie(app: &AppHandle, explicit: Option<String>) -> Option<String> {
    explicit
        .filter(|value| !value.trim().is_empty())
        .or_else(|| read_cookie(app))
}

fn cookie_value(cookie: &str, name: &str) -> Option<String> {
    cookie.split(';').find_map(|part| {
        let (key, value) = part.trim().split_once('=')?;
        if key == name && !value.is_empty() {
            Some(value.to_string())
        } else {
            None
        }
    })
}

fn aurora_eid(mid: &str) -> Option<String> {
    if mid.is_empty() || !mid.bytes().all(|value| value.is_ascii_digit()) {
        return None;
    }
    let key = b"ad1va46a7lza";
    let encoded = mid
        .bytes()
        .enumerate()
        .map(|(index, value)| value ^ key[index % key.len()])
        .collect::<Vec<_>>();
    Some(STANDARD_NO_PAD.encode(encoded))
}

#[tauri::command]
pub async fn bilibili_get_json(
    app: AppHandle,
    url: String,
    cookie: Option<String>,
    buvid: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = validate_api_url(&url)?;
        let client = json_client()?;
        let is_passport = target.host_str() == Some(PASSPORT_HOST);
        let cookie = request_cookie(&app, cookie);
        let account_mid = cookie
            .as_deref()
            .and_then(|value| cookie_value(value, "DedeUserID"));
        let request = if is_passport {
            login_headers(client.get(target), buvid.as_deref())
        } else {
            let request = bilibili_headers(client.get(target));
            match account_mid.as_deref() {
                Some(mid) if !mid.is_empty() => {
                    let request = request.header("x-bili-mid", mid);
                    match aurora_eid(mid) {
                        Some(eid) => request.header("x-bili-aurora-eid", eid),
                        None => request,
                    }
                }
                _ => request,
            }
        };
        let request = if let Some(cookie) = cookie {
            request.header(COOKIE, cookie)
        } else {
            request
        };
        let response = request
            .header(ACCEPT, "application/json")
            .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
            .header("Sec-Fetch-Site", "same-site")
            .header("Sec-Fetch-Mode", "cors")
            .send()
            .map_err(|error| format!("哔哩哔哩请求失败 {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("哔哩哔哩请求失败 HTTP {status}"));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_JSON_BYTES)
        {
            return Err("哔哩哔哩响应过大".into());
        }
        let bytes = response
            .bytes()
            .map_err(|error| format!("读取哔哩哔哩响应失败 {error}"))?;
        if bytes.len() as u64 > MAX_JSON_BYTES {
            return Err("哔哩哔哩响应过大".into());
        }
        serde_json::from_slice::<Value>(&bytes)
            .map_err(|error| format!("哔哩哔哩响应格式无效 {error}"))
    })
    .await
    .map_err(|error| format!("哔哩哔哩请求任务失败 {error}"))?
}

#[tauri::command]
pub async fn bilibili_post_json(
    app: AppHandle,
    url: String,
    body: Option<Value>,
    referer_url: Option<String>,
    cookie: Option<String>,
    buvid: Option<String>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = validate_api_url(&url)?;
        let referer = validate_risk_referer(referer_url.as_deref())?;
        let path = target.path().to_string();
        if target.host_str() != Some(PASSPORT_HOST) || !passport_path_allowed(&path) {
            return Err("哔哩哔哩登录接口不受信任".into());
        }
        let client = json_client()?;
        let request = login_headers(client.post(target), buvid.as_deref());
        let request = if let Some(referer) = referer {
            request.header(REFERER, referer.as_str())
        } else {
            request
        };
        let request = if let Some(cookie) = request_cookie(&app, cookie) {
            request.header(COOKIE, cookie)
        } else {
            request
        };
        let form = body
            .and_then(|value| value.as_object().cloned())
            .map(|values| {
                values
                    .into_iter()
                    .filter_map(|(key, value)| {
                        let value = match value {
                            Value::String(value) => value,
                            Value::Number(value) => value.to_string(),
                            Value::Bool(value) => value.to_string(),
                            _ => return None,
                        };
                        Some((key, value))
                    })
                    .collect::<std::collections::HashMap<_, _>>()
            });
        let request = if let Some(form) = form {
            request
                .header(
                    CONTENT_TYPE,
                    "application/x-www-form-urlencoded; charset=utf-8",
                )
                .form(&form)
        } else {
            request
        };
        let response = request
            .header(ACCEPT, "application/json")
            .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
            .header("Sec-Fetch-Site", "same-site")
            .header("Sec-Fetch-Mode", "cors")
            .send()
            .map_err(|error| format!("哔哩哔哩登录请求失败 {error}"))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("哔哩哔哩登录请求失败 HTTP {status}"));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_JSON_BYTES)
        {
            return Err("哔哩哔哩登录响应过大".into());
        }
        let bytes = response
            .bytes()
            .map_err(|error| format!("读取哔哩哔哩登录响应失败 {error}"))?;
        if bytes.len() as u64 > MAX_JSON_BYTES {
            return Err("哔哩哔哩登录响应过大".into());
        }
        serde_json::from_slice::<Value>(&bytes)
            .map_err(|error| format!("哔哩哔哩登录响应格式无效 {error}"))
    })
    .await
    .map_err(|error| format!("哔哩哔哩登录任务失败 {error}"))?
}

fn download_audio_headers(
    request: reqwest::blocking::RequestBuilder,
    app: &AppHandle,
) -> reqwest::blocking::RequestBuilder {
    let request = bilibili_headers(request);
    if let Some(cookie) = read_cookie(app) {
        request.header(COOKIE, cookie)
    } else {
        request
    }
}

fn validate_bvid(value: &str) -> Result<(), String> {
    if value.len() != 12
        || !value.starts_with("BV")
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return Err("视频编号无效".into());
    }
    Ok(())
}

fn current_timestamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn partial_path(target: &PathBuf) -> PathBuf {
    static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let name = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("bilibili-audio");
    let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    target.with_file_name(format!(
        ".{name}.{}.{}.{}.part",
        std::process::id(),
        current_timestamp(),
        sequence
    ))
}

fn remove_quietly(path: &PathBuf) {
    let _ = fs::remove_file(path);
}

fn download_audio(
    input: &DownloadInput,
    target: &PathBuf,
    client: &Client,
    app: &AppHandle,
) -> Result<(), String> {
    let response = download_audio_headers(client.get(input.url.clone()), app)
        .send()
        .map_err(|error| format!("下载哔哩哔哩音频失败 {error}"))?
        .error_for_status()
        .map_err(|error| format!("下载哔哩哔哩音频失败 {error}"))?;
    if response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().starts_with("text/html"))
    {
        return Err("音频地址返回了网页而不是媒体文件".into());
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_AUDIO_BYTES)
    {
        return Err("音频文件过大".into());
    }

    let temp = partial_path(target);
    remove_quietly(&temp);
    let mut source = response;
    let mut file =
        fs::File::create(&temp).map_err(|error| format!("创建音频临时文件失败 {error}"))?;
    let mut total = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = source.read(&mut buffer).map_err(|error| {
            remove_quietly(&temp);
            format!("读取哔哩哔哩音频失败 {error}")
        })?;
        if read == 0 {
            break;
        }
        total += read as u64;
        if total > MAX_AUDIO_BYTES {
            drop(file);
            remove_quietly(&temp);
            return Err("音频文件过大".into());
        }
        file.write_all(&buffer[..read]).map_err(|error| {
            remove_quietly(&temp);
            format!("写入哔哩哔哩音频失败 {error}")
        })?;
    }
    if total == 0 {
        drop(file);
        remove_quietly(&temp);
        return Err("哔哩哔哩音频为空".into());
    }
    file.sync_all().map_err(|error| {
        remove_quietly(&temp);
        format!("保存哔哩哔哩音频失败 {error}")
    })?;
    drop(file);
    if let Err(error) = fs::rename(&temp, target) {
        remove_quietly(&temp);
        if target.is_file() {
            return Ok(());
        }
        return Err(format!("保存哔哩哔哩音频失败 {error}"));
    }
    Ok(())
}

struct DownloadInput {
    url: String,
}

#[tauri::command]
pub async fn bilibili_cache_audio(
    app: AppHandle,
    url: String,
    bvid: String,
    cid: u64,
    audio_id: u32,
    extension: String,
) -> Result<BilibiliAudioCache, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validate_bvid(&bvid)?;
        if cid == 0 || audio_id == 0 {
            return Err("音频编号无效".into());
        }
        if extension != "flac" && extension != "m4a" {
            return Err("音频格式无效".into());
        }
        let media_url = validate_media_url(&url)?;
        let paths = ensure_storage_paths(&app)?;
        let cache_dir = paths.cache_dir.join("bilibili");
        fs::create_dir_all(&cache_dir)
            .map_err(|error| format!("创建哔哩哔哩缓存目录失败 {error}"))?;
        let target = cache_dir.join(format!("{bvid}-{cid}-{audio_id}.{extension}"));
        if target
            .metadata()
            .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
        {
            return Ok(BilibiliAudioCache {
                path: target.to_string_lossy().into_owned(),
                reused: true,
            });
        }

        let client = media_client()?;
        let input = DownloadInput {
            url: media_url.to_string(),
        };
        download_audio(&input, &target, &client, &app)?;
        Ok(BilibiliAudioCache {
            path: target.to_string_lossy().into_owned(),
            reused: false,
        })
    })
    .await
    .map_err(|error| format!("哔哩哔哩缓存任务失败 {error}"))?
}
