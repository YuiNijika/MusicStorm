use reqwest::blocking::Client;
use reqwest::header::{
    ACCEPT, ACCEPT_LANGUAGE, CONTENT_TYPE, LOCATION, REFERER, SET_COOKIE, USER_AGENT,
};
use reqwest::redirect::{Attempt, Policy};
use reqwest::Url;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::db::ensure_storage_paths;

const BILIBILI_REFERER: &str = "https://www.bilibili.com";
const BILIBILI_ORIGIN: &str = "https://www.bilibili.com";
const USER_AGENT_VALUE: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MAX_JSON_BYTES: u64 = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES: u64 = 200 * 1024 * 1024;
const CONNECT_TIMEOUT_SECONDS: u64 = 12;
const JSON_TIMEOUT_SECONDS: u64 = 15;
const REQUEST_TIMEOUT_SECONDS: u64 =180;
const COOKIE_VERSION: &str = "v1";
const PASSPORT_HOST: &str = "passport.bilibili.com";
const LOGIN_CALLBACK_HOST: &str = "passport.biligame.com";
const BILIBILI_CN_CALLBACK_HOST: &str = "passport.bilibili.cn";
const BILIBILI_CN_CALLBACK_PATH: &str = "/x/passport-login/web/crossDomain";
const BIGFUN_SSO_HOST: &str = "passport.bigfunapp.cn";
const BIGFUN_SSO_PATH: &str = "/api/v2/sso";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BilibiliAudioCache {
    path: String,
    reused: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BilibiliLoginCompletion {
    logged_in: bool,
}

fn api_path_allowed(path: &str) -> bool {
    matches!(
        path,
        "/x/web-interface/nav"
            | "/x/web-interface/wbi/search/type"
            | "/x/web-interface/popular"
            | "/x/web-interface/view"
 | "/x/web-interface/ranking/v2"
            | "/x/player/wbi/playurl"
 | "/x/v3/fav/folder/created/list-all"
 | "/x/v3/fav/folder/info"
 | "/x/v3/fav/resource/list"
    )
}

fn passport_path_allowed(path: &str) -> bool {
 path == "/x/passport-login/web/qrcode/generate"
 || path == "/x/passport-login/web/qrcode/poll"
}

fn validate_login_callback_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "登录回调地址无效".to_string())?;
    if url.scheme() != "https"
        || url.host_str() != Some(LOGIN_CALLBACK_HOST)
        || url.path() != "/x/passport-login/web/crossDomain"
        || url.username().len() > 0
        || url.password().is_some()
    {
        return Err("登录回调地址不受信任".into());
    }
    Ok(url)
}

