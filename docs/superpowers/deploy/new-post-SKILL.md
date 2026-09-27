---
name: new-post
description: 一键发随笔到 zzh-notes 博客（Hexo 7 + NexT + GitHub Pages）。当用户输入 /new-post <正文>，或说「发篇随笔 / 写篇新文章 / 记一下」并给出文字正文时，走文字随笔流程；说「发图 / 发张图 / 发张照片 / 发一组图 / 发个视频」并给出图片或视频文件路径与生图提示词时，走生图随笔流程（看图起标题、摘要与标签、图片超 400KB 无损压缩、视频超 5MB 用 ffmpeg 重编码、原件归档夸克网盘并附分享链接）；说「更新图池 / 换血 / 更新随机一图 / 随机一图换一批」时走图池更新流程（本机跑 tools/random-image-sync.mjs 抽新图入池、提交推送自动部署）。技能自动完成元信息推导、构建验证、提交推送与 CI 跟进，直到线上可访问。
---

# 概述

本技能把一篇随笔从「一段正文」变成「线上可访问的博客文章」，全程无需用户填写任何元信息：

- **流程 A（文字随笔）**：用户只给正文，技能推导标题、摘要、标签、slug，写文件、验证、推送、等 CI。
- **流程 B（生图随笔）**：用户给生图提示词与图片/视频路径，技能用 Read 看图起标题，按约定打标签，超 400KB 的图无损压缩、超 5MB 的视频用 ffmpeg 重编码后发布，**所有原件统一归档到夸克网盘**并生成分享链接写进正文。
- **流程 C（图池更新）**：用户一句话（如「更新图池」），技能跑本机同步工具从夸克三个图包抽新图入随机一图页图池（上限 24 张、FIFO 淘汰最旧、入过池不重抽），有变更则提交推送、等 CI 自动上线。

两条流程共享「元信息推导 → 写文件 → 本地验证 → 提交推送 → 等 CI → 汇报」骨架。仓库根目录的 `AGENTS.md` 是最高优先级约定，本文已内化其相关规则；若有出入，以 `AGENTS.md` 为准。

# 触发条件

- **流程分派看输入形态，不看措辞**：消息里给了图片或视频文件路径（1 个或多个，无论命令式还是自然语言触发）→ 流程 B；纯文字正文 → 流程 A。拿不准时按是否有文件路径分派。
- 命令式：`/new-post <正文>`（反引号或直接跟在后面的文字即正文；后面跟图片/视频路径与提示词时按输入形态走流程 B）。
- 自然语言：「发篇随笔」「写篇新文章」「记一下」「发一篇博客」等，**且消息里带了正文内容** → 流程 A；「发图」「发张图」「发张照片」「发一组图」「发个视频」等，**且给了文件路径与生图提示词** → 流程 B。
- 只说「发篇随笔」但没给正文 → 停下问一句正文是什么（这是唯一允许的回问）。生图场景缺图片路径或缺提示词 → 同样停下向用户要齐这两样输入。
- 「更新图池」「换血」「更新随机一图」「随机一图换一批」「图池换血」等（既无文章正文也无图片文件路径）→ 流程 C。
- 元信息（标题/摘要/标签/slug/时间）一律从正文或图片推导，**不向用户回问**。

# 前置检查

当前目录必须是 zzh-notes 项目，否则停下提示用户切到 `C:/Users/qqjxcjbgs/Documents/zzh-notes`：

```bash
ls _config.yml source/_posts/ && grep -m1 "^theme: next" _config.yml
```

环境事实（Windows 10 + Git Bash + powershell，node v24）：本仓库**当前没有 `node_modules/`**，验证步骤前必须先装依赖（见「本地验证」第 1 步）。已装工具链：ffmpeg 9.0.2（含 libx264/libx265）、ffprobe、jpegtran、gh 2.101.0（`C:/Program Files/GitHub CLI/`，未登录时见「提交推送与 CI」节）。

# 元信息推导（两条流程共用）

## 标题（title）

- 4-12 字中文，抓内容主题；不用「随笔」「记录」「感想」等空泛词。
- 文字随笔参考已发博客的五种风格：极简古语/四字格（「转正」「兼听则明」）、口语判断句（「一千块买了只猫」）、书名号+观感（「重读《瓦尔登湖》」）、技术陈述句（可带全角冒号，如「YOLO 训练：自有预训练 + 伪缺陷迭代」）。已发 88 篇的 88% 标题在 10 字以内，短是铁律。
- 生图随笔用**场景命名式**：色彩/光线 + 主体 + 品类（「米色墙前黑裙肖像」「灰粉CCD人像」）；有具体角色名可用「·」分层（「何仙姑·床边泪痕」）。**标题必须从图片画面推导**（见流程 B1），不是从提示词文字推导。

