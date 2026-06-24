# new-post skill 部署交接文档

- **日期**：2026-06-24
- **用途**：把 `new-post` skill 部署到新机器，实现"只给正文 → 自动生成标题/标签/slug → 验证 → 推送上线"的一键发随笔流程。
- **适用范围**：ZZH 的随笔博客 `zzh-notes`（Hexo 7 + NexT，GitHub Pages）。

---

## 一、这个 skill 是什么

`new-post` 是一个 ZCode 个人 skill。触发后，用户只需提供正文，skill 自动完成：

1. 从正文推导标题（中文）、标签、英文 permalink slug、当前时间
2. 写成标准 front-matter 的 Markdown 文件到 `source/_posts/`
3. `hexo clean && hexo generate` 本地验证（无 ERROR 才继续）
4. `git add / commit / push`
5. 等 GitHub Actions CI 跑完，报告线上永久链接

**触发方式**（二选一）：
- 斜杠命令：`/new-post <正文内容>`
- 自然语言："帮我发篇随笔：<正文>" / "记一下：<正文>"

---

## 二、新机前置条件

部署 skill 前，新机器必须先具备以下环境（缺一不可）：

### 1. ZCode CLI 已安装并配置

- 能正常启动 ZCode 会话
- `~/.zcode/` 目录存在
- 已配置模型 provider（参考 `~/.zcode/cli/config.json`）

### 2. Node.js 已安装

```bash
node --version   # 需要 v20 或更高
```

### 3. zzh-notes 项目已 clone 并可构建

```bash
git clone https://github.com/zzh-learner/zzh-notes.git
cd zzh-notes
npm install
npx hexo generate   # 确认能成功生成
```

### 4. Git 全局配置已就绪

```bash
git config --global user.name   # 应有值
git config --global user.email  # 应有值
```

### 5. GitHub CLI 已登录

```bash
gh auth status   # 应显示 Logged in to github.com account zzh-learner
```
未登录则 `gh auth login` 按提示完成浏览器授权。

### 6. git 代理已配置（国内必做，否则 push 必超时）

⚠️ **这是最容易漏的一步。** 国内直连 `github.com:443` 几乎必然超时。必须让 git 走本地代理：

```bash
git config --global http.proxy http://127.0.0.1:7897
git config --global https.proxy http://127.0.0.1:7897
```

**确认代理端口**：上面用的是 `7897`（Clash/Mihomo 默认）。如果新机的代理软件端口不同（如 `7890`），用实际端口替换。验证代理可用：

```bash
curl -s -o /dev/null -w "%{http_code}\n" -x http://127.0.0.1:7897 https://github.com --max-time 15
# 输出 200 = 代理通；输出 000 = 端口不对或代理没开
```

如果新机不用代理（如海外机器或已全局 VPN），跳过此步。

---

## 三、部署 skill（核心步骤）

### Step 1：创建 skill 目录

skill 是 ZCode 的"个人 skill"，放在用户主目录的 `~/.agents/skills/` 下（与 mem-recall、trellis-meta 等同级）。

```bash
mkdir -p ~/.agents/skills/new-post
```

Windows 路径为 `C:\Users\<用户名>\.agents\skills\new-post\`。

### Step 2：写入 SKILL.md

在该目录下创建 `SKILL.md`，**完整内容见本文档第四节**，一字不差地复制。

> 也可直接从已部署的机器拷贝：源文件 `~/.agents/skills/new-post/SKILL.md`。

### Step 3：验证 skill 被识别

重启 ZCode 会话（或新开一个会话），确认 skill 出现在可用列表中。可直接试触发：

```
/new-post 这是一篇测试随笔的正文内容。
```

若 skill 被调用并开始执行生成流程，则部署成功。

---

## 四、SKILL.md 完整内容（直接复制）

```markdown
---
name: new-post
description: 在 ZZH 的随笔博客（zzh-notes，Hexo + NexT）里一键发新随笔。用户只给正文，自动生成标题/标签/英文 permalink，写成标准 front-matter，本地验证后 commit + push 上线。当用户说"发篇随笔"、"写篇新文章"、"记录一下"、"记个灵感"并给出正文时触发；也响应用户直接输入 `/new-post <正文>`。只在含 `_config.yml` 且 `theme: next` 的 zzh-notes 项目目录下生效。
---

