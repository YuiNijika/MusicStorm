---
title: 本地曲库
description: 本地文件模型、扫描导入、双写存储与调用示例。
order: 6
---

# 本地曲库

> 理解本地音乐从磁盘到可播放 `Track` 的完整链路：数据模型、扫描编排、双写存储。

## 本页边界

覆盖：`src/lib/local/` 与 `src-tauri` 的扫描命令。

**不**覆盖：网易云数据（见 [API](#/docs/dev/api)）、播放（见 [播放引擎](#/docs/dev/player)）。

## 数据模型

`src/lib/local/library-store.ts`，结构 `folders / artists / albums / tracks`：

| 实体 | 说明 |
|---|---|
| `LocalArtist` | 艺人分组：`id / name / folderPath / coverDataUrl` |
| `LocalAlbum` | 专辑：`artistId` 归属艺人 |
| `LocalTrack` | 曲目：经 `storedToTrack()` 转成播放用 `Track` |

存储双写：localStorage `musicstorm.local.library` + SQLite。任何变更**必须**走 `saveLocalLibrary`，并广播事件 `musicstorm:local-library-change`。

## 导入编排

页面层不要直接拼扫描与合并，用 `src/lib/local/import-folder.ts` 的提交函数（内部完成：选择校验 → Rust 扫描 → 合并 → 双写 → 返回新状态）：

| 函数 | 用途 | 返回 |
|---|---|---|
| `commitArtistFolder({ folderPath, artistName?, coverDataUrl? })` | 艺人文件夹：直接子文件夹 = 专辑，根目录散曲自建「{艺人名} 精选」专辑 | `{ state, artist, added }` |
| `commitMusicFiles()` | 选散文件导入 | `{ state, added }` |
| `commitFolderAlbum({ folderPath, ... })` | 一个文件夹作为一张专辑导入 | 同上 |
| `commitCreateAlbum({ ... })` | 手动建专辑 | 同上 |
| `pickMusicFolder` / `pickMusicFiles` | 调 Rust 原生文件选择 | 路径或 `null`（取消） |

```ts
import { useLocalLibrary } from "@/hooks/use-local-library"

// 页面层推荐用法：hook 已封装状态与提交，内部自己弹目录选择
const { library, importArtistFolder } = useLocalLibrary()
await importArtistFolder()
```

```ts
import { commitArtistFolder } from "@/lib/local/import-folder"

// 底层直接调用（非 React 环境 / 自定义流程）
const result = await commitArtistFolder({ folderPath })
// result = { state: LocalLibraryState, artist: LocalArtist, added: number }
notifySuccess(result.added > 0 ? "艺人导入完成" : "扫描完成", {
    description: `已导入 ${result.added} 首 · ${result.artist.name}`,
})
```

## 纯函数读写

`library-store.ts` 的纯函数直接操作状态，适合无 UI 的批处理：

```ts
import {
    listAlbumsByArtist,
    listTracksByAlbum,
    listLocalPlayableTracks,
    loadLocalLibrary,
    removeArtistsBulk,
    saveLocalLibrary,
} from "@/lib/local/library-store"

const state = loadLocalLibrary()
const albums = listAlbumsByArtist(state, artistId)        // LocalAlbum[]
const tracks = listTracksByAlbum(state, albumId)          // Track[]（已带封面）
const playable = listLocalPlayableTracks(state)           // 全部可播放 Track[]

// 删除艺人：includeAlbums 决定是否连带删除专辑
const next = removeArtistsBulk(state, new Set([artistId]), true)
saveLocalLibrary(next)
```

## 扫描（Rust 侧）

| 命令 | 行为 |
|---|---|
| `scan_music_folder` | 目录扫描（深度 ≤ 8，曲目 ≤ 2000） |
| `scan_music_files` | 散文件扫描 |
| `scan_music_artist_folder` | 艺人文件夹扫描（子文件夹 = 专辑） |

扫描在 Rust 侧 rayon 并行（2~6 线程），进度经事件 `musicstorm:scan-progress` 推送（`done / total / currentPath`）。本地标签读取在 `src-tauri/src/local_meta.rs`：

- `fix_tag_text`：修复 ID3 latin-1 误读的 GBK/UTF-8 标签
- `decode_text_bytes`：歌词解码，支持 UTF-8 / BOM / UTF-16 / GB18030

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 导入后艺人 / 专辑对不上 | 艺人文件夹按「直接子文件夹 = 专辑」分组；根目录散曲进「{艺人名} 精选」 |
| 中文标签乱码 | 确认标签读取走了 `fix_tag_text`（ID3 latin-1 误读） |
| 大目录导入慢 / 卡 | 撞到 `MAX_TRACKS=2000` / `MAX_DEPTH=8` 上限或单文件过大 |
| 取消导入报错 | 提交函数抛 `CANCELLED`，页面按取消处理，不要当错误弹窗 |
| 浏览器环境调导入函数 | 抛 `DESKTOP_ONLY`，本地库能力仅在桌面运行时可用 |

## 排查路径

1. 确认走提交函数（`commit*`）而非手拼扫描
2. 确认目录结构符合分组规则（子文件夹层级）
3. 看 `musicstorm:scan-progress` 事件是否触发（定位卡在扫描还是合并）
4. 确认 `saveLocalLibrary` 被调用（双写任意一侧失败都查该函数）
5. 检查 `musicstorm.local.library` 的 JSON 是否损坏（损坏会导致读取回退空库）
