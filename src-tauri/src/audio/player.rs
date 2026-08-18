// rodio 本地播放内核；远程 URL 由前端 H5 处理

use crate::audio::{emit_ended, emit_tick, AudioTickPayload};
use crate::audio::eq::{eq_source, EqState};
use rodio::source::SeekError as RodioSeekError;
use rodio::{OutputStream, Sink, Source};
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use symphonia::core::audio::{SampleBuffer, SignalSpec};
use symphonia::core::codecs::{Decoder as SymDecoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymError;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{self, Time};
use symphonia::default::{get_codecs, get_probe};
use lofty::file::AudioFile;
use tauri::AppHandle;

pub struct PlayerHandle {
    cmd_tx: Mutex<mpsc::Sender<PlayerCmd>>,
    volume: Arc<Mutex<f32>>,
    ffmpeg_path: Arc<Mutex<Option<PathBuf>>>,
    eq: Arc<EqState>,
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
    Seek {
        position_ms: f64,
        /// 前端 isPlaying：seek 后应继续播（避免再插一条 play 打散合并）
        resume: bool,
        reply: mpsc::Sender<Result<(), String>>,
    },
    Stop,
}

struct SharedPlayback {
    position_ms: AtomicU64,
    duration_ms: AtomicU64,
    playing: AtomicBool,
    ended: AtomicBool,
    /// seek 期间禁止 empty→ended 与进度虚增
    seeking: AtomicBool,
}

impl PlayerHandle {
    pub fn load(&self, source: String, remote: bool) -> Result<(), String> {
        if remote || is_remote_source(&source) {
            return Err("仅支持本地文件".into());
        }
        let (tx, rx) = mpsc::channel();
        self.send(PlayerCmd::Load { source, reply: tx })?;
        rx.recv_timeout(Duration::from_secs(5))
            .map_err(|_| "load 超时".to_string())?
    }

    pub fn play(&self, source: String, remote: bool) -> Result<(), String> {
        if remote || is_remote_source(&source) {
            return Err("仅支持本地文件".into());
        }
        let (tx, rx) = mpsc::channel();
        self.send(PlayerCmd::Play { source, reply: tx })?;
        rx.recv_timeout(Duration::from_secs(30))
            .map_err(|_| "play 超时".to_string())?
    }

    pub fn pause(&self) {
        let _ = self.send(PlayerCmd::Pause);
    }

    pub fn seek(&self, position_ms: f64, resume: bool) -> Result<(), String> {
        let (tx, rx) = mpsc::channel();
        self.send(PlayerCmd::Seek {
            position_ms,
            resume,
            reply: tx,
        })?;
        // try_seek 应很快；极端兜底也限制在数秒内，避免前端永久挂起
        rx.recv_timeout(Duration::from_secs(12))
            .map_err(|_| "seek 超时".to_string())?
    }

    pub fn set_volume(&self, volume: f32) {
        if let Ok(mut v) = self.volume.lock() {
            *v = volume.clamp(0.0, 1.0);
        }
    }

    pub fn set_ffmpeg_path(&self, path: Option<PathBuf>) {
        if let Ok(mut current) = self.ffmpeg_path.lock() {
            *current = path;
        }
    }

    /// 实时更新 EQ 增益；enabled 为 false 时等效平直
    pub fn set_eq(&self, gains: &[f32], enabled: bool) {
        self.eq.set_gains(gains, enabled);
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
    pub fn start(app: AppHandle, ffmpeg_path: Option<PathBuf>) -> Result<PlayerHandle, String> {
        let (tx, rx) = mpsc::channel::<PlayerCmd>();
        let volume = Arc::new(Mutex::new(0.8_f32));
        let volume_worker = Arc::clone(&volume);
        let ffmpeg_path = Arc::new(Mutex::new(ffmpeg_path));
        let ffmpeg_path_worker = Arc::clone(&ffmpeg_path);
        let eq = EqState::new();
        let eq_worker = Arc::clone(&eq);
        let shared = Arc::new(SharedPlayback {
            position_ms: AtomicU64::new(0),
            duration_ms: AtomicU64::new(0),
            playing: AtomicBool::new(false),
            ended: AtomicBool::new(false),
            seeking: AtomicBool::new(false),
        });
        let shared_tick = Arc::clone(&shared);

        thread::Builder::new()
            .name("audio-player".into())
            .spawn(move || {
                if let Err(error) = run_worker(
                    app,
                    rx,
                    volume_worker,
                    shared_tick,
                    ffmpeg_path_worker,
                    eq_worker,
                ) {
                    eprintln!("[audio] worker exit: {error}");
                }
            })
            .map_err(|e| e.to_string())?;

        Ok(PlayerHandle {
            cmd_tx: Mutex::new(tx),
            volume,
            ffmpeg_path,
            eq,
        })
    }
}

fn is_remote_source(source: &str) -> bool {
    let lower = source.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn current_ffmpeg_path(path: &Arc<Mutex<Option<PathBuf>>>) -> Option<PathBuf> {
    path.lock().ok().and_then(|value| value.clone())
}

fn run_worker(
    app: AppHandle,
    rx: mpsc::Receiver<PlayerCmd>,
    volume: Arc<Mutex<f32>>,
    shared: Arc<SharedPlayback>,
    ffmpeg_path: Arc<Mutex<Option<PathBuf>>>,
    eq: Arc<EqState>,
) -> Result<(), String> {
    let (_stream, handle) =
        OutputStream::try_default().map_err(|e| format!("无法打开音频输出: {e}"))?;
    let sink = Sink::try_new(&handle).map_err(|e| format!("无法创建播放器: {e}"))?;
    sink.pause();

    let mut last_volume = -1.0_f32;
    let mut current_source: Option<String> = None;
    // sink 内是否已有可恢复缓冲；同 path 的 play 只 resume
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
                // Load 换源必须丢掉旧缓冲，否则 play 同 path 会误走 resume
                sink.stop();
                has_buffer = false;
                shared.playing.store(false, Ordering::Relaxed);
                shared.ended.store(false, Ordering::Relaxed);
                shared
                    .position_ms
                    .store(0f64.to_bits(), Ordering::Relaxed);
                let result = validate_local_path(&source).map(|_| ());
                if result.is_ok() {
                    current_source = Some(source);
                } else {
                    current_source = None;
                }
                let _ = reply.send(result);
            }
            Ok(PlayerCmd::Play { source, reply }) => {
                let result = apply_play(
                    &sink,
                    &shared,
                    &volume,
                    &mut last_volume,
                    &mut has_buffer,
                    &mut current_source,
                    source,
                    current_ffmpeg_path(&ffmpeg_path).as_deref(),
                    &eq,
                );
                let _ = reply.send(result);
            }
            Ok(PlayerCmd::Pause) => {
                sink.pause();
                shared.playing.store(false, Ordering::Relaxed);
            }
            Ok(PlayerCmd::Seek {
                position_ms,
                resume,
                reply,
            }) => {
                // 合并连续 Seek，只落地最后一次；任一次 resume=true 则 seek 后继续播
                let mut target = position_ms.max(0.0);
                let mut want_resume = resume;
                let mut replies = vec![reply];
                let mut deferred: Vec<PlayerCmd> = Vec::new();
                while let Ok(cmd) = rx.try_recv() {
                    match cmd {
                        PlayerCmd::Seek {
                            position_ms: next_ms,
                            resume: next_resume,
                            reply: next_reply,
                        } => {
                            target = next_ms.max(0.0);
                            want_resume = want_resume || next_resume;
                            replies.push(next_reply);
                        }
                        other => deferred.push(other),
                    }
                }

                shared.seeking.store(true, Ordering::Relaxed);
                shared.ended.store(false, Ordering::Relaxed);
                apply_seek(
                    &sink,
                    &shared,
                    &volume,
                    &mut last_volume,
                    &mut has_buffer,
                    &current_source,
                    target,
                    want_resume,
                    current_ffmpeg_path(&ffmpeg_path).as_deref(),
                    &eq,
                );
                shared.seeking.store(false, Ordering::Relaxed);
                for r in replies {
                    let _ = r.send(Ok(()));
                }

                for cmd in deferred {
                    match cmd {
                        PlayerCmd::Load { source, reply } => {
                            sink.stop();
                            has_buffer = false;
                            shared.playing.store(false, Ordering::Relaxed);
                            shared.ended.store(false, Ordering::Relaxed);
                            shared
                                .position_ms
                                .store(0f64.to_bits(), Ordering::Relaxed);
                            let result = validate_local_path(&source).map(|_| ());
                            if result.is_ok() {
                                current_source = Some(source);
                            } else {
                                current_source = None;
                            }
                            let _ = reply.send(result);
                        }
                        PlayerCmd::Play { source, reply } => {
                            let result = apply_play(
                                &sink,
                                &shared,
                                &volume,
                                &mut last_volume,
                                &mut has_buffer,
                                &mut current_source,
                                source,
                                current_ffmpeg_path(&ffmpeg_path).as_deref(),
                                &eq,
                            );
                            let _ = reply.send(result);
                        }
                        PlayerCmd::Pause => {
                            sink.pause();
                            shared.playing.store(false, Ordering::Relaxed);
                        }
                        PlayerCmd::Stop => {
                            sink.stop();
                            has_buffer = false;
                            shared.playing.store(false, Ordering::Relaxed);
                            shared
                                .position_ms
                                .store(0f64.to_bits(), Ordering::Relaxed);
                        }
                        PlayerCmd::Seek {
                            position_ms: next_ms,
                            resume: next_resume,
                            reply: next_reply,
                        } => {
                            shared.seeking.store(true, Ordering::Relaxed);
                            apply_seek(
                                &sink,
                                &shared,
                                &volume,
                                &mut last_volume,
                                &mut has_buffer,
                                &current_source,
                                next_ms.max(0.0),
                                next_resume,
                                current_ffmpeg_path(&ffmpeg_path).as_deref(),
                                &eq,
                            );
                            shared.seeking.store(false, Ordering::Relaxed);
                            let _ = next_reply.send(Ok(()));
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

        // seek 中 sink 可能短暂 empty，禁止误 ended；也不虚增进度
        if shared.seeking.load(Ordering::Relaxed) {
            continue;
        }

        // 仅在有缓冲且 sink 自然耗尽时 ended；seek 失败后 has_buffer=false 不会误触发
        if shared.playing.load(Ordering::Relaxed) && has_buffer && sink.empty() {
            shared.playing.store(false, Ordering::Relaxed);
            shared.ended.store(true, Ordering::Relaxed);
            has_buffer = false;
            let duration = f64::from_bits(shared.duration_ms.load(Ordering::Relaxed));
            shared
                .position_ms
                .store(duration.to_bits(), Ordering::Relaxed);
            emit_ended(&app);
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

fn apply_play(
    sink: &Sink,
    shared: &SharedPlayback,
    volume: &Arc<Mutex<f32>>,
    last_volume: &mut f32,
    has_buffer: &mut bool,
    current_source: &mut Option<String>,
    source: String,
    ffmpeg_path: Option<&Path>,
    eq: &Arc<EqState>,
) -> Result<(), String> {
    let same = current_source.as_ref() == Some(&source);
    // 仅同曲且 sink 仍有该曲缓冲时 resume；否则一律重开，避免切源后误续播
    if same && *has_buffer && !sink.empty() {
        if let Ok(v) = volume.lock() {
            sink.set_volume(*v);
            *last_volume = *v;
        }
        sink.play();
        shared.playing.store(true, Ordering::Relaxed);
        shared.ended.store(false, Ordering::Relaxed);
        return Ok(());
    }

    match start_playback_from(sink, &source, shared, 0.0, ffmpeg_path, eq) {
        Ok(()) => {
            *current_source = Some(source);
            *has_buffer = true;
            if let Ok(v) = volume.lock() {
                sink.set_volume(*v);
                *last_volume = *v;
            }
            sink.play();
            shared.playing.store(true, Ordering::Relaxed);
            shared.ended.store(false, Ordering::Relaxed);
            Ok(())
        }
        Err(error) => {
            eprintln!("[audio] play error: {error}");
            *has_buffer = false;
            shared.playing.store(false, Ordering::Relaxed);
            shared.ended.store(false, Ordering::Relaxed);
            Err(error)
        }
    }
}

fn apply_seek(
    sink: &Sink,
    shared: &SharedPlayback,
    volume: &Arc<Mutex<f32>>,
    last_volume: &mut f32,
    has_buffer: &mut bool,
    current_source: &Option<String>,
    target: f64,
    resume: bool,
    ffmpeg_path: Option<&Path>,
    eq: &Arc<EqState>,
) {
    let Some(source) = current_source.clone() else {
        shared
            .position_ms
            .store(target.to_bits(), Ordering::Relaxed);
        return;
    };
    // 原生 playing 或前端要求 resume
    let was_playing = shared.playing.load(Ordering::Relaxed) || resume;

    // 优先 sink 内 try_seek（容器索引，近 O(1)）
    let seeked = if *has_buffer && !sink.empty() {
        sink.try_seek(Duration::from_millis(target as u64)).is_ok()
    } else {
        false
    };

    if seeked {
        shared
            .position_ms
            .store(target.to_bits(), Ordering::Relaxed);
        shared.ended.store(false, Ordering::Relaxed);
        if was_playing {
            sink.play();
            shared.playing.store(true, Ordering::Relaxed);
        }
        return;
    }

    // 回退：重开播放源（内部用 symphonia 做容器 seek，PotPlayer 风格）
    // 先清 has_buffer，避免 stop 后 empty 被当成播完
    *has_buffer = false;
    shared.playing.store(false, Ordering::Relaxed);

    match start_playback_from(sink, &source, shared, target, ffmpeg_path, eq) {
        Ok(()) => {
            *has_buffer = true;
            if let Ok(v) = volume.lock() {
                sink.set_volume(*v);
                *last_volume = *v;
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
            if was_playing {
                match start_playback_from(sink, &source, shared, 0.0, ffmpeg_path, eq) {
                    Ok(()) => {
                        *has_buffer = true;
                        if let Ok(v) = volume.lock() {
                            sink.set_volume(*v);
                            *last_volume = *v;
                        }
                        sink.play();
                        shared.playing.store(true, Ordering::Relaxed);
                        shared.ended.store(false, Ordering::Relaxed);
                    }
                    Err(recover_err) => {
                        eprintln!("[audio] seek recover error: {recover_err}");
                        *has_buffer = false;
                        shared.playing.store(false, Ordering::Relaxed);
                        shared.ended.store(false, Ordering::Relaxed);
                        shared
                            .position_ms
                            .store(target.to_bits(), Ordering::Relaxed);
                    }
                }
            } else {
                *has_buffer = false;
                shared.playing.store(false, Ordering::Relaxed);
                shared.ended.store(false, Ordering::Relaxed);
                shared
                    .position_ms
                    .store(target.to_bits(), Ordering::Relaxed);
            }
        }
    }
}

fn validate_local_path(source: &str) -> Result<std::path::PathBuf, String> {
    if is_remote_source(source) {
        return Err("仅支持本地文件".into());
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
        return Err("文件不可用".into());
    }
    Ok(path.to_path_buf())
}

/// 直接基于 symphonia 的容器级 Source，实现 PotPlayer 风格的快速 seek
/// - 打开即 probe
/// - offset >0 时先 FormatReader::seek（Coarse），再创建 decoder 从目标附近开始解码
/// - 实现 try_seek 支持 sink.try_seek 直达容器索引
struct SymphoniaSource {
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn SymDecoder>,
    track_id: u32,
    spec: SignalSpec,
    buffer: SampleBuffer<i16>,
    buffer_pos: usize,
    total_duration: Option<Time>,
}

impl SymphoniaSource {
    fn open(path: &Path, offset: Duration) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
        let mss = MediaSourceStream::new(Box::new(file), Default::default());

        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
            hint.with_extension(ext);
        }

        // 预建索引：拖动时真正 O(1) 级别；音乐文件成本可接受
        let format_opts = FormatOptions {
            prebuild_seek_index: true,
            enable_gapless: true,
            ..Default::default()
        };
        let meta_opts = MetadataOptions::default();

        let probed = get_probe()
            .format(&hint, mss, &format_opts, &meta_opts)
            .map_err(|e| format!("不支持的格式或文件损坏: {e}"))?;

        let mut format = probed.format;

        let (track_id, total_duration, codec_params) = {
            let track = format
                .tracks()
                .iter()
                .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
                .ok_or("文件中没有可播放音轨".to_string())?;
            let id = track.id;
            let dur = track.codec_params
                .time_base
                .zip(track.codec_params.n_frames)
                .map(|(base, frames)| base.calc_time(frames));
            let params = track.codec_params.clone();
            (id, dur, params)
        };

        // 先在 demux 层 seek 到目标时间（PotPlayer 风格）
        let off_secs = offset.as_secs_f64();
        if off_secs > 0.0 {
            let _ = format.seek(
                SeekMode::Coarse,
                SeekTo::Time {
                    time: off_secs.into(),
                    track_id: Some(track_id),
                },
            );
        }

        let mut decoder = get_codecs()
            .make(&codec_params, &DecoderOptions::default())
            .map_err(|e| format!("无法创建解码器: {e}"))?;

        // 取第一个属于 track 的 packet 解码，填充初始 buffer
        let (spec, buffer) = Self::next_decoded_buffer(&mut *format, &mut *decoder, track_id)?;

        Ok(SymphoniaSource {
            reader: format,
            decoder,
            track_id,
            spec,
            buffer,
            buffer_pos: 0,
            total_duration,
        })
    }

    fn next_decoded_buffer(
        reader: &mut dyn FormatReader,
        decoder: &mut dyn SymDecoder,
        track_id: u32,
    ) -> Result<(SignalSpec, SampleBuffer<i16>), String> {
        const MAX_RETRIES: usize = 8;
        let mut retries = 0;
        loop {
            let packet = match reader.next_packet() {
                Ok(p) => p,
                Err(SymError::IoError(_)) => {
                    // 文件尾或无更多数据
                    return Err("无法读取音频数据".into());
                }
                Err(e) => return Err(format!("读包失败: {e}")),
            };
            if packet.track_id() != track_id {
                continue;
            }
            match decoder.decode(&packet) {
                Ok(decoded) => {
                    let spec = *decoded.spec();
                    let duration = units::Duration::from(decoded.capacity() as u64);
                    let mut buf = SampleBuffer::<i16>::new(duration, spec);
                    buf.copy_interleaved_ref(decoded);
                    return Ok((spec, buf));
                }
                Err(SymError::DecodeError(_)) => {
                    retries += 1;
                    if retries > MAX_RETRIES {
                        return Err("解码连续失败".into());
                    }
                    continue;
                }
                Err(e) => return Err(format!("解码错误: {e}")),
            }
        }
    }

    fn refill_buffer(&mut self) -> bool {
        match Self::next_decoded_buffer(&mut *self.reader, &mut *self.decoder, self.track_id) {
            Ok((spec, buf)) => {
                self.spec = spec;
                self.buffer = buf;
                self.buffer_pos = 0;
                true
            }
            Err(_) => false,
        }
    }

    fn try_seek_internal(&mut self, pos: Duration) -> Result<(), String> {
        let time = pos.as_secs_f64();
        // 交互拖动优先 Coarse，响应更快；必要时可用 Accurate
        let seek_res = self
            .reader
            .seek(
                SeekMode::Coarse,
                SeekTo::Time {
                    time: time.into(),
                    track_id: Some(self.track_id),
                },
            )
            .map_err(|e| format!("容器 seek 失败: {e}"))?;

        // seek 后 decoder 状态需重置：直接重置 buffer，从下一个 packet 开始
        // 按 rodio 做法，拿到实际位置后解一包
        if self.refill_buffer() {
            // 简单处理：buffer_pos 置 0；更精确可按 seek_res 做 sample 偏移，这里以目标时间为准
            let _ = seek_res;
            self.buffer_pos = 0;
            Ok(())
        } else {
            Err("seek 后无法获取数据".into())
        }
    }
}

impl Iterator for SymphoniaSource {
    type Item = i16;

    fn next(&mut self) -> Option<i16> {
        if self.buffer_pos >= self.buffer.len() {
            if !self.refill_buffer() {
                return None;
            }
        }
        let sample = *self.buffer.samples().get(self.buffer_pos)?;
        self.buffer_pos += 1;
        Some(sample)
    }
}

impl Source for SymphoniaSource {
    fn current_frame_len(&self) -> Option<usize> {
        Some(self.buffer.samples().len())
    }

    fn channels(&self) -> u16 {
        self.spec.channels.count() as u16
    }

    fn sample_rate(&self) -> u32 {
        self.spec.rate
    }

    fn total_duration(&self) -> Option<Duration> {
        self.total_duration
            .map(|Time { seconds, frac }| Duration::new(seconds, (frac * 1_000_000_000.0) as u32))
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), RodioSeekError> {
        self.try_seek_internal(pos)
            .map_err(|_| RodioSeekError::NotSupported {
                underlying_source: "SymphoniaSource",
            })
    }
}

/// FFmpeg 流式 WAV PCM；不指定 -ar，保留源采样率
struct FfmpegSource {
    child: Child,
    stdout: ChildStdout,
    channels: u16,
    sample_rate: u32,
    total_duration: Option<Duration>,
}

impl FfmpegSource {
    fn open(
        executable: &Path,
        input: &Path,
        offset: Duration,
        total_duration: Option<Duration>,
    ) -> Result<Self, String> {
        let mut command = Command::new(executable);
        command.stdin(Stdio::null()).stderr(Stdio::null());
        if offset > Duration::ZERO {
            command.args(["-ss", &format!("{:.6}", offset.as_secs_f64())]);
        }
        let mut child = command
            .arg("-i")
            .arg(input)
            .args([
                "-map",
                "0:a:0",
                "-vn",
                "-sn",
                "-dn",
                "-c:a",
                "pcm_f32le",
                "-f",
                "wav",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .spawn()
            .map_err(|error| format!("FFMPEG_DECODE_FAILED: 无法启动 FFmpeg: {error}"))?;
        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| "FFMPEG_DECODE_FAILED: 无法读取 FFmpeg 输出".to_string())?;
        let (channels, sample_rate) = read_streaming_wav_header(&mut stdout).map_err(|error| {
            let _ = child.kill();
            format!("FFMPEG_DECODE_FAILED: {error}")
        })?;
        Ok(Self {
            child,
            stdout,
            channels,
            sample_rate,
            total_duration,
        })
    }
}

impl Drop for FfmpegSource {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Iterator for FfmpegSource {
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let mut bytes = [0u8; 4];
        self.stdout.read_exact(&mut bytes).ok()?;
        Some(f32::from_le_bytes(bytes))
    }
}

impl Source for FfmpegSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }

    fn channels(&self) -> u16 {
        self.channels
    }

    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    fn total_duration(&self) -> Option<Duration> {
        self.total_duration
    }
}

fn read_streaming_wav_header(reader: &mut impl Read) -> io::Result<(u16, u32)> {
    let mut riff = [0u8; 12];
    reader.read_exact(&mut riff)?;
    if &riff[..4] != b"RIFF" || &riff[8..] != b"WAVE" {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "FFmpeg 未输出有效 WAV"));
    }

    let mut format = None;
    loop {
        let mut header = [0u8; 8];
        reader.read_exact(&mut header)?;
        let size = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        match &header[..4] {
            b"fmt " => {
                let mut data = vec![0u8; size];
                reader.read_exact(&mut data)?;
                if data.len() < 16 {
                    return Err(io::Error::new(io::ErrorKind::InvalidData, "WAV fmt 块无效"));
                }
                let channels = u16::from_le_bytes([data[2], data[3]]);
                let sample_rate = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
                let bits = u16::from_le_bytes([data[14], data[15]]);
                if channels == 0 || sample_rate == 0 || bits != 32 {
                    return Err(io::Error::new(io::ErrorKind::InvalidData, "FFmpeg PCM 参数无效"));
                }
                format = Some((channels, sample_rate));
            }
            b"data" => {
                return format.ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidData, "WAV 缺少 fmt 块")
                });
            }
            _ => {
                io::copy(&mut reader.take(size as u64), &mut io::sink())?;
            }
        }
        if size % 2 == 1 {
            let mut padding = [0u8; 1];
            reader.read_exact(&mut padding)?;
        }
    }
}

fn requires_external_decoder(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    !matches!(
        extension.as_str(),
        "mp1" | "mp2" | "mp3" | "mpga" | "wav" | "pcm" | "raw" | "aac"
            | "m4a" | "flac" | "ogg" | "aif" | "aiff"
    )
}

fn start_playback_from(
    sink: &Sink,
    source: &str,
    shared: &SharedPlayback,
    offset_ms: f64,
    ffmpeg_path: Option<&Path>,
    eq: &Arc<EqState>,
) -> Result<(), String> {
    sink.stop();

    let path_buf = validate_local_path(source)?;
    let duration_hint = compute_duration_hint(&path_buf);
    let clamped = if let Some(dur) = duration_hint {
        shared
            .duration_ms
            .store((dur.as_secs_f64() * 1000.0).to_bits(), Ordering::Relaxed);
        let dms = dur.as_secs_f64() * 1000.0;
        offset_ms.clamp(0.0, dms)
    } else {
        offset_ms.max(0.0)
    };

    let offset = Duration::from_millis(clamped as u64);
    if requires_external_decoder(&path_buf) {
        let executable = ffmpeg_path.ok_or_else(|| {
            "FFMPEG_REQUIRED: 此格式需要外部 FFmpeg，请前往设置 > 播放配置 FFmpeg".to_string()
        })?;
        let source = FfmpegSource::open(executable, &path_buf, offset, duration_hint)?;
        sink.append(eq_source(source, Arc::clone(eq)));
    } else {
        match SymphoniaSource::open(&path_buf, offset) {
            Ok(source) => {
                if f64::from_bits(shared.duration_ms.load(Ordering::Relaxed)) <= 0.0 {
                    if let Some(duration) = source.total_duration() {
                        shared.duration_ms.store(
                            (duration.as_secs_f64() * 1000.0).to_bits(),
                            Ordering::Relaxed,
                        );
                    }
                }
                sink.append(eq_source(source, Arc::clone(eq)));
            }
            Err(error) if error.contains("无法创建解码器") => {
                let executable = ffmpeg_path.ok_or_else(|| {
                    "FFMPEG_REQUIRED: 音频编码不受内置解码器支持，请前往设置 > 播放配置 FFmpeg".to_string()
                })?;
                let source = FfmpegSource::open(executable, &path_buf, offset, duration_hint)?;
                sink.append(eq_source(source, Arc::clone(eq)));
            }
            Err(error) => return Err(error),
        }
    }
    shared
        .position_ms
        .store(clamped.to_bits(), Ordering::Relaxed);
    Ok(())
}

fn compute_duration_hint(path: &Path) -> Option<Duration> {
    // 复用 lofty 读取时长，避免重复打开做全量解码
    if let Ok(probe) = lofty::probe::Probe::open(path) {
        if let Ok(tagged) = probe.read() {
            let d = tagged.properties().duration();
            if d > Duration::ZERO {
                return Some(d);
            }
        }
    }
    None
}