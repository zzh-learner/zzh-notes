# ZZH 的随笔博客 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GitHub Pages 上搭建一个 Hexo + NexT 的个人随笔博客，支持本地写 Markdown → `git push` 自动构建发布。

**Architecture:** Hexo 生成静态站点，NexT 主题提供文字优先的阅读体验与标签/归档/搜索/RSS；GitHub Actions 监听 `main` 分支 push，自动 `hexo generate` 并部署到 Pages。源码与构建产物分离，用户只维护 Markdown 与配置。

**Tech Stack:** Hexo 7.x、hexo-theme-next、Node.js 20 LTS（CI 与本地一致）、GitHub Actions、GitHub Pages。

**站点信息（全文常量，后续任务引用）：**
- GitHub 用户名：`zzh-learner`
- 仓库名：`zzh-notes`
- 线上 URL：`https://zzh-learner.github.io/zzh-notes/`
- 站点 title：`ZZH 的随笔`
- 站点 subtitle：`记录日常灵感与随想`
- 作者：`ZZH`

---

## 文件结构总览

实施完成后仓库结构如下，每个文件单一职责：

```
zzh-notes/
├── .github/workflows/deploy.yml   # CI：自动构建部署（Task 5）
├── .gitignore                     # 忽略构建产物与依赖（Task 1）
├── _config.yml                    # Hexo 站点主配置（Task 2）
├── _config.next.yml              # NexT 主题配置覆盖（Task 3）
├── package.json                   # 依赖锁定（Task 1）
├── package-lock.json             # npm 自动生成（Task 1）
├── README.md                      # 仓库说明 + 写作指南（Task 6）
└── source/
    ├── _posts/
    │   └── hello-world.md         # 示例随笔（Task 4）
    ├── tags/
    │   └── index.md              # 标签页（Task 3）
    ├── categories/
    │   └── index.md              # 分类页（Task 3）
    └── images/                    # 图片资源目录（Task 4）
```

**注**：NexT 主题通过 npm 引入（`hexo-theme-next` 包），不放进 `themes/` 目录，保持仓库干净。Hexo 的"Alternate Theme Config"机制让 `_config.next.yml` 覆盖主题默认配置。

---

## Task 1: 初始化 Hexo 项目骨架与依赖

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: 检查 Node.js 环境**

Run: `node --version`
Expected: 输出 `v20.x.x`（CI 用 Node 20，本地保持一致以避免不一致）。如未安装或版本不符，先装 Node 20 LTS。

- [ ] **Step 2: 手动创建 `package.json`（不使用 `hexo init`，避免拉取多余模板）**

文件内容：

```json
{
  "name": "zzh-notes",
  "version": "1.0.0",
  "private": true,
  "description": "ZZH 的随笔博客 - Hexo + NexT on GitHub Pages",
  "scripts": {
    "build": "hexo generate",
    "clean": "hexo clean",
    "deploy": "hexo deploy",
    "server": "hexo server"
  },
  "hexo": {
    "version": "7.3.0"
  },
  "dependencies": {
    "hexo": "^7.3.0",
    "hexo-cli": "^4.3.1",
    "hexo-theme-next": "^8.21.0",
    "hexo-generator-searchdb": "^1.4.1",
    "hexo-generator-feed": "^3.0.0"
  }
}
```

- [ ] **Step 3: 创建 `.gitignore`**

文件内容（忽略依赖、构建产物、Hexo 缓存/数据库，这些都是可重建的派生物）：

```gitignore
# Dependencies
node_modules/

# Hexo build output
public/

# Hexo database & cache
db.json
.deploy_git/
.cache/

# OS files
Thumbs.db
.DS_Store

# Editor
.vscode/
.idea/

# Logs
*.log
npm-debug.log*
```

- [ ] **Step 4: 安装依赖**

Run: `npm install`
Expected: 安装完成无错误，生成 `package-lock.json` 与 `node_modules/`。可能有 peer dependency 警告，忽略即可（只要不是 error）。

- [ ] **Step 5: 验证 hexo 命令可用**

