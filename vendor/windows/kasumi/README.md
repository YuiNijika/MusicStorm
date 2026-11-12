# Windows SDK

> 说明 Windows 侧的静态库、公共头文件、WebView2 适配、独立示例、打包和发布签名。

## 模块边界

`windows/` 是 SDK 构建根目录，只产出静态库、公共头文件和 CMake 包配置。可运行示例
位于独立工程 `windows/examples/win32-host/`，通过已安装的 CMake 包消费 SDK。

| 路径 | 责任 |
| --- | --- |
| `src/commands/ksm_phase1.h` | 宿主侧 `KSM` 根入口、生命周期和统一调用 |
| `src/bridge/ksm_command_registry.h` | Windows 已实现命令清单 |
| `src/bridge/ksm_router.h` | 参数校验、权限检查和命令分发 |
| `src/platform/ksm_host_services.h` | 宿主平台服务接口 |
| `src/platform/ksm_windows_host_services.h` | 文件、对话框、剪贴板、通知、下载、链接、窗口、系统信息和日志服务 |
| `src/platform/ksm_sql_driver.h` | SQL 驱动 SPI、连接注册表和安全错误边界 |
| `src/platform/ksm_sqlite_driver.h` | 内置 SQLite 驱动与参数绑定 |
| `src/platform/ksm_odbc_sql_driver.h` | 基于系统 ODBC 的 MySQL / PostgreSQL 可选驱动 |
| `src/plugins/ksm_plugin.h` | 可注册插件接口、命令和权限声明 |
| `src/plugins/ksm_clipboard_plugin.h` | 剪贴板命令插件 |
| `src/plugins/ksm_notification_plugin.h` | 通知命令插件 |
| `src/plugins/ksm_window_plugin.h` | 窗口命令插件 |
| `src/plugins/ksm_http_plugin.h` | HTTPS 下载命令插件 |
| `src/plugins/ksm_shell_plugin.h` | 外部链接命令插件 |
| `src/plugins/ksm_sql_plugin.h` | SQL 命令插件与宿主驱动分发 |
| `src/plugins/ksm_path_plugin.h` | 虚拟路径命令插件 |
| `src/plugins/ksm_store_plugin.h` | 应用 JSON 存储命令插件 |
| `src/plugins/ksm_os_plugin.h` | 系统信息命令插件 |
| `src/plugins/ksm_log_plugin.h` | 平台日志命令插件 |
| `src/platform/ksm_web_resource.h` | 内嵌 Web 资源提供器接口和 URL 到资源路径解析 |
| `src/platform/ksm_win32_resource_provider.h` | 从 Win32 `RCDATA` 读取页面、样式和脚本 |
| `src/platform/ksm_webview_host.h` | 共享命令线程池、单 timer scheduler、超时、取消、单响应和事件投递 |
| `src/platform/ksm_window_frame.h` | 无标题栏窗口样式、缩放边框、最小/最大尺寸和工作区处理 |
| `src/platform/ksm_webview2_host.h` | 共享 WebView2 Environment、窗口级会话、多个独立 WebView 视图和 UI 线程回投 |
| `tests/contract_runner.cpp` | Windows 契约、安全策略和生命周期测试 |
| `examples/win32-host/` | 独立 Win32 + WebView2 示例工程 |

Windows 当前实现 **47/47 个适用命令**。`device.getInfo` 是 Android 专属命令，
Windows 返回 `NOT_SUPPORTED`。

## 应用配置

Windows 示例从仓库根目录 `kasumi.config.json` 读取 `windows.packageName`、
`windows.version`、`windows.commands`、`windows.permissions`，以及可选的
`windows.decorations`、`windows.window`、`windows.shell.allowedOrigins` 和
`windows.http.allowedOrigins`：

```json
{
  "windows": {
    "packageName": "kasumi-win32-example",
    "version": "0.1.0",
    "commands": [
      "ping",
      "capabilities.query",
      "app.getInfo",
      "http.download"
    ],
    "permissions": ["http.download"],
    "decorations": true,
    "window": {
      "width": 1280,
      "height": 800,
      "minWidth": 960,
      "minHeight": 600,
      "maxWidth": 1920,
      "maxHeight": 1200,
      "backgroundColor": "#0B0B0D"
    },
    "shell": {
      "allowedOrigins": ["https://example.com"]
    },
    "http": {
      "allowedOrigins": ["https://cdn.example.com"]
    }
  }
}
```