## 摘要（description）

- **60-100 字中文**（硬性区间；已发博客均值约 70 字，此区间正是众数区）。
- 比正文更书面化的第三人称内容概述：把口语正文提炼成通顺完整的一两句，句末用句号收束。
- 值内**不要出现半角冒号+空格**（会破坏 YAML 解析，且构建不报错、文章静默丢失）：比例写 `9:16`（冒号后不空格），分层用全角冒号「：」。
- 生图随笔用固定套语：开头「一张 <画幅比例> 竖版/横版照片级 AI 人像：<画面主体、装扮与氛围要点>」，结尾必带「记录成品与完整出图提示词」。含视频时把「一张……照片级 AI 人像/抓拍」改成「一段……照片级 AI 视频」。画幅比例的取法见 B1 第 3 步（提示词写明优先，否则 ffprobe 实测折算）。实例（已发 75 字）：
  > 一张 9:16 竖版照片级 AI 抓拍：《八仙！》何仙姑扮相半蹲床边，粉白广袖荷衣配半滑落的红披帛，高俯视镜头下仰头望向画面外，泪痕与汗珠未干。记录成品与完整出图提示词。

## 标签（tags）

- 1-3 个，YAML 列表写法。优先复用已有词表（读书、思考、生活、游戏、工作、美食、猫、诗词、转载、AI、DeepSeek……），新词也可但必须具体。
- **文字随笔绝不打「摄影」「Cosplay」**——命中 `_config.yml` 的 `ai_gallery.tags: [摄影, Cosplay]` 会被移出首页。AI 话题的纯文字随笔打 `AI` + 主题词（如 `AI`、`推荐`）即可留在首页。
- **生图随笔固定打 `AI` + `摄影`**；仅当提示词/画面有具体角色名（何仙姑、玛奇玛等）才加第三个 `Cosplay`。顺序固定：AI、摄影、Cosplay。已发 37 篇命中画廊的文章无一例外全部带 `AI`。

## 永久链接（permalink）

- kebab-case 英文短 slug：`^[a-z0-9-]+$` 加尾斜杠，语义是标题内容的英文概括，2-4 个词、11-29 字符为宜。实例：`on-focus/`、`bought-a-cat/`、`hexiangu-bedside/`、`silent-pink-bob/`。
- **定稿前先查重**（撞车会让两篇文章抢同一个 URL，且已发布 permalink 绝不可改）：

  ```bash
  grep -rl "permalink: <slug>/" source/_posts/     # 有输出即撞车，换一个 slug 再查，直到无输出
  ```

- **一旦生成、发布后绝不修改**（外链失效）。生图随笔的素材文件名以该 slug 为前缀（见流程 B3）。

## 日期与文件名

- date 用本机当前时间（Git Bash 里执行）：

  ```bash
  powershell -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"
  ```

  格式必须是 `YYYY-MM-DD HH:MM:SS`（全站 88/88 篇一致）。不写 `updated` 字段（由 git 插件按提交数自动决定）。
- 文章文件名 = `<中文标题>.md`，放 `source/_posts/`。标题里的 Windows 非法/不便字符在**文件名**中替换省略（如全角冒号换空格），标题本身保留原样。

## 文章模板与写文件规范

front-matter 模板（恰好 5 个字段，与全站一致；`scaffolds/post.md` 里没有 description，必须手写补上）：

```markdown
---
title: 标题草稿
date: 2026-09-27 10:30:00
tags:
  - 标签一
  - 标签二
permalink: example-slug/
description: 用六十到一百字的中文书面语，以第三人称概括正文内容，写成通顺完整的一两句话并以句号收束。
---

（正文从这行开始，与 front-matter 之间保持一个空行）
```

写文件规范（违反任何一条都会导致「CI 显示 success 但文章静默丢失」或 YAML 解析失败）：

- 用 **Write 工具**写文件，不用 echo/cat 重定向。
- YAML 每个冒号后必须有空格（`key: value`）。
- tags 每项前是**两个空格 + `- `**，如上模板；绝不写标量式 `tags: 专心`。
- front-matter 结束的 `---` 与正文之间空一行；正文末尾保留换行。

