---
title: 规范
description: 代码风格、动效、懒加载、组件与构建约定，以及排查路径。
order: 11
---

# 开发规范

> 提交代码前必读：风格、动效、懒加载、组件与构建约定，以及通用排查路径。

## 本页边界

覆盖：全仓通用开发约定。

**不**覆盖：各模块接口（见 [API](#/docs/dev/api) 等子文档）。

## 代码风格

- TypeScript `strict: true`，禁用无理由 `any`；`interface` 描述对象、`type` 描述联合
- 缩进 4 空格，LF，UTF-8 无 BOM，文件尾一个换行
- 文件 `kebab-case.ts`，React 组件 `PascalCase.tsx`，**一个组件一个目录**（目录语义命名，如 `components/Button` 导出 `Button`，不叫 `ButtonComponent`）
- **注释写 why，不写 what**；魔法数字必须命名常量
- Rust：`rustfmt` / `clippy`，模块 `snake_case.rs`，`unwrap` 仅在不失败路径（带 why 注释）

```ts
// Bad：注释复述代码
// 如果 status 是 1 就返回
if (status === 1) {
    return
}

// Good：注释解释为什么
// 播放地址必须实时获取，缓存会拿到过期 URL
await fetchSongUrl(id)
```

## 动效 token

缓动与时长唯一真源在 `src/App.css` 的 `:root`：

| Token | 值 | 用途 |
|---|---|---|
| `--ease-enter` | `cubic-bezier(0.32, 0.72, 0, 1)` | 进入动画 |
| `--ease-exit` | `cubic-bezier(1, 0, 0.68, 0.28)` | 退出动画（enter 精确镜像，可逆过渡必须镜像） |
| `--ease-press` | `cubic-bezier(0.5, 0, 0.75, 0)` | 按压反馈 |
| `--duration-press` / `--duration-control` / `--duration-hover` / `--duration-enter` | 100 / 140 / 200 / 340 ms | 各场景时长 |

硬规则：

- **新增组件禁止自定义缓动**，一律引用 token
- 动画只允许 transform / opacity（GPU 合成）；**禁止 filter / blur 动画**（全屏模糊每帧重绘必卡）
- `prefers-reduced-motion` 下非全灭：App.css 强制 transition-property 白名单 150ms cross-fade；组件 JS 侧判 reduce 时 timer 用 150ms 不是 0
- 弹性滑块 `elastic-slider` 的过冲弹簧 `cubic-bezier(0.34, 1.56, 0.64, 1)` 是有意保留的物理回弹，勿"修正"

## 路由切换载入动画

`src/lib/app/route-transition.ts` 的 `runRouteTransition(mutate)` 包一层 View Transitions，主内容区独立快照、固定淡入（CSS 在 `Style.css` 的 `vt-route-*` 规则）：

- 回调内用 `flushSync` 让新页面在截帧前提交，否则快照捕到的还是旧页
- 三种情况直接切换不建快照：不支持 `startViewTransition`、`prefers-reduced-motion`、性能模式（`html.performance-mode`）
- 切换期间挂 `vt-route-fade` class，`transition.finished` 后移除

与主题切换的圆扩散（见 [主题与外观](#/docs/dev/appearance)）是两套独立 VT：主题切换挂 `theme-switching`，路由切换挂 `vt-route-fade`，互不污染。

## 懒加载约定

- 页面一律 `lazy()` + 页面专属骨架屏（`src/components/music/loading-skeletons.tsx`）
- 大依赖懒加载：网易云加密库只能动态 import（见 [API](#/docs/dev/api) 加密链）
- 非首屏组件条件挂载：歌词视图（全屏播放器展开时）、登录对话框等

```tsx
// 页面级懒加载
const SettingsPage = lazy(() =>
    import("@/pages/settings").then((m) => ({ default: m.SettingsPage })),
)
// 渲染处用 Suspense fallback={页面骨架屏}
```

## 组件约定

- `dropdown-menu` 基于 `@base-ui/react/menu`（Base UI，不是 radix）：菜单项触发用 `onClick`，**不要用 `onSelect`**（Base UI 不触发）；参考 `src/components/layout/sidebar.tsx`
- 组件只消费 hook / 桥接函数，不直接 `invoke`、不直接读写 localStorage
- UI 文案只描述用户真实所见，不写技术栈、不描述实现方式
- 移除组件 = 删除整个目录

## 通知与 Toast

统一走 `src/lib/notify.ts`，不要直接操作 toast manager：

| 函数 | 类型 | 默认停留 |
|---|---|---|
| `notifySuccess` / `notifyInfo` | success / info | 3.2s |
| `notifyWarning` | warning | 3.8s |
| `notifyError` | error | 4.8s（高优先级） |
| `notifyLoading` | loading | 不自动关，需手动更新或关闭 |
| `notifyPromise(promise, { loading, success, error })` | 三态 | loading → 成功/失败就地变换类型与文案 |

使用约定：

- `notifyPromise` 适合签到、清理缓存等有明确终态的异步动作，一个 id 全程复用，不会另弹第二条
- `notifyFromError(title, error)` 从 unknown error 提取 message（内部 `formatError`）
- 同类重复通知传 `id` 去重（如「已是当前账号」）
- viewport 默认右上角流式堆叠，上限 4 条；求 star 是独立 bottom-center 组件（`star-toast.tsx`），不走 notify.ts

## 构建约定

| 约定 | 说明 |
|---|---|
| 主应用 `vite build` 在 PowerShell（大写盘符 `D:`）执行 | Git Bash 小写 `d:/` cwd 触发 vite html-inline-proxy 盘符大小写 bug |
| 多页入口在 `vite.config.ts` 的 `rollupOptions.input` | 主窗口 / desktop-lyric / mini-player 三个入口必须齐全，缺项 dev 无感但打包后窗口 404 白屏（见 [Tauri 命令](#/docs/dev/tauri)） |
| pnpm / node 命令加 `NODE_OPTIONS=` 前缀 | 去掉 safe-delete shim，否则 pnpm 临时目录删除被拦截、vite 清 dist 卡死 |
| pnpm 装包后空目录 | junction 创建失败；`New-Item -ItemType Junction` 手工链接到根 `node_modules/.pnpm/<pkg>`，并验证 package.json 可读 |
| website：`vite.config.ts` 需 `build.emptyOutDir=false` | 沙箱 safe-delete 拦截清空 dist |
| website：`import.meta.glob` 用根绝对模式 | `"/content/docs/*.md"`；相对模式按项目根解析，越界静默返回空 |
| website：dev 的 glob 有缓存 | 新增文档 md 后需重启 dev 才出现 |

## 常见问题与排查

| 现象 | 优先检查 |
|---|---|
| 网易云接口报错 / 数据不返回 | `musicstorm-api-settings` 模式与来源；`netease_http_post` 域白名单 |
| 文档页空白（website） | `import.meta.glob` 绝对模式；dev glob 缓存需重启 |
| 启动动画一直盖着页面 | App 根 effect 未执行（渲染异常），看 `main.tsx` catch |
| 原生音频无声 / 卡顿 | `audio_probe` 输出；设备独占占用；引擎偏好 |
| 扫描导入后曲库对不上 | `musicstorm:scan-progress` 是否触发；`MAX_TRACKS / MAX_DEPTH` 上限 |
| 本地中文标签乱码 | 确认标签读取走 `fix_tag_text` |
| vite build 报 html-inline-proxy | 换 PowerShell（大写盘符）执行 |
| 菜单点击无反应 | 确认用 `onClick` 不是 `onSelect`（Base UI） |

通用排查路径：

1. 确认入口模块被加载（console / 断点）
2. 确认函数 / 命令存在且已注册（Rust 命令查 `invoke_handler`）
3. 确认 localStorage key 与读写入口一致（组件不该直读）
4. 确认走正确的 API 层入口（netease 数据必须经 `neteaseRequest`）
5. 确认事件名拼写与方向（`musicstorm:*` 前端内，`audio://*` Rust → 前端）
6. 查 Rust 侧日志与前端 `console.error`（渲染失败会打 `[boot] App 加载失败`）
