---
title: 更新与发布
description: 更新检查机制、版本比较、平台隔离的发布流程。
order: 17
---

# 更新与发布

> 理解应用如何检查与消费更新：GitHub Releases 数据层、版本比较、平台隔离规则，以及发版流程。

## 本页边界

覆盖：`src/lib/app/github-update.ts`、`src/hooks/use-app-update.tsx`、发布 / tag 规则。

**不**覆盖：安装包内更新（系统级）、官网数据层（`website/src/lib/github.ts` 同规则，见 [规范](#/docs/dev/conventions)）。

## 更新数据层

`src/lib/app/github-update.ts`：

| 导出 | 说明 |
|---|---|
| `checkAppUpdate(force?)` | 检查更新；`force` 跳过 5h 缓存 |
| `peekCachedUpdate()` | 读上次检查结果（不触发网络） |
| `subscribeUpdateStatus(listener)` | 订阅状态（返回取消函数） |
| `isNewerVersion(latest, current)` | 语义化版本比较 |
| `normalizeSemver(raw)` | 规范化版本串 |
| `STATUS_EVENT` / `CACHE_TTL_MS` | 事件名 `musicstorm:update-status` / 5h 缓存 |

数据源：GitHub Releases（`api.github.com/repos/YuiNijika/MusicStorm/releases`），结果缓存 5h。

```ts
import { checkAppUpdate, subscribeUpdateStatus } from "@/lib/app/github-update"

const un = subscribeUpdateStatus((result) => {
    // UpdateCheckResult: currentVersion / latestTag / latestVersion /
    // releaseName / releaseBody / htmlUrl / publishedAt / hasUpdate
    if (result.hasUpdate) {
        // 展示更新提示（releaseBody 为说明，htmlUrl 供浏览器打开）
    }
})
const result = await checkAppUpdate()
un()
```

组件层用 `useAppUpdate()`（`src/hooks/use-app-update.tsx`，`AppUpdateProvider` 提供）。

## 平台隔离

| 规则 | 说明 |
|---|---|
| Android 专属 tag 后缀 | `-android`（`ANDROID_TAG_SUFFIX`），Android 平台只匹配该后缀，桌面平台过滤掉 |
| 版本来源 | `readAppVersion()` 读应用版本（Tauri 版本） |
| 缓存 key 分平台 | `cacheKeyForPlatform()`，Android / 桌面不共用缓存 |

发布时桌面 tag 用 `vX.Y.Z`，Android 用 `vX.Y.Z-android`，两者互不干扰。官网 releases 数据层（`website/src/lib/github.ts`）沿用同一过滤规则。

## 发布流程

1. 更新 `src-tauri/tauri.conf.json` 的 `version`（如 `0.0.6`）
2. 桌面构建：`pnpm tauri build`（Windows NSIS 安装包，SimpChinese）
3. 打 tag `v0.0.6` 并创建 GitHub Release，附安装包资产
4. Android 单独打 `v0.0.6-android` tag
5. 官网数据层 5min sessionStorage 缓存会自动过期拉新

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 检查结果不更新 | 命中 5h 缓存；`checkAppUpdate(true)` 强制刷新 |
| 桌面收到 Android 版本 | tag 未按平台隔离；`tagMatchesPlatform` 未过滤 |
| 版本比较错误 | 版本串不规范（`normalizeSemver` 失败会返回 null） |
| 更新提示重复弹 | `musicstorm-update-boot-toasted` 去重标记未清理 |

## 排查路径

1. 确认 GitHub Release 存在且 tag 格式正确（`v` 前缀 + 语义化版本）
2. 直接调 `checkAppUpdate(true)` 看 `UpdateCheckResult`
3. 平台隔离问题查 `tagMatchesPlatform` 与 `cacheKeyForPlatform`
4. 版本比较问题查 `normalizeSemver` / `isNewerVersion`
