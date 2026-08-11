---
title: 封面与播放 URL
description: 播放 URL 解析、封面缓存与覆写、ffmpeg 检测配置。
order: 16
---

# 封面与播放 URL

> 理解一首歌的「可播 URL」与「封面图」如何被解析、缓存与覆写，以及 ffmpeg 在链路中的角色。

## 本页边界

覆盖：`src/lib/music/resolve-url.ts`、`remote-cover-cache.ts`、`cover-overrides.ts`、`src/lib/player/ffmpeg.ts`、`src-tauri/src/cover_cache.rs`、`ffmpeg.rs`。

**不**覆盖：封面渲染组件、播放引擎（见 [播放引擎](#/docs/dev/player)）。

## 播放 URL 解析

`src/lib/music/resolve-url.ts` 的 `resolvePlayableUrl(track)` 是播放 URL 的唯一入口：

```ts
import { resolvePlayableUrl } from "@/lib/music/resolve-url"

const result = await resolvePlayableUrl(track)
// { ok: true, url } | { ok: false, reason, entry? }
if (!result.ok) {
    // reason 可直接展示；entry 为最接近可播的条目（供降级）
}
```

行为契约：

- **本地曲目**：`convertFileSrc(filePath)` 直出 `asset://` URL
- **网易云曲目**：始终重新 `fetchSongUrl`（不缓存），按音质偏好挑条目；无 URL / 无版权 / VIP 未购 → `ok: false`
- **HTTP 升级**：网易云 CDN 的 `http://music.126.net` 自动升 `https://`（WKWebView ATS 限制），其它第三方地址不改写

## 封面缓存

Rust 侧（`cover_cache.rs`）磁盘缓存，命令：`cache_cover_url`、`cache_cover_data_url`、`clear_cover_cache`（保留 keep_hashes）。前端封装：

```ts
import {
    ensureRemoteCoverCached,
    getCachedRemoteCover,
} from "@/lib/music/remote-cover-cache"

const cached = getCachedRemoteCover(url)          // 同步读缓存
const cover = await ensureRemoteCoverCached(url)  // 缺则缓存后返回
```

组件层用 `use-cached-cover-url` hook（`src/hooks/use-cached-cover-url.ts`），不直接操作缓存。

## 封面覆写

`src/lib/music/cover-overrides.ts`——用户手动换封面，localStorage（`musicstorm-cover-override(s)`），含旧版本迁移：

```ts
import {
    clearCoverOverride,
    getCoverOverride,
    setCoverOverride,
} from "@/lib/music/cover-overrides"

await setCoverOverride(trackId, cachedCover)   // 写入覆写
const override = getCoverOverride(trackId)     // 读取
await clearCoverOverride(trackId)              // 清除
```

`resolveTrackCoverUrl` 按「覆写 → 本地专辑封面 → 远程缓存」顺序取封面；启动时 `migrateLegacyOverrides` 迁移旧格式。

## ffmpeg

`src/lib/player/ffmpeg.ts` 封装 `ffmpeg_*` 命令：

| 函数 | 命令 | 说明 |
|---|---|---|
| `detectFfmpeg()` | `ffmpeg_detect` | 检测可用性（配置 / 环境 / 手动） |
| `validateFfmpeg(path)` | `ffmpeg_validate` | 校验指定路径 |
| `setFfmpegPath(path \| null)` | `ffmpeg_set_path` | 写入配置 |
| `pickFfmpegExecutable()` | `pick_ffmpeg_executable` | 系统选择器选路径 |

`FfmpegStatus = { available, path, version, source: "configured" \| "environment" \| "manual" \| "missing", error }`。播放链路用 `isFfmpegRequiredError(error)` 判断某个错误是否需要用户配置 ffmpeg。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 网易云歌曲无法播放 | `resolvePlayableUrl` 返回 `ok: false`，用 `reason` 区分版权 / VIP / 无链 |
| macOS 上播放被拦 | 确认 `normalizeNeteaseMediaUrl` 已升级 CDN 为 https |
| 封面不更新 | 命中缓存；`clear_cover_cache` 保留的 keep_hashes 需核对 |
| 换的封面丢失 | 确认 `setCoverOverride` 后渲染走 `resolveTrackCoverUrl` 顺序 |

## 排查路径

1. 播放问题：直接调 `resolvePlayableUrl(track)` 看 `reason`
2. 封面问题：先查覆写（`getCoverOverride`），再查缓存（`getCachedRemoteCover`）
3. ffmpeg 问题：`detectFfmpeg()` 看 `source` 与 `error`
4. 确认 Web 调试下封面/URL 行为与桌面差异（`convertFileSrc` 仅 Tauri 可用）