# 流程 A：文字随笔

1. **取正文**：`/new-post` 后面的内容，或自然语言请求里的正文部分。指令语本身（「帮我发篇随笔」）不是正文，绝不写进文章。
2. **推导元信息**：按上节规则得 title / description / tags / permalink / date / 文件名。
3. **写文件**：按模板用 Write 工具写 `source/_posts/<中文标题>.md`。用户正文**原样保留**，不润色、不删改、不补充（正文形态由用户定：一两句口语、格言原文、长文技术稿都合法）。
4. 依次执行：**本地验证 → 提交推送 → 等 CI → 汇报**（见后文各节）。

# 流程 B：生图随笔

输入三样：图片/视频文件路径（1..n 个；图片 jpg/jpeg/png/webp，视频 mp4/mov/webm）、生图提示词全文、可选的补充说明。**提示词全文就是博客正文的完整内容**——逐字粘贴进正文，绝不删改、压缩或总结；正文其余部分（素材引用、中文短评、网盘链接行）沿用已发 38 篇生图随笔的固定结构（2026-09-22 起定型）。

## B1 收素材与看图

1. 逐个确认存在并记录字节数（图片与视频同样处理）：

   ```bash
   IMG=$(cygpath -m "<用户给的文件路径>")   # 统一成 C:/... 形式，后续 node 命令可直接用
   wc -c < "$IMG"
   ```

2. **用 Read 工具逐个查看图片/视频**（Read 支持 MP4/MOV/WEBM），得出画面主题。标题（场景命名式）、中文短评、description 的画面要点都从这里来——这是需求的硬性要求，不许跳过看图直接照抄提示词起标题。
3. 顺手记录画幅比例（description 套语要用）：提示词写明比例（如 9:16）就用它；没写就实测（图片也能量），折算成最接近的常见比例（16:9、9:16、4:3、3:4、1:1、3:2、2:3），都不贴切就略去比例只写竖版/横版：

   ```bash
   ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$IMG"
   ```

## B2 逐素材判定与压缩

阈值：**图片 409600 字节（400 × 1024）**；**视频 5242880 字节（5 MB）**（400KB 对视频无意义，几乎必超）。对每个素材：

- ≤ 阈值 → **发布就用这份原件**（原样复制，B3 步骤），但仍要归档夸克（B4，统一口径）。
- > 阈值 → 压缩出发布件，原件只上夸克、**绝不进 git 仓库**。

**产物路径规则（B3 的 cp 依赖它）**：逐张处理，每张压完立即 `wc -c` 并记录产物完整路径。sharp-cli 的产物名 = 输入文件主名 + 输出格式扩展名（`IMG_1234.jpg` 压 jpeg 得 `IMG_1234.jpg`、压 webp 得 `IMG_1234.webp`）；**多张图主名相同会互相覆盖，此时每张单独 `mktemp -d` 一个输出目录**。jpegtran / ffmpeg 的输出路径在命令里显式指定，无歧义。压完 `ls "$OUTDIR"` 核对实际文件名后再进 B3。

图片压缩命令（按扩展名分支；输出目录必须已存在、目录名别用单个字母）：

```bash
OUTDIR=$(mktemp -d)                        # 压缩输出目录（在仓库外）
# PNG：严格无损重压缩 + 剥离元数据（像素级一致已在本机验证）
npx --yes sharp-cli -i "$IMG" -o "$OUTDIR/" -f png -c 9
# JPEG 第一步：严格无损（jpegtran 已装并实测；-copy none 剥元数据，-optimize 优化霍夫曼表）
jpegtran -copy none -optimize -outfile "$OUTDIR/$(basename "$IMG")" "$IMG"
```

