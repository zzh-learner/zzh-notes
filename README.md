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
