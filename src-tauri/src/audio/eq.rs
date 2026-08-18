// 10 段参数均衡器：RBJ biquad 系数 + 可被前端实时刷新的共享增益。
// 作为 rodio Source 组合子包裹原声源，使本地原生输出同样走 EQ（与 H5 Web Audio 对齐）。

use rodio::source::{SeekError as RodioSeekError, Source};
use rodio::Sample;
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// 10 段中心频率（Hz），与前端 eq-prefs.ts 的 EQ_BAND_FREQUENCIES 严格对齐
pub const EQ_FREQUENCIES: [f32; 10] = [
    31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// 增益上下限（dB），与前端 GAIN_MIN/GAIN_MAX 一致
const GAIN_MIN_DB: f32 = -12.0;
const GAIN_MAX_DB: f32 = 12.0;

/// 共享的 EQ 状态：gains 为各频段增益，enabled 关闭时等效平直。
/// 前端通过 audio_set_eq 实时改写，播放中无需重建源即可生效。
#[derive(Default)]
pub struct EqState {
    gains: Mutex<[f32; 10]>,
}

impl EqState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// 应用新的增益；enabled 为 false 或长度不符时归零（等效平直）
    pub fn set_gains(&self, gains: &[f32], enabled: bool) {
        let mut guard = match self.gains.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        if enabled && gains.len() == EQ_FREQUENCIES.len() {
            for (dst, src) in guard.iter_mut().zip(gains.iter()) {
                *dst = src.clamp(GAIN_MIN_DB, GAIN_MAX_DB);
            }
        } else {
            guard.fill(0.0);
        }
    }

    fn current(&self) -> [f32; 10] {
        let guard = self.gains.lock();
        *guard
            .map(|g| g)
            .unwrap_or_else(|e| e.into_inner())
    }
}

