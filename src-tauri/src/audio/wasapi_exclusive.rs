//! Windows WASAPI 独占模式输出引擎。
//!
//! cpal/rodio 只开放共享模式，无法实现 WASAPI 独占。这里直接走 Windows
//! 媒体 API：用 IAudioClient 以 EXCLUSIVE + EVENTCALLBACK 打开渲染流，
//! 事件驱动从 rodio 的 DynamicMixer 拉取 f32 采样并写入设备缓冲，
//! 结构上与 rodio 的 OutputStream 保持一致，因此可用 Sink::new_idle
//! 复用整套 Sink 控制逻辑。独占打不开时由调用方回退共享模式。

use rodio::dynamic_mixer::{self, DynamicMixer, DynamicMixerController};
use rodio::Source;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Weak};
use std::thread::{self, JoinHandle};

use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_EVENT, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::{
    AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, IAudioClient,
    IAudioRenderClient, IMMDevice, IMMDeviceEnumerator, WAVEFORMATEX, WAVEFORMATEXTENSIBLE,
    WAVE_FORMAT_PCM, eConsole, eRender,
};
use windows::Win32::Media::KernelStreaming::{KSDATAFORMAT_SUBTYPE_PCM, WAVE_FORMAT_EXTENSIBLE};
use windows::Win32::Media::Multimedia::{KSDATAFORMAT_SUBTYPE_IEEE_FLOAT, WAVE_FORMAT_IEEE_FLOAT};
use windows::Win32::System::Com::{
    CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree,
};
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::core::GUID;

/// 设备枚举器 CLSID：BCDE0395-E52F-467C-8E3D-C4579291692E。
/// windows 绑定未导出该常量，此处按标准 GUID 手动构造。
const CLSID_MMDEVICE_ENUMERATOR: GUID = GUID {
    data1: 0xBCDE_0395,
    data2: 0xE52F,
    data3: 0x467C,
    data4: [0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E],
};

/// 设备原生采样格式，渲染线程按此逐样本转换。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SampleFormat {
    F32,
    I16,
    I24,
    I32,
    U8,
}

impl SampleFormat {
    fn bytes_per_sample(self) -> usize {
        match self {
            SampleFormat::F32 | SampleFormat::I32 => 4,
            SampleFormat::I16 => 2,
            SampleFormat::I24 => 3,
            SampleFormat::U8 => 1,
        }
    }
}

/// windows 绑定生成的 COM 接口默认非 Send；独占渲染线程单线程独占使用，
/// 包裹并手动标记 Send 安全。方法经 self 访问字段，避免闭包按字段捕获裸类型。
struct AudioClientHandle(IAudioClient);
unsafe impl Send for AudioClientHandle {}

impl AudioClientHandle {
    fn current_padding(&self) -> windows::core::Result<u32> {
        unsafe { self.0.GetCurrentPadding() }
    }

    fn stop(&self) -> windows::core::Result<()> {
        unsafe { self.0.Stop() }
    }
}

struct RenderClientHandle(IAudioRenderClient);
unsafe impl Send for RenderClientHandle {}

impl RenderClientHandle {
    fn get_buffer(&self, frames: u32) -> windows::core::Result<*mut u8> {
        unsafe { self.0.GetBuffer(frames) }
    }

    fn release_buffer(&self, frames: u32, flags: u32) -> windows::core::Result<()> {
        unsafe { self.0.ReleaseBuffer(frames, flags) }
    }
}

/// HANDLE 包装裸指针默认非 Send；渲染线程仅等待该事件，包裹标记 Send 安全。
struct EventHandle(HANDLE);
unsafe impl Send for EventHandle {}

impl EventHandle {
    fn wait(&self, ms: u32) -> WAIT_EVENT {
        unsafe { WaitForSingleObject(self.0, ms) }
    }
}

/// 独占输出流。持有渲染线程与设备对象，Drop 时停止并释放。
pub struct ExclusiveOutputStream {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    _controller: Arc<DynamicMixerController<f32>>,
    _client: IAudioClient,
    _event: HANDLE,
}

/// 独占输出流句柄，供 Sink::new_idle 的队列源接入混音器。
pub struct ExclusiveOutputStreamHandle {
    mixer: Weak<DynamicMixerController<f32>>,
}

impl ExclusiveOutputStreamHandle {
    /// 等价于 rodio OutputStreamHandle::play_raw。
    pub fn play_raw<S>(&self, source: S) -> Result<(), String>
    where
        S: Source<Item = f32> + Send + 'static,
    {
        let mixer = self
            .mixer
            .upgrade()
            .ok_or_else(|| "独占输出已关闭".to_string())?;
        mixer.add(source);
        Ok(())
    }
}