# New Post — 一键发随笔

在 zzh-notes 博客里，用户只提供正文，本 skill 负责生成全部元信息、写成标准文件、验证、提交推送，全自动上线。

## 触发条件

满足以下任一即触发：
- 用户输入 `/new-post <正文内容>`
- 用户说"发篇随笔 / 写篇新文章 / 记一下"之类，并提供了正文
- 用户明确表示要把一段文字作为新随笔发布

## 前置检查（每次必做）

1. 确认当前目录是 zzh-notes 项目：存在 `_config.yml` 且 `theme: next`，存在 `source/_posts/`。
   - 若不是，停下告诉用户："这个 skill 只在 zzh-notes 项目里可用，请 cd 到项目目录。"
2. 从用户输入中取出**正文**：
   - 斜杠命令：`/new-post 后面的全部内容` 就是正文
   - 自然语言：把用户描述要写的内容提炼为正文（不要把"帮我发篇随笔"这种指令本身算进正文）

## 生成元信息（从正文推导，不要回头问用户）

- **title**：从正文提炼一个简短的中文标题（4-12 字），抓住核心主题。不要用"随笔"、"记录"等空泛词。
- **tags**：从正文识别 1-3 个关键词作标签。用列表格式（每项前 `  - `）。
- **permalink**：生成英文短 slug，kebab-case（如 `on-focus`、`a-walk-in-rain`）。一旦生成，**绝不修改**。
- **date**：取当前时间，格式 `YYYY-MM-DD HH:MM:SS`，时区 Asia/Shanghai。可用 `powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"` 获取。
- **文件名**：用 title（中文），加 `.md`，放 `source/_posts/` 下。

## 写文件（严格遵守 front-matter 格式）

文件内容模板（**冒号后必须有空格，tags 用列表**——这是踩过坑的红线）：

\`\`\`markdown
---
title: <生成的中文标题>
date: <当前时间>
tags:
  - <标签1>
  - <标签2>
permalink: <英文slug>/
---

<用户给的正文>
\`\`\`

注意：
- front-matter 和正文之间空一行。
- 正文末尾保留一个换行。
- 用 Write 工具写文件，不要用 echo/cat 重定向（避免编码和换行问题）。

## 验证（对应 AGENTS.md 红线，不可跳过）

写完文件后，立即跑：

\`\`\`bash
npx hexo clean && npx hexo generate
\`\`\`

检查输出：
- **必须无 \`ERROR\`**。若出现 \`Process failed: _posts/xxx.md\`，多半是 front-matter 的 YAML 语法错（冒号后缺空格等），修正后重跑。
- 确认文章页已生成：检查 \`public/<permalink>/index.html\` 存在。
- 确认文章进了首页和归档：\`index.html\`、\`archives/index.html\` 都应存在。

验证失败就**停下报错**，把错误日志给用户看，不要盲目推送。

## 提交并推送（验证通过后）

\`\`\`bash
git add "source/_posts/<文件名>.md"
git commit -m "post: <标题>"
git push
\`\`\`

若 push 因网络失败，重试 1-2 次；仍失败就告诉用户"本地已提交，网络恢复后手动 \`git push\`"。

## 等待 CI 并报告

推送后等约 10 秒，用 \`gh run list --limit 1\` 取最新 run，\`gh run watch <id> --exit-status\` 等 CI 完成。

CI 成功后，给用户报告：
- 标题
- 永久链接：\`https://zzh-learner.github.io/zzh-notes/<permalink>/\`
- 标签

CI 失败则看 \`gh run view <id> --log-failed\` 报错给用户。

## 不要做的事

- 不要修改已发布文章的 \`permalink\`。
- 不要在非 zzh-notes 目录下执行。
- 不要跳过 \`hexo generate\` 验证直接推送。
- 不要把用户的指令语（"帮我发篇随笔"）写进正文。
- 不要装 \`hexo-renderer-nunjucks\`（见 AGENTS.md 红线）。
```