/// 单二阶 biquad（RBJ cookbook），逐样本处理
#[derive(Clone)]
struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl Biquad {
    fn passthrough() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    fn peaking(fs: f32, f0: f32, gain_db: f32, q: f32) -> Self {
        let a = 10.0_f32.powf(gain_db / 40.0);
        let w0 = std::f32::consts::TAU * f0 / fs;
        let (sin_, cos_) = w0.sin_cos();
        let alpha = sin_ / (2.0 * q);
        Self::normalize(
            1.0 + alpha * a,
            -2.0 * cos_,
            1.0 - alpha * a,
            1.0 + alpha / a,
            -2.0 * cos_,
            1.0 - alpha / a,
        )
    }

    fn shelf(fs: f32, f0: f32, gain_db: f32, q: f32, highshelf: bool) -> Self {
        let a = 10.0_f32.powf(gain_db / 40.0);
        let w0 = std::f32::consts::TAU * f0 / fs;
        let (sin_, cos_) = w0.sin_cos();
        let alpha = sin_ / (2.0 * q);
        let two_sqrt_a = 2.0 * (a * a).sqrt() * alpha;
        let (b0, b1, b2, a0, a1, a2) = if highshelf {
            (
                a * ((a + 1.0) + (a - 1.0) * cos_ + two_sqrt_a),
                -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_),
                a * ((a + 1.0) + (a - 1.0) * cos_ - two_sqrt_a),
                (a + 1.0) - (a - 1.0) * cos_ + two_sqrt_a,
                2.0 * ((a - 1.0) - (a + 1.0) * cos_),
                (a + 1.0) - (a - 1.0) * cos_ - two_sqrt_a,
            )
        } else {
            (
                a * ((a + 1.0) - (a - 1.0) * cos_ + two_sqrt_a),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cos_),
                a * ((a + 1.0) - (a - 1.0) * cos_ - two_sqrt_a),
                (a + 1.0) + (a - 1.0) * cos_ + two_sqrt_a,
                -2.0 * ((a - 1.0) + (a + 1.0) * cos_),
                (a + 1.0) + (a - 1.0) * cos_ - two_sqrt_a,
            )
        };
        Self::normalize(b0, b1, b2, a0, a1, a2)
    }

    fn normalize(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> Self {
        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    fn process(&mut self, input: f32) -> f32 {
        let output = self.b0 * input + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1 - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;
        output
    }
}

/// 每声道一列 biquad 级联
struct EqRack {
    /// 每声道 10 段滤波器
    channels: Vec<[Biquad; 10]>,
}

impl EqRack {
    fn new(channels: u16, fs: f32, gains: [f32; 10]) -> Self {
        Self {
            channels: (0..channels)
                .map(|_| Self::build_filters(fs, gains))
                .collect(),
        }
    }

    fn build_filters(fs: f32, gains: [f32; 10]) -> [Biquad; 10] {
        let valid = fs.is_finite() && fs > 0.0;
        std::array::from_fn(|i| {
            if !valid || gains[i].abs() < 0.01 {
                return Biquad::passthrough();
            }
            let f0 = EQ_FREQUENCIES[i];
            match i {
                0 => Biquad::shelf(fs, f0, gains[i], 1.0, false),
                last if last == EQ_FREQUENCIES.len() - 1 => {
                    Biquad::shelf(fs, f0, gains[i], 1.0, true)
                }
                _ => Biquad::peaking(fs, f0, gains[i], 1.0),
            }
        })
    }

    /// 处理一个交错帧（长度 = 声道数）
    fn process_frame(&mut self, frame: &mut [f32]) {
        for (chan, slot) in frame.iter_mut().enumerate() {
            if let Some(filters) = self.channels.get_mut(chan) {
                for filter in filters.iter_mut() {
                    *slot = filter.process(*slot);
                }
            }
        }
    }
}

/// 交错循环缓冲：把 rodio 单样本流按声道数重组为帧后送入 EQ。
/// 内部把输入统一转 f32，输出回 i16（rodio sink 直接消费）。
pub struct InterleaveEq<S> {
    inner: S,
    shared: Arc<EqState>,
    cached_gains: [f32; 10],
    rack: EqRack,
    /// 已读取待吐出的交错帧（f32），EQ 处理一次后会按序发射
    pending: Vec<f32>,
    pending_pos: usize,
}

impl<S: Source> InterleaveEq<S>
where
    S::Item: Sample + SampleConvert,
{
    fn build(inner: S, shared: Arc<EqState>) -> Self {
        let fs = inner.sample_rate() as f32;
        let channels = inner.channels().max(1);
        let gains = shared.current();
        Self {
            cached_gains: gains,
            rack: EqRack::new(channels, fs, gains),
            inner,
            shared,
            pending: Vec::new(),
            pending_pos: 0,
        }
    }

    fn refresh_if_dirty(&mut self) {
        let current = self.shared.current();
        if current != self.cached_gains {
            self.cached_gains = current;
            let fs = self.inner.sample_rate() as f32;
            let channels = self.inner.channels().max(1);
            self.rack = EqRack::new(channels, fs, current);
        }
    }

    /// 从内层读满一帧并过 EQ；返回处理的声道数（或 None 表示流结束）
    fn pull_frame(&mut self) -> Option<usize> {
        let channels = self.inner.channels().max(1) as usize;
        let mut frame = Vec::with_capacity(channels);
        for _ in 0..channels {
            let sample = self.inner.next()?;
            frame.push(<S::Item as SampleConvert>::to_f32(sample));
        }
        self.refresh_if_dirty();
        self.rack.process_frame(&mut frame);
        self.pending = frame;
        self.pending_pos = 0;
        Some(channels)
    }
}

impl<S: Source> Iterator for InterleaveEq<S>
where
    S::Item: Sample + SampleConvert,
{
    type Item = i16;

    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.pending_pos < self.pending.len() {
                let s = self.pending[self.pending_pos];
                self.pending_pos += 1;
                return Some(sample_to_i16(s));
            }
            self.pending.clear();
            self.pending_pos = 0;
            if self.pull_frame().is_none() {
                return None;
            }
        }
    }
}

impl<S: Source> Source for InterleaveEq<S>
where
    S::Item: Sample + SampleConvert,
{
    fn current_frame_len(&self) -> Option<usize> {
        self.inner.current_frame_len()
    }
    fn channels(&self) -> u16 {
        self.inner.channels()
    }
    fn sample_rate(&self) -> u32 {
        self.inner.sample_rate()
    }
    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }
    fn try_seek(&mut self, pos: Duration) -> Result<(), RodioSeekError> {
        // 清空跨帧残留缓冲，再委托内层 seek，避免 seek 后出口残留旧数据
        self.pending.clear();
        self.pending_pos = 0;
        self.inner.try_seek(pos)
    }
}

/// 输入样本统一转 f32 的能力（i16 / f32 本地源）
pub trait SampleConvert: Copy + Send {
    fn to_f32(self) -> f32;
}

impl SampleConvert for i16 {
    fn to_f32(self) -> f32 {
        self as f32 / i16::MAX as f32
    }
}

impl SampleConvert for f32 {
    fn to_f32(self) -> f32 {
        self
    }
}

/// 便捷入口：包裹任意本地源（SymphoniaSource 是 i16，FfmpegSource 是 f32）
pub fn eq_source<S: Source>(inner: S, shared: Arc<EqState>) -> InterleaveEq<S>
where
    S::Item: Sample + SampleConvert,
{
    InterleaveEq::build(inner, shared)
}

fn sample_to_i16(v: f32) -> i16 {
    (v.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
}
