# 项目规则

本项目强制使用 yuinijika skill。任何编码、写文档之前，先读取并调用 `.agents/skills/yuinijika/SKILL.md`，按其子规范执行。

- 写码或改码 → 读 `.agents/skills/yuinijika/coding-style.md`
- 写技术文档 / README / API / MDX → 读 `docs-style.md`

不得自行另建编码规范文档，规则只在此 skill 内维护。不要生成无用的临时文件，测试用到的用完即删或直接在终端跑。

## 前端 UI / 交互规范

涉及前端 UI、界面、交互的改动，强制调用 web-design-guidelines、web-artifacts-builder、apple-design skill：

- 改动前端组件 / 页面 / 交互逻辑前，先调用 web-design-guidelines（WebFetch 拉取 vercel-labs/web-interface-guidelines 最新规范），实现完成后按规范逐条自检并输出 findings
- 构建页面 / 组件 / 交互时遵循 web-artifacts-builder 设计指南：避免模板化 AI 风格，保持 Apple 设计语言、玻璃拟态、克制排版，移动端遵循触控与安全区规范
- 手势驱动 UI、弹簧动画、拖拽 / 滑动 / sheet 交互、动量与可中断过渡、半透明材质 → 先调用 apple-design，按 Apple 动效与材质规范实现

## GitHub Releases 发布规范

发布 GitHub Releases 时，内容风格严格对齐以往版本（以 v26.9.5 为基准），结构固定：

1. 总述段落：一句或一段概括本次版本聚焦方向（2-4 个主题），不用引用符 `>`
2. `## 新增功能`
3. `## 优化与调整`
4. `## 修复问题`

格式要求：

- 列表项用 `- `，子项用 4 空格缩进 `- `
- 小节标题用 `## `，列表项之间不空行
- 不写版本号 / 发布日期 / 作者信息，由 GitHub 自动生成
- 「修复问题」每项以「修复」开头，说明问题现象 + 根因或方案
- 内容来源：结合 git commit 历史与本地项目记忆，只写真实发生的改动，不编造
- 发布前先查 github-update.ts / tauri.conf.json 确认版本号