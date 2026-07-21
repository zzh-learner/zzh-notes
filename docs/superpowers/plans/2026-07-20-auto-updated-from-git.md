# 基于Git历史自动标注文章更新时间 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Hexo 构建期读每篇文章的 git commit 历史，commit 数 ≥2 时自动填 `post.updated`（显示"更新于"），否则不填（不显示）。

**Architecture:** 新增 `scripts/git-updated.js` 插件，挂 `template_locals` filter（执行期修正：原计划 `before_generate` 不可行——warehouse 的 Post Document 不允许 updated 字段被外部修改，updateById 也不生效；改用 `template_locals` 直接改 `locals.page.updated`，跟 `scripts/git-revision.js` 同款模式），对每篇 post 详情页跑 `git log --follow --no-merges --pretty=format:%ci`，按 commit 数决定是否填 updated。同时给 NexT 模板 `post-meta.njk` 第 22 行加 `post.updated and` 空值判断（修 NexT 既有 bug），并把 `_config.next.yml` 的 `updated_at.enable` 从 `false` 改回 `true`。

**Tech Stack:** Hexo 7.3.0 filter API、Node.js 原生 `child_process.execSync` + `Date`（零新依赖）、NexT 8 模板（Nunjucks）。

## Global Constraints

（摘自 spec 与 AGENTS.md，所有任务隐含遵守）

- **不装新 npm 包**：插件只用 `child_process`、`path`，`Date` 原生解析 git `%ci` 输出（已验证 `new Date('2026-07-20 14:52:40 +0800')` 正确解析成 UTC）。
- **git 错误必须静默跳过**（仅 `hexo.log.warn`），不阻断构建——对齐 `scripts/git-revision.js` 既有模式与 AGENTS.md 约束。
- **构建必须在含完整 git 历史的检出里跑**：CI 已配 `fetch-depth: 0`（`.github/workflows/deploy.yml` 第 30 行），不动。
- **改配置后必须验证**（AGENTS.md 红线 3）：每个改动配置/模板的任务末尾必须跑 `npx hexo clean && npx hexo generate`，确认无 ERROR 且关键页面生成。
- **项目页路径 `/zzh-notes/` 不动**，`_config.yml` 的 `url`/`root`/`updated_option` 都不改。
- **YAML 冒号后必须有空格**（AGENTS.md 写作规范）。
- **时区**：`config.timezone = 'Asia/Shanghai'`（`_config.yml` 第 11 行）。插件只负责把带时区的 `%ci` 字符串解析成 Date 对象赋给 `post.updated`；渲染层显示由 Hexo `date()` helper 自动按 `config.timezone` 转。
- **permalink 绝不修改**（AGENTS.md 写作规范）。

---

## File Structure

| 文件 | 操作 | 责任 |
|---|---|---|
| `scripts/git-updated.js` | 新增 | 构建期读 git 历史，按 commit 数填 `post.updated` |
| `themes/next/layout/_partials/post/post-meta.njk` | 改 1 行（第 22 行） | 加 `post.updated and` 空值判断，修 NexT bug |
| `_config.next.yml` | 改 1 行 + 更新注释 | `updated_at.enable: false` → `true` |
| `_config.yml` | **不动** | 保持 `updated_option: 'empty'`，插件是唯一数据源 |

---

## Task 1: 新增 git-updated 插件（核心）✅ 已执行（commit `cab85dd`）

> **执行期修正**：原计划挂 `before_generate` + 改 `post.updated`，实测不可行（warehouse 的 Post Document 不允许 updated 字段被外部修改，`Post.updateById` 也不生效，已用 probe 脚本独立验证）。改用 `template_locals` 直接改 `locals.page.updated`（跟 `scripts/git-revision.js` 同款）。下方代码块已更新为实际实现。

**Files:**
- Create: `scripts/git-updated.js`

**Interfaces:**
- Consumes: `hexo.base_dir`、`hexo.log`、`locals.page`（template_locals 注入）
- Produces: 副作用——对 commit 数 ≥2 的 post 详情页，给 `page.updated` 赋 Date 值

**设计说明：**

对齐 `scripts/git-revision.js` 的成熟模式（execSync + base_dir + 相对路径 + 错误静默 + `template_locals`）。核心算法：

