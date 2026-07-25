//! rodio 播放内核：仅本地 path（远程由前端 H5 处理）

use crate::audio::{emit_tick, AudioTickPayload};
use rodio::{Decoder, OutputStream, Sink, Source};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

pub struct PlayerHandle {
    cmd_tx: Mutex<mpsc::Sender<PlayerCmd>>,
    volume: Arc<Mutex<f32>>,
}

enum PlayerCmd {
    Load {
        source: String,
        reply: mpsc::Sender<Result<(), String>>,
    },
    Play {
        source: String,
        reply: mpsc::Sender<Result<(), String>>,
    },
    Pause,
    Seek(f64),
    Stop,
}

struct SharedPlayback {
    position_ms: AtomicU64,
    duration_ms: AtomicU64,
    playing: AtomicBool,
    ended: AtomicBool,
}

impl PlayerHandle {
    pub fn load(&self, source: String, remote: bool) -> Result<(), String> {
        if remote || is_remote_source(&source) {
            return Err("原生引擎仅支持本地文件".into());
        }
        let (tx, rx) = mpsc::channel();
        self.send(PlayerCmd::Load { source, reply: tx })?;
        rx.recv_timeout(Duration::from_secs(5))
            .map_err(|_| "load 超时".to_string())?
    }

    pub fn play(&self, source: String, remote: bool) -> Result<(), String> {
        if remote || is_remote_source(&source) {
            return Err("原生引擎仅支持本地文件".into());
        }
        let (tx, rx) = mpsc::channel();
        self.send(PlayerCmd::Play { source, reply: tx })?;
        rx.recv_timeout(Duration::from_secs(30))
            .map_err(|_| "play 超时".to_string())?
    }

    pub fn pause(&self) {
        let _ = self.send(PlayerCmd::Pause);
    }

    pub fn seek(&self, position_ms: f64) {
        let _ = self.send(PlayerCmd::Seek(position_ms));
    }

    pub fn set_volume(&self, volume: f32) {
        if let Ok(mut v) = self.volume.lock() {
            *v = volume.clamp(0.0, 1.0);
        }
    }

    pub fn stop(&self) {
        let _ = self.send(PlayerCmd::Stop);
    }

    fn send(&self, cmd: PlayerCmd) -> Result<(), String> {
        self.cmd_tx
            .lock()
            .map_err(|_| "cmd lock".to_string())?
            .send(cmd)
            .map_err(|_| "player channel closed".to_string())
    }
}

pub struct PlayerInner;

impl PlayerInner {
    pub fn start(app: AppHandle) -> Result<PlayerHandle, String> {
        let (tx, rx) = mpsc::channel::<PlayerCmd>();
        let volume = Arc::new(Mutex::new(0.8_f32));
        let volume_worker = Arc::clone(&volume);
        let shared = Arc::new(SharedPlayback {
            position_ms: AtomicU64::new(0),
            duration_ms: AtomicU64::new(0),
            playing: AtomicBool::new(false),
            ended: AtomicBool::new(false),
        });
        let shared_tick = Arc::clone(&shared);

        thread::Builder::new()
            .name("audio-player".into())
            .spawn(move || {
                if let Err(error) = run_worker(app, rx, volume_worker, shared_tick) {
                    eprintln!("[audio] worker exit: {error}");
                }
            })
            .map_err(|e| e.to_string())?;

        Ok(PlayerHandle {
            cmd_tx: Mutex::new(tx),
            volume,
        })
    }
}

