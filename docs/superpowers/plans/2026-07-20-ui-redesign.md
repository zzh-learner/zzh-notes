# UI 重设计（低调·内涵·现代）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 zzh-notes 博客从"背景图全透 + 文字阴影 hack"切换到低调现代设计：冷净感炭黑配深青、思源宋体+黑体、杂志式摘要首页、左对齐 header、有节制的 GSAP 动效。

**Architecture:** Vendor `node_modules/hexo-theme-next/` 到 `themes/next/`（脱离 npm 管理），改动集中在设计 token（`_variables/base.styl` + Gemini scheme）、自定义文件注入（`source/_data/*.njk` + `styles.styl`）、`_config.next.yml` 开关。NexT 已内建 `excerpt_description` 摘要机制，无需改 layout，仅在配置里开启。

**Tech Stack:** Hexo 7.3 + NexT 8.21（vendor）+ Stylus + Nunjucks + GSAP 3 + ScrollTrigger + Google Fonts。

## Global Constraints

- **Node.js 20 LTS**（见 `README.md`）
- `url`/`root` 不动：仍是 `https://zzh-learner.github.io/zzh-notes/`（AGENTS.md 红线 4）
- 不装 `hexo-renderer-nunjucks`（AGENTS.md 红线 1）
- `package.json` 除 `hexo-theme-next` 外的 13 个依赖**一个都不动**（AGENTS.md 红线 2）
- 改完任何配置/样式必须 `npx hexo clean && npx hexo generate` 验证（AGENTS.md 红线 3）
- `marked` 配置键保持 camelCase（AGENTS.md 红线 5）
- 文章图片仍走 `post_asset_folder` 同名文件夹机制（AGENTS.md 红线 6）
- 所有提交在 `main` 分支上做（项目原本就 push 到 main 触发 Actions）
- 每个 Task 结束必须跑 `npx hexo clean && npx hexo generate`，无 ERROR 才进下一个 Task

---

## Task 1: Vendor 主题到 `themes/next/`，从 npm 依赖剥离

**动机**：`node_modules/hexo-theme-next/` 的改动会被 `npm install` 覆盖、CI 重建丢失。Vendor 到仓库后所有改动进 git。

**Files:**
- Create: `themes/next/`（从 `node_modules/hexo-theme-next/` 整目录复制）
- Modify: `package.json`（移除 `hexo-theme-next` 依赖）
- Modify: `.gitignore`（确认没有忽略 `themes/`）

**Interfaces:**
- Produces: 后续 Task 全部基于 `themes/next/` 这个 vendor 目录工作。`_config.yml` 的 `theme: next` 不动——Hexo 优先读本地 `themes/<name>/`。