`packageName` 写入 EXE 版本资源并作为示例 ZIP 的目录前缀；`version` 同时用于
`FileVersion`、`ProductVersion`、ZIP 文件名和 `app.getInfo.version`。`commands`
注入 `KSM::Init`，同时约束前端桥接、`KSM` 原生子模块和 `capabilities.query`。
`permissions` 注入路由器的权限 allowlist，缺失或空数组表示拒绝全部权限。`ping` 与
`capabilities.query` 必须保留；未列入的命令返回 `NOT_SUPPORTED`，命令已启用但权限
未配置时返回 `PERMISSION_DENIED`。`permission.request` 不会动态扩大该集合。

`shell.allowedOrigins` 接受精确 `http` / `https` origin；`http.allowedOrigins` 只接受
精确 `https` origin。两者默认拒绝，不支持通配符或用户名密码，每一跳下载重定向都要重新匹配。
`pnpm ksm` 构建与打包默认读取该文件，也可用 `--config <path>` 指定其他配置。

`windows.window` 设置窗口初始标题、位置、尺寸边界、是否可缩放、是否透明、是否置顶、
是否居中以及创建时是否可见：

| 字段 | 默认值 | 作用 |
| --- | --- | --- |
| `width` / `height` | `1080` / `720` | 初始窗口尺寸，单位为 DIP；`0` 回退默认值 |
| `minWidth` / `minHeight` | `320` / `240` | 可拖动的最小窗口尺寸；`0` 回退默认值 |
| `maxWidth` / `maxHeight` | `0` / `0` | 可拖动的最大窗口尺寸；`0` 表示不限制 |

尺寸边界通过 `WM_GETMINMAXINFO` 同时应用到有边框和无边框窗口；最大化时也会夹取到配置的
最大尺寸。`maxWidth` / `maxHeight` 必须大于等于对应的最小值，初始尺寸也不能超过最大值。
直接使用 CMake 时对应变量是 `KASUMI_WINDOW_WIDTH`、`KASUMI_WINDOW_HEIGHT`、
`KASUMI_WINDOW_MIN_WIDTH`、`KASUMI_WINDOW_MIN_HEIGHT`、`KASUMI_WINDOW_MAX_WIDTH` 与
`KASUMI_WINDOW_MAX_HEIGHT`。

`backgroundColor` 接受 `#RRGGBB` 或 `#AARRGGBB`，会写入 WebView2 Controller 的默认背景色。
拖动或缩放时 WebView2 尚未重绘的区域会短暂显示该颜色，因此应与页面背景保持一致，避免
出现白色闪边。透明窗口固定使用 `#00000000`，忽略该值。省略时 WebView2 使用不透明白色。

### 应用图标

根级 `icons.window`、`icons.tray` 与 `icons.installer` 使用项目内的 `.ico` 文件。
CLI 会把窗口图标和托盘图标传给 CMake，并生成到版本资源中：

```powershell
cmake -S windows `
  -B build `
  -DKASUMI_APP_ICON=C:/project/icons/icon.ico `
  -DKASUMI_TRAY_ICON=C:/project/icons/tray.ico
```

窗口图标使用资源 ID `101`，同时用于窗口类、任务栏和 `WM_SETICON`；托盘图标使用资源
ID `102`，未提供时托盘回退到资源 `101`，再回退到系统默认图标。`icons.installer`
会写入 NSIS 的 `Icon`/`UninstallIcon` 或 MSI 的 `ARPPRODUCTICON`。

### 隐藏系统标题栏

`decorations` 默认是 `true`。设置为 `false` 后，Win32 宿主保留可缩放边框、最小尺寸和
工作区约束，只隐藏系统标题栏。Kasumi 不会自动绘制窗口按钮，页面需要自行实现标题栏：

无边框窗口默认使用 12 DIP 圆角。Windows 11 通过 DWM 原生圆角，Windows 10 使用窗口区域
回退；最大化或最小化时自动恢复直角。圆角由宿主处理，页面不需要额外 CSS，也不需要开启
窗口透明。

顶层 HWND 仍然存在，用于 DWM、任务栏、缩放和命中测试。Kasumi 拦截 `WM_ERASEBKGND`
并把窗口类背景刷设为空，客户区由 WebView2 子窗口独占绘制，不会先绘制一块原生白色窗口。
WebView2 控制器与首个页面导航完成前，宿主还会绘制一张原生初始化表面，显示应用名、
渐变背景、品牌标记和“WebView2 正在初始化”状态，避免露出未初始化的原生空窗口。

```tsx
import { KSM } from "kasumi-bridge";

