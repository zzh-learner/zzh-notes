# 设计：基于 Git 历史自动标注文章更新时间

**日期**：2026-07-20
**状态**：待审
**作者**：ZZH + ZCode

## 1. 背景与动机

### 1.1 现状

刚刚修完一个 bug：旧文章每次发布新随笔时，都会显示"更新于今天"。

**根因**（详见 commit `73347ca`）：
- `_config.yml` 的 `updated_option: 'mtime'` 用文件 mtime 填 `post.updated`
- mtime 会随 git clone/checkout/pull 全部刷新成当下时间，CI 每次跑都把所有文章的 mtime 变成今天

**当前的修复**（方案 A 的"不显示"模式）：
- `_config.yml`: `updated_option: 'empty'`（Hexo 不自动填 updated）
- `_config.next.yml`: `post_meta.updated_at.enable: false`（模板不渲染"更新于"）

结果：**所有文章都不再显示更新时间**，包括真正改过的。

### 1.2 期望

希望"真正修改过的文章"自动显示准确的更新时间，同时：
- 新发布的文章（只有 1 个 commit）只显示"发表于"，不显示"更新于"
- 未改过的旧文章，即便今天有 CI 跑，也不显示"更新于今天"
- 更新时间用 git commit 的作者日期，不受 clone/checkout 影响

### 1.3 为什么选 git 而不是 mtime 或手动 front-matter

| 数据源 | 问题 |
|---|---|
| mtime（Hexo 默认）| clone/checkout/pull 会刷新成当下，不可靠 |
| 手动 `updated:` front-matter | 需要每次发布都想着"这次要不要标"，易忘，且跟 git 历史脱节 |
| **git commit 作者日期** | 跟博客发布工作流（`git push`）天然一致，时间戳稳定，CI 环境不会改变 |

## 2. 总体方案

新增一个 Hexo 插件 `scripts/git-updated.js`，在构建期对每篇文章读 git 历史，根据 commit 数量决定是否填 `post.updated`：

- **0 个 commit**（新文件未提交）→ 跳过
- **1 个 commit**（只发布过，未改过）→ 不设 `post.updated`
- **≥2 个 commit**（改过）→ `post.updated` = 最新 commit 的作者日期

同时改 NexT 模板，加 `post.updated` 空值判断（修 NexT 一个既有 bug），让未改过的文章不会被误显示为"更新于今天"。

## 3. 详细设计

### 3.1 判定规则的精确定义

对一篇 `source/_posts/xxx.md`：

1. 算相对路径 `relPath = path.relative(hexo.base_dir, post.full_source)`（posix 风格，跟 `git-revision.js` 第 129 行一致）
2. 执行：`git log --follow --no-merges --pretty=format:%ci -- "<relPath>"`
3. 解析输出（按行）：
   - 输出为空 → 0 个 commit → 跳过
   - 输出 1 行 → 1 个 commit → `post.updated` 保持 undefined
   - 输出 ≥2 行 → 最新 commit（第 1 行）的 `%ci` 解析成 Date，赋给 `post.updated`

**`--follow` 的作用**：跟踪文件重命名。跟 `git-revision.js` 第 35 行一致，保证重命名后的文章不会丢失历史、被误判成"只有 1 个 commit"。

**`--no-merges` 的作用**：排除 merge commit，只统计真实的内容提交。跟 `git-revision.js` 一致。

**`%ci` 的含义**：committer date，ISO 8601 格式（如 `2026-07-20 14:52:40 +0800`）。选 `%ci`（committer）而非 `%ai`（author）的理由：committer date 反映"提交到当前分支的时间"，对博客这种"push 上线"语义更贴合。

### 3.2 插件挂载点：`before_generate`

```
hexo.extend.filter.register('before_generate', () => {
  const Post = hexo.database.model('Post');
  Post.forEach(post => { ... });
});
```

**为什么选 `before_generate`**：
- 在所有 post processor（包括 Hexo 读 `updated_option` 的 `post.js` processor）之后执行，能稳定拿到完整 Post 集合
- 在模板渲染之前，`post.updated` 的赋值会被渲染层正确读到
- 不跟 Hexo 默认的 `updated_option` 逻辑打架（我们保持 `updated_option: 'empty'`，Hexo 默认填 undefined，插件覆盖）