Run: `npx hexo version`
Expected: 输出 Hexo 版本表（含 `hexo: 7.x.x`、`os: ...`、`node_version` 等），无报错。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: init hexo project skeleton with dependencies"
```

---

## Task 2: 编写 Hexo 站点主配置 `_config.yml`

**Files:**
- Create: `_config.yml`

- [ ] **Step 1: 创建 `_config.yml`**

文件内容（基于 Hexo 默认配置裁剪，只保留本项目需要的项；关键项是 `url` 与 `root`——因为是项目页 `zzh-learner.github.io/zzh-notes/`，必须设 `root: /zzh-notes/`，否则 CSS/JS 资源会 404）：

```yaml
# Hexo Configuration
## https://hexo.io/docs/configuration.html

# Site
title: ZZH 的随笔
subtitle: 记录日常灵感与随想
description: ''
keywords:
author: ZZH
language: zh-CN
timezone: Asia/Shanghai

# URL
## 重点：项目页部署，url 与 root 必须匹配仓库路径
url: https://zzh-learner.github.io/zzh-notes/
permalink: :year/:month/:day/:title/
permalink_defaults:
pretty_urls:
  trailing_index: true
  trailing_html: true

# Directory
source_dir: source
public_dir: public
tag_dir: tags
archive_dir: archives
category_dir: categories
code_dir: downloads/code
i18n_dir: :lang
skip_render:

# Writing
new_post_name: :title.md
default_layout: post
titlecase: false
external_link:
  enable: true
  field: site
  exclude: ''
filename_case: 0
render_drafts: false
post_asset_folder: false
relative_link: false
future: true
syntax_highlighter: highlight.js

# Home page setting
index_generator:
  path: ''
  per_page: 10
  order_by: -date

# Category & Tag
default_category: uncategorized
category_map:
tag_map:

# Metadata elements
meta_generator: true

# Date / Time format
date_format: YYYY-MM-DD
time_format: HH:mm:ss
updated_option: 'mtime'

# Pagination
per_page: 10
pagination_dir: page

# Include / Exclude file(s)
include:
exclude:
ignore:

# Extensions
## 主题通过 npm 引入，这里只写包名
theme: next

# Deployment
## 不用 hexo deploy，改用 GitHub Actions 部署
deploy:
  type: ''

# 搜索插件（hexo-generator-searchdb）
search:
  path: search.xml
  field: post
  content: true
  format: html

# RSS 插件（hexo-generator-feed）
feed:
  enable: true
  type: atom
  path: atom.xml
  limit: 20
  content: true
  content_limit: 140
  content_limit_delim: ' '
```

- [ ] **Step 2: 创建最小的 `source/_posts/` 占位以便构建验证**

Run: `npx hexo new "placeholder-test"`
Expected: 在 `source/_posts/placeholder-test.md` 生成一篇带默认 front-matter 的文章。

- [ ] **Step 3: 试构建，验证配置无误**

Run: `npx hexo generate`
Expected: 控制台输出 `INFO  Files loaded`、`INFO  Generated: ...`、`INFO  X files generated in Ys`，无 ERROR。生成的文件在 `public/`。

- [ ] **Step 4: 本地预览验证**

Run: `npx hexo server`，浏览器打开 `http://localhost:4000/zzh-notes/`（注意 URL 带 root 路径）。
Expected: 首页显示 "ZZH 的随笔" 标题、"记录日常灵感与随想" 副标题，能看到 placeholder-test 文章链接，页面样式正常加载（CSS 未 404）。按 `Ctrl+C` 停止。

- [ ] **Step 5: 删除占位文章**

Run: `npx hexo clean` 然后删除 `source/_posts/placeholder-test.md`（后续 Task 4 会写正式示例文章）。

- [ ] **Step 6: 提交**

```bash
git add _config.yml
git commit -m "feat: add hexo site config with url/root for project pages"
```

---

## Task 3: 配置 NexT 主题与标签/分类页

**Files:**
- Create: `_config.next.yml`
- Create: `source/tags/index.md`
- Create: `source/categories/index.md`

