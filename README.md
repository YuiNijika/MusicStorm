

<p align="center">
  <img src="/public/icon.webp" width="128" alt="MusicStorm 图标" />
</p>

<h1 align="center">MusicStorm</h1>

<p align="center">
  基于 Tauri 2、React 与 Rust 的桌面音乐播放器，整合本地曲库与网易云音乐。
</p>

<p align="center">
  <a href="https://github.com/YuiNijika/MusicStorm/releases">下载应用</a>
  ·
  <a href="https://music.miomoe.cn/">网页版</a>
  ·
  <a href="https://github.com/YuiNijika/MusicStorm/issues">反馈问题</a>
</p>

## 功能

| 模块 | 能力 |
|---|---|
| 本地音乐 | 文件夹/文件导入，按专辑与艺人管理，标签、内嵌封面与歌词解析，网易云补全元数据 |
| 网易云音乐 | 扫码/验证码登录，搜索、歌单、电台、MV，收藏与音质偏好 |
| 播放 | 队列与循环模式，会话恢复，播放统计，macOS 系统媒体键与控制中心 |
| 外观 | 亮/暗/跟随系统，可调主题色与毛玻璃，全屏播放器与同步歌词 |

## 安装

前往 [Releases](https://github.com/YuiNijika/MusicStorm/releases) 下载。Windows 安装包免管理员权限，需 Microsoft Edge WebView2 Runtime（现代 Win10/11 自带）；macOS / Linux 用户请选择对应平台的安装包。

也可以直接打开 [网页版](https://music.miomoe.cn/player.html) 在线体验，支持在线播放与本地导入，功能少于桌面版。

## 开发

环境要求：Node.js、pnpm、Rust stable、Tauri 2 系统依赖（见 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)）。

```bash
git clone https://github.com/YuiNijika/MusicStorm.git
cd MusicStorm
pnpm install
pnpm tauri dev        # 开发
```

## 构建

```bash
# 产物在 src-tauri/target/release/bundle/
pnpm tauri build          # 包管理器
python scripts/build.py   # 构建脚本
```
Android 开发需 Android Studio、Android SDK、Android NDK。  
macOS 开发需 Xcode Command Line Tools；FFmpeg 用于部分格式转码与探测，应用会自动探测 Homebrew 安装路径。macOS 支持仍为开发阶段，最低系统 macOS 13.0。

## 项目说明

- 与网易云音乐及其关联公司无隶属、授权或合作关系
- 在线音乐版权归对应权利人所有，请遵守当地法律与服务条款
- 请勿将本项目用于绕过付费、版权保护或其他访问限制

## 反馈

前往 [Issues](https://github.com/YuiNijika/MusicStorm/issues)，附上系统版本、复现步骤与日志。