### 3.3 错误处理（对齐 `git-revision.js` 第 131-135 行）

```js
try {
  // 跑 git log，解析，赋值
} catch (e) {
  hexo.log.warn(`git-updated: 跳过 ${post.path} - ${e.message}`);
  // 不阻断构建，post.updated 保持 undefined
}
```

- 任何 git 错误（如浅克隆、无 `.git`、文件未提交）都被捕获并 `warn` 跳过
- 不阻断构建，符合 AGENTS.md 里 `git-revision.js` 的约束："任何 git 错误都被捕获并 warn 跳过，不会阻断构建"
- CI 构建依赖：GitHub Actions 的 `actions/checkout@v7` 已配 `fetch-depth: 0`（见 `.github/workflows/deploy.yml` 第 30 行），满足完整 git 历史要求

### 3.4 缓存（对齐 `git-revision.js` 的惰性缓存模式）

虽然 `before_generate` 只跑一次，但为防止未来扩展（如 `template_locals` 多次访问），插件内部维护一个 `Map<post.full_source, updatedValue>` 缓存。键用 `full_source`（绝对路径），跟 `git-revision.js` 第 124 行一致。

### 3.5 时区处理

`%ci` 输出已带时区偏移（`+0800`），赋给 `post.updated` 时需用 `hexo-util` 的 `timezone()` 转到配置的 `Asia/Shanghai`，跟 Hexo 处理 `post.date` 的方式一致（见 `hexo/dist/plugins/processor/post.js` 第 82-83 行）。

实现：
```js
const { timezone } = require('hexo-util');
post.updated = timezone(moment(commitDate), hexo.config.timezone);
```

## 4. 文件改动清单

### 4.1 新增：`scripts/git-updated.js`

完整插件实现，约 50-70 行。结构对齐 `scripts/git-revision.js`：
- 顶部 `'use strict'` 和 `/* global hexo */` 注释
- `git(args, cwd)` helper（跟 `git-revision.js` 第 27-29 行一致）
- `getCommitCountAndLatestDate(relPath, cwd)` 核心函数
- `before_generate` filter 注册

### 4.2 修改：`themes/next/layout/_partials/post/post-meta.njk`

第 22 行：
```njk
{# 改前 #}
{%- if theme.post_meta.updated_at.enable and (not theme.post_meta.updated_at.another_day or date_diff or not theme.post_meta.created_at) %}

{# 改后 #}
{%- if post.updated and theme.post_meta.updated_at.enable and (not theme.post_meta.updated_at.another_day or date_diff or not theme.post_meta.created_at) %}
```

**只加 `post.updated and` 一个条件**。作用：当 Hexo 数据层没有 `post.updated`（未改过的文章）时，整个"更新于"块不渲染。

**为什么这是修 NexT 既有 bug**：`post-meta.njk` 假设 `post.updated` 一定有值，所以 `date(post.updated)` 在 undefined 时回退到当前时间（见 hexo helper `date.js` 第 22 行 `if (date == null) date = moment()`），导致未改过的文章显示"更新于今天"。这是 NexT 模板层面的缺陷，加空值判断是合理修复。

**升级风险**：NexT 主题升级会覆盖本文件。补丁只有一行，升级时手动重新打即可。若未来 NexT 官方修了这个 bug，删掉补丁即可。

### 4.3 修改：`_config.next.yml`

```yaml
post_meta:
  item_text: true
  created_at: true
  updated_at:
    enable: true       # ← 从 false 改回 true（让模板渲染"更新于"）
    another_day: true  # ← 保持。作用：updated 跟 date 同一天就不显示
  categories: true
```

同时**更新该处注释**，说明：方案 A 下 `enable: true` 是安全的，因为模板已加 `post.updated` 空值判断。

### 4.4 不动：`_config.yml`

`updated_option: 'empty'` 保持不变。让 Hexo 默认不填 updated，由插件作为唯一数据源。

## 5. 验证计划

### 5.1 本地验证（实施完成后）

```bash
npx hexo clean && npx hexo generate
```

