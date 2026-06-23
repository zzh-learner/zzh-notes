# 设计文档：ZZH 的随笔博客（GitHub Pages）

- **日期**：2026-06-23
- **状态**：待审阅
- **作者**：ZZH

## 1. 项目目标

搭建一个托管在 GitHub Pages 上的个人随笔博客，用于记录日常灵感与随想。

**核心定位**：纯记录型为主（时间流倒序的文章列表，主要给自己看，别人能读到也行），辅以轻量的标签功能做横向主题串联。

**非目标（YAGNI）**：

- 不做评论系统、不做访客统计
- 不做相册、不做作品集式的封面图门户
- 不做密码保护 / 多作者 / CMS 后台
- 不做知识库式的复杂目录树与全文搜索权重

## 2. 技术栈选型与理由

| 维度 | 选择 | 理由 |
|------|------|------|
| 静态站点生成器 | **Hexo** | Node.js 生态，中文社区与文档最成熟，Windows 下 `npm i` 即用 |
| 主题 | **NexT** | 文字优先、排版克制；标签 / 分类 / 按年归档 / 本地搜索 / RSS 均为原生开关 |
| 托管 | **GitHub Pages** | 免费、稳定、与 git 工作流天然集成 |
| 部署 | **GitHub Actions（全自动 CI）** | 一次配置后只需 `git push` 源码即自动构建并发布 |

**关键决策记录**：

- *为何不用 Jekyll*：Jekyll 是 Pages 原生支持、零 CI 配置，但 Windows 本地预览需装 Ruby + DevKit，native extension 编译偶发问题，日常维护成本高。Hexo 配合一个一次性的 Actions workflow 即可实现等价的"push 即上线"体验，且本地预览体验更好。
- *为何不用 Hugo/Astro*：Hugo 极速但 Go 生态相对小众；Astro 工程化偏重。Hexo 在"成熟 + 中文友好 + 功能够用"上最平衡。

## 3. 系统架构

```
本地写作                          仓库 (public)                    线上
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ 编辑器写 Markdown │  git    │ source/_posts/   │  push   │                  │
│ VSCode / Typora  │ ──────> │ *.md (源文件)    │ ──────> │  GitHub Actions  │
│ 配置文件          │         │ _config.yml      │         │  hexo generate   │
└──────────────────┘         │ theme-next 配置  │         │  deploy 到 Pages │
                             └──────────────────┘         └────────┬─────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────┐
                                                          │ username.github.io│
                                                          │ /<repo>/  (公开)  │
                                                          └──────────────────┘
```

**数据流**：Markdown 源文件 → Hexo 生成静态 HTML → Actions 推送到 Pages 分支 / Pages 产物 → 公开访问。

**隔离边界**：

- **源码层**：`source/_posts/*.md` + 配置，用户唯一需要关心和编辑的内容
- **构建层**：Hexo + NexT 主题 + Actions workflow，一次配好，稳定不动
- **产物层**：自动生成的 `public/`，用户无需手动管理

## 4. 组件设计

### 4.1 目录结构

```
zzh-notes/
├── source/
│   ├── _posts/              # 随笔正文（Markdown）
│   │   └── hello-world.md   # 示例文章
│   ├── _data/               # NexT 自定义数据（可选）
│   └── images/              # 文章引用的图片资源
├── themes/
│   └── next/                # NexT 主题（或用 npm 引入）
├── _config.yml              # Hexo 站点主配置
├── _config.next.yml         # NexT 主题配置（Hexo 覆盖机制）
├── package.json             # 依赖声明
├── .github/
│   └── workflows/
│       └── deploy.yml       # 自动构建部署 workflow
├── .gitignore               # 忽略 node_modules / public / db.json
└── README.md                # 仓库说明
```

### 4.2 站点配置（`_config.yml` 关键项）

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `title` | `ZZH 的随笔` | 浏览器标签 + 首页标题 |
| `subtitle` | `记录日常灵感与随想` | 首页副标题 |
| `author` | `ZZH` | 文章页 / 页脚署名 |
| `language` | `zh-CN` | 中文界面 |
| `timezone` | `Asia/Shanghai` | 文章时间用本地时区 |
| `url` | `https://username.github.io/zzh-notes` | Pages 域名（仓库路径） |
| `permalink` | `:year/:month/:day/:title/` | 默认兜底；干净链接靠每篇 front-matter 的 `permalink` 覆盖为英文短 slug（见 4.3） |

