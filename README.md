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

## 随机一图

页面地址：<https://zzh-learner.github.io/zzh-notes/random/>（导航菜单「随机一图」）。

从夸克网盘的三个图包（小语会员图包 · 团子朋友圈原图 · 橙子的照片）抽图入池。默认**全换**模式：一次抽 24 张从未入过池的新图（三夹轮流均衡）整体替换现有池，判重状态保留、永不重样。**图片存 GitHub Release 资产（tag `pool-*`），不进 git 历史**——换期时旧期 release 连同旧图自动删除，仓库体积零增长，git 里只有几 KB 的 manifest。页面每次访问从随机位置进入图池，「上一张 / 下一张」按 manifest 顺序循环浏览，标题下方显示当前位置计数。

**为什么拉图不在 GitHub Actions 上做**：夸克 open API 屏蔽海外 IP（2026-09-27 实测，GitHub runner 全线 ETIMEDOUT、本机同时可通），拉图只能在国内环境执行。因此 `random-image.yml` 是看门狗：每天北京时间 10:00 检查图池新鲜度，停更超 7 天自动建 issue 提醒、恢复后自动关闭。

图池换血目前走**本机手动**（随时可用）：

```bash
node tools/random-image-sync.mjs --dry-run   # 只打印选中的文件名，不写入任何文件（预览）
node tools/random-image-sync.mjs             # 全换：24 张全新图整体替换现有池（默认）
node tools/random-image-sync.mjs --fresh 36  # 全换并指定每期张数
node tools/random-image-sync.mjs --daily 4   # 增量模式：只加 4 张新图（FIFO 淘汰最旧）
```

之后提交推送即自动部署（本机直连 GitHub 超时用一次性代理 `git -c http.proxy=http://127.0.0.1:7897 push`）；停更超 7 天看门狗会开 issue 提醒。想彻底免手动，可在本机加 Windows 计划任务每天跑同步脚本。

> 云端自动化记录（2026-09-27）：GitHub Actions 拉不了图（夸克 API 屏蔽海外 IP）；Gitee Go 国内桥接链尝试后搁置（流水线需在其网页 UI 以插件方式配置），脚本留档于 `tools/gitee-bridge/`。夸克鉴权若需在别处复用：`node tools/random-image-sync.mjs --secret-to-file <仓库外路径>` 生成 JSON（用完即删）。

## 目录约定

- `source/_posts/` — 随笔正文
- `source/images/` — 文章引用的图片
- `_config.yml` — Hexo 站点配置
- `_config.next.yml` — NexT 主题配置
- `.github/workflows/deploy.yml` — 自动部署

## 注意事项

- `permalink` 一旦发布就不要改，否则外链会失效。
- `node_modules/`、`public/`、`db.json` 已被 `.gitignore` 忽略，无需提交。