export function Titlebar() {
  return (
    <header className="titlebar">
      <span>My App</span>
      <button type="button" onClick={() => void KSM.window.minimize()}>
        最小化
      </button>
      <button type="button" onClick={() => void KSM.window.maximize()}>
        最大化
      </button>
      <button type="button" onClick={() => void KSM.window.close()}>
        关闭
      </button>
    </header>
  );
}
```

拖拽区域和交互控件必须分开声明：

```css
.titlebar {
  -webkit-app-region: drag;
  app-region: drag;
}

.titlebar button,
.titlebar input {
  -webkit-app-region: no-drag;
  app-region: no-drag;
}
```

WebView2 的非客户区支持在宿主初始化时启用。若运行时版本过旧，CSS 拖拽区域可能不生效，
但系统标题栏仍保持隐藏状态。

直接使用 CMake 时可传入对应缓存变量：

```powershell
cmake -S windows/examples/win32-host `
  -B windows/examples/win32-host/build `
  -DKASUMI_APP_PACKAGE_NAME=kasumi-win32-example `
  -DKASUMI_WINDOW_DECORATIONS=OFF `
  -DKASUMI_APP_VERSION=0.1.0 `
  -DKASUMI_APP_COMMANDS="ping,capabilities.query,app.getInfo,fs.readText" `
  -DCMAKE_PREFIX_PATH="$PWD/windows/build/sdk/install"
```

## 宿主入口

```cpp
#include <kasumi/commands/ksm_filesystem.h>
#include <kasumi/platform/ksm_webview2_host.h>

KSM::Init(file_system, host_services);
const std::string response = KSM::Invoke(
    "window-1",
    "http.download",
    R"({"url":"https://example.com/file.bin","path":"app://data/file.bin"})"
);
```

`KSM::Invoke(windowId, ...)` 按 WebView View 维护独立路由器和事件订阅。空 `windowId` 使用默认
路由上下文。请求 `timeoutMs` 范围为 `1..600000`；重复活动请求 ID 返回 `BUSY`。宿主根入口
直接调用 `KSMHostServices`，不得通过 `KSM::Invoke` 递归回路由。

| 子模块 | 入口 | 宿主服务 |
| --- | --- | --- |
| 文件系统 | `KSM::Fs` | `KSMFileSystem` 与 picked 文件方法 |
| 对话框 | `KSM::Dialog` | 对话框与文件选择方法 |
| 剪贴板 | `KSM::Clipboard` | 读写系统剪贴板 |
| 通知 | `KSM::Notification` | `ShowNotification` |
| 权限 | `KSM::Permission` | 生成的权限清单 |
| 窗口 | `KSM::Window` | 标题、最小化、最大化、尺寸和关闭 |
| HTTP | `KSM::Http` | `Download`；插件专用 `DownloadTrusted` 可按显式主机后缀与请求头缓存媒体 |
| Shell | `KSM::Shell` | `OpenExternal` |
| 设备 | `KSM::Device` | `GetInfo`，Windows 返回空 |
| 虚拟路径 | `KSM::Path` | `Dirs`、`Join`、`Normalize`、`Dirname`、`Basename`、`Extname`、`IsAbsolute` |
| 存储 | `KSM::Store` | 读取、写入、删除、清空和列出 JSON 键值，数据位于 `app://data/.kasumi/store.json` |
| 系统信息 | `KSM::Os` | `GetInfo`，不采集持久设备标识 |
| 日志 | `KSM::Log` | `Write`，使用固定的日志级别并输出到 `OutputDebugStringW` |
| 应用 | `KSM::App` | 版本、语言和退出 |

