---
name: "yuinijika-docs-style"
description: "Technical documentation writing style for YuiNijika — practical developer docs with boundaries first, real entry points, tables, runnable examples, and debug paths. Invoke when writing README, API docs, MDX/Markdown guides, framework notes, or developer handbooks."
---

# Docs Style — YuiNijika

Hard constraints for technical documentation.
Soft marketing tone, empty overviews, and fake API invention are forbidden.

Code samples inside docs MUST follow [coding-style.md](coding-style.md).
This file only controls document structure, tone, and content shape.

---

## When to Use

MUST use this skill when writing or rewriting:

- project docs / README developer sections
- API / Hook / config / module docs
- framework loading / extension guides
- troubleshooting pages
- MDX / Markdown technical docs

MUST NOT use chat-style fragmentation here.
Docs are technical prose, not WeChat bursts.

---

## Page Skeleton (default)

Every page MUST follow this shape unless the user specifies another template:

```md
# 页面标题

> 一句话说明本页覆盖什么、解决什么问题。

## 模块边界 / 适合谁阅读 / 入口

...

## 核心内容（按真实结构拆）

...

## 代码示例

...

## 常见问题 / 常见风险 / 排查路径

...
```

Required elements:

1. **H1 title** — concrete capability name, not slogan
2. **Lead quote** — one-line scope summary under the title:
   `> 理解 X 的加载顺序、边界、读取方式和扩展点。`
3. **Boundary first** — state what this page is for, and what it is NOT
4. **Real entry points** — files, functions, hooks, config keys, load order
5. **Tables for structure** — layers, fields, hooks, files, priorities
6. **Runnable examples** — real naming, real call shape, real guards; code style from coding-style
7. **Wrong paths** — explicit anti-patterns
8. **Debug path** — numbered checklist when relevant

---

## Hard Content Rules

### 1. Write for developers doing real work

Docs MUST answer:

- where is the entry
- what is the load order
- how to call / read / extend
- what not to touch
- how to debug when it breaks

Docs MUST NOT be:

- product marketing copy
- backend UI click manuals (unless the page is explicitly an ops guide)
- vague architecture essays with no file/function anchors

### 2. Source-first, invent-nothing

- MUST base APIs, paths, hooks, option keys, and class names on real code or verified project facts
- MUST NOT invent functions, hooks, filters, config keys, or file paths
- If uncertain, write the verification method instead of fabricating details
- Prefer project-native naming and patterns over generic textbook samples

### 3. Prefer extension over core edits

When documenting customization:

- MUST recommend hooks / filters / official extension points / child theme / plugin layer
- MUST warn against dumping one-off changes into core files
- MUST explain update/overwrite and maintenance cost when core edits are mentioned

### 4. Boundaries before details

Before deep dives, MUST define layers, for example:

| 层级 | 负责内容 | 典型入口 |
|---|---|---|
| 配置层 | 开关与字段 | `options/...` |
| 运行层 | 读取与输出 | `functions/...` |
| 扩展层 | Hook / Filter | `do_action` / `apply_filters` |

If multiple systems look similar, MUST state which one to use for which job.

### 5. Show the real path

Use trees for load order:

```txt
functions.php
└─ inc/inc.php
   ├─ options
   ├─ framework
   └─ do_action('..._require_end')
```

Use tables for:

- files and responsibilities
- config fields and effects
- hooks, type, params
- priority / override order
- risks and symptoms

### 6. Examples must be production-shaped

Code samples MUST follow [coding-style.md](coding-style.md):

- naming, formatting, early return, comments = why
- directory-scoped naming
- no magic numbers
- explicit types where the language expects them

Also include real-world guards when relevant:

- existence checks (`class_exists`, `function_exists`)
- admin / frontend context checks
- empty value checks
- permission / capability checks
- idempotency notes for payments, points, inventory, downloads

Good example pattern:

```php
add_action('example_hook', 'project_handle_example', 20, 1);

function project_handle_example($payload)
{
    if (empty($payload->id)) {
        return;
    }

    // only sync / record; do not re-process completed work
}
```

Also show anti-examples when useful:

```php
// Wrong: invent a parallel reader
get_option('everything');

// Correct: use the project reader
_pz('field_id');
```