fn is_remote_source(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn run_worker(
    app: AppHandle,
    rx: mpsc::Receiver<PlayerCmd>,
    volume: Arc<Mutex<f32>>,
    shared: Arc<SharedPlayback>,
) -> Result<(), String> {
    let (_stream, handle) =
        OutputStream::try_default().map_err(|e| format!("无法打开音频输出: {e}"))?;
    let sink = Sink::try_new(&handle).map_err(|e| format!("无法创建播放器: {e}"))?;
    sink.pause();

    let mut last_volume = -1.0_f32;
    let mut current_source: Option<String> = None;
    // sink 内是否已有可恢复的缓冲（同 path 的 play 只 resume）
    let mut has_buffer = false;

    let app_tick = app.clone();
    let shared_tick = Arc::clone(&shared);
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(200));
        let position_ms = f64::from_bits(shared_tick.position_ms.load(Ordering::Relaxed));
        let duration_ms = f64::from_bits(shared_tick.duration_ms.load(Ordering::Relaxed));
        let ended = shared_tick.ended.swap(false, Ordering::Relaxed);
        if shared_tick.playing.load(Ordering::Relaxed) || ended {
            emit_tick(
                &app_tick,
                AudioTickPayload {
                    position_ms,
                    duration_ms,
                    ended,
                },
            );
        }
    });

    loop {
        match rx.recv_timeout(Duration::from_millis(50)) {
            Ok(PlayerCmd::Load { source, reply }) => {
                let result = validate_local_path(&source).map(|_| ());
                if result.is_ok() {
                    current_source = Some(source);
                }
                let _ = reply.send(result);
            }
            Ok(PlayerCmd::Play { source, reply }) => {
                let same = current_source.as_ref() == Some(&source);
                let result = if same && has_buffer && !sink.empty() {
                    // 同曲 resume：不重置进度
                    if let Ok(v) = volume.lock() {
                        sink.set_volume(*v);
                        last_volume = *v;
                    }
                    sink.play();
                    shared.playing.store(true, Ordering::Relaxed);
                    shared.ended.store(false, Ordering::Relaxed);
                    Ok(())
                } else {
                    match start_playback_from(&sink, &source, &shared, 0.0) {
                        Ok(()) => {
                            current_source = Some(source);
                            has_buffer = true;
                            if let Ok(v) = volume.lock() {
                                sink.set_volume(*v);
                                last_volume = *v;
                            }
                            sink.play();
                            shared.playing.store(true, Ordering::Relaxed);
                            shared.ended.store(false, Ordering::Relaxed);
                            Ok(())
                        }
                        Err(error) => {
                            eprintln!("[audio] play error: {error}");
                            has_buffer = false;
                            shared.playing.store(false, Ordering::Relaxed);
                            Err(error)
                        }
                    }
                };
                let _ = reply.send(result);
            }
            Ok(PlayerCmd::Pause) => {
                sink.pause();
                shared.playing.store(false, Ordering::Relaxed);
            }
            Ok(PlayerCmd::Seek(ms)) => {
                let target = ms.max(0.0);
                let Some(source) = current_source.clone() else {
                    shared
                        .position_ms
                        .store(target.to_bits(), Ordering::Relaxed);
                    continue;
                };
                let was_playing = shared.playing.load(Ordering::Relaxed);

                // 优先 try_seek（格式支持时即时跳转）
                let seeked = if has_buffer && !sink.empty() {
                    sink.try_seek(Duration::from_millis(target as u64)).is_ok()
                } else {
                    false
                };

                if seeked {
                    shared
                        .position_ms
                        .store(target.to_bits(), Ordering::Relaxed);
                } else {
                    // 回退：重开 decoder + skip_duration
                    match start_playback_from(&sink, &source, &shared, target) {
                        Ok(()) => {
                            has_buffer = true;
                            if let Ok(v) = volume.lock() {
                                sink.set_volume(*v);
                                last_volume = *v;
                            }
                            if was_playing {
                                sink.play();
                                shared.playing.store(true, Ordering::Relaxed);
                            } else {
                                sink.pause();
                                shared.playing.store(false, Ordering::Relaxed);
                            }
                            shared.ended.store(false, Ordering::Relaxed);
                        }
                        Err(error) => {
                            eprintln!("[audio] seek error: {error}");
                        }
                    }
                }
            }
            Ok(PlayerCmd::Stop) => {
                sink.stop();
                has_buffer = false;
                shared.playing.store(false, Ordering::Relaxed);
                shared.position_ms.store(0f64.to_bits(), Ordering::Relaxed);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if let Ok(v) = volume.lock() {
            if (*v - last_volume).abs() > 0.001 {
                sink.set_volume(*v);
                last_volume = *v;
            }
        }

        if shared.playing.load(Ordering::Relaxed) && sink.empty() {
            shared.playing.store(false, Ordering::Relaxed);
            shared.ended.store(true, Ordering::Relaxed);
            has_buffer = false;
            let duration = f64::from_bits(shared.duration_ms.load(Ordering::Relaxed));
            shared
                .position_ms
                .store(duration.to_bits(), Ordering::Relaxed);
        } else if shared.playing.load(Ordering::Relaxed) {
            let pos = f64::from_bits(shared.position_ms.load(Ordering::Relaxed));
            let duration = f64::from_bits(shared.duration_ms.load(Ordering::Relaxed));
            let next = if duration > 0.0 {
                (pos + 50.0).min(duration)
            } else {
                pos + 50.0
            };
            shared.position_ms.store(next.to_bits(), Ordering::Relaxed);
        }
    }

    Ok(())
}

fn validate_local_path(source: &str) -> Result<std::path::PathBuf, String> {
    if is_remote_source(source) {
        return Err("原生引擎仅支持本地文件".into());
    }

    let path = source
        .strip_prefix("file:///")
        .or_else(|| source.strip_prefix("file://"))
        .unwrap_or(source);
    let path = if cfg!(windows)
        && path.starts_with('/')
        && path.len() > 2
        && path.as_bytes().get(2) == Some(&b':')
    {
        &path[1..]
    } else {
        path
    };
    let path = Path::new(path);
    if !path.exists() {
        return Err(format!("文件不存在: {}", path.display()));
    }
    Ok(path.to_path_buf())
}

/// 从 offset_ms 开始解码入 sink（skip_duration 兜底真 seek）
fn start_playback_from(
    sink: &Sink,
    source: &str,
    shared: &SharedPlayback,
    offset_ms: f64,
) -> Result<(), String> {
    sink.stop();

    let path_buf = validate_local_path(source)?;
    let file = File::open(&path_buf).map_err(|e| format!("打开文件失败: {e}"))?;
    let reader = BufReader::new(file);
    let decoder = Decoder::new(reader).map_err(|e| format!("解码失败: {e}"))?;

    if let Some(total) = decoder.total_duration() {
        shared.duration_ms.store(
            (total.as_secs_f64() * 1000.0).to_bits(),
            Ordering::Relaxed,
        );
    } else {
        // 保留扫描写入的 duration（前端已有则 tick 会用引擎值；此处不强制清 0）
    }

    let duration_ms = f64::from_bits(shared.duration_ms.load(Ordering::Relaxed));
    let clamped = if duration_ms > 0.0 {
        offset_ms.clamp(0.0, duration_ms)
    } else {
        offset_ms.max(0.0)
    };
    let offset = Duration::from_millis(clamped as u64);

    // 始终 skip_duration，offset=0 等价从头播
    let audio = decoder.skip_duration(offset);
    sink.append(audio);

    shared
        .position_ms
        .store(clamped.to_bits(), Ordering::Relaxed);
    Ok(())
}