```
template_locals 触发时（每页渲染前）：
  if page.layout != 'post' or !page.full_source: return
  relPath = path.relative(hexo.base_dir, page.full_source) 转 posix
  out = execSync('git log --follow --no-merges --pretty=format:%ci -- "<relPath>"')
  commits = out.trim().split('\n').filter(Boolean)
  if commits.length >= 2:
    page.updated = new Date(commits[0])   // 最新 commit 的 %ci
  // 否则不动（保持 undefined）
```

- [x] **Step 1: 写插件文件**

创建 `scripts/git-updated.js`，完整内容如下（对齐 `git-revision.js` 的注释密度与风格）：

```js
/* global hexo */
'use strict';

// 文章更新时间 —— 构建时读 git 历史，按 commit 数决定是否填 page.updated
// 规则：commit 数 0（未提交）或 1（只发布过）→ 不填；≥2（改过）→ 填最新 commit 的 %ci
// 挂在 template_locals，渲染期为每篇 post 详情页计算（覆盖 Hexo 默认 updated_option: 'empty'）
// 任何 git 错误均静默跳过（仅 warn），绝不阻断构建
//
// 设计说明：跟 scripts/git-revision.js 同款用 template_locals 而非 before_generate。
// 原因：warehouse 的 Post.forEach / Post.toArray() 每次 query 都返回新的 Document 实例
// （p1 !== p2 !== p3 已实测），在 before_generate 里改 post.updated 只动到临时对象，
// _runGenerators 阶段重新 query 时读不到，page.updated 还是 undefined。
// template_locals 收到的 locals.page 正是渲染器要用的对象，直接赋值即可生效。

const { execSync } = require('child_process');
const path = require('path');

function git(args, cwd) {
  return execSync(args, { cwd, encoding: 'utf8' });
}

// 取该文件所有提交的 committer date（%ci，ISO 8601 带时区），按时间倒序
// commits[0] = HEAD（最新）。--follow 跟踪重命名，--no-merges 排除 merge commit
function getCommitDates(relPath, cwd) {
  const out = git(
    `git log --follow --no-merges --pretty=format:%ci -- "${relPath}"`,
    cwd
  ).trim();
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

// template_locals：每页渲染时触发，locals.page 即将被送进渲染器
// 只对文章详情页（layout === 'post'）计算，惰性求值
hexo.extend.filter.register('template_locals', locals => {
  const page = locals.page;
  if (!page || page.layout !== 'post' || !page.full_source) {
    return locals;
  }

  try {
    const baseDir = hexo.base_dir;
    const relPath = path.relative(baseDir, page.full_source).replace(/\\/g, '/');
    const commits = getCommitDates(relPath, baseDir);

    if (commits.length >= 2) {
      // 最新 commit 的 %ci 解析成 Date（带时区，new Date 能正确解析）
      const updated = new Date(commits[0]);
      if (!isNaN(updated.getTime())) {
        page.updated = updated;
      }
    }
    // commits.length < 2 时不赋值，page.updated 保持原值（undefined）
  } catch (e) {
    hexo.log.warn(`git-updated: 跳过 ${page.path} - ${e.message}`);
  }

  return locals;
});
```