文件选择器同一时间只接受一个活动请求；已有选择器未完成时，新的 `dialog.openFile` 或
`dialog.saveFile` 返回 `BUSY`，不会静默返回 `null` 或覆盖待处理状态。

```cpp
const auto roots = KSM::Path::Dirs();
if (!roots) {
    throw std::runtime_error("Kasumi path directories are unavailable.");
}

const auto config_path = KSM::Path::Join(
    roots->data,
    {"notes", "config.json"}
);
if (!config_path) {
    throw std::runtime_error("The virtual path is invalid.");
}

if (!KSM::Store::Set("profile", R"({"theme":"light"})")) {
    throw std::runtime_error("The profile could not be stored.");
}
const auto profile = KSM::Store::Get("profile");
if (!profile || !profile->found) {
    throw std::runtime_error("The profile was not found.");
}

KSM::Log::Write(
    KSM::LogLevel::Info,
    "Profile loaded from " + *config_path,
    "settings"
);
```

`KSM::Path`、`KSM::Store`、`KSM::Os` 和 `KSM::Log` 会复用插件路由与权限校验，应在
插件处理器之外调用，避免在命令处理期间再次进入路由。

## 插件与 SQL

Windows 宿主默认加载 `fs`、`dialog`、`clipboard`、`notification`、`window`、`http`、
`shell`、`sql`、`path`、`store`、`os` 和 `log` 插件。`core` 仍由路由层实现，
`device` 仅 Android 注册。插件接口位于
`include/kasumi/plugins/ksm_plugin.h`，消费方可以通过 `KSMWebView2Host` 构造函数传入
额外插件：

```cpp
#include <memory>
#include <vector>
#include <kasumi/platform/ksm_webview2_host.h>
#include <kasumi/plugins/ksm_plugin.h>

auto host = std::make_shared<KSMWebView2Host>(
    window,
    file_system,
    std::vector<std::string>{"https://example.com"},
    web_root,
    user_data_folder,
    false,
    web_resources,
    L"https://app.local/index.html",
    false,
    KASUMI_APP_VERSION,
    ConfiguredCommands(),
    true,
    std::vector<std::shared_ptr<KSMPlugin>>{
        std::make_shared<MyPlugin>()
    }
);
```

除 `core` 外的内置插件都可以用同 ID 自定义插件替换，但替换插件必须完整声明该 ID 在
`protocol/plugins.json` 中的全部命令。自定义插件不得抢占其他生成命令。自定义命令不在
`protocol/commands.json` 时，插件必须实现自己的参数校验。插件上下文携带请求 ID，
下载插件用它连接 `KSMHostServices::CancelRequest`。

SQL 驱动实现 `KSMSqlDriver` 和 `KSMSqlConnection`，然后注册到宿主服务：

```cpp
services->RegisterSqlDriver(std::make_shared<MyPostgresDriver>());
```

Windows 内置 SQLite。宿主启动时会发现系统已安装的 MySQL / MariaDB 和 PostgreSQL
ODBC 驱动，并自动注册 `mysql`、`postgres`；没有对应 ODBC 驱动时，这两个标识不会出现在
`sql.drivers`。MySQL URL 使用
`mysql://host[:port]/database?ssl-mode=required|disabled`，
PostgreSQL URL 使用
`postgresql://host[:port]/database?sslmode=require|disable`，默认要求
TLS。`mongodb` 需要通过 `KSMSqlDriver` SPI 注册宿主驱动。

SQLite 接受 `:memory:` 或可写虚拟路径，不接受 `app://picked` 和真实路径。驱动返回的
异常必须转换为协议错误码，连接字符串和凭据不得出现在前端错误消息中。ODBC 适配器要求
用户自行安装数据库厂商驱动，Kasumi 不随包分发 MySQL、PostgreSQL 或 MongoDB 客户端。

每个宿主服务最多保持 32 个连接。单次查询最多返回 10,000 行和 16 MiB 结果数据；超限返回
`RESOURCE_LIMIT`，不会截断结果。Store 的完整读改写使用进程级锁，多个 View 的插件实例
不会覆盖彼此的 `store.json` 更新。

