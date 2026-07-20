# 设计文档：UI 重设计（低调 · 内涵 · 现代）

- **日期**：2026-07-20
- **作者**：ZZH（与 ZCode brainstorming 协作）
- **状态**：已定稿，待用户审阅后进入实施计划
- **前置阅读**：`AGENTS.md`（红线规则）、`docs/superpowers/specs/2026-06-23-zzh-notes-blog-design.md`

---

## 1. 目标与动机

把现有"背景图全透 + 文字阴影 hack"的视觉基调，切换为**低调、富有内涵、现代化**的设计。具体含义：

- **低调**：视觉让位给文字。背景、装饰、动效都不喧宾夺主
- **内涵**：用克制的配色和带书卷气的字体传递"随笔/读书"的气质，而非科技感
- **现代**：杂志式首页摘要、干净的 header、有节制的滚动动效

**非目标**（沿用 AGENTS.md）：

- 不接评论、不接统计、不做 CMS
- 不改变写作流程（仍走 `new-post` skill → git push → GitHub Actions）

---

## 2. 关键决策汇总

经 brainstorming 9 次提问对齐：

| # | 决策点 | 选择 |
|---|--------|------|
| 1 | 背景图 | 保留 `background.webp`，但加 92%/88% 遮罩压到若隐若现 |
| 2 | 配色基调 | 冷净感 · 炭黑配深青（Swiss Modernism 路数） |
| 3 | 中文字体 | 标题宋体（Noto Serif SC） + 正文黑体（Noto Sans SC） |
| 4 | 改动范围 | 深度改主题（动 styl + njk） |
| 5 | 落地方式 | Vendor `node_modules/hexo-theme-next/` 到 `themes/next/` |
| 6 | 阅读密度 | 中版中排，正文宽 700px、行高 1.8 |
| 7 | 执行风格 | 方案 C 重度版（首页摘要 + header 模板 + GSAP 动效） |
| 8 | 摘要来源 | `new-post` skill 自动生成 `description` 字段写入 front-matter |
| 9 | 动效强度 | 重度（GSAP + ScrollTrigger，5 个动效点 + 完整工程兜底） |

---

## 3. 落地架构

### 3.1 Vendor 主题到仓库

**动机**：NexT 通过 npm 装在 `node_modules/hexo-theme-next/`，直接改源码会被 `npm install` 覆盖、CI 重建丢失。Vendor 到仓库后所有改动进 git，可控可回溯。

**步骤**：

1. 把 `node_modules/hexo-theme-next/` 整目录复制到 `themes/next/`
2. 从 `package.json` 的 `dependencies` 移除 `hexo-theme-next`
3. `_config.yml` 的 `theme: next` 不动——Hexo 优先读取本地 `themes/<name>/`，会自动命中
4. `.gitignore` 确认没有忽略 `themes/`

**与红线 2 的关系**：AGENTS.md 红线 2"依赖清单不要精简"是针对**功能依赖**（renderer/generator/css 工具链），而 `hexo-theme-next` 是**主题文件**换形态（npm → vendor），其余 13 个依赖一个不动。这是合规的形态变更，不是"精简"。

**升级路径**：将来 NexT 有更新，手动复制新版 `node_modules/hexo-theme-next/` 到 `themes/next/`，解冲突本次改过的 5-8 个 styl/njk 文件。

### 3.2 改动文件清单

