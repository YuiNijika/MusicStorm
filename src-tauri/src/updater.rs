// 自研自动更新（仅桌面端编译）：
// 从 GitHub Releases 下载对应平台安装包（NSIS setup.exe）到系统临时目录，
// 透传下载进度给前端，校验 sha256 后以静默模式启动安装并退出当前进程，
// 由安装器接管完成安装并拉起新版本。
use reqwest::blocking::Client;
use serde_json::json;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DOWNLOAD_NAME: &str = "MusicStorm-update.exe";
// 进度发射粒度：约每 512KB 一次，8MB 安装包约 16 次更新，足够顺滑
const PROGRESS_EMIT_BYTES: u64 = 512 * 1024;
const PROGRESS_EVENT: &str = "musicstorm:update-progress";

fn download_target() -> PathBuf {
    std::env::temp_dir().join(DOWNLOAD_NAME)
}

fn sha256_hex(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let mut file = File::open(path).map_err(|e| format!("读取安装包失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("读取安装包失败: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

// 下载安装包到临时目录，返回绝对路径。sha256 可选，传入时校验不匹配即删除并报错。
#[tauri::command]
pub async fn download_update(
    app: AppHandle,
    url: String,
    sha256: Option<String>,
) -> Result<String, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("下载地址为空".into());
    }

    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            // 下载本身可能较慢（镜像源），只限制连接与重定向，不设总超时
            .connect_timeout(Duration::from_secs(15))
            .user_agent(format!("MusicStorm-update/{}", option_env!("CARGO_PKG_VERSION").unwrap_or("dev")))
            .build()
            .map_err(|e| format!("创建下载客户端失败: {e}"))?;

        let response = client
            .get(url)
            .send()
            .map_err(|e| format!("下载安装包失败: {e}"))?
            .error_for_status()
            .map_err(|e| format!("下载安装包失败: {e}"))?;

        let total = response.content_length().unwrap_or(0);
        let dest = download_target();
        let mut file = File::create(&dest).map_err(|e| format!("创建临时文件失败: {e}"))?;

        let mut stream = response;
        let mut downloaded: u64 = 0;
        let mut buf = [0u8; 64 * 1024];
        let mut last_emit: u64 = 0;
        loop {
            let n = stream
                .read(&mut buf)
                .map_err(|e| format!("读取下载内容失败: {e}"))?;
            if n == 0 {
                break;
            }
            file.write_all(&buf[..n])
                .map_err(|e| format!("写入临时文件失败: {e}"))?;
            downloaded += n as u64;
            // 均匀粒度发射进度，避免高频 IPC
            if downloaded - last_emit >= PROGRESS_EMIT_BYTES {
                last_emit = downloaded;
                let _ = handle.emit(
                    PROGRESS_EVENT,
                    json!({ "downloaded": downloaded, "total": total }),
                );
            }
        }
        let _ = handle.emit(
            PROGRESS_EVENT,
            json!({ "downloaded": downloaded, "total": total }),
        );

        if total > 0 && downloaded != total {
            drop(file);
            let _ = std::fs::remove_file(&dest);
            return Err("下载不完整（大小不一致），已删除残留文件".into());
        }

        if let Some(expected) = sha256.filter(|s| !s.trim().is_empty()) {
            let actual = sha256_hex(&dest)?;
            if !actual.eq_ignore_ascii_case(expected.trim()) {
                drop(file);
                let _ = std::fs::remove_file(&dest);
                return Err("下载文件校验失败（sha256 不匹配），已删除残留文件".into());
            }
        }

        Ok(dest.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| format!("下载任务失败: {e}"))?;

    result
}

// 校验安装包存在并以静默模式启动安装，随后退出当前进程由安装器接管。
// 注意不能 wait()：NSIS 会等待原应用退出才替换文件，阻塞等待会造成死锁。
#[tauri::command]
pub fn install_update(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if !path.is_file() {
        return Err("安装包不存在".into());
    }
    std::process::Command::new(&path)
        .arg("/S")
        .spawn()
        .map_err(|e| format!("启动安装程序失败: {e}"))?;
    // 安装器接管后退出应用，由 NSIS 完成文件替换并启动新版本
    app.exit(0);
    Ok(())
}
