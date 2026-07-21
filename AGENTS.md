# AGENTS.md — 给 AI agent 的项目指令

> 本文件是本仓库的最高优先级约定（高于 agent 默认行为）。
> 任何在本项目工作的 AI agent（ZCode、Claude Code、Codex 等）**必须先读本文件**，再动手。

## 项目概况

- **这是什么**：ZZH 的个人随笔博客。纯记录型为主 + 轻度标签。
- **技术栈**：Hexo 7 + NexT 8 主题，托管在 GitHub Pages。
- **线上地址**：<https://zzh-learner.github.io/zzh-notes/>
- **写作流程**：本地写 Markdown → `git push` → GitHub Actions 自动构建发布。

## 构建命令与自定义脚本

- 需要 **Node.js 20 LTS**（见 `README.md`）。
- 常用命令（也可直接 `npx hexo ...`）：
  | 命令 | 作用 |
  |------|------|
  | `npm run build` / `npx hexo generate` | 生成静态文件到 `public/` |
  | `npm run server` / `npx hexo server` | 本地预览 http://localhost:4000/zzh-notes/ |
  | `npm run clean` / `npx hexo clean` | 清理缓存与 `public/` |
- **`scripts/git-revision.js`**：自定义 Hexo 插件，构建时读 git 历史为每篇文章生成行级修订 diff，注入到 NexT 文章页末尾（`postBodyEnd`）。两条连带约束：
  - 它依赖 `diff` 包（红线 2 的"不要精简"清单之一），删了会构建报错。
  - 它在构建期 `execSync('git log ...')`，所以 **CI/构建必须在含完整 git 历史的检出里跑**（Actions 默认如此）——浅克隆或无 `.git` 会让修订区静默不渲染。
  - 任何 git 错误都被捕获并 `warn` 跳过，**不会阻断构建**；若某篇修订区缺失，先查是否未提交或刚重命名。

## 写作发布规范

- 新随笔放 `source/_posts/`，文件名用中文便于本地浏览。
- front-matter 必填：`title`（中文）、`date`、`tags`。`categories` 可选。
- **YAML 冒号后必须有空格**（`key: value`，不是 `key:value`）。写错会导致该文章被解析器静默跳过——CI 仍显示 success，但文章不生成、首页不更新。推荐用 `npx hexo new "标题"` 建文，模板已带正确格式，只在下面填值即可。
- `tags` 用列表写法（每项前加 `  - `），不要写成 `tags: 专心`：
  ```yaml
  tags:
    - 专心
    - 读书
  ```
- **`permalink` 用英文短 slug**（如 `permalink: some-slug/`），保证分享链接干净；一旦发布**绝不修改**，否则外链失效。
- 不写评论、不接统计、不做 CMS——这些是明确排除的非目标。

## 红线规则（踩坑沉淀，违反必出问题）

### 1. 绝对不要装 `hexo-renderer-nunjucks`

该包实现残缺（`nunjucks.configure({})` 不传路径），会覆盖 Hexo 7 内置的完整 Nunjucks 渲染器，导致 `{% extends '_layout.njk' %}` 报 "template not found"、首页和归档页无法生成。**Hexo 7 已自带完整版，无需外部包。**

### 2. 依赖清单是完整的，不要"精简"

`package.json` 里的 14 个依赖都是实测必需的，尤其这几类容易被误删：
- **4 个 generator**（`hexo-generator-index/archive/category/tag`）：Hexo 7 核心只内置 asset/page/post 三个 generator。少了它们 → 首页/归档/分类/标签页不生成，且**不报错**。
- **`hexo-renderer-marked` / `hexo-renderer-stylus`**：核心不内置 renderer，缺了文章不渲染或样式编译失败。
- **`css` / `@adobe/css-tools` / `@next-theme/plugins`**：NexT 的 `package.json` 没声明 `dependencies`，这些是它的隐式依赖，必须由宿主项目装。

### 3. 修改配置或依赖后必须验证

改 `_config.yml` / `_config.next.yml` / `package.json` 后，**必须**跑：
```bash
npx hexo clean && npx hexo generate
```
确认无 ERROR、且关键页面（`index.html`、`archives/index.html`、文章页）都生成，再提交。不要只看"build 成功"就以为没问题——缺页面的构建也会显示成功。

### 4. 项目页路径是 `/zzh-notes/`，不要改 `url` / `root`

`_config.yml` 的 `url: https://zzh-learner.github.io/zzh-notes/` 和 `root`（由 url 推导）决定了所有静态资源路径。改错会导致 CSS/JS 全部 404，页面裸奔。

### 5. `hexo-renderer-marked` 的图片配置键是 **camelCase**

开启文章资源夹图片（`post_asset_folder: true`）时，`marked` 段必须用 **camelCase** 键名：
```yaml
marked:
  prependRoot: true   # ✅ 正确
  postAsset: true     # ✅ 正确
```
**不要**写成下划线版（`prepend_root` / `asset_image_slug`）——那两个名字在 7.x 渲染器里不存在（`renderer.js` 读的是 `prependRoot` / `postAsset`），YAML 解析不报错，但选项被静默忽略。后果：图片 `src` 回退解析到站点根目录（如 `/zzh-notes/xxx.jpg` 而非 `/zzh-notes/<permalink>/xxx.jpg`），**线上 404，且构建无任何 ERROR**。

验证方法：生成后 `grep -o '<img[^>]*src="[^"]*"' public/<permalink>/index.html`，确认路径含 permalink 段。

### 6. 带图随笔的图片放在文章同名文件夹

`post_asset_folder: true` 已开启。每篇带图随笔的结构：
```
source/_posts/
  ├─ 标题.md
  └─ 标题/              ← 与 .md 同名的文件夹（手动建，或 hexo new 自动生成）
      └─ xxx.jpg
```
正文用相对文件名引用：`![描述](xxx.jpg)`，渲染器会自动补全路径到该文章的资源夹。点击放大由 `_config.next.yml` 的 `fancybox: true` 提供（NexT 自动从 CDN 加载，无需装 npm 包）。

## 排查速查（按症状）

| 症状 | 第一步 |
|------|--------|
| CI 成功但新文章没上线 | 看构建日志有无 `Process failed: _posts/xxx.md`，多为 YAML 冒号后缺空格；本地 `npx hexo generate` 复现 |
| `Cannot find module 'xxx'` | `grep -rn "require('xxx')" node_modules/hexo-theme-next/` 确认是否 NexT 隐式依赖 |
| `template not found` | 检查是否误装了 `hexo-renderer-nunjucks`，卸载它 |
| 无错但缺页面 | `npx hexo generate --debug 2>&1 \| grep "Generator:"` 看缺哪个 generator |
| CI `startup_failure` 无日志 | 仓库 Pages 未启用，先 `gh api -X POST repos/zzh-learner/zzh-notes/pages -f build_type=workflow -f source[branch]=main` |
| 资源 404 / 页面裸奔 | 检查 `_config.yml` 的 `url` 是否仍是 `.../zzh-notes/` |
| 文章图片 404（路径指向站点根） | `marked` 段配置键用了下划线版（`prepend_root`），改成 camelCase（`prependRoot` / `postAsset`），见红线 5 |

## 参考文档

- 完整踩坑记录：`docs/superpowers/lessons/2026-06-23-hexo-next-setup-pitfalls.md`
- 实施计划：`docs/superpowers/plans/2026-06-23-zzh-notes-blog.md`
- 设计文档：`docs/superpowers/specs/2026-06-23-zzh-notes-blog-design.md`
- 日常使用：见 `README.md`