| 文件 | 改动 | 说明 |
|------|------|------|
| `themes/next/source/css/_variables/base.styl` | 改色值/字号/字体 token | 设计 token 总入口 |
| `themes/next/source/css/_variables/Gemini.styl` | 改 Gemini scheme 专属变量 | 配合新配色 |
| `themes/next/source/css/_schemes/Gemini/index.styl` | 改 scheme 实现 | header/sidebar 圆角、阴影、边框 |
| `themes/next/layout/_macro/post.njk` | 改首页文章宏 | 全文 → 摘要卡片 |
| `source/_data/styles.styl` | 重写 | 背景图遮罩 + 新 token 应用 |
| `source/_data/header.njk`（新建） | 自定义 header | 左对齐 logo + 细分隔线 + 滚动收缩 |
| `source/_data/head.njk`（新建） | 注入 Google Fonts link | `display=swap` 防 FOIT |
| `source/_data/body-end.njk`（新建） | 注入 GSAP script | 阅读进度条 + 动效 |
| `_config.next.yml` | 改 `theme_color` / `font` / `custom_file_path` | 启用新 token 和自定义文件 |
| `package.json` | 移除 `hexo-theme-next` | vendor 化 |
| `new-post` skill（SKILL.md） | front-matter 加 `description` | 由 skill 自动生成摘要 |

---

## 4. 设计规格

### 4.1 配色（亮色模式）

底色 `#FAFAFA`（非纯白，长时间阅读不累），正文 `#09090B`（非纯黑，避免对比眩光），深青 accent `#0891B2`（ui-ux-pro-max 数据库验证过的 WCAG 合格 accent）。

| 用途 | 色值 | NexT 变量 |
|------|------|-----------|
| 页面底 | `#FAFAFA` | `$body-bg-color` |
| 内容卡片底 | `#FFFFFF` | `$content-bg-color` |
| 正文 | `#09090B` | `$text-color` |
| 次要文字（meta、日期） | `#52525B` | 新增 `$text-color-secondary` |
| 边框 | `#E4E4E7` | `$border-color` |
| 链接默认 | `#09090B` + 下划线 | `$link-color` |
| 链接 hover | `#0891B2` 深青 | `$link-hover-color` |
| **主题色（accent）** | `#0891B2` | `$theme-color` + `theme_color.light` |
| 选区 | 深青底 + 白字 | `$selection-bg/color` |

### 4.2 配色（暗色模式）

保留 `prefers-color-scheme: dark` 自动切换。accent 从 `#0891B2` 提亮到 `#22D3EE`，因为深青在暗底上对比度不达标。

| 用途 | 色值 | NexT 变量后缀 |
|------|------|---------------|
| 页面底 | `#0F0F11` | `-dark` |
| 卡片底 | `#18181B` | `-dark` |
| 正文 | `#F4F4F5` | `-dark` |
| 次要文字 | `#A1A1AA` | `-dark` |
| 边框 | `#27272A` | `-dark` |
| 链接 hover / accent | `#22D3EE` | `-dark` |

### 4.3 字体系统

**中文**

| 元素 | 字体 | 字重 | 字号 |
|------|------|------|------|
| 文章标题 / H1-H6 / 站点 logo | Noto Serif SC（思源宋体） | 600 | H1 2em，逐级 -0.125em |
| 正文 / 段落 / 列表 | Noto Sans SC（思源黑体） | 400 | 1em (16px) |
| 代码块 / inline code | JetBrains Mono | 400 | 0.875em |

**西文**（混排时西文优先，浏览器按字符回退到中文）

| 元素 | 字体 |
|------|------|
| 标题西文 | Playfair Display 600 |
| 正文西文 | Public Sans 400 |

**font-family 链**（`themes/next/source/css/_variables/base.styl`）

```styl
$font-family-chinese  = 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei'
$font-family-base     = 'Public Sans', $font-family-chinese, sans-serif
$font-family-headings = 'Playfair Display', 'Noto Serif SC', $font-family-chinese, serif
$font-family-posts    = 'Public Sans', 'Noto Sans SC', $font-family-chinese, sans-serif
$font-family-monospace = 'JetBrains Mono', consolas, Menlo, monospace
```

**加载方式**：通过 `source/_data/head.njk` 注入 Google Fonts CSS2 `<link>`，加 `display=swap` 防 FOIT。中文字体文件大，`display=swap` 让系统字先显示，web font 加载完后替换。

**行高**：`$line-height-base` 从 NexT 默认 `2` 调到 `1.8`。

### 4.4 背景图（保留但压低）

`source/images/background.webp` 保留。在 `source/_data/styles.styl` 里：