检查项（按 AGENTS.md 红线 3）：
- ✅ 无 ERROR
- ✅ `public/index.html`、`public/archives/index.html` 生成
- ✅ 关键文章页生成

### 5.2 行为验证

准备 3 个测试样本（用现有文章）：

| 文章 | git 历史 | 预期显示 |
|---|---|---|
| `hello-essays.md`（开篇，多次提交） | ≥2 commit | 发表于 + 更新于 |
| 某篇只提交过一次的文章 | 1 commit | 只显示发表于 |
| 新建未提交的文章（临时造一个）| 0 commit | 不显示更新于，且不阻断构建 |

验证方法：
1. `git log --follow --no-merges --pretty=format:%ci -- source/_posts/hello-essays.md` 看真实 commit 数
2. 生成后 `grep -c "更新于" public/<permalink>/index.html` 看是否渲染
3. `grep -oE 'datetime="[^"]*"' public/<permalink>/index.html` 看时间值是否正确

### 5.3 时区验证

确认 `post.updated` 显示的是 `Asia/Shanghai` 时区的时间，不是 UTC。方法：找一篇最近改过的文章，对比本地 `git log` 显示的时间和文章页 HTML 里的时间。

## 6. 边界情况

| 情况 | 行为 | 是否符合预期 |
|---|---|---|
| 新文章未 `git add` | 0 commit，跳过 | ✅ 本地预览不显示更新于，不阻断构建 |
| 新文章已 commit 但未 push | 1 commit，不显示 | ✅ 本地预览正常 |
| 同一天多次修改 | ≥2 commit 但 updated 跟 date 同一天 | ✅ `another_day: true` 过滤，不显示 |
| 改了文章但只改了 front-matter（如 tags） | ≥2 commit，显示更新于 | ✅ 符合"改过就算"语义 |
| 文件被重命名（`--follow` 跟踪） | 历史保留，commit 数正确 | ✅ |
| CI 浅克隆（`fetch-depth: 1`） | git log 只返回 1 行，所有文章都不显示更新于 | ⚠️ 当前 CI 已配 `fetch-depth: 0`，不会触发 |
| `hexo generate` 在无 `.git` 的目录跑 | git 报错被 catch，warn 跳过 | ✅ 不阻断构建 |

## 7. 非目标（明确排除）

- **不做"修改内容才算更新"的智能判断**：改 front-matter、改 typo、改正文，只要产生新 commit 就算更新。过滤规则会让方案复杂化，YAGNI。
- **不引入 `patch-package`**：模板补丁只有一行，手动维护成本低于引入新工具链。
- **不改 Hexo 核心 `updated_option` 语义**：插件只覆盖 `post.updated` 字段，不动 Hexo 配置项的行为。
- **不做 RSS / sitemap 的 updated 联动**：当前只关心文章页 meta 显示，RSS 用 `post.updated` 会自动跟着对，不需要额外处理。

## 8. 风险与回滚

### 8.1 风险

1. **NexT 升级覆盖模板补丁**：概率低（主题不常升级），影响小（一行补丁，5 秒重打）
2. **CI git 历史不完整**：当前 `fetch-depth: 0` 已规避，若未来误改回浅克隆，所有文章不显示更新于（不报错，静默降级）
3. **git 命令在 Windows 路径下失败**：`git-revision.js` 已在生产验证过同样的命令模式，风险低

### 8.2 回滚

如方案出现问题，回滚步骤：
1. `_config.next.yml`: `updated_at.enable` 改回 `false`
2. （可选）删除 `scripts/git-updated.js`
3. 模板补丁可保留（它是纯 bug 修复，无副作用）

回滚后状态等价于当前 main 分支（commit `73347ca`）。

## 9. 参考

- 现有 git 集成模式：`scripts/git-revision.js`
- Hexo post processor 源码：`node_modules/hexo/dist/plugins/processor/post.js` 第 80-93 行（`updated_option` 逻辑）
- Hexo date helper 源码：`node_modules/hexo/dist/plugins/helper/date.js` 第 22 行（`undefined` 回退当前时间）
- NexT 模板：`themes/next/layout/_partials/post/post-meta.njk` 第 22 行
- CI 配置：`.github/workflows/deploy.yml` 第 30 行（`fetch-depth: 0`）
