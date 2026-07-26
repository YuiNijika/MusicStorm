//! 网易云 HTTP 代理：前端完成 weapi/eapi 加密，Rust 负责无 CORS 的 POST

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, COOKIE, REFERER, USER_AGENT};
use serde::Serialize;
use std::time::Duration;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeteaseHttpResponse {
    pub status: u16,
    pub body: String,
    pub cookies: Vec<String>,
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(25))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

/// 向 music.163.com / interface 域 POST form-urlencoded 体
#[tauri::command]
pub fn netease_http_post(
    url: String,
    body: String,
    cookie: Option<String>,
    user_agent: Option<String>,
    referer: Option<String>,
    real_ip: Option<String>,
) -> Result<NeteaseHttpResponse, String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("请求 URL 为空".into());
    }
    if !(url.starts_with("https://music.163.com")
        || url.starts_with("https://interface.music.163.com")
        || url.starts_with("https://interface3.music.163.com")
        || url.starts_with("https://interfacepc.music.163.com"))
    {
        return Err("不允许的网易云请求域名".into());
    }

    let client = build_client()?;
    let mut headers = HeaderMap::new();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/x-www-form-urlencoded"),
    );
    if let Some(ua) = user_agent.as_deref().filter(|s| !s.is_empty()) {
        if let Ok(v) = HeaderValue::from_str(ua) {
            headers.insert(USER_AGENT, v);
        }
    }
    if let Some(ref_url) = referer.as_deref().filter(|s| !s.is_empty()) {
        if let Ok(v) = HeaderValue::from_str(ref_url) {
            headers.insert(REFERER, v);
        }
    }
    if let Some(ck) = cookie.as_deref().filter(|s| !s.is_empty()) {
        if let Ok(v) = HeaderValue::from_str(ck) {
            headers.insert(COOKIE, v);
        }
    }
    if let Some(ip) = real_ip.as_deref().filter(|s| !s.is_empty()) {
        if let Ok(v) = HeaderValue::from_str(ip) {
            headers.insert(HeaderName::from_static("x-real-ip"), v.clone());
            headers.insert(HeaderName::from_static("x-forwarded-for"), v);
        }
    }

    let response = client
        .post(url)
        .headers(headers)
        .body(body)
        .send()
        .map_err(|e| format!("网易云请求失败: {e}"))?;

    let status = response.status().as_u16();
    let mut cookies = Vec::new();
    for value in response.headers().get_all(reqwest::header::SET_COOKIE) {
        if let Ok(s) = value.to_str() {
            // 只取 name=value 段
            let first = s.split(';').next().unwrap_or(s).trim();
            if !first.is_empty() {
                cookies.push(first.to_string());
            }
        }
    }

    let body = response
        .text()
        .map_err(|e| format!("读取响应失败: {e}"))?;

    if body.len() > 8 * 1024 * 1024 {
        return Err("响应过大".into());
    }

    Ok(NeteaseHttpResponse {
        status,
        body,
        cookies,
    })
}