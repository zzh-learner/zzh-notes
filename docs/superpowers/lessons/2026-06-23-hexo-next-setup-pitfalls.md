# 踩坑记录：Hexo 7 + NexT 8 + GitHub Pages 搭建

- **日期**：2026-06-23
- **项目**：zzh-notes（ZZH 的随笔博客）
- **环境**：Windows 11、Node v24.14.0、Hexo 7.3.0、hexo-theme-next 8.27.0
- **背景**：从零搭建，过程中连续踩了 5 个坑，每个都导致构建失败或页面缺失。记录于此供日后排查复用。

---

## 坑 1：NexT 的隐式依赖未声明，需宿主手动安装

**现象**：`npx hexo new` / `generate` 时大量 `ERROR Script load failed: Cannot find module 'css'`，报错文件是 `hexo-theme-next/scripts/events/lib/utils.js:9`。

**根因**：`hexo-theme-next` 的 `package.json` **只有 `devDependencies`，没有 `dependencies` 字段**。但它的运行时脚本直接 `require('css')`、`require('@adobe/css-tools')`、`require('@next-theme/plugins')`。这些包本应由主题声明为依赖让 npm 自动装上，但它没声明，导致宿主项目缺这些包。

**解法**：在站点根 `package.json` 显式补上：
```json
"css": "^3.0.0",
"@adobe/css-tools": "^4.5.0",
"@next-theme/plugins": "^8.27.0"
```

**教训**：用 npm 方式装主题时，不要假设主题的 `package.json` 是完整的。遇到 `Cannot find module 'xxx'` 且 xxx 不是内置模块，先 `grep -r "require('xxx')" node_modules/hexo-theme-next/scripts/` 确认是不是主题在用，是就补进宿主依赖。

---

## 坑 2：装了 `hexo-renderer-nunjucks` 反而搞坏 layout 渲染

**现象**：`hexo generate` 报 `Template render error: template not found: _layout.njk`。首页 `index.html`、归档页不生成；但单篇文章页 `post/index.html` 能生成（因为 post.njk 不依赖 _layout 的 extends 链路出问题）。

**根因**：这是最隐蔽的一个。NexT 的 layout 是 `.njk`（Nunjucks），我以为需要装 `hexo-renderer-nunjucks` 渲染器。但**该外部包的实现是残缺的**——它的 `renderer.js` 里 `nunjucks.configure({})` **不传任何路径参数**，导致 Nunjucks 的模板加载器不知道去哪找 `_layout.njk`，`{% extends '_layout.njk' %}` 解析失败。

而 **Hexo 7 核心自带了完整的 Nunjucks 渲染器**（`node_modules/hexo/dist/plugins/renderer/nunjucks.js`），它的实现是 `nunjucks.configure(path.dirname(data.path), ...)`，正确地把模板所在目录设为加载器根。外部包注册同名渲染器后**覆盖**了内置的完整版，于是 layout 全坏。

**解法**：**卸载 `hexo-renderer-nunjucks`**，让 Hexo 内置版生效：
```bash
npm uninstall hexo-renderer-nunjucks
```
卸载后首页、归档页立即正常生成。

**教训**：
- Hexo 7 已内置 Nunjucks 渲染器，**不要装外部同名包**。
- 遇到 "template not found" 且只影响 extends/include 而不影响单个文件渲染时，第一反应查渲染器的 `configure()` 是否传了路径。
- 对照源码判断：`node_modules/hexo/dist/plugins/renderer/nunjucks.js`（内置，正确）vs `node_modules/hexo-renderer-nunjucks/lib/renderer.js`（外部，残缺）。

---

## 坑 3：Hexo 7 不内置首页/归档 generator，需独立插件

**现象**：`hexo generate` 无 ERROR，生成了 332 个文件，但**全是 `lib/` 静态资源**，没有任何 HTML 页面（缺 `index.html`、`archives/index.html`）。加文章后文章页能生成，但首页和归档页始终缺失。

**根因**：Hexo 7 核心**只内置 3 个 generator**：`asset`、`page`、`post`（见 `node_modules/hexo/dist/plugins/generator/index.js`）。

首页（index）、归档（archive）、分类（category）、标签（tag）这四个页面**需要独立的插件包**：
- `hexo-generator-index`
- `hexo-generator-archive`
- `hexo-generator-category`
- `hexo-generator-tag`

我在 `_config.yml` 里写了 `index_generator:` 配置块，但没装对应插件，配置被静默忽略，首页就不生成——而且**不报任何错**，非常误导。

**解法**：补装四个插件：
```bash
npm install hexo-generator-index hexo-generator-archive hexo-generator-category hexo-generator-tag
```

