---
title: 播放引擎
description: HTML5 / 原生双引擎、统一接口、播放器状态与调用示例。
order: 7
---

# 播放引擎

> 理解一首歌从 URL 到出声的引擎链路：引擎选择策略、统一接口、原生桥接与播放器状态。

## 本页边界

覆盖：`src/lib/player/`、`src-tauri/src/audio/`、`src/hooks/use-player.tsx`。

**不**覆盖：播放 URL 的获取（见 [API](#/docs/dev/api)）、Rust 音频命令的注册细节（见 [Tauri 命令](#/docs/dev/tauri)）。

## 引擎选择

`src/lib/player/engine-policy.ts` 决定用哪个引擎，偏好存 localStorage `musicstorm-engine-pref`：

| 引擎 | 实现 | 适用 |
|---|---|---|
| HTML5（默认） | `createHtml5Engine`（`audio-engine.ts`） | 通用、Web 调试、hls.js 流 |
| 原生 | rodio + cpal（`src-tauri/src/audio/`） | 独占设备、低延迟 |

切换入口：`getEnginePref()` / `setEnginePref()`；实际生效由 `resolveEngineChoice()` 按环境（是否桌面、引擎可用性）裁决，页面读裁决结果而不是直接读偏好。

## 统一引擎接口

两种引擎都实现同一个 `AudioEngine`（`audio-engine.ts`），业务层无感知：

| 方法 | 说明 |
|---|---|
| `load(url)` | 加载；可同步或异步，调用方应 `await Promise.resolve(...)` |
| `play()` | 开始播放 |
| `pause()` | 暂停 |
| `seek(ms, opts?)` | 跳转；`opts.resume` 供原生引擎快进后继续播 |
| `setVolume(v)` / `setMuted(b)` | 音量 / 静音 |
| `setSpeed(rate)` | 倍速（0.5–2）；HTML5 走 `playbackRate`，原生走音频采样 rate，换源后需重下发 |
| `getPositionMs()` / `getDurationMs()` | 进度查询 |
| `destroy()` | 销毁释放 |

内建守卫：HTML5 引擎 `load` 有 15s 就绪超时；切曲时取消未完成就绪等待，避免卡死。

## 原生引擎桥接

`src/lib/player/native-bridge.ts` 封装 Rust 音频命令：

```ts
import {
    audioProbe,
    getAudioOutputMode,
    listAudioDevices,
    setAudioDevice,
    setAudioExclusive,
} from "@/lib/player/native-bridge"

const probe = await audioProbe()          // 原生引擎是否可用
const devices = await listAudioDevices()  // 输出设备列表
await setAudioDevice(devices[0].id)       // 切换输出设备
await setAudioExclusive(true)             // 独占模式
```

原生引擎进度经事件 `audio://tick`（`AudioTickPayload`）推送，播完发 `audio://ended`（见 [事件](#/docs/dev/events)）。

## 播放器状态

`src/hooks/use-player.tsx` 提供 `PlayerProvider` + `usePlayer()`，覆盖队列与播放控制：

```tsx
const {
    currentTrack,
    engineStatus,
    playTrack,          // 播指定曲（可带队列）
    playOrToggle,       // 同曲再点：播放中暂停 / 已暂停继续；异曲：换队列并播
    playNext,           // 插入当前播放之后并立即播
    addToQueue,
    removeFromQueue,
    jumpTo,             // 按队列下标跳
    reorderQueue,
    clearQueue,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    playbackRate,
    setPlaybackRate,
} = usePlayer()

// 歌曲行点击的标准入口：同曲切换播放/暂停，异曲切队列
playOrToggle(track, queue)
```

## 倍速播放

| 导出 | 位置 | 说明 |
|---|---|---|
| `PLAYBACK_RATES` | `src/lib/player/playback-prefs.ts` | 档位 `[0.5, 0.75, 1, 1.25, 1.5, 2]` |
| `setPlaybackRate(rate)` | `usePlayer` | 收窄到 0.5–2，写回播放偏好并广播；切曲后按当前倍速重下发到引擎 |
| `SpeedPopover` | `src/components/music/speed-popover.tsx` | 底栏/全屏播放器的速度选择胶囊；`compact` 形态用于播放条 |

倍速不改变音高语义（变速不变调由引擎侧实现差异决定），且只在换曲时重下发，不会在播放中反复重置。

调用约定：

- 组件只消费 `usePlayer()`，**不要直接 new Audio / 调原生命令**（引擎切换后组件无感）
- 全局快捷键经 `musicstorm:player-command` 事件进入播放器（见 [事件](#/docs/dev/events)），不直接调 hook
- 进度条、音量条等 UI 读 hook 状态即可，无需自行计时

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 原生引擎无声 / 爆音 | `audio_probe` 不可用、设备被独占占用；切回 HTML5 引擎验证 |
| 切曲卡在加载 | HTML5 15s 就绪超时后走 `onError`；检查 URL 时效与网络 |
| 引擎偏好改了不生效 | 页面读 `resolveEngineChoice()` 的裁决，不是偏好原值 |
| 进度条不走 | 原生引擎依赖 `audio://tick`；检查事件是否注册（组件卸载会 un 掉） |

## 排查路径

1. 确认 URL 来自 `fetchSongUrl`（实时地址，勿缓存）
2. 确认引擎裁决结果：`resolveEngineChoice()` 返回哪个引擎
3. 原生引擎：`audio_probe` 输出是否 `ok`；HTML5：看 `onError` 消息
4. 确认事件监听在组件卸载时正确 un（重复注册会收到重复 tick）
5. 静音 / 音量状态：`setVolume` 与 `setMuted` 是否被 UI 意外覆盖