SQL 活动请求 ID 必须唯一，重复 ID 返回 `BUSY`。请求取消或超时后，SQLite 通过 progress
handler 响应取消，ODBC 设置 query timeout 并调用 `SQLCancel`；活动查询被终止后返回
`CANCELLED` 或 `TIMEOUT`。关闭窗口不会等待不可取消的查询无限阻塞。

## SDK 构建

```powershell
pnpm ksm build --windows --target sdk
python cli/ksm.py build --platform windows --target sdk
```

等价的 CMake 命令：

```powershell
cmake -S windows -B windows/build/sdk `
  -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_INSTALL_PREFIX="$PWD/windows/build/sdk/install" `
  -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
cmake --build windows/build/sdk --config Release --target install
```

安装目录包含：

```text
windows/build/sdk/install/
├─ include/kasumi/
├─ lib/kasumi_windows_bridge.lib
├─ lib/cmake/Kasumi/
└─ README.md
```

消费者只链接导入目标 `Kasumi::kasumi_windows_bridge`，不编译 `windows/src/` 下的
C++ 实现文件。依赖通过 `vcpkg.json` 固定为 `nlohmann-json` 与 `webview2`。
默认构建使用 `x64-windows-static-md` triplet；只有启用动态 Loader 时才使用
`x64-windows`。`cli/ksm.py` 会分别使用 `.tmp/vcpkg-installed` 和
`.tmp/vcpkg-installed-webview2-loader`，避免两种模式互相清理依赖。

## 独立示例

示例工程位于 `windows/examples/win32-host/`，使用
`find_package(Kasumi CONFIG REQUIRED)`。默认构建会把共享目录
`examples/showcase/` 编译进 EXE，输出目录不需要 `web/`。WebView2 Loader 默认静态
链接，WebView2 用户数据写入 `%LOCALAPPDATA%\Kasumi\Example\WebView2`，不会在 EXE
旁生成 `.WebView2` 目录。消费者只获得静态库、公共头文件和导入目标，不获得框架
`.cpp` 源码。

```powershell
pnpm ksm dev
pnpm ksm build --windows --target example
pnpm ksm build --windows --target example --multi-view
pnpm ksm build --windows --target example --with-webview2-loader
python cli/ksm.py build --platform windows --target sdk
cmake -S windows/examples/win32-host `
  -B windows/examples/win32-host/build `
  -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_PREFIX_PATH="$PWD/windows/build/sdk/install" `
  -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
cmake --build windows/examples/win32-host/build --config Release
.\windows\examples\win32-host\build\Release\kasumi_win32_example.exe
```

`pnpm ksm dev` 会监听 `windows/`、示例宿主目录和 `kasumi.config.json`；保存 C++ 源码
或窗口配置后自动重建并重启示例。前端展示页仍由开发服务器负责热更新。

示例要求 Evergreen WebView2 Runtime。缺失时显示安装提示并退出，不内置 Fixed Version
Runtime。默认使用静态 WebView2 Loader，不生成 `WebView2Loader.dll`。只有显式传入
`--with-webview2-loader` 或设置 `KASUMI_BUNDLE_WEBVIEW2_LOADER=ON` 时，才会改用动态
Loader 并把 `WebView2Loader.dll` 复制到 EXE 同级。宿主应用数据写入
`%LOCALAPPDATA%\Kasumi\Example`，默认不会在项目目录创建 `KasumiData/` 或
`kasumi_win32_example.exe.WebView2`。

需要直接替换页面文件时，可以启用外置模式：

```powershell
cmake -S windows/examples/win32-host `
  -B windows/examples/win32-host/build-external `
  -DKASUMI_EXAMPLE_EXTERNAL_WEB=ON `
  -DCMAKE_PREFIX_PATH="$PWD/windows/build/sdk/install" `
  -DCMAKE_TOOLCHAIN_FILE="$env:VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
