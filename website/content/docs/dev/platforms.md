---
title: 平台适配
description: 桌面 / macOS / 移动端的差异适配与系统集成。
order: 20
---

# 平台适配

> 理解同一套代码如何在桌面、macOS、移动端差异工作：平台判断、标题栏、托盘、Now Playing、移动端行为。

## 本页边界

覆盖：`src/lib/platform.ts`、标题栏 / 窗口控制、托盘、macOS 集成、移动端适配、平台相关 `cfg` 约定。

**不**覆盖：构建命令清单（见 [规范](#/docs/dev/conventions)）、更新平台隔离（见 [更新与发布](#/docs/dev/update)）。

## 平台判断

`src/lib/platform.ts`：

| 函数 | 说明 |
|---|---|
| `isTauriRuntime()` | 是否在 Tauri（桌面 / 移动）运行时；浏览器调试为 false |
| `isMacOS()` | 平台是否为 macOS（含移动端判断分离） |
| `isNativeMacOS()` | 原生 macOS（非浏览器 UA 推断） |

`isTauriRuntime()` 是能力守卫的通用入口：`pick_*`、`audio_*`、`db_*` 等桌面 / 移动命令在浏览器调试时必然失败，调用前先判断。

## 桌面

| 能力 | 入口 | 说明 |
|---|---|---|
| 标题栏 | `app/title-bar-prefs.ts` + `components/app/title-bar` | 双击标题栏 = 最大化（不是最小化）；拖拽有 4px 移动阈值（点击微抖不触发） |
| 窗口控制 | `use-window-controls` | 最小化 / 最大化 / 关闭 |
| 关闭到托盘 | `app/close-to-tray-prefs.ts` + `use-close-to-tray` | 关窗时隐藏到托盘 |
| 托盘菜单 | `src-tauri/src/tray.rs` | 播放控制 + 全局快捷键，事件 `musicstorm:player-command` |

## macOS

| 能力 | 入口 | 说明 |
|---|---|---|
| Now Playing | `src-tauri/src/macos_now_playing.rs` + `use-macos-now-playing` | 系统媒体控制（锁屏 / 控制中心） |
| 应用菜单 | `tray.rs` 的 `setup_macos_menu`（`#[cfg(target_os = "macos")]`） | 设置…（广播 `musicstorm:open-settings`）、播放菜单 |
| Dock 恢复 | `lib.rs` 的 `RunEvent::Reopen` | 隐藏到托盘后点击 Dock 图标恢复窗口 |
| ATS 限制 | `music/resolve-url.ts` | 网易云 CDN http → https 升级（WKWebView 混合内容限制） |
| 快捷键默认 | `global-shortcut-prefs.ts` | macOS 默认不抢占系统级组合键 |

## 移动端（Android / iOS WebView）

| 能力 | 入口 | 说明 |
|---|---|---|
| 内联播放 | `audio-engine.ts`（`playsinline`） | WebView 需允许内联播放，否则 play() 被系统拦截仅全屏 |
| Android 返回键 | `use-android-back` | 返回栈处理（关详情 / 退应用） |
| 能力裁剪 | `#[cfg(not(target_os = "android"))]` | 文件选择、独占音频等桌面命令 Android 不注册 |
| 更新隔离 | `ANDROID_TAG_SUFFIX` | `-android` tag 隔离（见 [更新与发布](#/docs/dev/update)） |

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 浏览器调试命令报错 | 桌面能力在浏览器不可用；用 `isTauriRuntime()` 守卫或 mock |
| 移动端点播放没声音 | 未设置 `playsinline`；或走独占音频命令（Android 已裁剪） |
| macOS 快捷键抢占输入 | 默认空组合键设计（Apple Music 习惯）；自定义后注意冲突 |
| 托盘图标点了没反应 | 事件 `musicstorm:player-command` 前端未监听 |

## 排查路径

1. 确认 `isTauriRuntime()` 判断后再调平台命令
2. 平台差异代码确认 `#[cfg]` 标注（桌面功能 Android 裁剪）
3. macOS 行为：确认走 `isNativeMacOS()` 而非 UA 推断
4. 移动端播放：确认引擎为 HTML5（原生引擎 `cfg(not(android))`）
