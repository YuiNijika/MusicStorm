# MusicStorm 统一版本号 + 移动端后台播放 / 布局 / 骨架 / 样式现代化

## 摘要

本次改造围绕 5 个目标展开，全部落地于现有代码库并遵循 DESIGN-SPEC 的 Apple 风格基线：

1. **统一版本号**：桌面与 Android 合并为同一版本线 `26.9.4`（日期式），共用同一个 GitHub release tag（不再有 `-android` 独立 tag），移动端不再单独构建版本，以 `tauri.conf.json` 的 `version` 为唯一事实来源；参考 tauri-plugin-updater 的"单一语义版本跨平台匹配"思路，保持现有 GitHub API 查询模式。
2. **Android 后台播放修复**（你已选**全面原生流式**）：所有曲目（含网易云云端）改走原生 MediaPlayer 流式，锁屏/后台不再断续或丢失播放。
3. **全屏播放器移动端排版修复**（已知问题）。
4. **移动端骨架屏重写**。
5. **样式收敛到 `style.css`**（不改 `app.css`）：基于现有 oklch token / motion / 玻璃体系，系统性收敛组件与移动端排版，更现代、更 Apple。

---

## 现状盘点（Phase 1 结论）

### 版本管理当前是"双轨"的
| 位置 | 现状 | 问题 |
|---|---|---|
| [src-tauri/tauri.conf.json](file:///d:/Codes/MusicStorm/src-tauri/tauri.conf.json) | `version: "0.1.3"`、`android.versionCode: 3` | 桌面版本 |
| [src-tauri/Cargo.toml](file:///d:/Codes/MusicStorm/src-tauri/Cargo.toml) | `0.1.3` | 桌面 Rust 版本 |
| [scripts/build.py](file:///d:/Codes/MusicStorm/scripts/build.py) | `_APK_DEFAULT_VERSION = "0.0.3"`、`_write_android_version_properties` 写死 `versionCode=3`、把移动版注入 tauri.properties + env | **Android 独立版本线**，与桌面脱钩 |
| [src/lib/app/github-update.ts](file:///d:/Codes/MusicStorm/src/lib/app/github-update.ts) | `ANDROID_TAG_SUFFIX = "-android"`、按平台分 tag 分缓存、mobile 读注入的 build version 否则回退 `"0.0.3"` | 桌面/Android 分线比较，无法一起发版 |

### Android 后台播放缺失点（已确认）
- [audio-engine.ts](file:///d:/Codes/MusicStorm/src/lib/player/audio-engine.ts#L115-L148)：HTML5 引擎只在 **回到前台** 的 `visibilitychange`/`focus` 时恢复播放；Android WebView 的 `<audio>` 进后台会被系统暂停，因此"有概率不播、断续"。
- [MusicStormBridge.kt](file:///d:/Codes/MusicStorm/src-tauri/gen/android/app/src/main/java/com/yuinijika/musicstorm/MusicStormBridge.kt)：原生 MediaPlayer 承担本地高音质，但**没有任何 WAKE_LOCK** → 锁屏后 CPU 休眠导致断续；`android-engine.ts` 也没有后台返回恢复逻辑。
- [local-quality.ts](file:///d:/Codes/MusicStorm/src/lib/player/local-quality.ts#L42-L64)：`shouldUseNativeForTrack` 对 `source === "netease"` 直接返回 false → 云端歌走 H5，正是后台不可靠的来源。
- [resolve-url.ts](file:///d:/Codes/MusicStorm/src/lib/music/resolve-url.ts#L47-L114)：云端返回 CDN URL（可原生流式），本地返回 `convertFileSrc`（asset://，MediaPlayer 不适用，Android 需原始文件路径）。

### 全屏播放器（[full-player.tsx](file:///d:/Codes/MusicStorm/src/components/layout/full-player.tsx)）
- 移动端为 封面/歌词 翻页结构（`-page*100%`）；顶部栏左右按钮不对称（右侧用 `w-[72px]` 占位）、控制条 `grid-cols-[1fr_auto_1fr]` 在窄屏可能溢出、若干 Popover `side="top"` 在移动端触发出屏。这是"排版有问题"的根因区域。

### 骨架屏与样式
- 通用 [skeleton.tsx](file:///d:/Codes/MusicStorm/src/components/ui/skeleton.tsx) + 页面骨架 [loading-skeletons.tsx](file:///d:/Codes/MusicStorm/src/components/music/loading-skeletons.tsx)，插在 [App.tsx](file:///d:/Codes/MusicStorm/src/App.tsx) 的 `Suspense` fallback 上；移动端没有独立一套。
- 样式 token 在 `App.css`（不改），组件/移动端自定义样式在 `Style.css`（本次改这里）。

---

## 改动方案（按文件 + what / why / how）

### A. 版本号统一（桌面 + Android 同版本同 tag）

**A1. `src-tauri/tauri.conf.json`**
- `version`: `"0.1.3"` → `"26.9.4"`（当前日期 2026-09-04）。
- `bundle.android.versionCode`: `3` → `260904`（`yyMMdd` 推导 + 1 位末位余量，单调递增）。同一天重发时在该步手动 +1（见 Assumptions）。

**A2. `src-tauri/Cargo.toml`**
- `version`: `0.1.3` → `"26.9.4"`，与 tauri.conf.json 对齐（Tauri 要求一致）。

**A3. `scripts/build.py`（关键：去独立的移动版本线）**
- 删除 `_APK_DEFAULT_VERSION = "0.0.3"`。
- 新增 `_desktop_version()`：读取 `src-tauri/tauri.conf.json` 的 `version` 作为唯一来源。
- `_load_apk_config` / `_android_build_version` 改为回退 `_desktop_version()`（而非 0.0.3）。
- `_write_android_version_properties(version)`：`versionName=version`、`versionCode=推导自 version 的日期整数`（去除两处写死行为）。
- `_patch_android_asset_config`：直接写桌面 version（与 `tauri.conf.json` 相同即可）。
- APK 重命名：`MusicStorm_{_desktop_version()}-aarch64.apk`（替换 `_APK_DEFAULT_VERSION`）。
- 说明性注释同步：删掉"Android 独立于桌面"的描述，改为"统一版本"。

**A4. `src/lib/app/github-update.ts`（合并平台分线，保持 API 查询模式）**
- 删除 `ANDROID_TAG_SUFFIX`、`isAndroidPlatform()`、`tagMatchesPlatform()`、`cacheKeyForPlatform()`、`readInjectedBuildVersion()` 的移动端分支、移动端 `"0.0.3"` 回退。
- `readAppVersion()` 统一为：优先 `@tauri-apps/api/app` 的 `getVersion()`（Android 的 `getVersion()` 返回 versionName = 26.9.4，与 tauri updater 的版本匹配一致）；异常时回退注入版本，再回退 `"0.1.0"`（仅开发 Web）。
- `tagMatchesPlatform` 简化：直接取第一个非 draft release tag `v26.9.4`（不再区分平台）。缓存 key 保持单一 `musicstorm-github-release-cache`。
- 保留现有 `fetchGithubReleases` → `normalizeSemver` → `isNewerVersion` 的 API 查询链路不变。

**A5. `vite.config.ts` + `vite-env.d.ts`**
- 移除对 `ANDROID_VERSION_NAME` 的读取（移动版本不再注入）；`__APP_BUILD_VERSION__` 仅保留 `VITE_APP_VERSION` 供开发/Web 兜底。确认 `__APP_BUILD_VERSION__` 无其它消费点后收窄。

> 参考 Tauri 官方 updater：它以**单一语义版本**跨平台匹配更新；Android 的 `versionName` = 语义版本（这里就是 26.9.4），`versionCode` 是独立的单调整数。我们保持"GitHub API 查 releases"而非引入 tauri-plugin-updater 二进制分发，因此只对齐其版本匹配与"一起发版"的语义，不接它的下载协议。

### B. Android 全面原生流式 + 后台播放修复

**B1. `src-tauri/gen/android/app/src/main/java/com/yuinijika/musicstorm/MusicStormBridge.kt`**
- **Wake lock（根治锁屏断续）**：播放期间持有 `PowerManager.PARTIAL_WAKE_LOCK`；`startPlayback` 时 acquire，`pausePlayback/stopMedia/onCompletion/onError/onAudioFocusLoss` 时 release。
- **流式支持**：`prepareFile(path)` 已用 `setDataSource(path)`——MediaPlayer 原生支持 http(s) URL，无需接口改动即可流式播放云端曲目；补充判定记录 `currentSourceIsRemote`，为后续 seek/时长上报留分支。（不改函数签名）
- 在 `startPlayback` 后保持前台服务（已满足 >Android 13 后台播放约束），必要时在 `AndroidManifest.xml` 确认 `FOREGROUND_SERVICE_MEDIA_PLAYBACK` 权限已声明。

**B2. `src/lib/player/android-engine.ts`**
- 增加后台恢复，镜像 HTML5 引擎：记录 `wasPlayingBeforeHidden`，监听 `visibilitychange`/`focus`/`resume`，回到前台且"播放中但当前未播"时重新 `startAndroidPlayback()` + 更新状态。

**B3. `src/lib/player/local-quality.ts`**
- `shouldUseNativeForTrack`：当 `isAndroid() && hasAndroidAudio()` 时，`source === "netease"` 也返回 true（云端曲目走原生流式，不再退回 H5）。

**B4. `src/lib/music/resolve-url.ts`**
- 平台感知：`isAndroid()` 时，本地返回 `track.filePath` 原始路径（MediaPlayer 可直接播放），不返回 `convertFileSrc` 的 asset://；云端仍返回 `fetchSongUrl` 的 CDN URL（原生可流式）。

**B5. `src/hooks/use-player.tsx`**
- 在 load 选型处，确保 Android 云端也走 native：结合 B3/B4，`wantNative` 对 Android 全域为 true；native 失败时保留 H5 兜底（防止个别格式/URL 失效白屏）。

> 结果：Android 上本地与网易云全部走系统 MediaPlayer 流式，配合 Wake lock + 前台服务 + 后台返回恢复，锁屏与切后台不断续、稳定恢复。

### C. 全屏播放器移动端排版修复（`src/components/layout/full-player.tsx`）

- **顶部栏对称**：把左右两侧改为 `flex-1` 等宽容器 + 中间居中，替换现有 `w-[72px]` 占位，避免右侧"样式"按钮宽度变化导致偏移错位。
- **移动端翻页容器**：封面页/歌词页用 `h-full min-h-0` 约束 + `safe-area` 底边，封面块 `max-w` 配合 `vh` 留出控制条高度，杜绝封面挤压或溢出。
- **控制条**：进度条与 `grid-cols-[1fr_auto_1fr]` 抛到 `max(env(safe-area-inset-bottom),…)` 之上；窄屏（`<400px`）把音量/EQ/音质 Popover 改为 `side` 自适配，避免触发出屏。
- 保持现有翻页手势/spring 参数常量不变（它们即 DESIGN-SPEC 规范）。

### D. 移动端骨架屏重写

- 在 [loading-skeletons.tsx](file:///d:/Codes/MusicStorm/src/components/music/loading-skeletons.tsx) 增加移动端变体 `MobilePlaylistGridSkeleton` / `MobileTrackListSkeleton`（1:1 镜像真实布局：更大封面、触控行高、`animate-pulse` 不变形）。
- [App.tsx](file:///d:/Codes/MusicStorm/src/App.tsx) 的 `Suspense` fallback 用 `useIsMobile()` 分流选择移动/桌面骨架。
- 遵循 DESIGN-SPEC「骨架与现实布局 1:1、禁止 shimmer、加载完成 cross-fade 140ms、禁止布局跳动」。

### E. 移动端布局自检清单（跨所有页面 audit +修复）

逐页面排查（home / discover / search / local / library / radios / stats / settings + artist/album/playlist/comment 详情栈）并修复：
- 首屏横向溢出（`overflow-x` 来源、固定 `min-w`）、分段导航在 360px 宽度不被截断。
- 触控目标 ≥44px；列表行高加大；hover 态在触屏不误触。
- `env(safe-area-inset-*)` 顶部导航 + 底部播放条 + 全屏播放器全部覆盖。
- 底部播放条 (`player-bar.tsx`) 不遮挡详情页最后一行（预留 `pb`）。
- 键盘弹出、旋转横屏时菜单/弹层不跑飞。

### F. 样式收敛到 `style.css`（不改 `app.css`）

- 组件级自定义样式与移动端媒体查询集中在 `src/Style.css`；`app.css` 只保留 token / reset / 全局基座，不做样式改动。
- 按 DESIGN-SPEC 收敛：排版字阶、圆角沿用 `--radius`、glass/材质语义统一走现有类、hover 显 thumb 滑块、`tabular-nums` 时间码、触控目标。
- 现代化排布：移动端顶部导航密度、详情页大标题/返回、卡片间距与留白节奏趋于 Apple Music 观感。
- 不改 shadcn 默认圆角/样式（用户偏好：不随意改 `--radius` 之外的任意圆角）。

---

## 假设与决策

1. **版本 `26.9.4`**：按发版当天日期换算（本次 2026-09-04）。后续发版人工改 `tauri.conf.json` 的 `version`；`build.py` 自动据此推导 versionName 与 versionCode，桌面/Android 同 tag 一起发。
2. **versionCode 推导 = `yyMMdd` 数字**（如 260904）；同一天内重发需在该数字上手动 +1 以满足 Google Play 严格递增。（已在 Assumptions 记录，非自动覆盖。）
3. **NetEase 云端走 MediaPlayer 流式**：依赖 CDN URL 短期有效期内可流式；seek 由 MediaPlayer 支持。个别格式/URL 失效时保留 H5 兜底回退。
4. **不引入 tauri-plugin-updater 二进制协议**：维持现状 GitHub API 查 releases 的方式，仅对齐其"单一版本跨平台"的匹配语义与一起发版的目标。
5. **样式只改 `style.css`**，`app.css` 不动。

## 验证步骤

1. **版本**：`python scripts/build.py 2`（Android）产物为 `MusicStorm_26.9.4-aarch64.apk`，`tauri.properties` 的 versionName=26.9.4 / versionCode=260904；`pnpm tauri build`（Windows）桌面版本为 26.9.4。设置页「更新」tab 的当前版本显示 `26.9.4`。
2. **更新检查**：桌面与 Android 均取同一个 `v26.9.4` release tag，`hasUpdate` 判定正确，无 `-android` 残留逻辑。
3. **后台播放**（Android 真机）：本地曲 + 网易云曲 → 锁屏 5 分钟无断续；切后台返回自动续播；通知栏/锁屏播放/暂停/切歌正常。
4. **全屏播放器**（移动端窄屏）：开/关、封面↔歌词横滑、下拉收起；无页面溢出、无控制条遮挡、Popover 不出屏。
5. **骨架屏**：弱网/慢加载下移动端骨架 1:1 无布局跳动。
6. **样式审计**：运行 dev，用 web-design-guidelines 对首屏/详情/歌词/设置页做对比度与可访问性抽查；移动 375px 与桌面 1440px 双端截图核对排版与密度。

## 风险与说明

- Android 流式到 `setDataSource(URL)` 需真机反复验证 seek 与时长；若 CDN 返回 `Content-Length` 正常即可平滑拖动。
- 全屏播放器手势参数即规范，本次只改布局不改手势常量，避免动效回归。
- `gen/` 为 Android 生成工程，`tauri android` 重新生成可能覆盖手工改动——Wake lock/流式等 Bridge 改动集中在 `MusicStormBridge.kt`（源文件，非 generate 产物），叠加 build.py 注入即可保留。