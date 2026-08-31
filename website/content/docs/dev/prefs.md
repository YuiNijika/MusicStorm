---
title: 偏好存储
description: localStorage 偏好域清单、读写约定与新增偏好流程。
order: 10
---

# 偏好存储

> 应用设置分三种存储：localStorage 偏好、SQLite 设置、磁盘缓存。先分清归属，再按约定读写。

## 本页边界

覆盖：`src/lib/` 下各 `*-prefs.ts` 的 localStorage 偏好域。

**不**覆盖：SQLite（`db_get_setting` / `db_set_setting`）、网易云 API 磁盘缓存（`api_cache_*`）。

## 三类存储怎么选

| 存储 | 用途 | 示例 |
|---|---|---|
| localStorage 偏好 | 即时生效的 UI / 行为偏好 | 主题、音质、引擎、布局 |
| SQLite 设置 | 需要 Rust 侧读取的持久值 | ffmpeg 路径等 |
| API 磁盘缓存 | 网易云响应缓存（TTL 过期） | 歌曲详情、歌单 |

## 偏好域清单

| Key | 内容 | 读写入口 |
|---|---|---|
| `musicstorm-api-settings` | API 模式 / 来源 / 自定义 URL | `netease/api-settings.ts` |
| `musicstorm-api-cache-ttl-ms` | API 缓存 TTL | `netease/cache-prefs.ts` |
| `musicstorm-api-cache-auto-purge` | 缓存自动清理 | 同上 |
| `musicstorm-netease-accounts` | 账号库（多账号） | `netease/account-vault.ts` |
| `musicstorm-netease-active-uid` | 当前账号 | 同上 |
| `musicstorm-netease-quality-br` | 网易云音质偏好 | `netease/quality.ts` |
| `musicstorm.local.library` | 本地曲库快照 | `local/library-store.ts` |
| `musicstorm-appearance` | 主题 / 强调色 / 着色范围 | `appearance/appearance-prefs.ts` |
| `musicstorm-player-engine` | 播放引擎偏好 | `player/engine-policy.ts` |
| `musicstorm-player-preferences` | 播放偏好 | `player/playback-prefs.ts` |
| `musicstorm-player-fade-enabled` / `musicstorm-player-fade-ms` | 淡入淡出 | `player/fade-prefs.ts` |
| `musicstorm-full-player-chrome` / `musicstorm-full-player-layout` | 全屏播放器 | `player/full-player-prefs.ts` |
| `musicstorm-lyric-override` / `musicstorm-lyric-overrides` | 歌词覆写 | `lib/lyric/overrides.ts` |
| `musicstorm-cover-override` / `musicstorm-cover-overrides` | 封面覆写 | `lib/music/cover-overrides.ts` |
| `musicstorm-library-layout` | 资料库布局 | `lib/library/layout-prefs.ts` |
| `musicstorm-track-order` | 曲目排序 | `lib/library/track-order.ts` |
| `musicstorm-titlebar-style` / `musicstorm-titlebar-double-click` | 标题栏 | `app/title-bar-prefs.ts` |
| `musicstorm-in-app-shortcuts` | 应用内快捷键 | `app/in-app-shortcut-prefs.ts` |
| `musicstorm-close-to-tray` | 关闭到托盘 | `app/close-to-tray-prefs.ts` |
| `musicstorm-performance-mode` / `musicstorm-performance-material-glass` | 性能模式 | `app/performance-prefs.ts` |
| `musicstorm-devtools-enabled` | 开发者工具开关 | `app/devtools-prefs.ts` |
| `musicstorm-search-history` | 搜索历史 | `lib/search-history.ts` |
| `musicstorm-sidebar` | 侧栏风格（compact / classic + navOrder） | `app/sidebar-prefs.ts` |
| `musicstorm-auto-signin` | 每日自动签到开关（默认开） | `netease/daily-signin.ts` |
| `musicstorm-signin-log` | 签到记录（按账号 × 自然日） | 同上 |
| `musicstorm-star-toast-seen` | 求 star 提示展示去重（按天） | `app/star-toast.tsx` |
| `musicstorm-playback-session` | 播放会话恢复 | `player/playback-session.ts` |
| `musicstorm-remote-cover-ready` | 远程封面就绪标记 | `lib/music/remote-cover-cache.ts` |
| `musicstorm-update-boot-toasted` | 更新提示去重 | `lib/app/github-update.ts` |

例外：全局快捷键（`global_shortcuts`）走 SQLite 设置（`db_get_setting` / `db_set_setting`），**不是** localStorage；本地曲库「高音质自动切引擎」的判定（`player/local-quality.ts`）是纯逻辑无存储。

> 上表为常见域；新增偏好先 grep `musicstorm-` 防重复建域。

## 读写约定

每个偏好域一个模块，统一形状：

```ts
// src/lib/app/xxx-prefs.ts —— 模块形状
const STORAGE_KEY = "musicstorm-xxx"
const CHANGE_EVENT = "musicstorm:xxx"

export function readXxxPrefs(): XxxPrefs { /* 读 + 默认值合并 */ }
export function writeXxxPrefs(prefs: XxxPrefs): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    // 变更必须广播，订阅方（组件 / 其它模块）靠事件刷新
    emit(CHANGE_EVENT, prefs)
}
```

硬规则：

- **组件禁止直接读 localStorage**，一律经 `readXxxPrefs` / `writeXxxPrefs`
- 写入必须广播对应事件（见 [事件](#/docs/dev/events)），不广播的变更订阅方看不到
- 读取要做默认值合并（`{ ...DEFAULT, ...parsed }`），旧版本缺字段不炸
- 历史 key 迁移在模块内做（如 `api-settings.ts` 的 `LEGACY_*` 兼容）

## 新增偏好流程

1. 建 `src/lib/xxx/xxx-prefs.ts`，定义类型 + `DEFAULT` + 读写函数
2. 定义 `musicstorm-xxx` key 与 `musicstorm:xxx` 事件名（先 grep 防冲突）
3. 在 `writeXxxPrefs` 内广播变更
4. 页面用 `readXxxPrefs` 读、`listen` 事件刷新；不要另建第二份 state

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 设置不生效 | key 拼写不一致；或组件直读 localStorage 没走模块 |
| 设置丢失 / 回默认 | JSON 解析失败（结构变了）——读函数需默认值合并兜底 |
| 别处改了不刷新 | 写入方没广播事件；订阅方没 listen |
| 与旧版本冲突 | 检查模块内是否有 LEGACY key 迁移逻辑 |

## 排查路径

1. grep `musicstorm-` 确认 key 唯一、归属哪个模块
2. 确认读写都走同一模块的 `read*` / `write*`
3. 确认 `write*` 内 `emit` 了对应事件
4. 打开 DevTools 看 localStorage 实际值是否符合预期结构