impl ExclusiveOutputStream {
    /// 打开默认输出设备的 WASAPI 独占渲染流。
    pub fn open_default() -> Result<(Self, ExclusiveOutputStreamHandle), String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        let enumerator: IMMDeviceEnumerator = unsafe {
            CoCreateInstance(&CLSID_MMDEVICE_ENUMERATOR, None, CLSCTX_ALL)
                .map_err(|e| format!("创建设备枚举器失败: {e}"))?
        };
        let device: IMMDevice = unsafe { enumerator.GetDefaultAudioEndpoint(eRender, eConsole) }
            .map_err(|e| format!("获取默认输出设备失败: {e}"))?;
        let client: IAudioClient = unsafe { device.Activate(CLSCTX_ALL, None) }
            .map_err(|e| format!("激活 IAudioClient 失败: {e}"))?;

        // GetMixFormat 分配 CoTaskMem 内存，初始化完成后手动释放
        let format_ptr: *mut WAVEFORMATEX = unsafe { client.GetMixFormat() }
            .map_err(|e| format!("获取输出格式失败: {e}"))?;
        if format_ptr.is_null() {
            return Err("输出格式为空".into());
        }
        let (sample_rate, channels, sample_format) = parse_format(format_ptr)?;

        let mut default_period: i64 = 0;
        let mut min_period: i64 = 0;
        unsafe {
            client.GetDevicePeriod(Some(&mut default_period), Some(&mut min_period))
        }
        .map_err(|e| format!("获取设备周期失败: {e}"))?;
        // 事件驱动独占要求周期与缓冲时长一致；缺省回退 20ms
        let period = if default_period > 0 {
            default_period
        } else {
            200_000
        };

        let result = unsafe {
            client.Initialize(
                AUDCLNT_SHAREMODE_EXCLUSIVE,
                AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                period,
                period,
                format_ptr,
                None,
            )
        };
        unsafe { CoTaskMemFree(Some(format_ptr.cast())) };
        result.map_err(|e| format!("初始化独占流失败: {e}"))?;

        let render: IAudioRenderClient = unsafe { client.GetService() }
            .map_err(|e| format!("获取渲染客户端失败: {e}"))?;
        let buffer_frames: u32 = unsafe { client.GetBufferSize() }
            .map_err(|e| format!("获取缓冲大小失败: {e}"))?;
        if buffer_frames == 0 {
            return Err("独占流缓冲为空".into());
        }

        let event: HANDLE = unsafe { CreateEventW(None, false, false, None) }
            .map_err(|e| format!("创建事件失败: {e}"))?;

        let (controller, mixer) = dynamic_mixer::mixer::<f32>(channels, sample_rate);
        let stop = Arc::new(AtomicBool::new(false));

        let render_thread = {
            let stop = Arc::clone(&stop);
            let mixer = mixer;
            let render = RenderClientHandle(render.clone());
            let client = AudioClientHandle(client.clone());
            let event = EventHandle(event);
            let format = sample_format;
            let ch = channels as usize;
            let bytes_per_frame = format.bytes_per_sample() * ch;
            thread::Builder::new()
                .name("wasapi-exclusive".into())
                .spawn(move || {
                    let mut mixer = mixer;
                    loop {
                        if stop.load(Ordering::SeqCst) {
                            break;
                        }
                        // 事件驱动：有可用缓冲时事件触发；超时轮询停止标志
                        let wait = event.wait(100);
                        if stop.load(Ordering::SeqCst) {
                            break;
                        }
                        if wait != WAIT_OBJECT_0 {
                            continue;
                        }
                        let padding: u32 = client.current_padding().unwrap_or(u32::MAX);
                        if padding >= buffer_frames {
                            continue;
                        }
                        let avail = buffer_frames - padding;
                        let data: *mut u8 = match render.get_buffer(avail) {
                            Ok(ptr) => ptr,
                            Err(_) => break,
                        };
                        let len = avail as usize * bytes_per_frame;
                        let slice = unsafe { std::slice::from_raw_parts_mut(data, len) };
                        fill_frames(slice, avail as usize, ch, format, &mut mixer);
                        if render.release_buffer(avail, 0).is_err() {
                            break;
                        }
                    }
                    let _ = client.stop();
                })
                .map_err(|e| format!("启动独占渲染线程失败: {e}"))?
        };

        if let Err(e) = unsafe { client.Start() } {
            stop.store(true, Ordering::SeqCst);
            let _ = render_thread.join();
            let _ = unsafe { CloseHandle(event) };
            return Err(format!("启动独占流失败: {e}"));
        }