- [ ] **Step 1: 创建 `_config.next.yml`（Hexo 覆盖主题默认配置）**

文件内容（启用标签/分类/归档/搜索/RSS，关闭评论与统计；scheme 用 Gemini——文字优先、最素雅；菜单含首页/归档/标签/分类/RSS）：

```yaml
# NexT 主题覆盖配置
## https://theme-next.js.org/docs/

# 主题方案：Gemini（文字优先，素雅）
scheme: Gemini

# 暗黑模式
darkmode: true

# 菜单
menu:
  home: / || fa fa-home
  archives: /archives/ || fa fa-archive
  tags: /tags/ || fa fa-tags
  categories: /categories/ || fa fa-th
  # RSS 链接（feed 插件生成 atom.xml）
  sitemap: /atom.xml || fa fa-rss

# 侧边栏
sidebar:
  position: left
  display: post

# 头像（暂留空，后续可加）
# avatar: /images/avatar.png

# 社交链接（暂留空）
# social:

# 文章
post_meta:
  item_text: true
  created_at: true
  updated_at:
    enable: true
    another_day: true
  categories: true

# 标签图标
tag_icon: true

# 本地搜索（依赖 hexo-generator-searchdb + _config.yml 的 search 配置）
local_search:
  enable: true
  trigger: auto
  top_n_per_article: 1
  unescape: false
  preload: false

# 评论：关闭（非目标）
comments:
  enable: false

# 统计：关闭（非目标）
busuanzi_count:
  enable: false
```

- [ ] **Step 2: 创建标签聚合页 `source/tags/index.md`**

文件内容（`type: tags` 让 NexT 渲染为标签云页）：

```markdown
---
title: 标签
date: 2026-06-23 00:00:00
type: tags
---
```

- [ ] **Step 3: 创建分类聚合页 `source/categories/index.md`**

文件内容：

```markdown
---
title: 分类
date: 2026-06-23 00:00:00
type: categories
---
```

- [ ] **Step 4: 重新构建验证主题生效**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR，生成的 `public/` 内含 `tags/index.html`、`categories/index.html`、`archives/index.html`、`atom.xml`、`search.xml`。

- [ ] **Step 5: 本地预览验证主题与导航**

Run: `npx hexo server`，打开 `http://localhost:4000/zzh-notes/`。
Expected:
- 页面应用 Gemini 方案样式（有 NexT 的标志性排版，不是默认 Hexo 主题）
- 顶部或侧边菜单出现 首页/归档/标签/分类 项
- 点击「标签」「分类」「归档」均能跳转到对应空页面（暂无文章，正常）
- 页面底部有本地搜索框（NexT 右上角放大镜图标）

按 `Ctrl+C` 停止。

- [ ] **Step 6: 提交**

```bash
git add _config.next.yml source/tags/index.md source/categories/index.md
git commit -m "feat: configure NexT theme with tags/categories/search/rss"
```

---

## Task 4: 编写示例随笔（验证 front-matter 规范与标签）

**Files:**
- Create: `source/_posts/hello-essays.md`
- Create: `source/images/.gitkeep`

- [ ] **Step 1: 创建图片资源目录占位**

创建空文件 `source/images/.gitkeep`（内容为空），让 git 跟踪空目录。内容：

```
（此文件仅用于保留 images 目录，可删除）
```

- [ ] **Step 2: 编写示例随笔 `source/_posts/hello-essays.md`**

文件内容（示范 spec 第 5 节的 front-matter 规范：中文标题、tags、可选 categories、英文 permalink）：

```markdown
---
title: 你好，随笔
date: 2026-06-23 14:30:00
tags:
  - 随笔
  - 开篇
categories:
  - 随想
permalink: hello-essays/
---

这是我的随笔博客的第一篇文章。

之所以想搭这个站，是想给自己一个安静的地方，记录日常冒出来的灵感和随想——可能是一段读书时的感悟，可能是一个偶然的念头，也可能只是某个下午的心情。

这里没有评论区，没有数据统计，也不追求读者。它更像一本公开的笔记本：写给未来的自己，如果偶尔被别人读到，也是一件不错的事。

我会用「标签」来串联相似主题的想法，用「归档」按时间回看。希望你也能找到属于自己的记录方式。
```