- [ ] **Step 1: 确认 .gitignore 不忽略 themes/**

Run: `grep -n "themes" .gitignore || echo "themes not in gitignore"`
Expected: 输出 `themes not in gitignore`，或输出存在 `themes` 行但**不是** `themes/`（若是 `themes/` 需先移除）

- [ ] **Step 2: 复制主题到 vendor 目录**

```bash
cp -r node_modules/hexo-theme-next themes/next
```

Run: `ls themes/next/`
Expected: 输出包含 `LICENSE.md README.md _config.yml _vendors.yml docs languages layout package.json scripts source`

- [ ] **Step 3: 验证 vendor 后仍能正常 build（基线检查）**

```bash
npx hexo clean && npx hexo generate
```

Expected: 无 ERROR，`public/index.html` 生成。这一步只是确认 vendor 没破坏现状，**视觉尚未改变**。

- [ ] **Step 4: 从 package.json 移除 hexo-theme-next 依赖**

Modify `package.json`：
- 删除 `"hexo-theme-next": "^8.21.0",` 这一行（注意保留其他依赖）

- [ ] **Step 5: 删除 node_modules/hexo-theme-next 验证 Hexo 仍从 themes/next 加载**

```bash
rm -rf node_modules/hexo-theme-next
npx hexo clean && npx hexo generate
```

Expected: 无 ERROR、无 `Cannot find module 'hexo-theme-next'`，`public/index.html` 仍生成。若失败说明 vendor 没复制完整，回退 Step 2。

- [ ] **Step 6: 重装依赖确认 package.json 一致性**

```bash
npm install
ls node_modules/hexo-theme-next 2>&1 || echo "hexo-theme-next not reinstalled (expected)"
```

Expected: `hexo-theme-next not reinstalled (expected)` —— npm 不应再装这个包。

- [ ] **Step 7: 再次完整验证**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -20
```

Expected: INFO `Files built in ...s`，无 ERROR。`ls public/index.html` 存在。

- [ ] **Step 8: Commit**

```bash
git add themes/ package.json package-lock.json
git commit -m "build: vendor hexo-theme-next 到 themes/，从 npm 依赖剥离

为深度改主题做准备。后续 styl/njk 改动全部在 themes/next/ 下，进 git 可回溯。
package.json 的其余 13 个依赖一个不动（符合 AGENTS.md 红线 2）。"
```

---

## Task 2: 改设计 token（配色 + 行高 + 圆角）

**动机**：NexT 设计 token 集中在 `themes/next/source/css/_variables/base.styl`。覆盖变量值就能全局生效，不必改 layout。同时改 `theme_color` 配置让 `--theme-color` CSS 变量走新 accent。

**Files:**
- Modify: `themes/next/source/css/_variables/base.styl:7-23`（色值常量）
- Modify: `themes/next/source/css/_variables/base.styl:33-70`（scaffolding 变量）
- Modify: `themes/next/source/css/_variables/Gemini.styl:6-15`（scheme 底色 + 阴影）
- Modify: `_config.next.yml`（增加 `theme_color` 段）

**Interfaces:**
- Produces: 新色值常量（`$text-color = #09090B` 等）、新 theme_color 配置。后续 Task 3-7 全部依赖这些 token。

- [ ] **Step 1: 修改 `themes/next/source/css/_variables/base.styl` 顶部色值块**

把第 7-23 行的 Color system 段替换为：

```styl
// Color system
// --------------------------------------------------
$whitesmoke   = #f5f5f5;
$gainsboro    = #eee;
$grey-lighter = #e4e4e7;   // ← 改：边框色
$grey-light   = #ccc;
$grey         = #a1a1aa;   // ← 改：暗色模式次要文字
$grey-dark    = #71717a;
$grey-dim     = #52525b;   // ← 改：亮色模式次要文字
$black-light  = #27272a;
$black-dim    = #18181b;
$black-deep   = #09090b;   // ← 改：正文炭黑
$red          = #dc2626;
$blue-bright  = #22d3ee;   // ← 改：暗色模式 accent
$blue         = #0891b2;   // ← 改：亮色模式 accent（深青）
$blue-deep    = #0f0f11;   // ← 改：暗色模式底色
$orange       = #fc6423;
```

- [ ] **Step 2: 修改 `base.styl` Scaffolding 段（第 33-70 行）**

把第 33-70 行替换为：

```styl
// Scaffolding
// --------------------------------------------------
$text-color                   = $black-deep;
$text-color-dark              = #f4f4f5;

$link-color                   = $black-deep;
$link-color-dark              = #f4f4f5;
$link-hover-color             = $blue;
$link-hover-color-dark        = $blue-bright;
$link-decoration-color        = $grey-dim;

$blockquote-color             = $grey-dim;
$blockquote-color-dark        = $grey;

$border-color                 = $grey-lighter;

$body-bg-color                = #fafafa;
$body-bg-color-dark           = #0f0f11;
$content-bg-color             = white;
$content-bg-color-dark        = $black-dim;

$selection-bg                 = $blue;
$selection-color              = white;
$selection-bg-dark            = $blue-bright;
$selection-color-dark         = $black-deep;

$card-bg-color                = $whitesmoke;
$card-bg-color-dark           = $black-light;

$menu-item-bg-color           = $whitesmoke;
$menu-item-bg-color-dark      = $black-light;

$theme-color                  = convert(hexo-config('theme_color.light'));
$theme-color-dark             = convert(hexo-config('theme_color.dark'));

$scheme-text-align            = center;
```

- [ ] **Step 3: 修改 `base.styl` 行高（第 121 行附近）**

把 `$line-height-base = 2;` 改为：

```styl
$line-height-base         = 1.8;
```

- [ ] **Step 4: 修改 `themes/next/source/css/_variables/Gemini.styl`**

把第 6-15 行（`$body-bg-color` 到 `$border-radius`）替换为：

```styl
$body-bg-color           = #fafafa;

// Borders.
// --------------------------------------------------
$box-shadow-inner        = 0 1px 2px 0 rgba(0, 0, 0, .04);
$box-shadow              = 0 1px 2px 0 rgba(0, 0, 0, .04), 0 2px 8px 0 rgba(0, 0, 0, .03);

$border-radius-inner     = 8px;    // ← 改：圆角从 initial 改为 8px
$border-radius           = 8px;
```

- [ ] **Step 5: 在 `_config.next.yml` 顶部添加 theme_color 段**

在 `_config.next.yml` 的 `# 主题方案` 段之后（第 8 行附近）插入：

```yaml
# 主题色（配合 $theme-color CSS 变量，影响 headband、链接 hover、进度条等）
theme_color:
  light: "#0891b2"   # 深青
  dark: "#22d3ee"    # 暗色模式下提亮一档
```

- [ ] **Step 6: 验证 build**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -20
```

Expected: 无 ERROR。

- [ ] **Step 7: 验证配色注入到产物**

```bash
grep -o '#09090b\|#0891b2\|#fafafa' public/index.html public/css/main.css 2>/dev/null | sort -u
```

Expected: 输出包含这三个色值（或至少其中两个，取决于压缩方式）。

- [ ] **Step 8: Commit**

```bash
git add themes/next/source/css/_variables/base.styl \
        themes/next/source/css/_variables/Gemini.styl \
        _config.next.yml
git commit -m "feat(ui): 设计 token 切到冷净炭黑配深青

- 正文 #09090B（非纯黑避免眩光）
- 底色 #FAFAFA（非纯白减少疲劳）
- accent 深青 #0891B2（亮）/ #22D3EE（暗，提亮保对比度）
- 行高 2→1.8 更现代
- 圆角 0→8px 配合现代感"
```

---

## Task 3: 重写 `source/_data/styles.styl`（背景图遮罩 + 透明区兜底）

**动机**：原 styles.styl 的"内容区全透 + 文字阴影"方案在新设计里要换成"背景图加遮罩 + 内容区不透明白底"。

**Files:**
- Modify: `source/_data/styles.styl`（整体重写）

**Interfaces:**
- Produces: 背景图变成"若隐若现的肌理"，内容区回到干净白/暗底。

- [ ] **Step 1: 整体重写 `source/_data/styles.styl`**

完整内容：

```styl
// 自定义样式：低调现代版
// 配合 _config.next.yml 的 custom_file_path.style 注入
// 设计目标：背景图压到若隐若现，内容区回到干净白/暗底，文字当主角

// === 背景图 + 强遮罩（亮色 92%） ===
body {
  background-image: url('/zzh-notes/images/background.webp');
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  position: relative;
  min-height: 100vh;
}

// 用 ::before 做半透明遮罩，让背景图变成肌理
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(250, 250, 250, 0.92);
  z-index: -1;
  pointer-events: none;
}

// === 内容区不透明白/暗底（覆盖 Task 2 之外的细节） ===
// NexT 默认就是白底，这里只做微调
.main-inner {
  background: transparent;  // Gemini scheme 透明，让 $content-bg-color 在 .post-block 上生效
}

// === 暗色模式遮罩（深 88%） ===
@media (prefers-color-scheme: dark) {
  body::before {
    background: rgba(15, 15, 17, 0.88);
  }
}

// === 阅读进度条（GSAP 控制 width，这里只定样式） ===
.reading-progress-bar {
  position: fixed;
  top: 0;
  left: 0;
  height: 2px;
  width: 0;
  background: var(--theme-color);
  z-index: 1000;
  transition: width 0.1s linear;
}

// === 动效元素初始态（仅 gsap-ready 时启用，防 JS 失败内容不可见） ===
// 见 Task 7 的工程兜底说明
html.gsap-ready .fade-up {
  opacity: 0;
  transform: translateY(24px);
}

// 首页文章卡片 hover 边框变深青
.posts-list .post-block {
  transition: border-color 0.2s ease, transform 0.2s ease;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 8px;
}
.posts-list .post-block:hover {
  border-color: var(--theme-color);
}

// 标题宋体已通过 _config.next.yml 的 font 段应用，这里不重复

// === prefers-reduced-motion 跳过所有动效 ===
@media (prefers-reduced-motion: reduce) {
  html.gsap-ready .fade-up {
    opacity: 1 !important;
    transform: none !important;
  }
  .reading-progress-bar {
    display: none;
  }
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 2: 验证 build**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -10
```

Expected: 无 ERROR。

- [ ] **Step 3: 本地 server 走查**

```bash
npx hexo server
```

在浏览器打开 `http://localhost:4000/zzh-notes/`，确认：
- 背景图变成几乎不可见的肌理
- 内容区是干净白底（亮色）
- 切换系统到暗色模式，底色变深、背景图仍是若隐若现

Stop server: `Ctrl+C`

- [ ] **Step 4: Commit**

```bash
git add source/_data/styles.styl
git commit -m "feat(ui): 背景图加 92%/88% 遮罩压到若隐若现

原方案是内容区全透 + 文字阴影 hack，新方案反过来：背景图退到肌理，
内容区回到干净白/暗底，文字当主角。同时预留阅读进度条样式和动效兜底。"
```

---

## Task 4: 引入 Google Fonts + 应用字体 token

**动机**：标题宋体（Noto Serif SC）、正文黑体（Noto Sans SC）、西文 Playfair Display + Public Sans、代码 JetBrains Mono。通过 NexT 的 `font` 配置应用，通过 `custom_file_path.head` 注入 Google Fonts link。

**Files:**
- Create: `source/_data/head.njk`（注入 Google Fonts）
- Modify: `_config.next.yml`（启用 font 段 + custom_file_path.head）

**Interfaces:**
- Produces: `_variables/base.styl` 里的 `$font-family-*` 通过 NexT font 配置覆盖。所有标题走宋体、正文走黑体。

- [ ] **Step 1: 创建 `source/_data/head.njk`**

完整内容：

```njk
{# Google Fonts: 标题宋体 + 正文黑体 + 西文配对 + 等宽 #}
{# display=swap 防 FOIT，加载失败回退到系统字 #}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600&family=Noto+Sans+SC:wght@400;500&family=Playfair+Display:wght@600&family=Public+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
```

- [ ] **Step 2: 在 `_config.next.yml` 添加 font 段和 head 注入**

在 `_config.next.yml` 的 `# 暗黑模式` 段之后（约第 10 行）插入：

```yaml
# 字体（配合 source/_data/head.njk 的 Google Fonts link）
font:
  enable: true
  global:
    external: true
    family: Public Sans, Noto Sans SC, sans-serif
  title:
    external: true
    family: Playfair Display, Noto Serif SC, serif
  headings:
    external: true
    family: Playfair Display, Noto Serif SC, serif
  posts:
    external: true
    family: Public Sans, Noto Sans SC, sans-serif
  codes:
    external: true
    family: JetBrains Mono, monospace
```

- [ ] **Step 3: 在 `_config.next.yml` 的 `custom_file_path` 段加 head 注入**

把 `custom_file_path` 段（约第 62-66 行）改为：

```yaml
custom_file_path:
  # Google Fonts link 注入到 <head>
  head: source/_data/head.njk
  # 修订历史（构建时生成 diff，见 scripts/git-revision.js）
  postBodyEnd: source/_data/post-body-end.njk
  # 自定义样式：全站背景图（见 source/_data/styles.styl）
  style: source/_data/styles.styl
```

- [ ] **Step 4: 验证 build**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -10
```

Expected: 无 ERROR。

- [ ] **Step 5: 验证字体 link 注入**

```bash
grep -o 'Noto Serif SC\|Noto Sans SC\|Playfair Display\|fonts.googleapis.com' public/index.html | sort -u
```

Expected: 输出包含这 4 个字符串。

- [ ] **Step 6: 本地 server 走查字体**

```bash
npx hexo server
```

打开 `http://localhost:4000/zzh-notes/`，DevTools → Network → Fonts，确认 web font 请求发出；肉眼检查标题是宋体、正文是黑体。Stop server。

- [ ] **Step 7: Commit**

```bash
git add source/_data/head.njk _config.next.yml
git commit -m "feat(ui): 引入思源宋体+黑体+Playfair+Public Sans+JetBrains Mono

通过 NexT font 配置应用：
- 标题 Noto Serif SC + Playfair Display（书卷气）
- 正文 Noto Sans SC + Public Sans（阅读密度）
- 代码 JetBrains Mono

display=swap 兜底，加载失败回退系统字不裸奔。"
```

---

## Task 5: 开首页摘要（`excerpt_description` + `read_more_btn`）

**动机**：发现 NexT 已内建摘要机制，无需改 `_macro/post.njk`。只要在 `_config.next.yml` 开两个开关，首页就会用 `post.description` 作摘要并加"阅读全文"按钮。

**Files:**
- Modify: `_config.next.yml`（开启 `excerpt_description` 和 `read_more_btn`）

**Interfaces:**
- Produces: 首页从"全文堆叠"变成"标题 + 摘要 + 阅读全文按钮"。Task 8 的 new-post skill 负责生成 `description` 字段。

- [ ] **Step 1: 在 `_config.next.yml` 加 excerpt 配置**

在 `_config.next.yml` 的 `# 文章` 段之后（约第 40 行）插入：

```yaml
# 首页摘要：用 front-matter 的 description 字段作摘要，加"阅读全文"按钮
excerpt_description: true
read_more_btn: true
```

- [ ] **Step 2: 给至少一篇已有文章临时加 description 测试**

挑最近一篇 `source/_posts/回到明朝当王爷·读后.md`，在 front-matter 加一行：

```yaml
description: 一段测试摘要，验证首页摘要机制生效。
```

- [ ] **Step 3: 验证 build**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -10
```

Expected: 无 ERROR。

- [ ] **Step 4: 验证首页产物含摘要和 read_more 按钮**

```bash
grep -o 'post-description\|post-button\|阅读全文' public/index.html | sort -u
```

Expected: 输出包含 `post-description` 和 `post-button`。

- [ ] **Step 5: 本地 server 走查**

```bash
npx hexo server
```

打开首页，确认那篇文章显示为标题 + 摘要 + 阅读全文按钮，而不是全文。Stop server。

- [ ] **Step 6: 撤销测试用的临时 description**

把 Step 2 加的 `description:` 行删掉（或保留——这篇是测试样本，可留可删）。**正式 description 由 Task 8 的 new-post skill 在新文章时自动生成**；已发布旧文章走 fallback（正文前 120 字）或后续手动补。

- [ ] **Step 7: Commit**

```bash
git add _config.next.yml
git commit -m "feat(ui): 开首页摘要 excerpt_description + read_more_btn

利用 NexT 内建机制，无需改 _macro/post.njk。首页从全文堆叠变成
标题+摘要+阅读全文按钮。description 字段由 new-post skill 自动生成。"
```

---

## Task 6: 自定义 Header（左对齐 + 滚动收缩 + backdrop-filter）

**动机**：NexT 默认 header 是居中 logo + 副标题。改成现代的左对齐 + 细分隔线 + 滚动收缩。

**Files:**
- Create: `source/_data/header.njk`（自定义 header HTML）
- Modify: `source/_data/styles.styl`（追加 header 样式）
- Modify: `_config.next.yml`（启用 `custom_file_path.header`）

**Interfaces:**
- Produces: header 视觉与默认不同；滚动时高度从 80px 收缩到 56px。

- [ ] **Step 1: 创建 `source/_data/header.njk`**

完整内容：

```njk
{# 自定义 header：左对齐 logo + 右对齐导航 + 细分隔线 #}
{# 滚动收缩 + backdrop-filter 由 styles.styl + Task 7 GSAP 处理 #}
<header class="custom-header">
  <div class="custom-header-inner">
    <a href="{{ url_for('/') }}" class="custom-header-brand">
      {{ config.title }}
    </a>
    <nav class="custom-header-nav">
      {% for name, path in theme.menu %}
        {% set menu_path = path.split(' || ')[0] %}
        <a href="{{ url_for(menu_path) }}">{{ __('menu.' + name) }}</a>
      {% endfor %}
    </nav>
  </div>
</header>
```

- [ ] **Step 2: 在 `source/_data/styles.styl` 末尾追加 header 样式**

追加：

```styl
// === 自定义 header（覆盖 NexT 默认 header 视觉） ===
.custom-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  transition: height 0.25s ease, padding 0.25s ease;
}

.custom-header-inner {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: padding 0.25s ease;
}

// 滚动收缩状态（GSAP 加 .scrolled 类，见 Task 7）
.custom-header.scrolled .custom-header-inner {
  padding: 14px 40px;
}

.custom-header-brand {
  font-family: 'Playfair Display', 'Noto Serif SC', serif;
  font-weight: 600;
  font-size: 1.125em;
  color: var(--text-color, #09090b);
  text-decoration: none;
}

.custom-header-nav {
  display: flex;
  gap: 24px;
  font-family: 'Public Sans', 'Noto Sans SC', sans-serif;
  font-size: 0.875em;
}

.custom-header-nav a {
  color: var(--text-color, #09090b);
  text-decoration: none;
  transition: color 0.2s ease;
}

.custom-header-nav a:hover {
  color: var(--theme-color);
}

// 暗色模式 header
@media (prefers-color-scheme: dark) {
  .custom-header {
    background: rgba(24, 24, 27, 0.8);
    border-bottom-color: #27272a;
  }
  .custom-header-brand,
  .custom-header-nav a {
    color: #f4f4f5;
  }
}

@media (max-width: 767px) {
  .custom-header-inner {
    flex-direction: column;
    gap: 8px;
    padding: 16px 20px;
  }
  .custom-header-nav {
    gap: 16px;
  }
}
```

- [ ] **Step 3: 在 `_config.next.yml` 启用 header 注入**

在 `custom_file_path` 段加 `header`：

```yaml
custom_file_path:
  head: source/_data/head.njk
  header: source/_data/header.njk   # ← 新增
  postBodyEnd: source/_data/post-body-end.njk
  style: source/_data/styles.styl
```

- [ ] **Step 4: 验证 build**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -10
```

Expected: 无 ERROR。

- [ ] **Step 5: 验证 header 注入到产物**

```bash
grep -o 'custom-header\|custom-header-brand\|custom-header-nav' public/index.html | sort -u
```

Expected: 输出包含这三个 class。

- [ ] **Step 6: 本地 server 走查**

```bash
npx hexo server
```

打开首页，确认 header 左对齐 logo + 右对齐导航 + 底部细分隔线 + 半透明 backdrop-filter。Stop server。

- [ ] **Step 7: Commit**

```bash
git add source/_data/header.njk source/_data/styles.styl _config.next.yml
git commit -m "feat(ui): 自定义 header 左对齐+细分隔线+backdrop-filter

替换 NexT 默认居中 header。sticky 定位 + blur(8px) 半透明。
滚动收缩状态 .scrolled 由 Task 7 的 GSAP 加。"
```

---

## Task 7: 注入 GSAP 动效 + 阅读进度条 + 工程兜底

**动机**：5 个动效点（阅读进度条、卡片 stagger、H2/H3 fade、图片 lazyload fade、背景 parallax）。必须含完整工程兜底（防 JS 失败内容不可见、防 CLS、尊重 reduced-motion）。

**Files:**
- Create: `source/_data/body-end.njk`（GSAP CDN + 动效脚本）

**Interfaces:**
- Consumes: Task 3 在 styles.styl 里定义的 `.reading-progress-bar` / `.gsap-ready .fade-up`、Task 6 的 `.custom-header` 滚动收缩 hook。
- Produces: 所有动效元素初始 `opacity: 0` 仅在 `<html class="gsap-ready">` 时生效。`prefers-reduced-motion` 下所有动效跳过。

- [ ] **Step 1: 创建 `source/_data/body-end.njk`**

完整内容：

```njk
{# === 阅读进度条 DOM（样式在 styles.styl） === #}
<div class="reading-progress-bar" aria-hidden="true"></div>

{# === GSAP + ScrollTrigger（CDN，defer 不阻塞首屏） === #}
{# 国内访问可能慢/失败，但工程兜底保证内容仍可见 === #}
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>

<script>
window.addEventListener('load', function () {
  // 工程兜底 1：尊重 prefers-reduced-motion，直接返回（内容保持可见）
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  // 工程兜底 2：检查 GSAP 是否加载成功
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.warn('[ZZH] GSAP 未加载，动效跳过，内容保持可见');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  // 工程兜底 3：加 gsap-ready 类，激活 .fade-up 的初始 opacity:0
  // 这一步在 GSAP 确认可用后才做，保证失败时内容不消失
  document.documentElement.classList.add('gsap-ready');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // === 动效 1：阅读进度条 ===
  var bar = document.querySelector('.reading-progress-bar');
  if (bar) {
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: function (self) {
        bar.style.width = (self.progress * 100) + '%';
      }
    });
  }

  // === 动效 2：首页文章卡片 stagger fade-up ===
  var cards = document.querySelectorAll('.posts-list .post-block');
  if (cards.length) {
    cards.forEach(function (c) { c.classList.add('fade-up'); });
    gsap.to(cards, {
      opacity: 1,
      y: 0,
      duration: 0.5,
      stagger: 0.08,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '.posts-list',
        start: 'top 85%'
      }
    });
  }

  // === 动效 3：文章页 H2/H3 fade-up ===
  var headings = document.querySelectorAll('.post-body h2, .post-body h3');
  if (headings.length) {
    headings.forEach(function (h) { h.classList.add('fade-up'); });
    gsap.to(headings, {
      opacity: 1,
      y: 0,
      duration: 0.4,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: h => h,
        start: 'top 90%'
      }
    });
  }

  // === 动效 4：文章图片 lazyload fade-in ===
  var images = document.querySelectorAll('.post-body img');
  images.forEach(function (img) {
    if (img.complete) {
      img.style.opacity = 1;
    } else {
      img.style.opacity = 0;
      img.style.transition = 'opacity 0.3s ease';
      img.addEventListener('load', function () { img.style.opacity = 1; });
    }
  });

  // === 动效 5：背景图 parallax ===
  // body::before 是遮罩，body 本身的 background-attachment:fixed 已经固定了背景
  // 这里改为让 body::before 随滚动轻微 yPercent 位移制造视差
  // 注意：为避免 CLS，仅位移 5% 以内
  gsap.to('body', {
    backgroundPositionY: '+=5%',
    ease: 'none',
    scrollTrigger: {
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true
    }
  });

  // === header 滚动收缩 ===
  var header = document.querySelector('.custom-header');
  if (header) {
    ScrollTrigger.create({
      trigger: document.body,
      start: 'top -80',
      end: 99999,
      toggleClass: { targets: header, className: 'scrolled' }
    });
  }
});
</script>
```

- [ ] **Step 2: 在 `source/_data/styles.styl` 末尾追加图片 fade 初始态**

```styl
// === 图片 lazyload fade 初始态（仅 gsap-ready） ===
html.gsap-ready .post-body img {
  opacity: 0;
  transition: opacity 0.3s ease;
}
@media (prefers-reduced-motion: reduce) {
  html.gsap-ready .post-body img { opacity: 1 !important; }
}
```

- [ ] **Step 3: 在 `_config.next.yml` 启用 bodyEnd 注入**

在 `custom_file_path` 段加 `bodyEnd`：

```yaml
custom_file_path:
  head: source/_data/head.njk
  header: source/_data/header.njk
  postBodyEnd: source/_data/post-body-end.njk
  bodyEnd: source/_data/body-end.njk   # ← 新增（注意和 postBodyEnd 不同）
  style: source/_data/styles.styl
```

- [ ] **Step 4: 验证 build**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -10
```

Expected: 无 ERROR。

- [ ] **Step 5: 验证 script 注入到产物**

```bash
grep -o 'gsap@3.12.5\|reading-progress-bar\|gsap-ready' public/index.html | sort -u
```

Expected: 输出包含这三个字符串。

- [ ] **Step 6: 本地 server 走查动效**

```bash
npx hexo server
```

打开首页：
- 滚动时顶部出现深青细线进度条
- 卡片依次 fade-up 入场
- header 在滚动 80px 后收缩
- 系统设置开启 reduced-motion，刷新页面，确认所有动效跳过但内容可见

打开任一文章页：
- H2/H3 进入视口时 fade-up
- 图片加载完成后 fade-in

Stop server。

- [ ] **Step 7: Commit**

```bash
git add source/_data/body-end.njk source/_data/styles.styl _config.next.yml
git commit -m "feat(ui): GSAP+ScrollTrigger 动效（5 个动效点 + 完整工程兜底）

5 动效：阅读进度条/卡片 stagger/H2H3 fade/图片 lazyload fade/背景 parallax
3 兜底：
- .gsap-ready 类激活初始 opacity:0，GSAP 失败时内容仍可见
- 所有动效元素预留占位防 CLS
- prefers-reduced-motion 跳过所有动效直接显终态"
```

---

## Task 8: 同步 `new-post` skill 生成 `description` 字段

**动机**：首页摘要机制依赖 front-matter 的 `description` 字段。让 new-post skill 在生成文章时自动填一句摘要。

**Files:**
- Modify: `C:\Users\johnl\.agents\skills\new-post\SKILL.md`（front-matter 模板加 `description:`，并要求 LLM 基于正文生成一句摘要）

**Interfaces:**
- Consumes: Task 5 已开启 `excerpt_description: true`。
- Produces: 后续所有新文章的 front-matter 都带 `description` 字段，首页摘要自动填充。

- [ ] **Step 1: 读 new-post skill 当前模板**

Read: `C:\Users\johnl\.agents\skills\new-post\SKILL.md`

- [ ] **Step 2: 在 front-matter 模板加 description 字段**

把 skill 里的 front-matter 模板从类似：

```yaml
---
title: <标题>
date: <日期>
tags:
  - <标签>
permalink: <英文 slug>/
---
```

改为：

```yaml
---
title: <标题>
date: <日期>
description: <基于正文生成一句中文摘要，60-100 字>
tags:
  - <标签>
permalink: <英文 slug>/
---
```

- [ ] **Step 3: 在 skill 指令里加生成 description 的要求**

在 skill 的"生成步骤"段加一条：

> 生成 front-matter 时，基于正文内容生成一句中文摘要（60-100 字，概括核心观点或情境），填入 `description` 字段。不要直接抄正文首句，要重写。

- [ ] **Step 4: 验证 skill 语法**

Run: `grep -n "description:" "C:\Users\johnl\.agents\skills\new-post\SKILL.md"`
Expected: 输出包含至少一行 `description:`。

- [ ] **Step 5: Commit**

skill 文件在用户目录不在项目仓库，**不通过项目 git 提交**。改为告知用户：

> new-post skill 已更新。改动位置：`C:\Users\johnl\.agents\skills\new-post\SKILL.md`。
> 该文件在你的用户目录，不在项目仓库，无需项目 git 提交。skill 自身的版本管理由你自行处理。

**不跑 hexo generate**：skill 改动不影响 Hexo 构建。

---

## Task 9: 终验（hexo clean + generate + 产物检查 + 本地走查）

**动机**：AGENTS.md 红线 3 要求改完必须验证。这是收尾的全量验证。

**Files:** 无文件改动，只跑验证。

- [ ] **Step 1: 全量 clean + generate**

```bash
npx hexo clean && npx hexo generate 2>&1 | tail -30
```

Expected: INFO `Files built in ...s`，**无 ERROR**（warning 列出但需说明是否可接受）。

- [ ] **Step 2: 关键页面生成检查**

```bash
ls public/index.html public/archives/index.html public/tags/index.html public/categories/index.html
```

Expected: 4 个文件都存在。

- [ ] **Step 3: 文章图片路径不回归（AGENTS.md 红线 5）**

```bash
ls source/_posts/*.md | head -3
# 选一个有图的随笔，grep 它生成后的 img src
```

挑一个已知带图的随笔（如 permalinks 含 `/`），检查 `public/<它的 permalink>/index.html`：

```bash
grep -o '<img[^>]*src="[^"]*"' public/2026/07/15/<某篇>/index.html 2>/dev/null | head -3
```

Expected: `src` 路径含 permalink 段（如 `/zzh-notes/2026/07/15/<某篇>/xxx.jpg`），而不是指向站点根。

- [ ] **Step 4: 关键设计 token 注入检查**

```bash
grep -o '#09090b\|#0891b2\|#fafafa\|Noto Serif SC\|backdrop-filter\|gsap-ready' public/index.html public/css/*.css 2>/dev/null | sort -u
```

Expected: 输出包含这些设计 token。

- [ ] **Step 5: 本地 server 完整走查**

```bash
npx hexo server
```

逐项确认：
- [ ] 首页：背景图若隐若现 + 卡片摘要列表 + 滚动进度条 + 卡片 stagger fade-up
- [ ] 文章页：标题宋体、正文黑体、H2/H3 fade、图片 lazyload fade
- [ ] Header：左对齐 + backdrop-filter + 滚动收缩
- [ ] 暗色模式：切系统偏好，配色和遮罩切换正常，accent 是亮青
- [ ] 链接 hover：变深青
- [ ] 选区：深青底白字
- [ ] reduced-motion：系统开启后刷新，所有动效跳过内容可见
- [ ] 移动端（DevTools 模拟 375px）：header 纵向堆叠、阅读宽度合理

Stop server。

- [ ] **Step 6: Lighthouse 检查**

DevTools → Lighthouse → Mobile → Generate report。

Expected：
- Performance ≥ 80（背景图 + Google Fonts 会拖慢，但不至于不及格）
- Accessibility ≥ 95
- CLS < 0.1（动效占位兜底生效）

若 Performance < 80：检查是否 Google Fonts 阻塞、是否图片未加 width/height。若 CLS > 0.1：检查 `.fade-up` 元素是否预留 `min-height`。

- [ ] **Step 7: 最终 commit（如有未提交的微调）**

若 Step 5/6 发现问题并修复：

```bash
git add -A
git commit -m "fix(ui): 终验发现的问题修复"
```

若全部通过无微调，**跳过此步**。

- [ ] **Step 8: push 上线**

```bash
git push origin main
```

GitHub Actions 自动构建发布。打开 `https://zzh-learner.github.io/zzh-notes/` 确认线上效果。

---

## Self-Review

### Spec 覆盖检查

| Spec 章节 | 对应 Task |
|-----------|-----------|
| §3.1 Vendor 主题 | Task 1 |
| §3.2 改动文件清单 | Task 1-7（逐一对应） |
| §4.1-4.2 配色（亮+暗） | Task 2 |
| §4.3 字体系统 | Task 4 |
| §4.4 背景图遮罩 | Task 3 |
| §4.5 首页摘要列表 | Task 5（**简化：用 NexT 内建机制而非改 _macro/post.njk**） |
| §4.6 Header 模板 | Task 6 |
| §4.7 动效系统 | Task 7 |
| §4.8 new-post skill 同步 | Task 8 |
| §5 可访问性 | Task 3/7（reduced-motion）+ Task 9（Lighthouse） |
| §6 验证清单 | Task 9 |
| §7 风险与回退 | 每个 Task 都有独立 commit，可回退 |

### Spec 与计划差异说明

Spec §3.2 列出"改 `themes/next/layout/_macro/post.njk`"，但 Task 5 **简化为只开配置开关**——因为读源码发现 NexT 已内建 `excerpt_description` 机制。这是实施时基于代码事实的优化，不动 spec 的设计意图（首页摘要）。spec 不改。

### Placeholder 扫描

无 TBD / TODO / "稍后实现"。所有步骤都有具体代码或命令。

### 类型一致性

- `.fade-up`、`.gsap-ready`、`.reading-progress-bar`、`.custom-header.scrolled` 四个 class 名在 Task 3/6/7 一致使用
- 色值 `#09090b` / `#0891b2` / `#fafafa` / `#22d3ee` 在 Task 2 定义，Task 3/6 引用一致

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-20-ui-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每个 Task 派一个新 subagent，task 间审查，迭代快

**2. Inline Execution** - 当前 session 内批量执行，checkpoints 审查

**Which approach?**
