---
title: 快捷键
description: 全局快捷键、应用内快捷键与播放命令事件链路。
order: 18
---

# 快捷键

> 理解两类快捷键的实现与链路：全局（系统级，Rust 注册）与应用内（页面捕获），以及它们如何驱动播放器。

## 本页边界

覆盖：`src/lib/app/global-shortcut-prefs.ts`、`in-app-shortcut-prefs.ts`、`src-tauri/src/tray.rs`、`src/hooks/use-tray-commands.ts`、`use-player-hotkeys.ts`。

**不**覆盖：播放器状态（见 [播放引擎](#/docs/dev/player)）、事件机制（见 [事件](#/docs/dev/events)）。

## 两类快捷键

| 类型 | 触发范围 | 配置存储 | 实现 |
|---|---|---|---|
| 全局 | 系统级，应用失焦也可用 | SQLite `global_shortcuts`（JSON） | Rust 注册（`update_global_shortcut` 命令） |
| 应用内 | 窗口聚焦时 | localStorage `musicstorm-in-app-shortcuts` | 页面 keydown 捕获 |

## 全局快捷键

动作固定为 `toggle` / `previous` / `next`（`SHORTCUT_ACTIONS`）。默认组合键：`Ctrl+Alt+Space` / `Ctrl+Alt+Left` / `Ctrl+Alt+Right`；macOS 默认不抢占系统级组合键（空串）。

```ts
import {
    loadGlobalShortcuts,
    updateGlobalShortcut,
} from "@/lib/app/global-shortcut-prefs"

const shortcuts = await loadGlobalShortcuts()        // 读 SQLite 配置
await updateGlobalShortcut("toggle", "Ctrl+Alt+Space") // 注册 / 更新
```

Rust 侧注册后，按下时经事件 `musicstorm:player-command`（payload 为动作串）通知前端；macOS 另有应用菜单（`tray.rs` 的 `setup_macos_menu`）提供「播放 / 暂停」「上一首」等菜单项，走同一事件。

## 应用内快捷键

动作集（`IN_APP_ACTIONS`）：`togglePlay` / `seekBackward` / `seekForward` / `volumeDown` / `volumeUp` / `previous` / `next` / `closeFullPlayer`。

```ts
import {
    getInAppShortcuts,
    setInAppShortcut,
    keydownToInAppShortcut,
} from "@/lib/app/in-app-shortcut-prefs"

const map = getInAppShortcuts()                       // Record<action, combo>
await setInAppShortcut("togglePlay", "Space")         // 写入 + 广播变更
const action = keydownToInAppShortcut(event)          // keydown → action | null
```

页面在输入控件聚焦时不触发（搜索框空格不被抢占）；变更广播 `musicstorm-in-app-shortcut-change`。

## 播放命令链路

```txt
全局快捷键（Rust）        → musicstorm:player-command
macOS 菜单项（Rust）      → musicstorm:player-command
应用内 keydown（页面）    → usePlayer().playOrToggle 等

前端：use-tray-commands 监听 musicstorm:player-command，
      use-player-hotkeys 捕获应用内 keydown，两者最终都调 usePlayer()
```

payload 动作：`toggle` / `previous` / `next` / `seek-backward` / `seek-forward` / `volume-up` / `volume-down` / `show`。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 全局快捷键不生效 | 配置为空串 / 未注册；`updateGlobalShortcut` 未调用 |
| 冲突被系统抢占 | 组合键被其它应用占用；换键 |
| 搜索框打字触发快捷键 | 应用内捕获需在输入控件聚焦时跳过（`keydownToInAppShortcut` 调用方判断） |
| 菜单项点了没反应 | macOS 菜单走 `musicstorm:player-command`，前端需在监听 |

## 排查路径

1. 全局：确认 SQLite `global_shortcuts` 有配置且 Rust 已注册
2. 确认前端 `use-tray-commands` 监听了 `musicstorm:player-command`
3. 应用内：确认 `keydownToInAppShortcut` 返回了期望 action
4. 确认事件 payload 与动作枚举拼写一致