```styl
body {
  background-image: url('/zzh-notes/images/background.webp');
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
  position: relative;
}
body::before {
  content: '';
  position: fixed; inset: 0;
  background: rgba(250, 250, 250, 0.92);  // 亮色遮罩 92%
  z-index: -1;
}
@media (prefers-color-scheme: dark) {
  body::before { background: rgba(15, 15, 17, 0.88); }  // 暗色遮罩 88%
}
```

背景图在遮罩下变成"几乎看不见的肌理"，只在屏幕边缘若隐若现。

### 4.5 首页摘要列表

**改造前**：NexT 默认首页每篇文章全文输出，首页变成超长滚动条。

**改造后**：杂志式摘要卡片。改 `themes/next/layout/_macro/post.njk`，首页循环只渲染：

```
┌──────────────────────────────────────────┐
│  回到明朝当王爷·读后                      │ ← 标题（Noto Serif SC，hover 变深青）
│  2026-07-15 · #读书 #小说                 │ ← 日期 + tag（次要灰）
│                                           │
│  一段一两句的摘要，最多三行，
│  超出 ellipsis。由 new-post skill 自动
│  生成并写入 front-matter 的 description。  │ ← 摘要（Public Sans，正文灰）
│                                           │
│  阅读全文 →                                │ ← hover 链接
└──────────────────────────────────────────┘
        ↕ 32px 卡片间距
```

**摘要取值优先级**：`page.description` > `page.excerpt`（`<!-- more -->` 截断）> 正文前 120 字 fallback。

**卡片样式**：浅灰底 + 1px 细边框 + 8px 圆角，hover 时边框变深青。文章详情页（`post.njk`）保持原样。

### 4.6 Header 自定义模板

**改造前**：NexT 默认 header 居中 logo + 副标题。

**改造后**（`source/_data/header.njk`，通过 `_config.next.yml` 的 `custom_file_path.header` 注入）：

```
┌─────────────────────────────────────────────────────────┐
│  ZZH 的随笔        首页  归档  标签  分类  RSS          │
├─────────────────────────────────────────────────────────┤
│                       1px 细分隔线                       │
```

- logo 区左对齐（宋体），导航右对齐（黑体小号）
- 滚动时 header 收缩（高度 80px → 56px），加 `backdrop-filter: blur(8px)` 半透明
- 暗色模式 header 背景 `rgba(24,24,27,0.8)`

### 4.7 动效系统（GSAP + ScrollTrigger）

**加载方式**：CDN 引入 GSAP 3 + ScrollTrigger，通过 `source/_data/body-end.njk` 注入 `<script defer>`。不阻塞首屏。

**5 个动效点**：

| # | 元素 | 动效 | 触发 |
|---|------|------|------|
| 1 | 顶部阅读进度条 | 2px 深青细线，宽度跟随滚动进度 | 滚动时实时 |
| 2 | 首页文章卡片 | stagger `fade-up`（y:24, opacity:0→1, 每张延迟 0.08s） | 卡片进入视口 |
| 3 | 文章页 H2/H3 | `fade-up` + 轻微 scale（1.02→1） | 标题进入视口 |
| 4 | 文章图片 | lazyload fade-in（加载完成后 opacity 0→1, 300ms） | 图片 `complete` 事件 |
| 5 | 背景图 parallax | 背景图随滚动轻微位移（yPercent 0→15） | 滚动时 |

**工程兜底**（硬性要求，ui-ux-pro-max pre-delivery checklist）：

1. **防 JS 失败导致内容不可见**：fade-up 元素的初始 `opacity: 0` 只在 GSAP 加载成功后注入。实现：
   ```js
   document.documentElement.classList.add('gsap-ready');
   ```
   ```css
   .gsap-ready .fade-up { opacity: 0; }
   ```
2. **防 CLS**：所有动效元素预留 `min-height` 占位
3. **可访问性**：`@media (prefers-reduced-motion: reduce)` 下所有动效跳过，直接显示终态
4. **首屏不动**：above-the-fold 内容不做入场动效，避免 LCP 恶化