- JPEG 流程：先 jpegtran 严格无损；产物仍 > 409600 时再降到视觉无损 `npx --yes sharp-cli -i "<jpegtran 产物>" -o "<新目录>/" -f jpeg -q 95 --mozjpeg --progressive`，并在汇报里如实说明走了有损一步。
- PNG **绝对不要加 `--effort`**：sharp 0.35 的 PNG effort 会隐式开启 256 色调色板量化，属有损。
- 多张同格式图可一次处理：`npx --yes sharp-cli -i a.png -i b.png -o "$OUTDIR/" -f png -c 9`；PNG/JPEG 混合时分开跑（`-f` 是全局参数）。
- `npx --yes sharp-cli` 首次运行需联网下载，之后走本地缓存；拉取失败属「压缩工具缺失」，走失败降级（见后文），**不静默发大图**。JPEG 在 sharp 拉取失败时可先试本机 jpegtran（本地工具不依赖网络）。
- 图片压缩后仍 > 409600：PNG 先试严格无损的 WebP（浏览器全支持）`npx --yes sharp-cli -i "$IMG" -o "<新目录>/" -f webp --lossless`；JPEG 可降到 `-q 90`。再超就停下，向用户如实报告前后字节数并给三个选项：(a) 接受 >400KB 发布；(b) 用户同意后转 JPEG q90-95（放弃严格无损）；(c) 降分辨率（有损）。无损压不动是真实存在的（随机噪声类内容实测仅 +0.16%），**不许诺一定能压进 400KB，如实报告字节数**。

视频压缩（>5MB 时；mov/webm 不论大小一律转成浏览器兼容的 mp4/H.264，命令已实测）：

```bash
ffmpeg -y -i "$VID" -c:v libx264 -crf 23 -preset slow -c:a aac -b:a 128k -movflags +faststart "$OUTDIR/<slug>-N.mp4"
```

- 无音轨时 `-c:a` 自动忽略，命令同样成立。CRF 23 是质量/体积均衡值；压完仍明显超 5MB 可用 `-crf 26` 再压一次并如实报告前后字节数。视频**不做无损承诺**（H.264 重编码是有损转码），原件进夸克保真。

## B3 布置资源文件夹

```bash
mkdir -p "source/_posts/<中文标题>/"
cp "<发布图（≤400KB 的那张，或压缩输出目录里的产物）>" "source/_posts/<中文标题>/<slug>-1.<jpg|png|webp>"
cp "<发布视频（≤5MB 的原件，或 ffmpeg 产物）>" "source/_posts/<中文标题>/<slug>-N.mp4"
```

- 素材文件名 = `<slug>-N.<ext>`（图片与视频共用一条编号流，N 从 1 连续），**单素材也带 -1**（与已发博客约定一致：`hexiangu-bedside-1.jpg`、`white-shirt-camisole-portrait-1.mp4`）。
- `cp` 后 `ls "source/_posts/<中文标题>/"` 核对实际文件名，正文引用必须与实际文件名逐字符一致（扩展名跟实际格式：png 压缩产物是 .png、webp 是 .webp、jpeg 统一用 .jpg、视频一律 .mp4）。
- 未压缩原件（超阈值的那些）留在原位置或临时目录，**绝不复制进 `source/_posts/`**。

## B4 原图归档夸克网盘 + 分享链接

**统一口径：每一个原件（图片与视频，无论是否超阈值、无论是否压缩过）都上传到夸克网盘「博客原图/<slug>/」归档**——超阈值的博客只发压缩件，原件仅存网盘；不超阈值的博客发的就是原件，同时仍上网盘留一份。**未压缩原件绝不放进 git 仓库。**

调用夸克 CLI 前先跑其环境检查（夸克技能 SKILL.md 的约定）：

```bash
bash "C:/Users/qqjxcjbgs/.zcode/skills/quarkclouddrive/scripts/install.sh"
```

通过判据：退出码 0、秒级返回、不进入下载/安装动作（装过即幂等自检）。若它卡住、要求交互或失败：不要纠缠，直接试第一条夸克命令；命令因环境问题失败就走「夸克未绑定 / 授权失效」降级（见失败表），不阻断发布。

首次调用前生成会话 ID（同一对话内所有夸克命令复用同一个）：

```bash
SID="$(date +%s)-$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | cut -c1-6)"
```

每条夸克命令都必须带公共参数：`--session-input "<用户本次对话的原始提问，逐字复制，禁止改写摘要>"` 和 `--session-id "$SID"`（下面用占位符表示）。

第一步，确保「博客原图」存在并取其 FID（create-folder 幂等，已存在时直接返回现成 FID；**必须显式 `--parent-fid "0"` 才是根目录**，不传会建到平台默认目录）：

```bash
node "C:/Users/qqjxcjbgs/.zcode/skills/quarkclouddrive/scripts/quark-drive.cjs" create-folder --dir-path "博客原图" --parent-fid "0" --session-input "<SESSION_INPUT>" --session-id "<SESSION_ID>"
```

