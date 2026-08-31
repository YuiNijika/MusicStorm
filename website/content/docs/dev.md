---
title: 开发指南
description: 开发系列总览：架构分层、目录结构、阅读路线与启动链路。
order: 7
---

# MusicStorm 开发指南

> 开发系列总览：先看架构分层与目录结构，再按任务进入对应模块文档。

## 本系列包含

| 文档 | 覆盖内容 |
|---|---|
| [API](#/docs/dev/api) | 网易云数据接入：双模式、统一请求入口、加密链、模块清单 |
| [登录与会话](#/docs/dev/auth) | 扫码 / 手机号登录、凭证、多账号切换 |
| [本地曲库](#/docs/dev/local-library) | 本地文件模型、扫描、导入与存储 |
| [播放引擎](#/docs/dev/player) | HTML5 / 原生双引擎、播放器状态 |
| [歌词](#/docs/dev/lyric) | 歌词获取、解析、覆写与匹配 |
| [主题与外观](#/docs/dev/appearance) | 明暗主题、强调色、毛玻璃、性能模式 |
| [封面与播放 URL](#/docs/dev/media) | 播放 URL 解析、封面缓存 / 覆写、ffmpeg |
| [听歌统计](#/docs/dev/stats) | 播放会话、时长统计、榜单与来源 |
| [Tauri 命令](#/docs/dev/tauri) | Rust 侧命令全集、新增命令流程 |
| [事件](#/docs/dev/events) | 前端内 / Rust → 前端事件契约 |
| [偏好存储](#/docs/dev/prefs) | localStorage 偏好域与读写约定 |
| [快捷键](#/docs/dev/hotkeys) | 全局 / 应用内快捷键与命令链路 |
| [更新与发布](#/docs/dev/update) | 更新检查、版本比较、平台隔离发布 |
| [状态层 Hooks](#/docs/dev/hooks) | Provider 层级与 hooks 地图 |
| [平台适配](#/docs/dev/platforms) | 桌面 / macOS / 移动端差异 |
| [规范](#/docs/dev/conventions) | 代码风格、动效、懒加载、构建约定、排查路径 |

## 本页边界

适合谁阅读：首次接触代码库的开发者、需要定位某个能力归属的维护者。

本页**不**包含：各模块的接口细节（见上表子文档）、产品使用说明（见其它文档）。

## 架构分层

| 层级 | 负责内容 | 典型入口 |
|---|---|---|
| 界面层 | 页面、组件、路由、动效 | `src/pages/`、`src/components/` |
| 状态层 | 播放、登录、点赞、导航的 React Context | `src/hooks/use-player.tsx` 等 |
| API 层 | 网易云请求入口、本地曲库模型、偏好存储 | `src/lib/netease/client.ts`、`src/lib/local/library-store.ts` |
| 引擎层 | HTML5 音频、原生音频、ffmpeg、封面缓存 | `src/lib/player/`、`src-tauri/src/audio/` |
| Rust 层 | 无 CORS 代理、文件扫描、SQLite、托盘、快捷键、桌面歌词 / 小播放器第二窗口 | `src-tauri/src/` |

数据流约定：**界面层不直接碰 localStorage 与 SQLite**，一律经 `src/lib/` 下的模块读写；Rust 侧能力一律经 `invoke` 封装成 `src/lib/` 下的桥接函数，组件只调桥接函数。

## 目录结构

```txt
src/
├─ pages/            # 12 个页面，全部 lazy 加载
├─ components/
│  ├─ app/           # AppShell、主题、标题栏
│  ├─ auth/          # 登录对话框
│  ├─ layout/        # 侧栏、播放条、全屏播放器
│  ├─ music/         # 曲目行、歌单网格、骨架屏
│  └─ ui/            # 基础控件（toast 等）
├─ hooks/            # 播放器 / 会话 / 点赞 / 导航 等 Context
└─ lib/
   ├─ netease/       # 网易云 API 层（含 native/ 加密）
   ├─ local/         # 本地曲库模型与导入
   ├─ player/        # 播放引擎与偏好
   ├─ appearance/    # 主题与强调色
   ├─ lyric/         # 歌词解析与覆写
   ├─ music/         # 封面覆写、远程封面缓存、播放 URL 解析
   ├─ db/            # 听歌统计
   ├─ app/           # 更新、性能、快捷键、标题栏等偏好
   └─ storage/       # 路径

src-tauri/src/
├─ lib.rs            # 命令注册、扫描、文件选择
├─ audio/mod.rs      # 原生音频引擎（rodio + cpal）
├─ netease_proxy.rs  # 网易云 HTTP 无 CORS 代理
├─ db.rs             # SQLite（曲库 / 设置 / API 缓存 / 听歌统计）
├─ cover_cache.rs    # 封面磁盘缓存
├─ ffmpeg.rs         # ffmpeg 检测与校验
├─ tray.rs           # 托盘与全局快捷键
├─ desktop_lyric.rs  # 桌面歌词第二窗口
├─ mini_player.rs    # 桌面小播放器第二窗口
├─ local_meta.rs     # 本地文件标签读取
└─ macos_now_playing.rs # macOS Now Playing 集成

website/             # 官网子包，独立 vite 工程
```

## 阅读路线

| 任务 | 先读 |
|---|---|
| 加一个网易云接口 | `dev/api` → 模块清单 + `neteaseRequest` |
| 改本地曲库导入 | `dev/local-library` |
| 改播放 / 换引擎 | `dev/player` |
| 新增 Rust 命令 | `dev/tauri` |
| 新增跨端事件 | `dev/events` |
| 新增设置项 | `dev/prefs` |
| 提交代码前 | `dev/conventions`（规范）+ `dev/tauri`（注册） |

## 启动链路

单窗口直显、无 splash：`index.html` 内联 `#boot-loading` 兜底首帧，React 首帧 commit 后由 App 根 effect 淡出移除；`main.tsx` 渲染失败时兜底移除并显示错误。窗口标题栏约定：双击 = 最大化（不是最小化）。

## 调试入口

- 前端错误：`console.error`（渲染失败会打 `[boot] App 加载失败`）
- Rust 日志：`tauri dev` 终端输出
- 开发者工具：应用内快捷键（`src/lib/app/devtools-prefs.ts`）