### 7. Filter / Action contracts

When documenting hooks:

| 类型 | 适合做什么 |
|---|---|
| Action | append side effects at a process node |
| Filter | modify return value / config / HTML / query args |
| Dynamic hook | extend by type / page / order / tab |

Hard rules:

- Filter callbacks MUST return the same kind of value
- Action callbacks MUST NOT print unless the hook is a template output point
- High-frequency hooks MUST NOT do remote calls synchronously
- Money / points / stock / download callbacks MUST be idempotent
- Escape by context on output (`esc_html` / `esc_url` / `esc_attr` / `wp_kses_post`)

### 8. Performance and load cost

If a page touches admin options, large field trees, or heavy builders:

- MUST document conditional loading
- MUST warn against building huge configs on every admin page
- MUST prefer page/action checks before expensive work

### 9. Troubleshooting is mandatory for complex topics

End complex pages with a numbered path:

1. confirm entry file is loaded
2. confirm class/function exists
3. confirm prefix / slug / option key
4. confirm field/hook is in the right place
5. confirm saved data exists
6. confirm frontend reader uses the correct API
7. check Ajax/network/PHP logs if save/render fails

Or a symptom table:

| 现象 | 优先检查 |
|---|---|
| 不生效 | 配置键、读取函数、缓存 |
| 报类不存在 | 加载顺序、挂载点过早 |

---

## Language & Tone

- Default language: **简体中文** for docs body, unless user asks otherwise
- Tone: direct, calm, technical. No hype. No filler.
- Short paragraphs. One idea per section.
- Prefer concrete nouns: file path, function, hook, field id, return type
- MUST NOT write empty sentences like “非常强大、灵活、易于扩展” without mechanism
- MUST NOT dump unrelated stack/changelog narrative into user-facing docs pages
- Titles: capability-oriented (`加载机制`, `Hook 与过滤器`), not blog-like

Heading style:

- `#` page topic
- `##` major block
- `###` only when a major block truly needs split

---

## Section Patterns (reuse these)

### Overview / index page

- 项目介绍
- 适合谁阅读
- 快速开始 / 学习路线
- 文档模块
- 开发原则
- 内容范围

### Mechanism page

- 加载顺序
- 层级对照表
- 条件加载
- 推荐挂载点
- 常见加载问题

### Config / options page

- 入口文件
- prefix / menu / storage key
- 一级分组与子 section
- 字段结构
- 读取 / 写入
- 保存 Hook
- 性能判断
- 排查路径

### API / hooks page

- 使用原则
- 分类表（加载 / 用户 / 页面 / 支付...）
- 参数约定
- 回调写法
- 动态 Hook 边界
- 排查方式

### Appearance / behavior page

- 模块边界
- 核心文件
- 配置字段
- 运行链路
- 优先级
- 扩展正确写法
- 常见风险
- 调试入口

---

## Formatting Rules

- Use Markdown / MDX cleanly
- Use fenced code blocks with language tags (`php`, `ts`, `txt`, `bash`, `css`, `json`)
- Use tables for comparisons and inventories
- Use bullet lists for constraints and checklists
- Use numbered lists for sequences and debug steps
- Keep code blocks minimal but complete enough to copy
- Do not wrap every sentence in bold
- Do not spam emoji
- Do not invent decorative callout spam; one lead quote is enough

---

## Strictly Forbidden

- Fake APIs, fake paths, fake hooks
- Marketing fluff with no operational value
- “改一下核心文件就行” as the default solution
- Examples that violate coding-style
- Examples without guards on privileged or money-related flows
- Mixing multiple modules into one undifferentiated wall of text
- Writing docs like chat messages
- Ending without boundaries, examples, or debug path on complex topics

---

## Quality Checklist (before finishing a doc page)

1. Can a developer find the entry file in under 30 seconds?
2. Is the load / read / write / extend path explicit?
3. Are tables used where structure matters?
4. Are examples real-shaped, copyable, and coding-style compliant?
5. Are wrong approaches stated?
6. Is there a debug path for failure cases?
7. Did any name get invented without evidence?

If any answer is no, rewrite before delivery.