```

外置模式会把资源复制为 EXE 同级的 `web/`。运行时参数 `--web-root <dir>` 和
`--user-data-folder <dir>` 可分别覆盖 Web 根目录和 WebView2 用户数据目录。
命令行构建与打包可传入 `--external-web` 选择该模式，默认始终生成内嵌资源产物。

## WebView2 适配

`KSMWebView2Host` 构造时接收窗口、文件系统、外部 origin 白名单、可选 Web 根目录、
可选用户数据目录、可选资源提供器和应用版本。初始化时：

1. 检测 Evergreen WebView2 Runtime。
2. 在默认视图客户区绘制原生初始化表面，按 `windows.window.backgroundColor` 自动选择
   浅色或深色视觉，并按 DPI 缩放；透明窗口和 smoke test 跳过该表面。
3. 创建一个窗口级 WebView2 Environment。
4. 创建默认 WebView 子窗口、Controller 和 CoreWebView2。
5. 把 Controller 的默认背景色设为配置的 `windows.window.backgroundColor`；透明窗口
   使用完全透明色。该颜色覆盖 WebView2 在缩放、首次导航和页面重绘间隙暴露的默认白色。
6. `web_root` 为空时通过 `WebResourceRequested` 返回 EXE 内嵌资源；非空时把
   `https://app.local` 映射到该目录。
7. 关闭 DevTools、默认上下文菜单和状态栏。
8. 校验消息来源，拦截非 `app.local` 或开发 origin 的导航和 `window.open`。
9. 通过 `PostMessageAsJson` 回到 UI 线程发送响应。
10. 每个 View 在自身子窗口 `WM_SIZE` 时发送物理内容区尺寸的 `window.resized` 事件。

初始化表面完全由框架绘制，不需要页面 CSS 或 JavaScript。首个 `NavigationCompleted`
后自动撤下；初始化失败、窗口关闭或视图销毁时也会同步清理。宿主应在
`KSMWebView2Host::Initialize()` 返回 `true` 后再显示顶层窗口，让用户看到的是初始化
画面而不是原生窗口背景。多视图会话仍建议等所有 `CreateView()` 完成后再显示窗口。

初始化或首个页面导航失败时，框架会把初始化表面切换为错误面板，显示失败原因、目标
URL 和日志路径，并隐藏底层的 WebView2 错误页。日志追加写入
`%LOCALAPPDATA%\Kasumi\Logs\<executable-name>.log`，使用 UTF-16，包含时间、错误
描述、WebView2 Runtime 版本和 URL。宿主可以通过 `last_error()` 与
`last_log_path()` 读取最近一次失败信息，用于对话框或诊断页面。

失败回调触发后不要立即销毁窗口；保留窗口可以让用户看到错误面板和日志路径。窗口仍
可正常缩放，错误面板会跟随客户区更新。

`user_data_folder` 为空时使用
`%LOCALAPPDATA%\Kasumi\WebView2\<executable-name>`，不会让 WebView2 在 EXE 旁创建
默认 profile。内嵌模式为 `app://res` 和 `app://assets` 提供只读目录枚举与文件读取，
CSP 由 `index.html` 响应头注入。

每个 WebView View 分配单调递增且不复用的 `windowId`。同一窗口的 View 共享
WebView2 Environment，但各自拥有子 `HWND`、路由器、宿主服务、请求队列、超时计时器
和事件订阅。新文档开始或关闭 View 时，宿主取消旧请求、清理计时器并抑制迟到响应。
关闭一个 View 不影响同一窗口中的其他 View，关闭顶层窗口会关闭全部 View。

### 多 WebView 实例

默认的 `Initialize()` 保留单视图入口：创建 Environment 后自动创建一个填满客户区的
默认 View。需要标签页、分屏或浏览器式布局时，使用 `InitializeSession()` 只初始化
窗口会话，再调用 `CreateView()` 创建多个实例：

```powershell
pnpm ksm build --windows --target example --multi-view
pnpm ksm dev --windows --multi-view
```

`--multi-view` 设置示例工程的 `KASUMI_EXAMPLE_MULTI_VIEW=ON`，普通启动直接进入
`multi-view.html` 双实例演示。左侧写入共享沙箱便签，右侧通过自己的 View 路由轮询读取；
窗口缩放时宿主重新分发左右边界，双实例窗口最小为 `640 × 360`，保证每个 View 至少有
`320 × 360` 的可操作区域。`--multi-view-smoke` 加载同一套页面做 CTest。