**教训**：
- Hexo 5+ 把这些 generator 从核心拆成了独立插件。老教程（Hexo 3/4 时代）可能说"核心自带"，已过时。
- **关键诊断信号**：生成无 ERROR 但缺特定页面 → 先 `npx hexo generate --debug` 看 `Generator:` 列表，缺哪个就装哪个插件。
- `--debug` 输出里的 `Generator: <name>` 行是排查 generator 问题的金钥匙。

---

## 坑 4：缺 `hexo-renderer-marked`，Markdown 不渲染

**现象**：文章 front-matter 能解析，但正文不渲染成 HTML（或文章页内容异常）。这是坑 3 排查时顺带发现的。

**根因**：Hexo 7 核心**不内置 Markdown 渲染器**（只有 yaml/json/plain/nunjucks 四个内置 renderer）。NexT 的 devDependencies 里有 `hexo-renderer-marked`，但那是给主题开发用的，不会自动装到宿主。

**解法**：`npm install hexo-renderer-marked`。

**教训**：Hexo 7 的哲学是"核心最小化，功能靠插件"。凡是渲染（md/styl/njk/less/ejs）和生成（index/archive/...）几乎都要外部插件。搭建时一次性把 renderer + generator 配齐，别撞一个补一个。

---

## 坑 5：新 GitHub 仓库首次推送 CI 必然 `startup_failure`

**现象**：`git push` 后 GitHub Actions 第一次 run 直接 `conclusion: startup_failure`，`gh run view --log-failed` 报 "log not found"（连 job 日志都没有）。

**根因**：新创建的仓库**默认未启用 GitHub Pages**。workflow 申请了 `permissions: pages: write, id-token: write`，但仓库没有 Pages 配置可写，workflow 在启动阶段就被拒。

**解法**：**推送前**先用 API 启用 Pages 并设为 workflow 模式：
```bash
gh api -X POST repos/zzh-learner/zzh-notes/pages -f build_type=workflow -f source[branch]=main
```
返回含 `"build_type":"workflow"` 后，再推送或 `gh workflow run deploy.yml` 触发 CI，即可正常构建部署。

**教训**：
- GitHub Pages 不是开了仓库就有的，需要显式启用。
- `startup_failure` + 无日志 = 仓库/环境级配置问题（权限、Pages、secret 缺失），不是 workflow 代码问题。
- 正确顺序：**建仓库 → 启用 Pages(workflow 模式) → 推送触发 CI**。把启用 Pages 当作部署的前置依赖。

---

## 汇总：一次配齐的依赖清单（Hexo 7 + NexT 8）

为了避免重复踩坑，记录最终验证可用的完整依赖（截至 2026-06）：

```json
"dependencies": {
  "@adobe/css-tools": "^4.5.0",        // NexT 隐式依赖
  "@next-theme/plugins": "^8.27.0",     // NexT vendor 处理
  "css": "^3.0.0",                      // NexT 隐式依赖
  "hexo": "^7.3.0",
  "hexo-cli": "^4.3.1",
  "hexo-generator-archive": "^2.0.0",   // 归档页（核心不内置）
  "hexo-generator-category": "^2.0.0",  // 分类页（核心不内置）
  "hexo-generator-feed": "^3.0.0",      // RSS
  "hexo-generator-index": "^4.0.0",     // 首页（核心不内置）
  "hexo-generator-searchdb": "^1.4.1",  // 本地搜索
  "hexo-generator-tag": "^2.0.0",       // 标签页（核心不内置）
  "hexo-renderer-marked": "^7.0.1",     // Markdown 渲染（核心不内置）
  "hexo-renderer-stylus": "^3.0.0",     // styl 样式编译（核心不内置）
  "hexo-theme-next": "^8.21.0"
}
```

**绝对不要装**：`hexo-renderer-nunjucks`（残缺，覆盖 Hexo 7 内置完整版，详见坑 2）。

## 排查工具箱（按问题类型）

| 症状 | 第一步排查命令 |
|------|---------------|
| `Cannot find module 'xxx'` | `grep -rn "require('xxx')" node_modules/hexo-theme-next/` 看谁在用 |
| `template not found` | 对比内置 vs 外部 nunjucks 渲染器的 `configure()` 调用 |
| 无错但缺页面 | `npx hexo generate --debug 2>&1 \| grep "Generator:"` 看缺哪个 generator |
| CI `startup_failure` 无日志 | 查仓库 Pages 是否启用、token 权限是否够 |
| 资源 404（CSS/JS） | 查 `_config.yml` 的 `url` 和 `root` 是否匹配项目页路径 |