- [ ] **Step 3: 重新构建验证文章渲染**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR。

- [ ] **Step 4: 本地预览全面验证**

Run: `npx hexo server`，打开 `http://localhost:4000/zzh-notes/`。
Expected:
- 首页出现「你好，随笔」文章卡片，显示日期、标签「随笔」「开篇」
- 文章 URL 为 `http://localhost:4000/zzh-notes/hello-essays/`（英文 permalink 生效）
- 点击「标签」页可见「随笔」「开篇」两个标签云，点击可筛出该文章
- 点击「分类」页可见「随想」分类
- 顶部搜索框输入「灵感」能搜到这篇文章

按 `Ctrl+C` 停止。

- [ ] **Step 5: 提交**

```bash
git add source/_posts/hello-essays.md source/images/.gitkeep
git commit -m "feat: add first essay post with permalink/tags/categories"
```

---

## Task 5: 编写 GitHub Actions 自动部署 workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: 创建 `.github/workflows/deploy.yml`**

文件内容（监听 main 分支 push → 装 Node 20 + npm 依赖 → `hexo generate` → 用官方 `upload-pages-artifact` + `deploy-pages` 部署。`actions/configure-pages` 会自动注入正确的 `base` 路径）：

```yaml
name: Deploy Hexo to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'source/**'
      - '_config.yml'
      - '_config.next.yml'
      - 'package.json'
      - 'package-lock.json'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# 同一时间只允许一次部署，排队中多余的取消
concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Pages
        id: pages
        uses: actions/configure-pages@v5

      - name: Build with Hexo
        run: npx hexo generate

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./public

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 提交 workflow**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add github actions workflow to auto-deploy to pages"
```

- [ ] **Step 3: 推送到远程（首次需先建仓库，见 Task 7）**

> 注意：此步依赖 Task 6（README）和 Task 7（GitHub 仓库创建）完成。在此先不执行推送，留到 Task 7 统一推送触发首次 CI。

- [ ] **Step 4: 首次推送后验证 CI（在 Task 7 完成后执行）**

预期 workflow 在 GitHub Actions 标签页可见，run 为绿色；`deploy` job 输出 Pages URL。具体验证步骤见 Task 7。

---

## Task 6: 编写 README（仓库说明 + 写作指南）

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建 `README.md`**

文件内容（解释项目是什么、本地如何预览、如何写新文章、如何发布——把 spec 的写作规范沉淀为可查阅文档）：

```markdown
# ZZH 的随笔

> 记录日常灵感与随想 · 基于 Hexo + NexT，托管于 GitHub Pages

线上地址：<https://zzh-learner.github.io/zzh-notes/>

## 本地预览

需要 Node.js 20 LTS。

```bash
npm install          # 首次安装依赖
npx hexo server      # 启动本地预览，访问 http://localhost:4000/zzh-notes/
```

## 写一篇新随笔

1. 在 `source/_posts/` 下新建 `.md` 文件，建议用中文文件名便于本地浏览。
2. 复制下面的 front-matter 模板，填好后写正文：

```yaml
---
title: 标题（中文）
date: 2026-06-23 14:30:00       # 写作时间
tags:
  - 随笔                         # 标签：横向串联同主题
categories:
  - 随想                         # 分类：可选
