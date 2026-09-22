# AGENTS.md — 给 AI agent 的项目指令

> 本文件是本仓库的最高优先级约定（高于 agent 默认行为）。
> 任何在本项目工作的 AI agent（ZCode、Claude Code、Codex 等）**必须先读本文件**，再动手。

## 项目概况

- **这是什么**：ZZH 的个人随笔博客。纯记录型为主 + 轻度标签。
- **技术栈**：Hexo 7 + NexT 8 主题（git 跟踪的本地检出 `themes/next/`，非 npm 安装），托管在 GitHub Pages。
- **线上地址**：<https://zzh-learner.github.io/zzh-notes/>
- **写作流程**：本地写 Markdown → `git push` → GitHub Actions 自动构建发布。
- **站点为纯暗色**（亮色模式已删，`data-theme` 钉死 dark），不要恢复主题切换。

## 构建命令

- 本地需 **Node.js 20 LTS**（CI 用 Node 24，均兼容）。
- 常用命令（也可直接 `npx hexo ...`）：
  | 命令 | 作用 |
  |------|------|
  | `npm run build` / `npx hexo generate` | 生成静态文件到 `public/` |
  | `npm run server` / `npx hexo server` | 本地预览 http://localhost:4000/zzh-notes/ |
  | `npm run clean` / `npx hexo clean` | 清理缓存与 `public/` |

## 构建期插件（`scripts/`，共 5 个，都是 Hexo 插件）

| 脚本 | 作用 |
|------|------|
| `git-revision.js` | 读 git 历史为每篇文章生成行级修订 diff，注入文章页末尾（`postBodyEnd`）；依赖 `diff` 包 |
| `git-updated.js` | 文章"更新时间"：提交数 0/1 → 不显示；≥2 → 显示最新提交时间（渲染期覆盖 front-matter 手写的 `updated`）。配套 `_config.yml` 的 `updated_option: 'empty'` |
| `tag-weights.js` | 标签页（`type: tags`）注入 `[{name, count, path}]`，供词云脚本用 |
| `ai-gallery.js` | 生图聚合页（`source/ai/`，`type: ai`）：按 `_config.yml` 的 `ai_gallery.tags` 过滤标签，构建期把命中文章渲染成卡片 HTML（含第一张图封面）追加进 `page.content`；同时为 `_config.next.yml` 菜单的 `ai` 键兜底翻译「生图」（NexT 语言文件无 `menu.ai` 词条） |
| `index-generator.js` | 覆盖首页 index generator（同名后注册者胜）：命中 `ai_gallery.tags` 的文章不出现在首页列表（含分页）；归档/标签页/RSS/搜索/文章页不受影响。过滤异常自动回退为不过滤。标签解析与 `ai-gallery.js` 同源（DEFAULT_TAGS 两份副本，改一同步另一） |

共同约束（新增构建期插件必须沿用）：
- **git 插件（git-revision / git-updated / tag-weights）必须在完整 git 历史的检出里跑**：它们在构建期 `execSync('git log ...')`，浅克隆或无 `.git` 会让功能静默不渲染（CI 已设 `fetch-depth: 0`）；git 错误一律捕获并 `warn` 跳过，功能缺失时先查是否未提交或刚重命名。ai-gallery / index-generator 只读配置和 warehouse，不依赖 git。
- **改"渲染数据"的插件挂 `template_locals` filter，不能用 `before_generate`**（git-revision / git-updated / tag-weights / ai-gallery 均如此）：warehouse 每次 query 返回新的 Document 实例，`before_generate` 里改 `post.xxx` 只动到临时对象，生成阶段重新 query 读不到；`template_locals` 收到的 `locals.page` 才是渲染器实际使用的对象。改"生成哪些页面"则用 generator（index-generator 同名覆盖 index generator 是 generator 的本职，不套 filter）。另：hexo 对 `scripts/` 是 vm 包装逐个执行（`hexo/dist/hexo/index.js` 的 `loadPlugin`），跨脚本 `require` 会二次执行源码，插件间不共享模块——需共用的常量/规则写成两份同值副本 + 同步警告注释（如 DEFAULT_TAGS）。
- **任何错误都不阻断构建**：catch + `warn` 后安全降级——git 插件跳过功能、ai-gallery 注入失败退化为纯 Markdown 文案、index-generator 过滤异常回退不过滤（首页宁可多显示，不能静默缺页面）。

## 前端自定义注入（`source/_partials/`）