从输出 `type:"result"` 行取 `data.fid`（记为 `<GALLERY_FID>`）。第二步，建本篇子文件夹（子文件夹名 = 英文标题 = permalink slug，去掉尾斜杠）：

```bash
node "C:/Users/qqjxcjbgs/.zcode/skills/quarkclouddrive/scripts/quark-drive.cjs" create-folder --dir-path "<slug>" --parent-fid "<GALLERY_FID>" --session-input "<SESSION_INPUT>" --session-id "<SESSION_ID>"
```

取 `data.fid`（记为 `<DIR_FID>`）。第三步，**全部原件（图 + 视频）**一次上传（路径用 B1 的 `C:/...` 绝对路径）：

```bash
node "C:/Users/qqjxcjbgs/.zcode/skills/quarkclouddrive/scripts/quark-drive.cjs" upload "<原件1>" "<原件2>" --parent-fid "<DIR_FID>" --session-input "<SESSION_INPUT>" --session-id "<SESSION_ID>"
```

成功时最后一行 `type:"result"` 的 `code` 为 0，取 `data.fids`（文件 FID 列表）。第四步，创建公开永久分享链接（正文末尾要用）：

```bash
node "C:/Users/qqjxcjbgs/.zcode/skills/quarkclouddrive/scripts/quark-drive.cjs" share <fid1> [<fid2>...] --title "<中文标题> 原图" --session-input "<SESSION_INPUT>" --session-id "<SESSION_ID>"
```

（`--url-type`、`--expired-type` 用默认值 1：公开、永久。）取 `data.share_url`。

硬性注意（均出自夸克技能文档与实测）：

- **FID 是含 `|` 竖线尾串的长字符串，必须完整复制、不能截断**，命令行里加双引号防 shell 解析。
- stdout 为 NDJSON（一行一个 JSON）；命令失败时进程退出码为 1 并输出一行 `code` 为负数的 `type:"result"`。
- `code` 为非零负数且 `msg` 含「未授权/认证/token」→ 授权失效，**禁止重试原命令**，走失败降级（见后文）。
- 部分上传失败时 result 行 `code:-204`；断点续传可用 `upload list --state failed` 找 `recordId`、`upload resume --record-id <ID>` 续传。
- **绝不调用 `logout` 或 `bash scripts/uninstall.sh`**（撤销授权 + 删配置，不可逆）。绝不读取 `quark-drive.cjs` 源码，绝不向用户暴露协议字段/内部实现。
- 向用户描述归档位置按 `fullPath` 规则：`fullPath` 为空或不含 `/` 时只说「已上传到夸克网盘」，**禁说「根目录」**。

## B5 写文章

用 Write 工具写 `source/_posts/<中文标题>.md`，结构如下（front-matter 字段与共用模板一致，tags 按生图约定；正文四段式为已发博客定型结构）：

```text
---
title: <中文标题>
date: <「日期与文件名」节取得的本机时间>
tags:
  - AI
  - 摄影
permalink: <slug>/
description: <60-100 字，生图套语：一张 <比例> 竖版照片级 AI 人像：<画面要点>。记录成品与完整出图提示词。>
---

![<中文标题>](<slug>-1.jpg)

<视频时用这行，无视频删掉：><video src="/zzh-notes/<slug>/<slug>-2.mp4" controls muted playsinline loop style="width:100%;border-radius:8px;"></video>

<中文文学化短评：一句或一段，描述画面与创作意图>

<完整出图提示词原文，逐字粘贴，可分多段，绝不删改总结>

---

> 原图（未压缩）：[夸克网盘分享](<share_url>)
```

- 素材引用打头：图片每张一行 `![<中文标题>](<slug>-N.jpg)`（多图时 alt 文本带编号「二」「三」）；视频用 `<video src="/zzh-notes/<slug>/<slug>-N.mp4" controls muted playsinline loop style="width:100%;border-radius:8px;"></video>`（与已发视频随笔逐字同款）。素材之间空行。
- 网盘链接行是已发 38/38 篇生图随笔的固定收尾。若分享链接创建失败但上传成功，该行写 `> 原图（未压缩）：已归档夸克网盘「博客原图/<slug>」（分享链接创建失败，可后续补）`；若归档整体失败：**不阻断发布**，显著告知「原件未归档」与原件本地路径（与失败表口径一致），用户想补归档时再重跑 B4。

写完后依次执行：**本地验证（含图片路径加验）→ 提交推送 → 等 CI → 汇报**。