- [x] **Step 2: 本地验证插件无构建错误**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -10`

Expected: 输出 `417 files generated in ...`，无 ERROR，无 `git-updated: 跳过` 的 warn（除非真有未提交文件）。

**实测**：417 files generated，无 plugin 相关 ERROR/WARN（预存在的 `_data/header.njk` ERROR 与本插件无关，已对照验证）。

- [x] **Step 3: 验证插件确实填了 updated（找一篇改过的文章）**

> **执行期修正**：brief 原推荐 `hello-essays.md`，实际只 1 commit（不是"多次修改"）。全仓 commit≥2 的只有 3 篇：长风破浪 / 别碰那段投递脚本 / 关于专注力。改用这 3 篇验证。

Run: `git log --follow --no-merges --pretty=format:%H%n -- "source/_posts/关于专注力.md" | wc -l`

Expected: 数字 ≥2（关于专注力有 2 个 commit：发布 + YAML 修正）。

然后用 dump 脚本确认 Hexo 数据层 `page.updated` 已被填上（注意：必须用 `hexo.generate()` 触发完整 pipeline 才能让 template_locals 跑到，单纯 `hexo.load()` 不行）：

然后用 dump 脚本确认 Hexo 数据层 `post.updated` 已被填上：

创建临时验证脚本 `_verify-updated.js`：

```js
const hexo = new (require('hexo'))(process.cwd(), {});
hexo.init().then(() => hexo.load()).then(() => {
  const Post = hexo.database.model('Post');
  const p = Post.findOne({ slug: 'hello-essays' }) || Post.findOne({ title: /你好/ });
  if (p) {
    console.log(`title="${p.title}"  date="${p.date}"  updated="${p.updated}"  source="${p.source}"`);
  } else {
    console.log('未找到文章');
  }
  return hexo.exit();
}).catch(e => { console.error(e); process.exit(1); });
```

Run: `node _verify-updated.js 2>&1 | grep -v "^INFO\|^WARN"`

Expected: 输出里 `updated="..."` 不再是 `undefined`，而是一个 Date（如 `updated="Mon Jul 20 2026 ..."`）。

- [x] **Step 4: 清理临时验证脚本**

Run: `rm -f _verify-updated.js`

- [x] **Step 5: Commit**（实际 commit `cab85dd`，commit 信息追加了 before_generate → template_locals 的根因说明）

```bash
git add scripts/git-updated.js
git commit -m "feat(script): 新增 git-updated 插件，按 commit 数自动填 post.updated

构建期读每篇文章的 git 历史（--follow --no-merges），commit 数 >=2
才填 updated（最新 commit 的 %ci），否则保持 undefined。

设计与 scripts/git-revision.js 模式对齐：
- execSync + hexo.base_dir + 相对路径
- 任何 git 错误静默 warn 跳过，不阻断构建
- 零新依赖（原生 Date 解析带时区的 %ci 输出）"
```

---

## Task 2: 改 NexT 模板加空值判断（修 bug）

**Files:**
- Modify: `themes/next/layout/_partials/post/post-meta.njk:22`

**Interfaces:**
- Consumes: 无（纯模板条件改动）
- Produces: 模板第 22 行的 `if` 条件多一个 `post.updated and` 前置判断

**背景（为什么必须改）：**

Hexo 的 `date()` helper（`node_modules/hexo/dist/plugins/helper/date.js` 第 22 行 `getMoment` 函数）对 `undefined` 输入会回退成**当前时间**：

```js
function getMoment(date, lang, timezone) {
    if (date == null)
        date = moment();  // ← undefined → 当前时间
    ...
}
```

NexT 的 `post-meta.njk` 第 22 行只判断 `theme.post_meta.updated_at.enable`，不判断 `post.updated` 是否为空。结果：未改过的文章（`post.updated = undefined`）会被渲染成"更新于今天"。

加 `post.updated and` 是修这个 bug 的最小改动。

- [ ] **Step 1: 改模板第 22 行**

在 `themes/next/layout/_partials/post/post-meta.njk` 找到第 22 行：

```njk
  {%- if theme.post_meta.updated_at.enable and (not theme.post_meta.updated_at.another_day or date_diff or not theme.post_meta.created_at) %}
```

替换为（在条件最前面加 `post.updated and`）：

```njk
  {%- if post.updated and theme.post_meta.updated_at.enable and (not theme.post_meta.updated_at.another_day or date_diff or not theme.post_meta.created_at) %}