### 4.8 new-post skill 同步更新

`new-post` skill 的 SKILL.md front-matter 模板增加 `description:` 字段。skill 在生成文章时，基于正文内容自动生成一句中文摘要（约 60-100 字）填入。

**已发布旧文章处理**：
- 留空 `description`，首页 fallback 到正文前 120 字
- 不强制批量补（避免一次性改大量文章触发不必要的 git diff）
- 后续每次发新文章自然积累，旧文章有空再补

---

## 5. 可访问性硬要求

- 所有文字对比度过 WCAG AA（正文 4.5:1，大字 3:1）
  - 亮色 `#09090B` on `#FAFAFA` ≈ 19:1 ✓
  - 暗色 `#F4F4F5` on `#0F0F11` ≈ 18:1 ✓
  - 深青 `#0891B2` on `#FAFAFA` ≈ 5.4:1 ✓（AA 大字合格，正文刚好合格）
- 所有可点击元素保留焦点环（`:focus-visible` 不删）
- `prefers-reduced-motion` 尊重
- 图片 alt 文本保留
- 暗色模式 accent 提亮保证对比度

---

## 6. 验证清单

AGENTS.md 红线 3 要求改完必须验证：

```bash
npx hexo clean && npx hexo generate
```

构建后逐项检查：

- [ ] 无 ERROR（warning 可接受但要列出）
- [ ] `public/index.html` 生成且包含摘要卡片 HTML（不再是全文）
- [ ] `public/archives/index.html` 生成
- [ ] `public/tags/index.html`、`public/categories/index.html` 生成
- [ ] 任选一篇文章页，grep `<img` 的 src 路径仍含 permalink 段（**AGENTS.md 红线 5 不回归**）
- [ ] 文章页 CSS 包含 `Noto Serif SC`、`#0891B2`、`backdrop-filter`
- [ ] 本地 `npx hexo server` 走查：首页/文章页/暗色切换/header 滚动/进度条/卡片入场
- [ ] Lighthouse 移动端：Performance ≥ 80、Accessibility ≥ 95、CLS < 0.1

---

## 7. 风险与回退

### 7.1 已识别风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Vendor 后忘记删 `hexo-theme-next` npm 依赖 | 本地和 themes/ 同时存在，Hexo 优先级混乱 | 实施计划第一步就处理 |
| Google Fonts 在国内加载慢 | 首屏字体回退到系统字，体验降级 | `display=swap` 兜底；后续可换 jsDelivr CDN |
| GSAP CDN 被墙 | 动效失效 | 工程兜底已保证内容仍可见，仅失去动效 |
| 改 `_macro/post.njk` 不熟 | 首页布局错乱 | 先备份，本地 server 走查后才提交 |
| 暗色模式对比度不够 | 部分元素看不清 | accent 已提亮；Lighthouse Accessibility 卡 ≥ 95 |

### 7.2 回退路径

每个改动都基于 git commit。若整体上线后发现问题：

```bash
git revert <ui-redesign-merge-commit>
git push
```

GitHub Actions 自动重新构建发布。`themes/next/` 目录回到 vendor 前状态需要额外 `git rm -r themes/next && npm install hexo-theme-next@^8.21.0`，但走 revert 不需要——revert 会把所有文件改动（含新增的 themes/next/）一并撤销。

---

## 8. 不在本期范围

以下项目明确不在本次改动范围，避免范围蔓延：

- 头像、社交链接、评论、统计（AGENTS.md 非目标）
- 全文搜索的 UI 改造（功能保留，视觉只跟随新 token）
- RSS feed 的内容格式（不动）
- 修订历史 diff 的展示（不动，跟随新 token）
- 多语言、SEO meta、Open Graph（不动）

---

## 9. 下一步

本设计文档定稿并经用户审阅后，调用 `superpowers:writing-plans` skill 把本设计拆解成可执行的实施计划（分阶段、每阶段有验收点）。