# 流程 C：更新随机一图图池

把夸克网盘三个图包（小语会员图包 / 团子朋友圈原图 / 橙子的照片）里未入过池的图抽新入池，替换最旧的，上线随机一图页（https://zzh-learner.github.io/zzh-notes/random/）。

1. **同步**（工具读本机夸克 CLI 鉴权，无需用户输入；三夹合计约 1.9 万张，池上限 24 张）：

   ```bash
   node tools/random-image-sync.mjs            # 默认每日 4 张新图入池 + FIFO 淘汰最旧
   ```

   可选参数：`--dry-run` 只列选中文件名不写入（预览）；`--daily N` 指定张数；`--folder xiaoyu|tuanzi|chengzi` 只跑一夹（调试）。

2. **成功判据**：退出码 0，输出末行形如「入池 N 张，淘汰 M 张；池内现存 X/24 张」。N=0 属正常（无事可做）。**退出码非 0 → 不提交不推送**，把输出关键行如实报告给用户。
3. **无变更**（N=0 且 M=0）→ 不提交不推送，直接汇报「本次无新图入池，线上图池不变」。
4. **有变更 → 提交推送**（本机直连 GitHub 超时，push 必须带一次性代理参数，不改全局配置）：

   ```bash
   git add source/random tools/random-image-state.json
   git commit -m "chore(random-image): pool refresh (+N)"
   git -c http.proxy=http://127.0.0.1:7897 push
   ```

5. **等 CI**：`source/**` 在 deploy.yml paths 过滤器内，push 必触发部署，跟进方式见「提交推送与 CI」节。图池更新不改站点配置/依赖/脚本，**无需本地 hexo 构建**（AGENTS.md 红线 3 针对的是配置与插件改动）。
6. **汇报**：入池 N 张（列来源文件夹）、淘汰 M 张、池 X/24 张、线上地址。

# 本地验证（不可跳过）

1. 依赖检测——本仓库当前没有 `node_modules/`，缺了先装并告知用户首次较慢：

   ```bash
   [ -d node_modules ] || npm install
   ```

2. 构建并检查（`npx hexo clean && npx hexo generate` 必须 exit 0 且输出无 ERROR；只看「build 成功」不够，缺页面的构建也显示成功）：

   ```bash
   npx hexo clean && npx hexo generate
   ls "public/<slug>/index.html" "public/index.html" "public/archives/index.html"
   ```

   三个文件缺一即失败。permalink 带尾斜杠，对应产物就是 `public/<slug>/index.html`。

3. 生图随笔加验图片路径（防 `marked` 配置键写错导致图片 404 且无 ERROR）：

   ```bash
   grep -o '<img[^>]*src="[^"]*"' "public/<slug>/index.html"
   ```

   确认 src 形如 `/zzh-notes/<slug>/<slug>-1.jpg`（含 permalink 段与资源文件名）。

4. 任何一步失败：**停止，不推送**，把日志关键行（如 `Process failed: _posts/xxx.md`）展示给用户，按 `AGENTS.md` 排查速查表定位；不盲推、不跳过、不替用户改配置。

# 提交推送与 CI

验证通过后才执行。只提交文章与同名资源文件夹，**绝不含未压缩原件**：

```bash
git status --short                                   # 先确认待提交内容只有文章与资源文件夹
git add "source/_posts/<中文标题>.md" "source/_posts/<中文标题>/"
git commit -m "post: <中文标题>"
git push
```

- 提交信息格式 `post: <中文标题>`（全站惯例）；同文后补原图用 `post: <标题>（补原图）`。
- `git push` 网络失败：重试 1-2 次；仍失败则告知用户「本地已提交，网络恢复后请手动 `git push`」，不要反复盲试。
- CI 跟进（`source/**` 在 deploy.yml 的 paths 过滤器内，push 必触发部署）：

  ```bash
  sleep 5 && gh run list --limit 1        # 取最新 run 的 ID
  gh run watch <run-id> --exit-status     # 阻塞等到结束；退出码非 0 即失败
  ```

- CI 失败：`gh run view <run-id> --log-failed` 展示关键日志给用户，不自动重试部署。本机 gh 2.101.0 已装（`C:/Program Files/GitHub CLI/`，新开的终端 `gh` 直接可用）；若 `gh` 报未登录，提示用户跑一次 `gh auth login`，本次降级为「push 已完成，请到仓库 Actions 页查看」。