```

**注意**：用 Edit 工具，`old_string` 必须唯一匹配。这一行包含特殊字符（`{%-`、括号），直接整行复制粘贴。

- [ ] **Step 2: 验证模板改动后构建无错**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -5`

Expected: `417 files generated`，无 ERROR、无 Template render error。

- [ ] **Step 3: 验证未改过的文章不显示"更新于"**

先确认一篇 commit 数 = 1 的文章（找一篇最近只提交过一次的）。如果没有，可用任何 commit 数 < 2 的文章。查询命令：

Run: `for f in source/_posts/*.md; do n=$(git log --follow --no-merges --pretty=format:%ci -- "$f" | wc -l); echo "$n  $f"; done | sort -n | head -5`

Expected: 列出每篇文章的 commit 数，挑 commit 数 = 1 的那篇 permalink 备用。

然后查它渲染出来的 HTML：

Run: `grep -c "更新于" public/<那篇的permalink>/index.html`

Expected: `0`（不渲染"更新于"）。

- [ ] **Step 4: 验证改过的文章显示"更新于"且时间正确**

Run: `grep -oE '更新于[^<]*<time[^>]*datetime="[^"]*"' public/hello-essays/index.html`

Expected: 输出类似 `更新于</span>...<time ... datetime="2026-07-20T..."`，datetime 是最近一次 commit 的时间（不是今天 CI 跑的时间——这两个可能重合，但语义不同：这里是 git 历史 commit 时间）。

对比验证时间正确：

Run: `git log --follow --no-merges --pretty=format:%ci -- "source/_posts/hello-essays.md" | head -1`

Expected: 第一行的时间跟 HTML 里的 `datetime` 值一致（时区可能差 8 小时，但绝对时刻相同）。

- [ ] **Step 5: Commit**

```bash
git add themes/next/layout/_partials/post/post-meta.njk
git commit -m "fix(theme): NexT post-meta 模板加 post.updated 空值判断

NexT 模板第 22 行只判断 updated_at.enable，不判断 post.updated
是否为空。Hexo date() helper 对 undefined 输入回退当前时间，
导致未改过的文章被渲染成'更新于今天'。

加 'post.updated and' 前置判断修复。属 NexT 既有 bug，
升级主题时需重打此一行补丁。"
```

---

## Task 3: 开启主题 updated_at 开关

**Files:**
- Modify: `_config.next.yml`（第 61-63 行附近）

**Interfaces:**
- Consumes: 无
- Produces: 模板的 `theme.post_meta.updated_at.enable` 值从 `false` 变 `true`

**为什么放最后：**

在 Task 2（模板加空值判断）之前开启这个开关，会导致未改过的文章立刻显示"更新于今天"（bug 触发）。所以必须先改模板，再开开关。

- [ ] **Step 1: 改 `_config.next.yml` 的 `updated_at` 段**

找到 `_config.next.yml` 第 58-63 行附近的 `post_meta` 段（当前内容）：

```yaml
post_meta:
  item_text: true
  created_at: true
  # 关掉"更新于"显示。原因：配合 _config.yml 的 updated_option: 'empty'，
  # Hexo 数据层已经没有 updated 字段；但 NexT 模板（post-meta.njk 第 22 行）
  # 只判断 enable 开关，不判断 post.updated 是否为空，结果会把 undefined
  # 当当前时间渲染，导致每篇文章都显示"更新于今天"。
  # 如果将来某篇确需标注更新时间，给 front-matter 写 updated: 即可，
  # 然后可临时把这里改回 true。
  updated_at:
    enable: false
    another_day: true
  categories: true
```

替换为：

```yaml
post_meta:
  item_text: true
  created_at: true
  # 开启"更新于"显示。配合 scripts/git-updated.js 插件：
  # - 插件按 git commit 数决定是否填 post.updated（>=2 才填）
  # - post-meta.njk 已加 post.updated 空值判断（Task 2），未改过的文章不渲染
  # - another_day: true → updated 跟 date 同一天则不显示，避免同日多次修改显示冗余
  updated_at:
    enable: true
    another_day: true
  categories: true
```

- [ ] **Step 2: 验证构建无错**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -5`

Expected: `417 files generated`，无 ERROR。

- [ ] **Step 3: 端到端验证——三个测试样本**

**样本 A：改过的文章（commit ≥2，如 hello-essays）**

Run: `grep -c "更新于" public/hello-essays/index.html`

Expected: `1`（显示一次"更新于"）。

**样本 B：未改过的文章（commit = 1）**

用 Task 2 Step 3 找到的那篇 commit = 1 的文章 permalink：

Run: `grep -c "更新于" public/<permalink>/index.html`

Expected: `0`（不显示）。

**样本 C：关键页面都生成**

Run:
```bash
for f in index.html archives/index.html hello-essays/index.html; do
  if [ -f "public/$f" ]; then echo "OK: $f"; else echo "MISSING: $f"; fi
done
```

Expected: 全部 OK。

- [ ] **Step 4: Commit**

```bash
git add _config.next.yml
git commit -m "feat(config): 开启 NexT updated_at，配合 git-updated 插件

post_meta.updated_at.enable: false -> true。
前置条件已满足（Task 1 插件 + Task 2 模板空值判断），
未改过的文章不会被误显示。"
```

---

## Task 4: 推送上线 + 线上验证

**Files:**
- 无文件改动

**Interfaces:**
- Consumes: 前三个 Task 的提交
- Produces: GitHub Actions 触发，线上文章页生效

- [ ] **Step 1: 确认工作区干净，只有本次相关的 3 个 commit 在 main 上**

Run: `git log --oneline -5`

Expected: 看到刚提交的 3 个 commit（feat script、fix theme、feat config），HEAD 在最上面那个。

Run: `git status --short`

Expected: 工作区相对 HEAD 没有未提交的本次相关改动（AGENTS.md 和 png 文件的本地修改可以存在，不影响）。

- [ ] **Step 2: 推送到 main**

Run: `git push origin main 2>&1 | tail -5`

Expected: 输出 `main -> main`，无错误。

- [ ] **Step 3: 确认 CI 触发**

Run: `gh run list --limit 3 2>&1 | head -5`

Expected: 看到一个最近的 "Deploy Hexo to GitHub Pages" run，状态 `in_progress` 或 `queued`。

如果没触发，查 deploy.yml 的 `paths` 过滤——本次改了 `scripts/**` 和 `_config.next.yml`，都在 paths 列表里，应该会触发。

- [ ] **Step 4: 等 CI 跑完，线上验证**

等 1-2 分钟后：

Run: `gh run list --limit 1`

Expected: 最近一次 run 状态 `success` / `completed`。

然后浏览器访问（或 curl）：

- 线上首页：<https://zzh-learner.github.io/zzh-notes/>
- 改过的文章（如 hello-essays）：<https://zzh-learner.github.io/zzh-notes/hello-essays/>

Expected:
- 改过的文章显示"发表于 ... 更新于 ..."
- 未改过的文章只显示"发表于 ..."
- 没有文章被误显示"更新于今天"（除非今天真的 commit 过改动）

⚠️ 浏览器要看最新版需强刷（Ctrl+F5）避缓存。

---

## Self-Review 结果

**1. Spec 覆盖检查**：
- spec §3.1 判定规则 → Task 1 Step 1 的 `getCommitDates` + `commits.length >= 2` ✅
- spec §3.2 挂载点 `before_generate` → Task 1 的 `hexo.extend.filter.register('before_generate', ...)` ✅
- spec §3.3 错误处理 → Task 1 的 `try/catch + hexo.log.warn` ✅
- spec §3.5 时区处理 → Task 1 用原生 `new Date()` 解析带时区的 `%ci`，渲染层自动转（已在计划里说明） ✅
- spec §4.1 新增 `scripts/git-updated.js` → Task 1 ✅
- spec §4.2 改 `post-meta.njk` 第 22 行 → Task 2 ✅
- spec §4.3 改 `_config.next.yml` → Task 3 ✅
- spec §4.4 不动 `_config.yml` → Global Constraints 已声明 ✅
- spec §5 验证计划 → 每个 Task 末尾 + Task 4 线上验证 ✅
- spec §6 边界情况（重命名、未提交、同日多次）→ 由 `--follow`、try/catch、`another_day` 分别覆盖，在 Task 验证步骤里都有涉及 ✅

**2. 占位符扫描**：无 TBD/TODO，所有代码块都是完整可执行内容 ✅

**3. 类型一致性**：
- `post.updated` 在 Task 1 赋 `Date` 对象，Task 2 模板用 `post.updated` 判空（truthy check 对 Date 有效），Task 3 不涉及类型 ✅
- `getCommitDates` 返回 `string[]`，Task 1 Step 1 用 `commits[0]` 和 `commits.length` 一致 ✅

**4. 依赖顺序**：
- Task 2 必须在 Task 3 之前（已在 Task 3 说明里强调）✅
- Task 1 可独立（插件不影响显示，只是填数据）✅
- Task 4 必须最后（推送上线）✅

无需修改，计划已完整。
