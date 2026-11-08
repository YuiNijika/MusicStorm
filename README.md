# Music Storm

> 一个由 `create-kasumi` 初始化的 Windows 与 Android 应用。

## 模块边界

项目只包含应用代码、平台宿主和 Kasumi SDK 消费配置。框架的 C++ 与 Kotlin 源码
不会复制到这里。

| 路径 | 责任 |
| --- | --- |
| `frontend/` | 前端入口，由所选框架构建并接入 `kasumi-bridge` |
| `windows/` | Win32 + WebView2 应用宿主 |
| `android/` | Android WebView 应用宿主 |
| `vendor/windows/kasumi/` | 从 Release 下载的 Windows SDK |
| `vendor/android/repo/` | 从 Release 下载的 Android Maven 仓库 |
| `kasumi.config.json` | 两端包名、版本、命令能力和 Windows 标题栏配置 |

## 开始

```bash
pnpm install
pnpm ksm doctor
pnpm ksm dev --windows
pnpm ksm build --all
```

首次 Windows 开发会在 `.ksm/vcpkg/` 初始化依赖，之后复用安装、下载和二进制缓存。
`ksm dev` 不会重复构建生产前端，也不会在每次启动时重新配置 CMake。若上一次开发异常
退出，CLI 会自动清理 `.ksm/dev/state.json` 中记录的宿主与开发服务器。

Android 开发前连接设备或启动模拟器，然后运行：

```bash
pnpm ksm dev --android
```

## 构建产物

```text
.ksm/dist/windows/music-storm.exe
.ksm/dist/android/dev.kasumi.music_storm-26.11.7.apk
```

Windows 需要 CMake、Visual Studio C++ 工具链、vcpkg 和 Evergreen WebView2 Runtime。
Android 需要 JDK 21 与 Android SDK。项目自带 Gradle Wrapper，不需要额外安装 Gradle。

默认配置使用 `"commands": "all"`。需要最小权限时改成显式数组，并保留 `ping` 与
`capabilities.query`。

### 自定义 Windows 标题栏

将 `kasumi.config.json` 中的 `windows.decorations` 设为 `false`，然后自行实现窗口按钮：

```ts
import { KSM } from "kasumi-bridge";

await KSM.window.minimize();
await KSM.window.maximize();
await KSM.window.close();
```

标题栏拖拽区域使用 `app-region: drag`，按钮和输入控件使用 `app-region: no-drag`。
原生缩放边框、最小尺寸和工作区约束仍由 Win32 宿主处理。Android 不接受 `decorations`。

## 排查

1. `kasumi.config.json` 非法：运行 `pnpm ksm doctor` 查看具体字段。
2. Windows 找不到 SDK：重新运行 `pnpm create kasumi`，或恢复 `vendor/windows/kasumi/`。
3. Windows 找不到依赖：设置 `VCPKG_ROOT`，CMake 会按 `windows/vcpkg.json` 自动安装 `webview2` 和 `nlohmann-json`。
4. Android 依赖解析失败：确认 `vendor/android/repo/` 内存在 `dev/kasumi/kasumi/`。
5. Android 页面空白：确认先完成 `frontend/dist/` 构建，并检查 `assets` 配置。
