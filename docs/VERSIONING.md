# 版本与发布策略

## 版本号

| 平台 | 版本线 | tag 格式 | tauri.conf.json version |
| --- | --- | --- | --- |
| PC (Windows/macOS/Linux) | v0.0.x 照旧 | `v0.0.6` | 0.0.6 |
| Android | 独立起步 | `v0.0.1-android` | 与 PC 共用（构建时按需区分） |

**说明**

- `tauri.conf.json` 的 `version` 字段是**单文件共用**的。Android 版发布时保持同版本号即可，靠 **git tag 前缀区分**（`v0.0.x` = PC，`v0.0.x-android` = Android）。
- 不建议维护两套 conf 版本号：PC 与 Android 功能面不同，未来版本必然各自演进，分开 tag 是 GitHub Releases 上最清晰的呈现方式。

## 更新检查与 Android tag 的兼容

`src/lib/app/github-update.ts` 的逻辑：

- 读取 `@tauri-apps/api/app` 的 `getVersion()`（= tauri.conf.json version）
- 拉 GitHub `releases/latest`（**按发布时间最新**的 release）
- `normalizeSemver` 只取 `x.y.z` 主版本比较

**已知行为**：Android 发布后，PC 端更新检查会拉到 `v0.0.x-android` 的 release（因为它是 latest）。`0.0.1-android` 归一化为 `0.0.1` < PC 的 `0.0.6`，`isNewerVersion` 返回 false → **不会误提示更新**，但 release 摘要内容显示的是 Android 版说明。

**长期改进方向**（本文件记录，暂未实施）：

1. `releases/latest` 改用**平台过滤**：PC 端只认 `v0.0.x`（无后缀）的 tag，Android 端只认 `-android` 后缀——通过 tag 后缀判断平台，避免跨平台串内容
2. 或：Android 版单独走 Play 商店/独立发布，不参与 GitHub 自动更新检查

## 构建命令

```bash
# PC
pnpm tauri build

# Android（需要：JAVA_HOME 指向 AS 的 jbr + SDK cmdline-tools + NDK）
export JAVA_HOME="D:/SoftWare/Android/Android Studio/jbr"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
pnpm tauri android init   # 一次性
pnpm tauri android build --apk
```