```cpp
auto host = std::make_shared<KSMWebView2Host>(
    window,
    file_system,
    std::vector<std::string>{"https://example.com"},
    {},
    user_data_folder,
    false,
    web_resources,
    L"https://app.local/index.html",
    false,
    KASUMI_APP_VERSION,
    ConfiguredCommands(),
    kWindowDecorations
);

host->InitializeSession([host, window](bool success, const std::string &error) {
  if (!success) {
    return;
  }

  RECT client{};
  GetClientRect(window, &client);
  const LONG split = (client.right - client.left) / 2;

  KSMWebView2ViewOptions left;
  left.bounds = RECT{client.left, client.top, split, client.bottom};
  left.fill_parent = false;

  KSMWebView2ViewOptions right;
  right.bounds = RECT{split, client.top, client.right, client.bottom};
  right.fill_parent = false;

  auto first = host->CreateView(left);
  auto second = host->CreateView(right);
});
```

| 方法 | 作用 |
| --- | --- |
| `InitializeSession(callback)` | 只创建共享 Environment，不自动创建 View |
| `Initialize(callback)` | 兼容入口，创建 Environment 和一个默认 View |
| `CreateView(options, callback)` | 创建独立 View；未指定 `start_url` 时继承宿主默认地址 |
| `DestroyView(windowId)` | 关闭并移除指定 View |
| `view_count()` | 返回当前注册表中的 View 数量 |
| `SetBounds(bounds)` | 设置父窗口客户区坐标中的像素边界，并取消自动填满 |
| `FillParent()` | 恢复为填满父窗口客户区 |
| `SetVisible(visible)` | 独立显示或隐藏 View |
| `Focus()` | 切换可见性并把键盘焦点交给该 View |

`CreateView()` 的 `fill_parent` 默认为 `true`。显式调用 `SetBounds()` 会把该 View
切换为固定布局；之后顶层窗口收到 `WM_SIZE` 时只重新布局仍处于 `fill_parent` 模式的
View。尺寸边界会夹取到父窗口客户区；创建参数和 `SetBounds()` 的无面积输入会直接失败，
不会在夹取后变成一个 `1×1` 的实例。

多 View 不会放宽导航安全策略。每个 View 仍只允许 `https://app.local` 和开发模式
`http://localhost:5173`，`window.open` 继续被拦截。后续浏览器式产品需要单独设计
受控导航策略，不能通过增加 View 数量绕过现有边界。

## 下载、链接与窗口

`KSMWindowsHostServices` 使用 WinHTTP 下载：

- 只接受 HTTPS，关闭自动重定向并逐跳校验。
- 每一跳都必须匹配 `windows.http.allowedOrigins` 的精确 origin，并拒绝私网、回环、
  链路本地和云元数据地址。
- 最多 5 次重定向，总超时 120 秒，最大 100 MiB。
- 下载到同目录 `.part` 文件，成功后用 `MoveFileExW` 提交。
- 取消或超时会关闭 WinHTTP 句柄并删除临时文件。
- `overwrite` 缺省为 `false`；目标存在返回 `IO_ERROR`。
- 请求 ID 在创建 `.part` 文件前原子占用；同一 ID 的并发下载返回 `BUSY`。

`shell.openExternal` 使用 `ShellExecuteW`，服务层再次执行精确 origin 白名单校验。
默认空白名单，调用方必须通过 `KSMWindowsHostServices` 或 `KSMWebView2Host` 构造参数
显式配置允许的 `http` / `https` origin。

文件系统对根目录、父目录和目标执行句柄最终路径 containment 校验。junction、符号链接、
`..` 和大小写变化都不能让路径逃离可写虚拟根；`app://picked` 仍使用系统选择器授予的受限
句柄，不把选择结果转换成任意真实路径。

`window.setSize` 接受逻辑外框像素，最小 `320 × 240`。实现使用 `GetDpiForWindow`、
`MulDiv`、`MonitorFromWindow`、`GetMonitorInfo` 和 `SetWindowPos`；最大化、最小化和
全屏返回 `NOT_SUPPORTED`。`window.resized` 仍使用物理内容区尺寸。