fn validate_login_redirect_url(raw: &str) -> Result<Url, String> {
    let mut url = Url::parse(raw.trim()).map_err(|_| "登录跳转地址无效".to_string())?;
    let host = url
        .host_str()
        .unwrap_or_default()
        .trim_end_matches('.')
        .to_string();
    let is_bilibili_domain =
        host == "bilibili.com" || host.ends_with(".bilibili.com");
    let is_biligame_domain = host == "biligame.com" || host.ends_with(".biligame.com");
    let is_bilibili_cn_callback =
        host == BILIBILI_CN_CALLBACK_HOST && url.path() == BILIBILI_CN_CALLBACK_PATH;
    let is_bigfun_sso = host == BIGFUN_SSO_HOST && url.path() == BIGFUN_SSO_PATH;
    let host_allowed =
        is_bilibili_domain || is_biligame_domain || is_bilibili_cn_callback || is_bigfun_sso;
    let path_allowed = (host != BIGFUN_SSO_HOST || is_bigfun_sso)
        && (host != BILIBILI_CN_CALLBACK_HOST || is_bilibili_cn_callback);
    if url.scheme() == "http" && host_allowed && path_allowed {
        url.set_scheme("https")
            .map_err(|_| "登录跳转地址无效".to_string())?;
    }
    if url.scheme() != "https"
        || !host_allowed
        || !path_allowed
        || url.port().is_some()
        || url.username().len() > 0
        || url.password().is_some()
    {
        return Err(format!(
            "登录跳转地址不受信任 {}{}",
            host,
            url.path()
        ));
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::validate_login_redirect_url;

    #[test]
    fn accepts_bilibili_bigfun_sso_endpoint() {
        assert!(validate_login_redirect_url(
            "https://passport.bigfunapp.cn/api/v2/sso?ticket=test"
        )
        .is_ok());
        assert!(validate_login_redirect_url(
            "https://passport.bilibili.com/x/passport-login/web/crossDomain?ticket=test"
        )
        .is_ok());
        assert!(validate_login_redirect_url(
            "https://passport.bilibili.cn/x/passport-login/web/crossDomain?ticket=test"
        )
        .is_ok());
        assert!(validate_login_redirect_url("https://passport.biligame.com/").is_ok());
        assert!(validate_login_redirect_url("https://auth.bilibili.com/").is_ok());
        assert_eq!(
            validate_login_redirect_url("http://www.bilibili.com/").unwrap().scheme(),
            "https"
        );
    }

    #[test]
    fn rejects_other_bigfun_paths_and_lookalike_hosts() {
        assert!(validate_login_redirect_url("https://passport.bigfunapp.cn/other/path").is_err());
        assert!(validate_login_redirect_url(
            "https://passport.bigfunapp.cn.attacker.example/api/v2/sso"
        )
        .is_err());
        assert!(validate_login_redirect_url("https://passport.bilibili.cn/").is_err());
        assert!(validate_login_redirect_url(
            "https://passport.bilibili.cn.attacker.example/x/passport-login/web/crossDomain"
        )
        .is_err());
        assert!(validate_login_redirect_url("https://bilibili.com.attacker.example/").is_err());
        assert!(validate_login_redirect_url("https://passport.bilibili.com:8443/").is_err());
    }
}

fn collect_set_cookie(headers: &reqwest::header::HeaderMap, cookies: &mut BTreeMap<String, String>) {
    for value in headers.get_all(SET_COOKIE).iter() {
        let Ok(text) = value.to_str() else {
            continue;
        };
        let Some((name, value)) = text
            .split(';')
            .next()
            .and_then(|part| part.split_once('='))
        else {
            continue;
        };
        let name = name.trim();
        let value = value.trim();
        if !name.is_empty() && !value.is_empty() {
            cookies.insert(name.to_string(), value.to_string());
        }
    }
}

fn parse_cookie_header(header: &str) -> BTreeMap<String, String> {
    header
        .split(';')
        .filter_map(|part| {
            let (name, value) = part.trim().split_once('=')?;
            let name = name.trim();
            let value = value.trim();
            if name.is_empty() || value.is_empty() {
                return None;
            }
            Some((name.to_string(), value.to_string()))
        })
        .collect()
}

#[tauri::command]
pub async fn bilibili_complete_qr_login(
    app: AppHandle,
    callback_url: String,
) -> Result<BilibiliLoginCompletion, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut target = validate_login_callback_url(&callback_url)?;
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECONDS))
            .timeout(Duration::from_secs(JSON_TIMEOUT_SECONDS))
            .redirect(Policy::none())
            .build()
            .map_err(|error| format!("创建登录客户端失败 {error}"))?;
        let mut cookies = BTreeMap::new();

        for hop in 0..4 {
            let mut request = bilibili_headers(client.get(target.clone()));
            if !cookies.is_empty() {
                let cookie = cookies
                    .iter()
                    .map(|(name, value)| format!("{name}={value}"))
                    .collect::<Vec<_>>()
                    .join("; ");
                request = request.header(reqwest::header::COOKIE, cookie);
            }
            let response = request
                .send()
                .map_err(|error| format!("完成B站登录失败 {error}"))?;
            collect_set_cookie(response.headers(), &mut cookies);
            if !response.status().is_redirection() {
                break;
            }
            if hop == 3 {
                return Err("B站登录跳转次数过多".into());
            }
            let location = response
                .headers()
                .get(LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| "B站登录跳转地址缺失".to_string())?;
            let next = target
                .join(location)
                .map_err(|_| "登录跳转地址无效".to_string())?;
            target = validate_login_redirect_url(next.as_str())?;
        }

        let cookie = cookies
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        if !cookies.contains_key("SESSDATA") {
            return Err("B站登录未返回有效登录状态".into());
        }
        let response = json_client()?
            .get("https://api.bilibili.com/x/web-interface/nav")
            .header(reqwest::header::COOKIE, &cookie)
            .header(ACCEPT, "application/json")
            .header(ACCEPT_LANGUAGE, "zh-CN,zh;q=0.9")
            .header("Sec-Fetch-Site", "same-site")
            .header("Sec-Fetch-Mode", "cors")
            .send()
            .map_err(|_| "B站登录状态验证请求失败".to_string())?
            .error_for_status()
            .map_err(|_| "B站登录状态验证请求失败".to_string())?;
        let nav_bytes = response
            .bytes()
            .map_err(|_| "B站登录状态验证响应读取失败".to_string())?;
        let nav: Value = serde_json::from_slice(&nav_bytes)
            .map_err(|_| "B站登录状态验证响应无效".to_string())?;
        if nav.pointer("/data/isLogin").and_then(Value::as_bool) != Some(true) {
            return Err("登录回调已完成，但B站未确认登录状态".into());
        }

        write_cookie(&app, &cookie)?;
        Ok(BilibiliLoginCompletion { logged_in: true })
    })
    .await
    .map_err(|error| format!("B站登录任务失败 {error}"))?
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

