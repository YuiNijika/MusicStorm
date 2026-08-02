<p align="center">
  <img src="/public/icon.png" width="128" alt="MusicStorm 图标" />
</p>

<h1 align="center">MusicStorm</h1>

<p align="center">
  一款基于 Tauri 2、React 与 Rust 构建的 Windows 桌面音乐播放器。
</p>

<p align="center">
  <a href="https://github.com/YuiNijika/MusicStorm/releases">下载应用</a>
  ·
  <a href="https://github.com/YuiNijika/MusicStorm/issues">反馈问题</a>
</p>

## 关于 MusicStorm

MusicStorm 将本地音乐管理与网易云音乐服务整合在同一个桌面应用中，提供接近 Apple Music 的界面、原生本地音频播放、歌词展示和可定制的外观体验。

项目目前主要面向 Windows，仍处于持续开发阶段。部分在线能力依赖网易云音乐接口和账号状态，可能因服务端策略调整而发生变化。

## 功能特性

### 本地音乐

- 导入音乐文件夹或单独添加歌曲
- 按歌曲、专辑管理本地曲库
- 读取音频标签、内嵌封面、内嵌歌词和同目录歌词文件
- 支持 UTF-8、UTF-16、GBK / GB18030 等常见歌词编码
- 使用原生音频引擎播放本地音乐，并支持自动切换下一首
- 支持编辑专辑信息、手动设置封面和重新扫描元数据
- 可从网易云匹配并补全缺失的歌曲封面与歌词

### 网易云音乐

- 手机号与二维码登录
- 搜索歌曲、专辑、歌手、歌单和 MV
- 浏览推荐内容、个人歌单、收藏与电台
- 播放在线歌曲、查看歌词和 MV
- 支持歌曲收藏、歌单操作和音质偏好
- 支持电台及节目浏览、排序和队列播放

### 播放与曲库

- 播放队列、顺序播放、单曲循环与随机播放
- 音量、静音、播放进度和队列状态持久化
- 本地曲库、歌单、收藏和电台列表排序
- 支持列表与卡片视图，以及自定义拖拽排序
- 播放统计页面可查看歌曲、歌手和收听趋势
- 启动时恢复上次播放会话，可自行控制是否自动播放

### 外观与交互

- Apple 风格的亮色、暗色和跟随系统主题
- 可调整主题色、全局色调、玻璃透明度与模糊强度
- 全屏播放器、动态封面背景和同步歌词
- 自定义桌面标题栏、窗口控制与启动画面
- 支持键盘播放快捷键和 GitHub Releases 更新检测

## 下载与安装

前往 [Releases](https://github.com/YuiNijika/MusicStorm/releases) 下载最新构建产物。

Windows 安装包使用当前用户模式安装，不需要管理员权限。首次启动前请确保系统已安装 Microsoft Edge WebView2 Runtime；现代 Windows 10 / 11 通常已自带该组件。

> 如果系统或安全软件阻止运行，请先核对下载来源与 Release 页面提供的信息，不建议关闭系统安全防护。

## 本地开发

### 环境要求

- Node.js
- [pnpm](https://pnpm.io/)
- Rust stable 工具链
- Tauri 2 在 Windows 下所需的系统依赖

具体系统依赖请参考 [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)。

### 启动开发环境

```bash
git clone https://github.com/YuiNijika/MusicStorm.git
cd MusicStorm
pnpm install
pnpm tauri dev
```

### 构建前端

```bash
pnpm build
```

### 构建桌面应用

```bash
pnpm tauri build
```

构建产物由 Tauri 写入 `src-tauri/target/release/bundle/`。

## 技术栈

- **桌面框架**：Tauri 2
- **前端**：React、TypeScript、Vite、Tailwind CSS
- **原生层**：Rust、rodio、cpal、symphonia
- **本地数据**：SQLite 与应用本地存储
- **在线服务**：网易云音乐接口、GitHub Releases

## 项目说明

- MusicStorm 与网易云音乐及其关联公司无隶属、授权或合作关系。
- 在线音乐内容的版权归对应权利人所有，请遵守所在地区的法律法规及相关服务条款。
- 请勿将本项目用于绕过付费、版权保护或其他访问限制。
- 项目尚未提供许可证文件；在许可证明确前，默认保留所有权利。

## 反馈

发现问题或希望提出改进建议，可前往 [Issues](https://github.com/YuiNijika/MusicStorm/issues) 提交。反馈时建议附上系统版本、复现步骤和相关日志，以便定位问题。
