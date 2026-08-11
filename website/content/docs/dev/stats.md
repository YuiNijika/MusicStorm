---
title: 听歌统计
description: 播放会话记录、听歌时长统计、榜单与来源拆分的完整链路。
order: 15
---

# 听歌统计

> 理解「听歌时长 / 榜单 / 来源占比」如何被记录与读取：会话模型、Rust SQLite、前端封装与聚类。

## 本页边界

覆盖：`src/lib/db/play-stats.ts`、`src-tauri/src/db.rs` 的统计相关命令。

**不**覆盖：播放引擎（见 [播放引擎](#/docs/dev/player)）、SQLite 设置项（见 [偏好存储](#/docs/dev/prefs)）。

## 会话模型

每次播放是一个会话：开始记录、结束结算（时长与来源），数据落 SQLite：

```txt
播放开始 ── db_start_play_session({ trackId, source, ... })
播放结束 ── db_end_play_session({ sessionId, listenedMs, ... })
```

前端封装在 `src/lib/db/play-stats.ts`：

| 函数 | 对应命令 | 说明 |
|---|---|---|
| `startPlaySession(input: PlaySessionStart)` | `db_start_play_session` | 会话开始 |
| `recordPlaySessionEnd(input: PlaySessionEnd)` | `db_end_play_session` | 会话结束结算 |
| `upsertLibraryFolder(input)` | `db_upsert_folder` | 曲库文件夹落库 |
| `upsertLibraryTracks(tracks)` | `db_upsert_tracks` | 曲目落库 |
| `getListenStats(day?)` | `db_get_listen_stats` | 单日统计 |
| `listListenStats(...)` | `db_list_listen_stats` | 区间统计 |
| `listListenSourceBreakdown(...)` | `db_listen_source_breakdown` | 来源（网易云/本地/电台）占比 |
| `listTopTrackClusters(...)` | `db_list_top_tracks` | 榜单（聚类后） |

## 聚类与榜单

原始 `TopTrackStat` 行经 `enrichTopTrackStats` 补全元数据、`clusterTopTracks` 聚合成 `TopTrackCluster[]`，再 `clusterToTrack` 转可播放 `Track`。统计页（`src/pages/stats.tsx`）只消费高层 API，不直接读原始行。

```ts
import { getListenStats, listTopTrackClusters } from "@/lib/db/play-stats"

const today = await getListenStats()                  // 今日统计（day 缺省）
const top = await listTopTrackClusters(20)            // 榜单聚类前 20
```

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 时长不计 / 统计为 0 | 会话结束未调用 `recordPlaySessionEnd`（切歌、退出时机） |
| 榜单重复曲目 | 聚类 key 合并失败；检查 `enrichTopTrackStats` 的元数据匹配 |
| 来源占比缺失 | `PlaySessionStart.source` 未传或值不在枚举内 |
| 本地曲目无信息 | `upsertLibraryTracks` 未在导入时调用 |

## 排查路径

1. 确认播放流程调了 `startPlaySession` / `recordPlaySessionEnd`
2. 确认会话参数（`source` / `trackId`）正确
3. 直接查 SQLite（`db_list_listen_stats`）确认原始数据存在
4. 榜单问题定位在聚类层（`clusterTopTracks`），不是存储
