---
title: 歌词
description: 歌词获取链路、解析器、覆写与时间轴匹配。
order: 13
---

# 歌词

> 理解歌词从接口原始文本到逐行高亮的链路：获取、解析、覆写、活动行匹配。

## 本页边界

覆盖：`src/lib/netease/lyric.ts`、`src/lib/lyric/parse.ts`、`src/lib/lyric/overrides.ts`。

**不**覆盖：歌词 UI 组件与滚动（组件层，不在本页范围）。

## 获取链路

```txt
fetchLyricText(songId)          netease/lyric.ts：请求原始歌词文本
  └─ fetchLyricLines(songId)    解析为 LyricLine[]（内部 parseLrc）
      └─ LyricsView 组件         时间轴匹配 + 高亮滚动
```

```ts
import { fetchLyricLines, fetchLyricText } from "@/lib/netease/lyric"

const text = await fetchLyricText("1817864981")   // 原始 LRC / 纯文本
const lines = await fetchLyricLines("1817864981") // 已解析的 LyricLine[]
```

`fetchLyricText` 内部会先把网易云歌曲 id 规范化（`toNeteaseSongId`），非网易云 id 不请求。

## 解析器

`src/lib/lyric/parse.ts` 导出：

| 函数 | 输入 → 输出 | 说明 |
|---|---|---|
| `parseLrc(lrc: string)` | LRC 文本 → `LyricLine[]` | 标准 `[mm:ss.xx]` 标签解析；支持全局/行内偏移与逐字标签剥离 |
| `parseLyricText(text: string)` | 纯文本 → `LyricLine[]` | 无时间轴文本逐行摊开 |
| `plainTextToLyricLines(text: string)` | 纯文本 → `LyricLine[]` | 同上（内部用） |
| `findActiveLyricIndex(lines, positionMs)` | 行数组 + 播放位置 → 活动行下标 | 二分匹配，供高亮 |

```ts
import { findActiveLyricIndex, parseLrc } from "@/lib/lyric/parse"

const lines = parseLrc(lrcText)
const activeIndex = findActiveLyricIndex(lines, positionMs)
// 高亮 lines[activeIndex]
```

## 时间轴校正

`parseLrc` 内置三类时间轴处理，优先于歌词覆写使用：

| 语法 | 作用域 | 说明 |
|---|---|---|
| `[offset:±毫秒]` | 全文 | LRC 头部的全局偏移元信息；正值推迟、负值提前，作用于所有行 |
| `[±N]` | 单行 | 紧跟时间戳后的行内微调（如 `[00:12.00][+120]歌词`），仅该行生效 |
| `<mm:ss.xx>` 逐字标签 | 文本 | 增强型 LRC 的逐字时间标签对整行同步无用，解析时剥掉，防止串进歌词文本 |

```lrc
[offset:-300]
[ti:示例]
[00:12.00][+120]第一行歌词
[00:16.50]<00:16.50><00:17.20>第二行歌词
```

全局偏移按毫秒加在每行 `timeMs` 上；行内偏移再叠加。三者只影响解析结果，不改动原始文本。

## 歌词覆写

`src/lib/lyric/overrides.ts`——用户手动编辑的歌词优先于网络歌词，存 localStorage（`musicstorm-lyric-override(s)`）：

```ts
import {
    clearLyricOverride,
    getLyricOverride,
    setLyricOverride,
} from "@/lib/lyric/overrides"

const overridden = getLyricOverride(trackId)   // string | null
if (overridden) {
    setLyricOverride(trackId, lrcText)          // 写入覆写
} else {
    clearLyricOverride(trackId)                  // 清除覆写，回到网络歌词
}
```

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 歌词空白 | 歌曲无歌词（纯音乐 / 未收录）；`fetchLyricText` 返回空 |
| 时间轴错位 | 原始 LRC 自身问题；用户可覆写修正 |
| 覆写不生效 | 确认 `getLyricOverride` 返回非空，且渲染层优先生效 |
| 本地文件歌词乱码 | 走本地标签读取的 `decode_text_bytes`（UTF-8/BOM/UTF-16/GB18030），见 [本地曲库](#/docs/dev/local-library) |

## 排查路径

1. 确认 `fetchLyricText` 返回了文本（空 = 无歌词）
2. 确认 `parseLrc` 能解析（格式不符会退化为纯文本行）
3. 确认活动行用 `findActiveLyricIndex` 匹配位置
4. 覆写场景确认 localStorage key 内容有效