> **注意**：上面代码块里的 `` \`\`\` `` 和 `` \` `` 转义符是本文档为嵌套展示加的，**实际写入 SKILL.md 时去掉所有反斜杠**，恢复成正常的三个反引号和单反引号。

---

## 五、部署后验证流程

部署完成后，跑一次完整测试确认 skill 工作正常：

1. **进入项目目录**：
   ```bash
   cd <path-to>/zzh-notes
   ```

2. **触发 skill**（在 ZCode 会话里）：
   ```
   /new-post 这是一篇部署验证用的测试随笔，确认 skill 能正常工作。
   ```

3. **预期 skill 自动完成**：
   - 生成标题、标签、permalink
   - 写入 `source/_posts/<标题>.md`
   - `hexo generate` 无 ERROR
   - `git commit && git push` 成功
   - CI 跑绿
   - 报告线上链接

4. **线上确认**（强制刷新浏览器 `Ctrl+F5`，避免缓存）：
   - 首页 <https://zzh-learner.github.io/zzh-notes/> 出现该文章
   - 文章 permalink 页可访问

5. **清理测试文章**（可选）：
   ```bash
   git rm "source/_posts/<测试文章>.md"
   git commit -m "chore: remove deploy-test post"
   git push
   ```

---

## 六、常见问题

### Q1：skill 触发不了 / 不在可用列表里

- 确认文件路径精确是 `~/.agents/skills/new-post/SKILL.md`（目录名和文件名必须严格一致）
- 确认 SKILL.md 的 YAML front-matter 格式正确（`---` 包裹，`name:` 和 `description:` 两个键）
- 重启 ZCode 会话让 skill 重新加载

### Q2：push 一直超时失败

就是代理问题，见本文档第二节第 6 点。诊断：
```bash
git config --global --get http.proxy   # 应输出 http://127.0.0.1:7897
```
没配就配上；配了还不通，确认代理软件正在运行且端口对。

### Q3：skill 执行了但文章没上线

两种可能：
1. **CI 构建失败**：`gh run list` 看 conclusion 是不是 success，失败的话 `gh run view <id> --log-failed` 看日志（常见是 YAML 语法错）。
2. **浏览器缓存**：服务器其实更新了，`Ctrl+F5` 强制刷新。用 curl 确认服务器实际内容：
   ```bash
   curl -s "https://zzh-learner.github.io/zzh-notes/" | grep "<文章标题>"
   ```

### Q4：生成的时间不对

skill 用 `Get-Date` 取系统时间。如果新机时区不是 Asia/Shanghai，时间会偏。确认系统时区，或在 skill 里改用固定偏移。

---

## 七、相关文件索引

| 文件 | 位置 | 作用 |
|------|------|------|
| **SKILL.md（本 skill）** | `~/.agents/skills/new-post/SKILL.md` | skill 本体，部署目标 |
| AGENTS.md | 项目根 `zzh-notes/AGENTS.md` | 项目红线规则，skill 必须遵守 |
| 文章模板 | `zzh-notes/scaffolds/post.md` | `hexo new` 用的模板（skill 不依赖它，但格式一致） |
| 踩坑记录 | `zzh-notes/docs/superpowers/lessons/2026-06-23-hexo-next-setup-pitfalls.md` | Hexo+NexT 搭建的 5 个坑 |
| 实施计划 | `zzh-notes/docs/superpowers/plans/2026-06-23-zzh-notes-blog.md` | 博客搭建全流程 |
| 设计文档 | `zzh-notes/docs/superpowers/specs/2026-06-23-zzh-notes-blog-design.md` | 需求与架构设计 |

---

## 八、部署清单（照着勾）

部署到新机时，逐项确认：

- [ ] ZCode CLI 已安装、可启动会话
- [ ] Node.js v20+ 已安装（`node --version`）
- [ ] zzh-notes 已 clone，`npm install` + `hexo generate` 成功
- [ ] `git config --global user.name/email` 已设
- [ ] `gh auth status` 已登录 zzh-learner
- [ ] git 代理已配（国内）：`git config --global http.proxy http://127.0.0.1:7897`
- [ ] `~/.agents/skills/new-post/SKILL.md` 已创建（内容见第四节）
- [ ] ZCode 会话已重启，skill 出现在可用列表
- [ ] 触发 `/new-post <测试正文>` 全流程跑通
- [ ] 线上确认文章可见（`Ctrl+F5` 刷新）