### 4.3 URL 结构

- **默认**：文章 front-matter 中显式写 `permalink: /some-english-slug/`，保证分享链接干净。
- **退化**：未写 `permalink` 时，由 Hexo 按 `:year/:month/:day/:title/` 生成，作为兜底。
- **设计原则**：一旦某篇 permalink 已发布并被（潜在）分享，不再修改，以免外链失效。

### 4.4 NexT 主题启用的功能

| 功能 | 状态 | 实现方式 |
|------|------|----------|
| 标签（tags） | ✅ 启用 | 文章 front-matter `tags:`，自动生成标签云页 |
| 分类（categories） | ✅ 启用 | front-matter `categories:`，可选、按需用 |
| 按年归档 | ✅ 启用 | NexT 原生 archive 页 |
| 本地搜索 | ✅ 启用 | `hexo-generator-searchdb` 插件 + NexT search 配置 |
| RSS | ✅ 启用 | `hexo-generator-feed` 插件 |
| 评论 | ❌ 不启用 | 非目标 |
| 统计 | ❌ 不启用 | 非目标 |

### 4.5 自动部署 Workflow（`.github/workflows/deploy.yml`）

**职责**：监听 `main` 分支 push → 安装 Node + 依赖 → `hexo generate` → 上传 Pages 产物。

**触发**：`push` 到 `main`，且改动涉及 `source/`、`_config*.yml`、`themes/`、`package.json`。

**权限**：workflow 内 `permissions: contents: read, pages: write, id-token: write`；部署器用官方 `actions/deploy-pages`。

**产物来源**：`actions/upload-pages-artifact` 上传 `public/` 目录。

## 5. 文章 front-matter 规范

每篇随笔的标准头部：

```yaml
---
title: 标题（中文）
date: 2026-06-23 14:30:00       # 写作时间，时区 Asia/Shanghai
tags:
  - 随笔                         # 标签：横向串联同主题
  - 灵感
categories:
  - 随想                         # 分类：可选，粗粒度归档
permalink: /on-some-english-slug/  # 英文短 slug，保证链接干净
---
```

**约定**：

- `title` 用中文，自由命名。
- `tags` 是主要的内容组织手段（轻度 C 需求的落点）。
- `permalink` 为英文短 slug；命名风格统一用 `on-xxx` / `about-xxx` / 短词组，短横线分隔。
- 文件名建议中文可读（如 `关于读书的随想.md`），便于本地浏览。

## 6. 错误处理与边界情况

| 情况 | 处理 |
|------|------|
| Actions 构建失败 | workflow 失败会在 GitHub Actions 页面红色标出，push 方在 Actions 标签可看到日志；不影响已部署的旧版本（Pages 保留上次成功产物） |
| 本地预览与线上不一致 | 统一以 Actions 使用的 Node 版本和依赖为准（`package-lock.json` 锁版本） |
| 误删文章 | git 历史可恢复；部署是幂等的（每次全量重建） |
| permalink 冲突 | Hexo 构建会告警；约定每篇手动写唯一 slug |
| 中文 URL 编码问题 | 通过强制英文 permalink 规避 |

## 7. 测试与验收标准

**本地验收**：

- `npm install` 无报错
- `hexo server` 本地 `http://localhost:4000` 可访问
- 首页显示标题 / 副标题 / 示例文章
- 标签页、归档页可点击跳转

**线上验收**：

- push 后 Actions 运行变绿
- `https://username.github.io/zzh-notes/` 可访问
- 首页、文章页、标签页、归档页、搜索、RSS 链接均正常

**完成标准**：一篇示例随笔通过 `git push` 全自动上线，且可在站内通过标签 / 归档 / 搜索找到。

## 8. 后续可演进（非本期范围）

- 自定义域名（`CNAME`）
- 文章封面图 / 头图
- 站点统计（不依赖第三方评论）
- 更丰富的标签云样式

这些均不在首期实现，列出仅供未来参考。

## 9. 开放项（需在实施时确认）

- **GitHub 用户名**：用于生成正确的 `url`、Pages 域名与 README 中的链接（实施第一步会确认）。
- **仓库命名**：默认沿用目录名 `zzh-notes`，除非用户另有偏好。
