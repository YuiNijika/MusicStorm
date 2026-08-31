<p align="center">
  <img src="public/icon.webp" width="128" alt="MusicStorm 图标" />
</p>

<h1 align="center">MusicStorm</h1>

<p align="center">
  让每一次聆听，都成为风暴 —— 本地曲库与网易云音乐合二为一的高颜值桌面音乐播放器。
</p>

<p align="center">
  <a href="https://github.com/YuiNijika/MusicStorm/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="License: MIT" /></a>
  <a href="https://v2.tauri.app/"><img src="https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white" alt="Tauri 2" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Android%20%7C%20iOS-lightgrey" alt="Platforms" />
</p>

<p align="center">
  <a href="https://github.com/YuiNijika/MusicStorm/releases">下载应用</a>
  ·
  <a href="https://music.miomoe.cn/">网页版</a>
  ·
  <a href="https://github.com/YuiNijika/MusicStorm/issues">反馈问题</a>
</p>

## 特性

- **本地 + 云端一站式**：文件夹导入本地音乐，自动按专辑与艺人管理；登录网易云后歌单、电台、MV、评论全都在
- **全屏播放器**：经典 / 封面 / 纯歌词三种模板，同步滚动歌词，支持歌词对齐调整
- **桌面歌词与桌面小播放器**：桌面上常驻浮动歌词与迷你播放控件，可拖动、切歌、调进度
- **每日自动签到**：自动补签网易云网页端与安卓端，跨零点无需手动操作
- **播放统计**：按会话记录播放时长，榜单、来源分布一目了然
- **播放引擎**：无损与高规格文件走原生输出通道（支持 WASAPI 独占），在线与普通 MP3 走内置解码，淡入淡出与 EQ 可调
- **外观定制**：亮 / 暗 / 跟随系统，主题色、毛玻璃、背景图，侧栏双风格（紧凑 / 经典），主题切换圆扩散与路由载入动画
- **封面缓存自愈**：清理缓存后本地封面自动重新解析、远程封面回源重下，手动设置的封面受保护
- **多账号**：扫码 / 验证码登录，多账号随时切换，凭据只保存在本机

## 下载安装

前往 [GitHub Releases](https://github.com/YuiNijika/MusicStorm/releases) 下载对应平台的安装包：

| 平台 | 说明 |
| --- | --- |
| Windows | NSIS 安装包，免管理员权限，需 Microsoft Edge WebView2 Runtime（Win10/11 自带） |
| Android | APK 安装包，版本线与桌面端相互独立 |
| macOS | 即将推出（最低 macOS 13.0，开发阶段） |
| iOS | 即将推出 |

也可以直接打开[网页版](https://music.miomoe.cn/player.html)在线体验，支持在线播放与本地导入，功能少于桌面版。

## 本地开发

环境要求：Node.js、pnpm、Rust stable、Tauri 2 系统依赖（见 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)），Windows 需 WebView2。

```bash
git clone https://github.com/YuiNijika/MusicStorm.git
cd MusicStorm
pnpm install
pnpm tauri dev        # 开发
```

```bash
# 产物在 src-tauri/target/release/bundle/
pnpm tauri build          # 包管理器
python scripts/build.py   # 构建脚本（含产物整理）
```

Android 开发需 Android Studio、Android SDK、Android NDK；macOS 开发需 Xcode Command Line Tools，FFmpeg 用于部分格式转码与探测（应用会自动探测 Homebrew 安装路径）。开发者文档见[官网 Docs](https://music.miomoe.cn/#/docs/getting-started)。

## 项目结构

```
src/          # 前端：React 19 + Tailwind（页面、组件、状态层 hooks、网易云 API 层）
src-tauri/    # Rust：原生音频引擎、无 CORS 代理、SQLite、封面缓存、托盘与第二窗口
website/      # 官网子包，独立 Vite 工程
scripts/      # 构建与质量检查脚本
```

## 免责声明

- 本项目与网易云音乐及其关联公司**无隶属、授权或合作关系**
- 在线音乐版权归对应权利人所有，请遵守当地法律与服务条款
- 请勿将本项目用于绕过付费、版权保护或其他访问限制

## 反馈

前往 [Issues](https://github.com/YuiNijika/MusicStorm/issues)，附上系统版本、复现步骤与日志。

---

觉得好用的话，顺手去 [GitHub](https://github.com/YuiNijika/MusicStorm) 点个 star 罢，跪求！项目完全开源免费，遇到问题欢迎提 issue，或者来 [B 站](https://space.bilibili.com/435502585)找 UP 主唠嗑～ 🙏