`window.startDragging` 进入系统 `HTCAPTION` 移动循环；`window.startResizing` 接受
`top` / `bottom` / `left` / `right` / `topLeft` / `topRight` / `bottomLeft` /
`bottomRight`，进入系统缩放循环。无边框窗口按 8 DIP 边缘处理 `WM_NCHITTEST`；
WebView2 的 Chromium 输入窗口可能位于独立线程，跨线程子类化不生效，因此框架会在窗口
前台时轮询鼠标边角并作为原生兜底。自定义标题栏在边缘 8px 内应先调用
`window.startResizing`，否则标题栏 JS 拖动会先于原生缩放执行。

## 测试

```powershell
python cli/ksm.py test --platform windows --target sdk
python cli/ksm.py test --platform windows --target example
```

| 测试 | 位置 | 覆盖内容 |
| --- | --- | --- |
| `kasumi_contract` | SDK 构建目录 | 路由、fail-closed 权限、origin、symlink containment、重复请求 ID、picker `BUSY`、SQL 限额与取消、Store 并发和根入口 |
| `kasumi_win32_example_smoke` | 示例构建目录 | 隐藏启动示例、加载页面、执行 `ping` 并退出 |
| `kasumi_win32_example_multi_view_smoke` | 示例构建目录 | 同一窗口创建两个 View、独立身份与边界、两个页面分别完成命令写入、关闭单个 View 后其余实例继续运行 |

示例 smoke test 要求机器已安装 Evergreen WebView2 Runtime。

## 打包与签名

```powershell
python cli/ksm.py package --platform windows --target sdk
python cli/ksm.py package --platform windows --target example
pnpm ksm package --windows --target example --with-webview2-loader
```

- Release SDK 产物：`.ksm/release/kasumi/<version>/kasumi-windows-sdk-<version>.zip`。
- Release 示例产物：`.ksm/release/app/<version>/kasumi-win32-example-<version>.zip`。
- SDK ZIP 只包含静态库、公共头文件、CMake 包配置和 README。
- 默认示例 ZIP 只包含 EXE 和内嵌 Web 资源，不包含 `WebView2Loader.dll`、`.WebView2`、`web/` 或框架源码。
- `--with-webview2-loader` 模式额外包含 `WebView2Loader.dll`；外置模式额外包含 `web/`。

标签发布要求：

| Secret | 用途 |
| --- | --- |
| `WINDOWS_CERTIFICATE_BASE64` | Authenticode PFX 的 Base64 |
| `WINDOWS_CERTIFICATE_PASSWORD` | PFX 口令 |

正式标签缺少证书时工作流直接失败。签名使用 SHA-256 和 RFC3161 时间戳，并对每个
EXE/DLL 执行 `signtool verify /pa /all`。普通 CI 可以构建未签名产物。

## 排查路径

1. 启动提示缺少 WebView2 Runtime：安装 Evergreen Runtime 后重新运行。
2. `find_package(Kasumi)` 失败：检查 `CMAKE_PREFIX_PATH` 是否指向 SDK 安装目录。
3. 链接失败：确认消费者链接的是 `Kasumi::kasumi_windows_bridge`。
4. 页面空白：默认模式检查内嵌资源是否重新生成；外置模式检查 `web/index.html` 与 EXE 同级。
5. 请求一直超时：检查 WebView2 消息是否回到 UI 线程、来源是否为 `https://app.local`，
   以及 `timeoutMs` 是否在 `1..600000`。
6. 外部链接被拒绝：检查 origin 是否包含正确 scheme、host 和端口。
7. 下载失败：检查 HTTPS、重定向、目标路径、覆盖策略和 `.part` 清理。
8. 窗口尺寸不变：检查窗口是否最大化、最小化或全屏，以及目标显示器工作区。
9. 多 View 重叠或尺寸不动：确认显式布局的 View 已调用 `SetBounds`，需要跟随父窗口
   的 View 保持 `fill_parent=true`。
10. 关闭一个标签后顶层窗口退出：确认调用的是 `DestroyView(windowId)`，而不是
    `KSM.window.close()` 或 `KSMWebView2Host::Close()`。
11. SQL 返回 `RESOURCE_LIMIT`：减少结果列、行数或分页查询；连接额度需关闭旧连接后释放。
12. SQL 一直等待：确认请求 ID 未重复、取消令牌已透传，并检查 SQLite progress handler
    或 ODBC `SQLCancel` 是否执行。
