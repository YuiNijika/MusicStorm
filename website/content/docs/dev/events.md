---
title: 事件
description: 前端内与 Rust → 前端的事件契约、监听写法与新增事件规范。
order: 9
---

# 事件

> 应用内跨模块协作靠事件而非函数回调：分清事件与命令的适用场景，按命名与载荷约定新增。

## 本页边界

覆盖：`musicstorm:*` 与 `audio://*` 事件。

**不**覆盖：命令（见 [Tauri 命令](#/docs/dev/tauri)）、偏好存储（见 [偏好存储](#/docs/dev/prefs)）。

## 事件 vs 命令

| 场景 | 用事件 | 用命令 |
|---|---|---|
| 单向通知（进度、状态变化） | ✅ | |
| 持续数据流（音频 tick） | ✅ | |
| 请求 → 返回结果 | | ✅ |
| 需要返回值 / 抛错 | | ✅ |

## 事件清单

| 事件 | 方向 | 载荷 / 触发 |
|---|---|---|
| `audio://tick` | Rust → 前端 | `AudioTickPayload`，原生引擎播放进度，播放期间周期触发 |
| `audio://ended` | Rust → 前端 | 原生引擎播完 |
| `musicstorm:scan-progress` | Rust → 前端 | `{ done, total, currentPath }`，扫描进度 |
| `musicstorm:local-library-change` | 前端内 | 本地曲库变更广播 |
| `musicstorm:api-settings-change` | 前端内 | API 模式 / 来源变更 |
| `musicstorm:api-cache-ttl` | 前端内 | API 缓存 TTL 偏好变更 |
| `musicstorm:api-cache-auto-purge` | 前端内 | 缓存自动清理偏好变更 |
| `musicstorm:player-command` | 跨窗口 | 播放器命令：托盘 / 全局快捷键 / 桌面小播放器均发此事件，主窗口 `useTrayCommands` 统一消费（`toggle` / `next` / `seek-to` 等） |
| `musicstorm:mini-player-state` | Rust → 前端 | `MiniPlayerState`（title / artist / coverUrl / isPlaying / positionMs / durationMs），主窗口经 `update_mini_player` 推送，mini-player 窗口监听 |
| `musicstorm:mini-player-visibility` | 前端内 | 桌面小播放器窗口可见性广播（`useMiniPlayer` / `useMiniPlayerSync` 同步开关状态） |
| `musicstorm:desktop-lyric-update` | Rust → 前端 | 桌面歌词状态（当前行文本等），主窗口推送，desktop-lyric 窗口监听 |
| `musicstorm:desktop-lyric-visibility` | 前端内 | 桌面歌词窗口可见性广播 |
| `musicstorm:player-preferences` | 前端内 | 播放偏好变更 |
| `musicstorm:update-status` | 前端内 | 更新状态 |
| `musicstorm:full-player-chrome` | 前端内 | 全屏播放器界面偏好变更 |
| `musicstorm:full-player-layout` | 前端内 | 全屏播放器布局偏好变更 |
| `musicstorm:engine-pref` | 前端内 | 播放引擎偏好变更 |
| `musicstorm:devtools-enabled` | 前端内 | 开发者工具开关变更 |
| `musicstorm-sidebar-style` | 前端内 | 侧栏风格（compact / classic）变更 |
| `musicstorm-signin-log` | 前端内 | 每日签到记录变更（自动 / 手动签到后广播，账号页刷新状态） |
| `musicstorm-remote-cover-ready` | 前端内 | 远程封面缓存就绪 / 失效（detail 为原始 URL，空串广播表示需全量重新解析，见 [封面与播放 URL](#/docs/dev/media)） |

## 监听写法

Rust → 前端事件（Tauri）：

```ts
import { listen } from "@tauri-apps/api/event"

// 组件内：useEffect 注册，cleanup 注销，避免重复 tick
useEffect(() => {
    let disposed = false
    const un = listen<AudioTickPayload>("audio://tick", (event) => {
        if (disposed) {
            return
        }
        // 原生引擎进度回调，更新播放条位置
    })
    return () => {
        disposed = true
        void un.then((off) => off())
    }
}, [])
```

前端内事件（prefs 广播）：

```ts
import { listen } from "@tauri-apps/api/event"

const un = await listen("musicstorm:engine-pref", () => {
    // 引擎偏好变了，重新裁决引擎
})
```

## 新增事件规范

- 命名：跨窗口 / Rust → 前端用 `musicstorm:kebab-case`（带冒号）；新近的前端内偏好广播用 `musicstorm-kebab-case`（不带冒号，如 `musicstorm-sidebar-style`）。新增事件先 grep 两种前缀防冲突，并优先沿用同模块已有形态
- 方向与载荷：Rust 事件在 emit 处定义 payload 类型（`AudioTickPayload` 等），前端建同名类型
- 广播时机：偏好模块在 `writeXxxPrefs` 内广播（见 [偏好存储](#/docs/dev/prefs)），不要在组件里手发
- 高频事件（tick）：载荷要小，监听方组件卸载必须注销

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 事件没收到 | 拼写不一致；或监听注册在事件广播之后（同步广播） |
| tick 重复触发 | 组件多次挂载未注销；检查 cleanup 是否 `off` |
| 广播后 UI 没刷新 | 广播方与订阅方 key 不一致；前端内事件用 `listen`（Tauri 的 `emit` 也兼容） |

## 排查路径

1. 确认事件名拼写与方向（`musicstorm:*` 前端内，`audio://*` Rust → 前端）
2. 确认广播发生在数据变更点（prefs 写在 `write*` 内）
3. 组件内监听确认 cleanup 注销
4. Rust 事件确认 `app.emit(...)` 成功（返回 Result 要忽略失败）
