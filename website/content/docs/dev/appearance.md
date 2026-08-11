---
title: 主题与外观
description: 明暗主题、强调色、着色范围、毛玻璃与性能模式的机制。
order: 14
---

# 主题与外观

> 理解外观系统如何驱动全站：主题切换机制、强调色体系、着色范围、毛玻璃与性能模式。

## 本页边界

覆盖：`src/lib/appearance/appearance-prefs.ts`、`src/lib/app/performance-prefs.ts`、主题 token 体系（`src/App.css`）。

**不**覆盖：动效 token 的取值清单（见 [规范](#/docs/dev/conventions)）。

## 主题切换机制

- 明暗由 `html[data-theme="dark"]` 驱动，`index.html` 内联脚本在首帧前按 localStorage / 系统偏好落定，避免闪烁
- `prefers-color-scheme` 只作为未手动设置时的默认来源；手动偏好存 `musicstorm-appearance`

## 偏好模型

`AppearancePrefs`（`src/lib/appearance/appearance-prefs.ts`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `accent` | `AccentTone` | 强调色预设 id 或 `custom` |
| `tintScope` | `"accent" \| "global"` | accent 仅交互元素；global 额外低彩度染色所有表面 |
| `customHue` | `number` | 0–359，仅 `accent === "custom"` 生效 |
| `glassOpacity` | `number` | 0.35–0.9，玻璃底不透明度倾向 |
| `glassBlur` | `number` | 8–48 px 模糊 |
| `materialGlass` | `boolean` | 常驻毛玻璃（侧栏/底栏/面板）；关闭可降性能开销 |

预设强调色（`ACCENT_OPTIONS`）：中性 / 玫瑰 / 粉彩 / 橙橘 / 琥珀 / 翠绿 / 青绿 / 青蓝 / 蓝色 / 靛蓝 / 紫罗兰，各带 `hue`。

## 读写与生效

```ts
import {
    applyAppearanceToDom,
    readAppearancePrefs,
    writeAppearancePrefs,
} from "@/lib/appearance/appearance-prefs"

const prefs = readAppearancePrefs()
writeAppearancePrefs({ ...prefs, accent: "teal" })
// 生效动作在模块内完成：applyAppearanceToDom 写 CSS 变量 / data 属性
applyAppearanceToDom()
```

辅助函数：`resolveAccentHue`（解析当前 hue，custom 用 `customHue`）、`normalizeHue`、`isNeutralAccent`、`accentSwatch`（取色板）。

## 毛玻璃与性能模式

| 机制 | 位置 | 说明 |
|---|---|---|
| 毛玻璃 | `glassOpacity` / `glassBlur` / `materialGlass` | 减少毛玻璃表面可降 GPU 开销 |
| 性能模式 | `src/lib/app/performance-prefs.ts` | `getPerformanceMode()` / `setPerformanceMode(enabled)`；开启后 `html.performance-mode` class + 关闭毛玻璃等重特效 |

性能模式同时落 localStorage（`musicstorm-performance-mode`）与 SQLite（`performance_mode`），变更广播 `musicstorm-performance-mode-change`。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 刷新闪白/闪黑 | index.html 内联脚本未在 CSS 前落定 `data-theme` |
| 强调色不生效 | `writeAppearancePrefs` 后未 `applyAppearanceToDom` |
| custom 色无变化 | `customHue` 未设置或越界（0–359） |
| 毛玻璃关不掉 | `materialGlass` 未写回；或性能模式开关与偏好冲突 |

## 排查路径

1. 确认 `html[data-theme]` 值（DevTools）符合预期
2. 确认读的是 `readAppearancePrefs`（默认值合并，旧结构不炸）
3. 确认改的是 `accent` / `customHue` 并调用了 `applyAppearanceToDom`
4. 性能模式：确认 `html.performance-mode` class 与 CSS 覆盖