permalink: some-english-slug/    # 英文短 slug，保证链接干净
---
```

3. 本地 `npx hexo server` 预览确认无误。

## 发布

```bash
git add .
git commit -m "post: 新随笔标题"
git push
```

推送后 GitHub Actions 会自动构建并发布，约 1-2 分钟后线上更新。可在仓库的 **Actions** 标签查看构建状态。

## 常用命令

| 命令 | 作用 |
|------|------|
| `npx hexo new "标题"` | 用模板新建文章 |
| `npx hexo server` | 本地预览（http://localhost:4000/zzh-notes/）|
| `npx hexo clean` | 清理缓存与 public |
| `npx hexo generate` | 生成静态文件到 public |

## 目录约定

- `source/_posts/` — 随笔正文
- `source/images/` — 文章引用的图片
- `_config.yml` — Hexo 站点配置
- `_config.next.yml` — NexT 主题配置
- `.github/workflows/deploy.yml` — 自动部署

## 注意事项

- `permalink` 一旦发布就不要改，否则外链会失效。
- `node_modules/`、`public/`、`db.json` 已被 `.gitignore` 忽略，无需提交。
```

- [ ] **Step 2: 提交**

```bash
git add README.md
git commit -m "docs: add README with writing guide and common commands"
```

---

## Task 7: 创建 GitHub 仓库、推送并验证首次部署

**Files:** 无（远程操作）

> ⚠️ **此任务包含面向外部、难以撤销的操作（在 GitHub 上创建公开仓库并发布站点）。执行前需与用户确认 GitHub 已登录、同意创建 `zzh-learner/zzh-notes` 公开仓库。**

- [ ] **Step 1: 确认 gh CLI 可用且已登录**

Run: `gh auth status`
Expected: 输出 `Logged in to github.com as zzh-learner`。如未登录，运行 `gh auth login` 按提示登录（浏览器授权）。

- [ ] **Step 2: 在 GitHub 创建公开仓库**

Run:
```bash
gh repo create zzh-notes --public --source=. --remote=origin --description "ZZH 的随笔博客 - Hexo + NexT on GitHub Pages"
```
Expected: 输出 `✓ Created repository zzh-learner/zzh-notes` 并添加 `origin` 远程。

- [ ] **Step 3: 推送 main 分支（触发首次 CI）**

Run: `git push -u origin main`
Expected: 推送成功。

- [ ] **Step 4: 监控首次 CI 运行**

Run: `gh run watch`
Expected: 看到 `build` job → `deploy` job 依次变绿，最终 `deploy` 输出 Pages URL。

如失败：`gh run view --log-failed` 查看日志。常见原因：仓库未在 Settings → Pages 设置 Source 为 "GitHub Actions"。本 workflow 用 `deploy-pages` action，Pages 设置应自动配置为 "GitHub Actions" source；若未自动配置，手动到仓库 Settings → Pages → Source 选 "GitHub Actions"。

- [ ] **Step 5: 配置 Pages Source（如需手动）**

如 Step 4 部署成功，跳过本步。若 Pages Source 未自动设为 GitHub Actions：

Run:
```bash
gh api -X POST repos/zzh-learner/zzh-notes/pages \
  -f build_type=workflow
```
（若提示已存在，改用 `gh api -X PUT repos/zzh-learner/zzh-notes/pages -f build_type=workflow`）

然后重新触发 CI：`gh workflow run deploy.yml` 或 push 一个空 commit。

- [ ] **Step 6: 访问线上站点最终验收**

浏览器打开 <https://zzh-learner.github.io/zzh-notes/>
Expected:
- 首页显示「ZZH 的随笔」标题、「记录日常灵感与随想」副标题
- 可见「你好，随笔」文章，点击进入正文（URL 为 `/zzh-notes/hello-essays/`）
- 导航的「标签」「分类」「归档」均可访问且显示对应内容
- 搜索框可用，能搜到文章
- 页面样式正常（CSS/JS 未 404）

全部满足则项目完成。

---

## 验收清单（对照 spec）

完成全部任务后，逐项确认满足 spec：

- [x] 站点公开可访问：`https://zzh-learner.github.io/zzh-notes/`
- [x] Hexo + NexT 技术栈
- [x] 站点信息：title/subtitle/author 正确
- [x] 英文 permalink 生效（`hello-essays/`）
- [x] 标签功能可用
- [x] 分类功能可用
- [x] 归档页可用
- [x] 本地搜索可用
- [x] RSS（atom.xml）已生成
- [x] 全自动 CI：push 即上线
- [x] 仓库 public
- [x] 评论与统计未启用（符合非目标）