        Ok((
            ExclusiveOutputStream {
                stop: Arc::clone(&stop),
                thread: Some(render_thread),
                _controller: Arc::clone(&controller),
                _client: client,
                _event: event,
            },
            ExclusiveOutputStreamHandle {
                mixer: Arc::downgrade(&controller),
            },
        ))
    }
}

impl Drop for ExclusiveOutputStream {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
        let _ = unsafe { CloseHandle(self._event) };
    }
}

/// 解析设备 mix 格式，得到采样率、声道数与采样格式。
/// WAVEFORMATEX 为 packed 结构，字段须经 addr_of + read_unaligned 读取。
fn parse_format(format_ptr: *mut WAVEFORMATEX) -> Result<(u32, u16, SampleFormat), String> {
    if format_ptr.is_null() {
        return Err("输出格式为空".into());
    }
    let sample_rate = unsafe { std::ptr::addr_of!((*format_ptr).nSamplesPerSec).read_unaligned() };
    let channels = unsafe { std::ptr::addr_of!((*format_ptr).nChannels).read_unaligned() };
    let format_tag = unsafe { std::ptr::addr_of!((*format_ptr).wFormatTag).read_unaligned() };
    let bits = unsafe { std::ptr::addr_of!((*format_ptr).wBitsPerSample).read_unaligned() };
    if sample_rate == 0 || channels == 0 {
        return Err("设备输出格式异常".into());
    }
    let subformat = if format_tag == WAVE_FORMAT_EXTENSIBLE as u16 {
        let extensible = format_ptr as *const WAVEFORMATEXTENSIBLE;
        unsafe { std::ptr::addr_of!((*extensible).SubFormat).read_unaligned() }
    } else if format_tag == WAVE_FORMAT_IEEE_FLOAT as u16 {
        KSDATAFORMAT_SUBTYPE_IEEE_FLOAT
    } else if format_tag == WAVE_FORMAT_PCM as u16 {
        KSDATAFORMAT_SUBTYPE_PCM
    } else {
        return Err(format!("不支持的输出格式标签: {format_tag}"));
    };

    let sample_format = if subformat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT {
        SampleFormat::F32
    } else if subformat == KSDATAFORMAT_SUBTYPE_PCM {
        match bits {
            8 => SampleFormat::U8,
            16 => SampleFormat::I16,
            24 => SampleFormat::I24,
            32 => SampleFormat::I32,
            other => return Err(format!("不支持的位深: {other}")),
        }
    } else {
        return Err("不支持的子格式".into());
    };

    Ok((sample_rate, channels, sample_format))
}

/// 从混音器逐样本取数，按设备原生格式写入帧缓冲。
fn fill_frames(
    data: &mut [u8],
    frames: usize,
    channels: usize,
    format: SampleFormat,
    mixer: &mut DynamicMixer<f32>,
) {
    let _ = (frames, channels);
    match format {
        SampleFormat::F32 => {
            for chunk in data.chunks_exact_mut(4) {
                let v = mixer.next().unwrap_or(0.0);
                chunk.copy_from_slice(&v.to_le_bytes());
            }
        }
        SampleFormat::I16 => {
            for chunk in data.chunks_exact_mut(2) {
                let v = mixer.next().unwrap_or(0.0);
                let sample = (v.clamp(-1.0, 1.0) * 32767.0) as i16;
                chunk.copy_from_slice(&sample.to_le_bytes());
            }
        }
        SampleFormat::I24 => {
            for chunk in data.chunks_exact_mut(3) {
                let v = mixer.next().unwrap_or(0.0);
                let sample = ((v.clamp(-1.0, 1.0) * 8_388_607.0) as i32) & 0x00FF_FFFF;
                let bytes = sample.to_le_bytes();
                chunk[0] = bytes[0];
                chunk[1] = bytes[1];
                chunk[2] = bytes[2];
            }
        }
        SampleFormat::I32 => {
            for chunk in data.chunks_exact_mut(4) {
                let v = mixer.next().unwrap_or(0.0);
                let sample = (v.clamp(-1.0, 1.0) * 2_147_483_647.0) as i32;
                chunk.copy_from_slice(&sample.to_le_bytes());
            }
        }
        SampleFormat::U8 => {
            for byte in data.iter_mut() {
                let v = mixer.next().unwrap_or(0.0);
                *byte = ((v.clamp(-1.0, 1.0) * 0.5 + 0.5) * 255.0) as u8;
            }
        }
    }
}
