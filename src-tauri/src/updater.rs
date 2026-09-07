// 自研自动更新（仅桌面端编译）：
// 从 GitHub Releases 下载对应平台安装包（NSIS setup.exe）到应用缓存目录，
// 透传下载进度给前端，校验 sha256 后以静默模式启动安装并退出当前进程，
// 由安装器接管完成安装并拉起新版本；历史安装包由新实例启动时清理。
use reqwest::blocking::Client;
use serde_json::json;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DOWNLOAD_NAME: &str = "MusicStorm-setup.exe";
// 进度发射粒度：约每 512KB 一次，8MB 安装包约 16 次更新，足够顺滑
const PROGRESS_EMIT_BYTES: u64 = 512 * 1024;
const PROGRESS_EVENT: &str = "musicstorm:update-progress";

// 安装包缓存目录：应用运行目录（exe 同级）下的 updates 文件夹，
// 不放 AppData——方便用户查看与清理；开发环境即 target/debug/updates
fn updates_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "无法定位程序运行目录".to_string())?
        .join("updates");
    Ok(dir)
}

fn download_target() -> Result<PathBuf, String> {
    let dir = updates_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建缓存目录失败: {e}"))?;
    Ok(dir.join(DOWNLOAD_NAME))
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

// 下载安装包到应用缓存目录，返回绝对路径。sha256 可选，传入时校验不匹配即删除并报错。
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
    let dest = download_target()?;

    let handle = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut builder = Client::builder()
            // 下载本身可能较慢（镜像源），只限制连接与重定向，不设总超时
            .connect_timeout(Duration::from_secs(15))
            .user_agent(format!("MusicStorm-update/{}", option_env!("CARGO_PKG_VERSION").unwrap_or("dev")));
        // 直连 GitHub 失败时（如走系统代理的网络），读取代理环境变量手动接管
        let proxy_env = std::env::var("HTTPS_PROXY")
            .or_else(|_| std::env::var("https_proxy"))
            .or_else(|_| std::env::var("ALL_PROXY"))
            .or_else(|_| std::env::var("all_proxy"));
        if let Ok(proxy) = proxy_env {
            let proxy = proxy.trim();
            if !proxy.is_empty() {
                if let Ok(proxy) = reqwest::Proxy::all(proxy) {
                    builder = builder.proxy(proxy);
                }
            }
        }
        let client = builder
            .build()
            .map_err(|e| format!("创建下载客户端失败: {e}"))?;

        let response = client
            .get(url)
            .send()
            .map_err(|e| format!("下载安装包失败: {e}"))?
            .error_for_status()
            .map_err(|e| format!("下载安装包失败: {e}"))?;

        let total = response.content_length().unwrap_or(0);
        let mut file = File::create(&dest).map_err(|e| format!("创建缓存文件失败: {e}"))?;

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
                .map_err(|e| format!("写入缓存文件失败: {e}"))?;
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

// 拉起安装器（显示安装向导），随即退出主进程由 NSIS 接管。
// - 不带 /S：显示向导让用户自己选择安装目录，而非静默装到固定位置
// - 直接 spawn 的子进程会继承本进程的 Job Object，`app.exit()` 触发
//   WebView/进程组清理时安装器会被连带终止，表现为“setup 没被拉起”。
//   因此 Windows 上以 CREATE_BREAKAWAY_FROM_JOB 创建进程（脱离 Job）；
//   若当前 Job 不允许 Breakaway（spawn 失败），退化为 explorer.exe 拉起
//   （系统进程，不在本应用 Job 内）
// - 不 wait、不探测：NSIS 需要等原进程退出才能替换文件，长时间停留会被
//   安装器视为目标进程占用而异常退出/中断安装
// - 安装完成后自动运行新版本由安装包内 NSIS_HOOK_POSTINSTALL 钩子完成
//   （tauri.conf.json nsis.installerHooks → nsis/after-install.nsh）
#[tauri::command]
pub fn install_update(app: AppHandle, path: String) -> Result<(), String> {
    let path = PathBuf::from(path.trim());
    if !path.is_file() {
        return Err("安装包不存在".into());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_BREAKAWAY_FROM_JOB：脱离父进程 Job Object，主程序退出不影响安装器
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x0100_0000;
        if std::process::Command::new(&path)
            .creation_flags(CREATE_BREAKAWAY_FROM_JOB)
            .spawn()
            .is_ok()
        {
            schedule_exit(app);
            return Ok(());
        }
        // 回退：explorer 拉起（脱离 Job，效果一致）
    }

    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("启动安装程序失败: {e}"))?;
    schedule_exit(app);
    Ok(())
}

// 安装器已拉起：给其脱离进程树并显示向导的时间，随后干净退出主进程。
// 放到独立线程延迟执行，命令先返回 Ok，前端能收到“已启动安装”而非窗口销毁的错误。
fn schedule_exit(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(1500));
        app.exit(0);
    });
}

// 查询缓存目录是否已有匹配的安装包（大小 + sha256 均匹配才算有效）。
// 命中则直接返回路径由前端拉起，避免重复下载；不匹配的旧文件删除。
#[tauri::command]
pub fn find_local_setup(
    expected_size: Option<u64>,
    expected_sha256: Option<String>,
) -> Result<Option<String>, String> {
    let dest = download_target()?;
    if !dest.is_file() {
        return Ok(None);
    }
    if let Some(size) = expected_size {
        let actual = std::fs::metadata(&dest)
            .map(|m| m.len())
            .unwrap_or(0);
        if actual != size {
            let _ = std::fs::remove_file(&dest);
            return Ok(None);
        }
    }
    if let Some(expected) = expected_sha256.filter(|s| !s.trim().is_empty()) {
        let actual = sha256_hex(&dest)?;
        if !actual.eq_ignore_ascii_case(expected.trim()) {
            let _ = std::fs::remove_file(&dest);
            return Ok(None);
        }
    }
    Ok(Some(dest.to_string_lossy().into_owned()))
}

// 启动时清理历史安装包：安装完成后旧进程退出、新实例启动，此时清空缓存目录
// 正好回收已用过的 setup，避免残留占用磁盘
pub fn cleanup_stale_updates() {
    if let Ok(dir) = updates_dir() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}
