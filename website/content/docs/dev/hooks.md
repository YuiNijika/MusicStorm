---
title: 状态层 Hooks
description: 全局 Context 层级、hooks 地图与使用约定。
order: 19
---

# 状态层 Hooks

> 应用全局状态全部由 React Context hooks 承载：先看层级与地图，再按职责使用。

## 本页边界

覆盖：`src/hooks/` 全部 hooks。

**不**覆盖：播放器 / 会话的字段细节（见对应模块文档）。

## Provider 层级

`src/App.tsx` 嵌套顺序（外层依赖内层）：

```txt
ThemeProvider
└─ AppUpdateProvider
   └─ NeteaseSessionProvider     # 登录会话
      └─ LikedProvider           # 红心 / 订阅（依赖会话）
         └─ PlayerProvider       # 播放器（依赖会话与点赞）
            └─ MusicNavigationProvider  # 详情栈导航
```

## Hooks 地图

| Hook | 职责 | 关键值 / 方法 |
|---|---|---|
| `usePlayer` | 播放队列与控制 | `playOrToggle`、`jumpTo`、`seek` 等（见 [播放引擎](#/docs/dev/player)） |
| `useNeteaseSession` | 登录会话 | `ready` / `loggedIn` / `profile` / `accounts`（见 [登录与会话](#/docs/dev/auth)） |
| `useLiked` | 红心与订阅集合 | `likedSongIds`、`isTrackLiked(id)`、`isPlaylistSubscribed(id)`、`isRadioSubscribed`、`isAlbumSubscribed` |
| `useMusicNavigation` | 详情栈 | `detail`、`openPlaylist/openArtist/openAlbum/openRadio/openRadioProgram/openMv`、`back` |
| `useLocalLibrary` | 本地曲库状态与导入 | `library`、`importArtistFolder` 等（见 [本地曲库](#/docs/dev/local-library)） |
| `usePlayerHotkeys` | 应用内快捷键 → 播放 | 见 [快捷键](#/docs/dev/hotkeys) |
| `useTrayCommands` | 托盘 / 全局命令 → 播放 | 监听 `musicstorm:player-command` |
| `useAppUpdate` | 更新检查状态 | 见 [更新与发布](#/docs/dev/update) |
| `useCloseToTray` | 关闭到托盘 | — |
| `useDesktopLyric` / `useDesktopLyricSync` | 桌面歌词开关与状态推送 | 开关先查窗口真实可见性再 show/hide；仅可见时向 Rust 推状态 |
| `useMiniPlayer` / `useMiniPlayerSync` | 桌面小播放器开关与状态推送 | 同桌面歌词模式；Rust 缓存状态并广播 `musicstorm:mini-player-state`（见 [事件](#/docs/dev/events)） |
| `useAutoSignin` | 每日自动签到调度 | 登录态就绪后检查一次 + 每分钟检查跨天（见 [登录与会话](#/docs/dev/auth)） |
| `useMacOSNowPlaying` | macOS Now Playing | — |
| `useWindowControls` | 标题栏窗口控制 | 最小化 / 最大化 / 关闭 |
| `useQrLogin` | 扫码登录弹窗流程 | — |
| `useAndroidBack` | Android 返回键 | — |
| `useMobile` | 移动端适配判断 | — |
| `useMusicNavigation` 系列 | 导航 | 见上 |
| `useLibraryLayout` | 资料库布局偏好 | — |
| `useCachedCoverUrl` | 封面缓存读取 | — |
| `useApiCacheAutoPurge` | API 缓存自动清理 | — |
| `usePlaylistGrid` | 歌单网格计算 | — |
| `useContributors` | GitHub 贡献者（官网） | — |

## 使用约定

- **组件用 hook，不直接建全局状态**；跨组件共享状态一律放这些 Context
- hook 暴露的 `isXxx` 判断函数优先于自行比较 id 集合
- 依赖会话的 hook（`useLiked`、`usePlayer`）在 `ready` 之前不要依赖其数据
- 监听类 hook（`useTrayCommands` 等）在卸载时自动注销，勿重复监听

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| `useXxx must be used within Provider` | 组件挂在了 Provider 外层（如 Portal / 弹窗根） |
| 订阅状态不更新 | `LikedProvider` 未随会话切换重取 |
| 导航栈错乱 | 直接用 `location.hash` 改导航，绕过 `useMusicNavigation` |
| 播放命令双触发 | 全局快捷键与应用内快捷键同时注册同一动作 |

## 排查路径

1. 确认组件在对应 Provider 内（Provider 层级见上）
2. 确认用的是 hook 暴露的判断函数而非手写集合比较
3. 会话相关：确认 `ready` 后才消费数据
4. 命令重复：查快捷键配置是否重叠