- 所有主题定制走 `_config.next.yml` 的 `custom_file_path` 六个注入点（head / header / sidebar / postBodyEnd / bodyEnd / style）→ `source/_partials/*.njk` + `styles.styl`。**绝不改 `themes/next/` 主题源码**（git 已跟踪，改了会污染仓库且易被误提交）。
- `body-end.njk`（约 700 行）是全站动效中枢：Three.js 星空背景、GSAP 动效 + 阅读进度条、背景透明度滑块（localStorage）、实时时钟刷新、标签页 wordcloud2.js 词云（CDN 加载，失败自动降级）。改动前先通读全文。
- ⚠️ `docs/superpowers/` 下的 plans/specs 写的是旧路径 `source/_data/`，实际已迁移到 `source/_partials/`，一律以现状为准。

## CI（`.github/workflows/deploy.yml`）

- 流程：checkout（`fetch-depth: 0`）→ Node 24 + `npm ci` → `npx hexo generate` → Pages artifact；并发组 `pages` 会取消排队中的重复部署。
- **paths 过滤器**：只改 `docs/`、`README.md` 等未列入过滤器的文件**不会触发部署**。过滤器含：`source/**`、`_config*.yml`、`package*.json`、`scripts/**`、workflow 自身。

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
- **6 个 generator**（`hexo-generator-index/archive/category/tag` + `feed/searchdb`）：Hexo 7 核心只内置 asset/page/post 三个 generator。少了 index/archive/category/tag → 首页/归档/分类/标签页不生成；少了 feed/searchdb → RSS（atom.xml）/ 搜索（search.xml）缺失。**均不报错**。
- **`hexo-renderer-marked` / `hexo-renderer-stylus`**：核心不内置 renderer，缺了文章不渲染或样式编译失败。
- **`css` / `@adobe/css-tools` / `@next-theme/plugins`**：NexT 的 `package.json` 没声明 `dependencies`，这些是它的隐式依赖，必须由宿主项目装。
- **`diff`**：`scripts/git-revision.js` 直接 require，删了构建报错。

### 3. 修改配置或依赖后必须验证

改 `_config.yml` / `_config.next.yml` / `package.json` / `scripts/**` / `source/_partials/**` 后，**必须**跑：
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

### 7. 不改主题源码，定制只走注入

主题在 `themes/next/`（git 跟踪的本地检出，非 npm 安装、`node_modules/` 里没有 hexo-theme-next），改了会污染仓库且难排查。一切主题定制走两条正道：`_config.next.yml` 的 `custom_file_path` → `source/_partials/`，或 `scripts/` 构建期插件。

## 排查速查（按症状）

| 症状 | 第一步 |
|------|--------|
| CI 成功但新文章没上线 | 看构建日志有无 `Process failed: _posts/xxx.md`，多为 YAML 冒号后缺空格；本地 `npx hexo generate` 复现 |
| `Cannot find module 'xxx'` | `grep -rn "require('xxx')" themes/next/` 确认是否 NexT 隐式依赖 |
| `template not found` | 检查是否误装了 `hexo-renderer-nunjucks`，卸载它 |
| 无错但缺页面 | `npx hexo generate --debug 2>&1 \| grep "Generator:"` 看缺哪个 generator |
| CI `startup_failure` 无日志 | 仓库 Pages 未启用，先 `gh api -X POST repos/zzh-learner/zzh-notes/pages -f build_type=workflow -f source[branch]=main` |
| 资源 404 / 页面裸奔 | 检查 `_config.yml` 的 `url` 是否仍是 `.../zzh-notes/` |
| 文章图片 404（路径指向站点根） | `marked` 段配置键用了下划线版（`prepend_root`），改成 camelCase（`prependRoot` / `postAsset`），见红线 5 |
| push 后线上没更新 | 只改了 docs/README 等不在 deploy.yml paths 过滤器里的文件，属预期；手动 workflow_dispatch 或改到过滤器内文件 |
| 修订区/更新时间/词云缺失 | 三个 git 插件之一静默跳过：查文件是否未提交、刚重命名，或构建目录缺 git 历史 |
| 词云/星空/动效失效 | 查 `source/_partials/body-end.njk` 对应段及 CDN 可达性（有降级日志 `[ZZH] ...`） |

## 参考文档

- 完整踩坑记录：`docs/superpowers/lessons/2026-06-23-hexo-next-setup-pitfalls.md`
- 实施计划/设计文档：`docs/superpowers/plans/`、`docs/superpowers/specs/`（注意其中 `source/_data/` 是旧路径，现为 `source/_partials/`）
- 日常使用：见 `README.md`