fn cookie_path(app: &AppHandle) -> Result<PathBuf, String> {
 let paths = ensure_storage_paths(app)?;
 Ok(paths.config_dir.join("bilibili-cookie.bin"))
}

fn xor_cookie(bytes: &[u8], seed: u8) -> Vec<u8> {
 bytes
 .iter()
 .enumerate()
 .map(|(index, byte)| byte ^ seed.rotate_left((index %8) as u32))
 .collect()
}

fn read_cookie(app: &AppHandle) -> Option<String> {
 let path = cookie_path(app).ok()?;
 let encoded = fs::read(path).ok()?;
 if encoded.len() <5 || &encoded[..3] != COOKIE_VERSION.as_bytes() {
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
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("音频地址不受信任".into());
    }
    let host = url.host_str().ok_or_else(|| "音频地址缺少主机名".to_string())?;
    if !media_host_allowed(host) {
        return Err("音频地址不在哔哩哔哩媒体域名内".into());
    }
    Ok(url)
}

fn redirect_policy_for(
    validator: fn(&str) -> Result<Url, String>,
) -> Policy {
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
        .get_or_init(|| {
            build_client(
                validate_api_url,
                Duration::from_secs(JSON_TIMEOUT_SECONDS),
            )
        })
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
}

#[tauri::command]
pub async fn bilibili_get_json(app: AppHandle, url: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = validate_api_url(&url)?;
        let is_qr_poll = target.path() == "/x/passport-login/web/qrcode/poll";
        let client = json_client()?;
 let request = bilibili_headers(client.get(target));
 let request = if let Some(cookie) = read_cookie(&app) {
 request.header(reqwest::header::COOKIE, cookie)
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
        let mut response_cookies = BTreeMap::new();
        if is_qr_poll {
            collect_set_cookie(response.headers(), &mut response_cookies);
            if response_cookies.contains_key("SESSDATA") {
                let cookie = if let Some(existing) = read_cookie(&app) {
                    let mut merged = parse_cookie_header(&existing);
                    merged.append(&mut response_cookies);
                    merged
                } else {
                    response_cookies
                };
                let cookie = cookie
                    .iter()
                    .map(|(name, value)| format!("{name}={value}"))
                    .collect::<Vec<_>>()
                    .join("; ");
                write_cookie(&app, &cookie)?;
            }
        }
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

fn download_audio_headers(
 request: reqwest::blocking::RequestBuilder,
 app: &AppHandle,
) -> reqwest::blocking::RequestBuilder {
 let request = bilibili_headers(request);
 if let Some(cookie) = read_cookie(app) {
 request.header(reqwest::header::COOKIE, cookie)
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
    let mut file = fs::File::create(&temp)
        .map_err(|error| format!("创建音频临时文件失败 {error}"))?;
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