# 汇报

上线成功后向用户报告：

- 标题、标签、永久链接 `https://zzh-learner.github.io/zzh-notes/<permalink>/`。
- 生图随笔另报：每个素材压缩前后的字节数（如实，即使没压进阈值）；原件归档情况（按 fullPath 话术，如「已上传到「夸克网盘/博客原图/<slug>」目录」）与分享链接；**提醒：本文已打「摄影」标签，会进 `/ai/` 生图聚合页且不出现在首页——这是仓库预期行为，不是丢文章**。
- 若走了任何降级分支（原件未归档、素材超阈值仍发布等），在汇报里**显著**说明。

# 失败与降级

| 场景 | 处置 |
|------|------|
| 当前目录不是 zzh-notes 项目 | 停下，提示切到 `C:/Users/qqjxcjbgs/Documents/zzh-notes` |
| 用户没给正文 / 缺图片路径或缺提示词 | 停下向用户要齐输入（唯一允许的回问） |
| 压缩工具缺失（npx sharp-cli 拉取失败）且图 >400KB | 停下向用户说明并给选项（联网重试 / 用户手动压缩后再发 / 用户明确同意后发大图），**不静默发大图** |
| 无损压缩后仍 >400KB | 如实报告前后字节数，给三选项（接受超限 / 用户同意后有损转码 / 降分辨率），不自行决定 |
| JPEG >400KB | 第一步 `jpegtran -copy none -optimize`（已装并实测，严格无损）；仍超 409600 再 sharp q95 视觉无损，并**如实告知已走有损一步** |
| 视频 >5MB / mov / webm | ffmpeg 重编码转 mp4/H.264（已实测）；仍明显超 5MB 可 `-crf 26` 再压一次并如实报告。视频不承诺无损，原件进夸克保真 |
| 夸克未绑定 / 授权失效（code 为负且 msg 含未授权/认证/token） | **不重试原命令**，不在本技能内自动走登录流程；告知用户需到夸克技能完成重新授权，本次跳过归档、**不阻断博客发布**，显著告知「原图未归档」及原图本地绝对路径 |
| 上传失败（含 result code:-204） | 不阻断发布；可提示用 `upload list` / `upload resume --record-id <ID>` 断点续传；汇报中显著告知未归档与原图本地路径 |
| 分享链接创建失败但上传成功 | 博客照发，正文网盘行改写为归档位置说明（见 B5） |
| 图池同步鉴权失效（退出码 42 或输出含未授权/认证/token） | 告知用户需到夸克技能完成重新授权后重跑流程 C；线上页面不受影响，本次终止 |
| 图池同步其他失败 | 重试一次；再失败如实报告工具输出，不提交（工具保证失败项不入池不写 manifest） |
| hexo 验证失败 / 缺页面 | **停止不推送**，展示日志关键行 |
| git push 网络失败 | 重试 1-2 次后告知「本地已提交」，等网络恢复手动推 |
| CI 失败 | `gh run view <run-id> --log-failed` 展示日志，不自动重试 |

# 约定与禁忌

- **不改已发布 permalink**；slug 一次定稿。
- **不跳验证**：永远先 `npx hexo clean && npx hexo generate` 并检查三个关键页面，后 push。
- **不把指令语写进正文**；用户正文原样保留；生图提示词逐字全文进正文。
- **不装 `hexo-renderer-nunjucks`**（会让首页/归档页无法生成）；依赖清单不精简（14 个都是必需）。
- **不改 `themes/next/` 主题源码**；一切定制只走 `_config.next.yml` 注入点或 `scripts/` 插件。
- **未压缩原图绝不进 git 仓库**；`git add` 只加文章 .md 与同名资源文件夹（流程 C 则只加 `source/random` 与 `tools/random-image-state.json`）。
- 普通文字随笔**绝不打「摄影」「Cosplay」**；生图随笔固定 `AI` + `摄影`（有具体角色名才加 `Cosplay`）。
- `marked` 配置如需改动，键名是 camelCase（`prependRoot` / `postAsset`）——但本技能正常情况下**不改任何配置文件**。
- 夸克 CLI：FID 完整传值加引号；`--session-input` 逐字复制用户原始提问；`--session-id` 首次生成、同对话复用；绝不 `logout` / `uninstall.sh`；绝不读 `quark-drive.cjs` 源码或向用户暴露协议字段。
