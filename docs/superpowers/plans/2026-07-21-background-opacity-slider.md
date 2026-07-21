# 背景图明暗滑块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在网页 header 右侧加图标按钮，点击展开 popover 滑块，拖动可实时调节全站背景图可见度（0=完全隐藏，100=完全可见），localStorage 持久化，颜色随 `[data-theme]` 自动切换。

**Architecture:** 单一 CSS 变量 `--bg-overlay-opacity`（0~1）驱动 `body::before` 遮罩透明度。滑块 JS 只更新这一个变量；亮/暗色用 `[data-theme]` 选择器分别定义遮罩颜色。正交解耦：滑块管可见度，主题管颜色。

**Tech Stack:** Hexo 7 + NexT 8，原生 JS（IIFE），CSS 变量，localStorage，Font Awesome 图标。

## Global Constraints

- **Node.js 20 LTS**（见 `README.md`）
- 不引入任何新 npm 包（红线 2：依赖清单完整，不要"精简"也不要"扩充"）
- 改动后必须 `npx hexo clean && npx hexo generate` 验证无 ERROR（红线 3）
- 不动 `_config.yml` 的 `url` / `root`（红线 4）
- 资源路径带项目根 `/zzh-notes/`（CSS 里 url 已带，不动）
- 新增 DOM 只能加在 `source/_data/header.njk` 和 `source/_data/body-end.njk`；新增样式只能加在 `source/_data/styles.styl`；新增 JS 只能加在 `source/_data/body-end.njk`
- 触发部署路径覆盖：`source/_data/**` 已在 `.github/workflows/deploy.yml:14` 的 `paths` 列表里，本次所有改动都会自动触发部署
- 所有 IIFE 必须 try/catch 包裹 localStorage 调用，避免隐私模式抛错
- 所有新增按钮必须复用现有 `.theme-toggle` 风格骨架（32×32、transparent、hover 浅底）

---

## File Structure

| 文件 | 责任 | 改动类型 |
|------|------|---------|
| `source/_data/header.njk` | 新增 DOM：背景按钮 + popover 容器 | 新增约 15 行 |
| `source/_data/styles.styl` | 改遮罩读 CSS 变量；文章卡片改透明；新增按钮 + popover + 滑块样式 | 修改 + 新增约 130 行 |
| `source/_data/body-end.njk` | 新增独立 IIFE：滑块逻辑 + popover 开关 + localStorage | 新增约 70 行 |

**职责边界**：
- `header.njk` 只负责 DOM 结构（按钮和 popover 容器），不含逻辑
- `styles.styl` 只负责视觉，不读取 localStorage
- `body-end.njk` 的 IIFE 只操作 CSS 变量和 DOM 属性，不直接写 inline style

---

## Task 1：在 header.njk 加 DOM（按钮 + popover）

**Files:**
- Modify: `source/_data/header.njk:8-23`（在 `.custom-header-nav` 内、搜索按钮之前插入）

**Interfaces:**
- Produces: `#bg-toggle`（按钮）、`#bg-popover`（popover）、`#bg-slider`（range input）。Task 2 的样式和 Task 3 的 JS 都通过这三个 id 引用。

- [ ] **Step 1: 读取 header.njk 确认当前结构**

Run: `cat source/_data/header.njk`
Expected: `.custom-header-nav` 内依次有 `{% for %}` 导航循环、搜索按钮 `{%- if theme.local_search.enable %}`、主题切换按钮。

- [ ] **Step 2: 在搜索按钮之前插入背景按钮 + popover**

在 `source/_data/header.njk` 的 `.custom-header-nav` 内，**搜索按钮的 `{%- if theme.local_search.enable %}` 之前**，插入以下代码（紧挨 `{% endfor %}` 之后）：

```njk
      {# 背景明暗调节：点按钮弹 popover，内含 range slider。
         滑块 JS 在 body-end.njk，控制 --bg-overlay-opacity CSS 变量。
         样式在 styles.styl 的 .custom-header-bg / .bg-popover 段。 #}
      <button type="button"
              class="custom-header-bg popover-trigger"
              id="bg-toggle"
              aria-label="调节背景明暗"
              title="背景明暗"
              aria-haspopup="true"
              aria-expanded="false">
        <i class="fa fa-image" aria-hidden="true"></i>
      </button>
      <div class="bg-popover"
           id="bg-popover"
           role="dialog"
           aria-label="背景明暗调节"
           hidden>
        <span class="bg-popover-label">背景明暗</span>
        <div class="bg-popover-row">
          <span class="bg-popover-min">隐</span>
          <input type="range"
                 min="0"
                 max="100"
                 value="50"
                 step="1"
                 class="bg-slider"
                 id="bg-slider"
                 aria-label="背景可见度">
          <span class="bg-popover-max">显</span>
        </div>
      </div>
```

- [ ] **Step 3: 构建验证 DOM 注入成功**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -5`
Expected: 无 ERROR，生成 419+ 个文件。

Run: `grep -c 'id="bg-toggle"' public/aiero-intro/index.html`
Expected: `1`

Run: `grep -c 'id="bg-slider"' public/aiero-intro/index.html`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add source/_data/header.njk
git commit -m "feat(bg-slider): header 加按钮 + popover DOM

- 新增 #bg-toggle 图标按钮（fa-image）
- 新增 #bg-popover 容器，含 range slider #bg-slider
- 插入位置：.custom-header-nav 内，搜索按钮之前"
```

---

## Task 2：styles.styl 改遮罩 + 加样式

**Files:**
- Modify: `source/_data/styles.styl:70-77`（亮色遮罩块）
- Modify: `source/_data/styles.styl:100-102`（暗色遮罩块）
- Modify: `source/_data/styles.styl:124-131`（.post-block hover 段上方，新增透明规则）
- Append: `source/_data/styles.styl`（文件末尾追加 popover + 按钮样式）

**Interfaces:**
- Consumes: Task 1 产生的 `.custom-header-bg` / `.bg-popover` / `.bg-slider` / `.bg-popover-label` / `.bg-popover-row` / `.bg-popover-min` / `.bg-popover-max` class 名
- Produces: `--bg-overlay-opacity` CSS 变量（默认 0.5），由 Task 3 的 JS 写入

- [ ] **Step 1: 改亮色遮罩读 CSS 变量**

定位 `source/_data/styles.styl:70-77` 的 `body::before` 块（注释为 "用 ::before 做半透明遮罩，让背景图变成肌理"）。把 `background: rgba(250, 250, 250, 0.92);` 改成读 CSS 变量：

**替换前：**
```styl
// 用 ::before 做半透明遮罩，让背景图变成肌理
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(250, 250, 250, 0.92);
  z-index: -1;
  pointer-events: none;
}
```

**替换后：**
```styl
// 用 ::before 做半透明遮罩，让背景图变成肌理
// 透明度由 --bg-overlay-opacity 控制（滑块 JS 写入，默认 0.5 = 半隐半现）
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(250, 250, 250, var(--bg-overlay-opacity, 0.5));
  z-index: -1;
  pointer-events: none;
}
```

- [ ] **Step 2: 改暗色遮罩读 CSS 变量**

定位 `source/_data/styles.styl:100-102` 的 `[data-theme="dark"] body::before` 块（注释为 "暗色模式遮罩（深 88%）"）。改 opacity 同样由变量驱动：

**替换前：**
```styl
// === 暗色模式遮罩（深 88%） ===
// 用 [data-theme="dark"] 替代原 prefers-color-scheme，让手动按钮生效
[data-theme="dark"] body::before {
  background: rgba(15, 15, 17, 0.88);
}
```

**替换后：**
```styl
// === 暗色模式遮罩（颜色切暗，透明度仍由滑块控制） ===
// 颜色换暗色，但 --bg-overlay-opacity 与亮色共用同一个值（滑块管可见度，主题管颜色）
[data-theme="dark"] body::before {
  background: rgba(15, 15, 17, var(--bg-overlay-opacity, 0.5));
}
```

- [ ] **Step 3: 文章卡片改透明**

定位 `source/_data/styles.styl:123-131` 的 `.posts-expand .post-block` 段（"首页文章卡片 hover 边框变深青"）。**在该段之前**插入透明规则：

**在该位置插入：**
```styl
// === 文章卡片改透明（配合背景明暗滑块） ===
// 决策依据：用户在 brainstorming §3 明确选"文章区也透明，文字直接叠在背景图上"。
// 滑块拉到最右时，背景图完全可见，正文直接压在图上。
// 风险：某些复杂背景图会让正文难辨（用户已接受，见 spec §9）。
.posts-expand .post-block,
.post-block {
  background: transparent !important;
}

```

- [ ] **Step 4: 文件末尾追加 popover + 按钮样式**

在 `source/_data/styles.styl` **末尾**追加以下整段：

```styl

// === 背景明暗调节按钮（复用 .theme-toggle / .custom-header-search 骨架） ===
.custom-header-bg {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  margin-left: 8px;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-color, #09090b);
  border-radius: 6px;
  transition: background 0.2s ease, color 0.2s ease;
  vertical-align: middle;
}
.custom-header-bg:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--theme-color);
}
// popover 打开时按钮高亮，给"正在操作"反馈
.custom-header-bg[aria-expanded="true"] {
  background: rgba(8, 145, 178, 0.1);
  color: var(--theme-color);
}
[data-theme="dark"] .custom-header-bg { color: #f4f4f5; }
[data-theme="dark"] .custom-header-bg:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #22d3ee;
}
@media (prefers-reduced-motion: reduce) {
  .custom-header-bg { transition: none; }
}

// === 背景明暗 popover ===
.bg-popover {
  position: fixed;
  top: 72px;              // 桌面端 header 高度（body padding-top: 72px）
  right: 24px;
  z-index: 110;           // 高于 .custom-header(100)
  min-width: 220px;
  padding: 16px 20px;
  background: var(--content-bg-color, #ffffff);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-family: 'Public Sans', 'Noto Sans SC', sans-serif;
  font-size: 0.875em;
}
[data-theme="dark"] .bg-popover {
  background: var(--content-bg-color, #18181b);
  border-color: #27272a;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
// hidden 属性兜底（防被其他 display 规则覆盖）
.bg-popover[hidden] { display: none; }

.bg-popover-label {
  display: block;
  margin-bottom: 12px;
  font-weight: 500;
  color: var(--text-color, #09090b);
}
.bg-popover-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bg-popover-min, .bg-popover-max {
  flex-shrink: 0;
  color: var(--blockquote-color, #52525b);
  font-size: 0.85em;
}

// === 滑块（跨浏览器统一外观） ===
.bg-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  background: var(--border-color, #e4e4e7);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.bg-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--theme-color);
  border: 2px solid var(--content-bg-color, #ffffff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.bg-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--theme-color);
  border: 2px solid var(--content-bg-color, #ffffff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
.bg-slider:focus-visible {
  // 聚焦时轨道淡光晕，辅助键盘定位
  box-shadow: 0 0 0 4px rgba(8, 145, 178, 0.2);
}

// === 移动端 popover 满宽 ===
@media (max-width: 767px) {
  .bg-popover {
    top: 100px;            // 移动端 header 纵向堆叠更高（body padding-top: 100px）
    right: 12px;
    left: 12px;
    min-width: 0;
  }
}
```

- [ ] **Step 5: 构建验证样式编译通过**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -10`
Expected: 无 ERROR，无 Stylus 编译报错，419+ 个文件生成。

Run: `grep -c "custom-header-bg" public/css/main.css` 之类
Expected: 至少 1（说明样式已编译进 main.css）。如果路径不对，改成实际 CSS 路径。

```bash
# 找到主 CSS 文件再 grep
css_file=$(find public/css -name "*.css" | head -1)
echo "css: $css_file"
grep -c "custom-header-bg\|bg-popover\|bg-slider" "$css_file"
```

Expected: 至少 3（三种 selector 都进 CSS 了）。

Run: `grep -c -- '--bg-overlay-opacity' "$css_file"`
Expected: 至少 2（亮色和暗色两个遮罩块都用了变量）。

- [ ] **Step 6: Commit**

```bash
git add source/_data/styles.styl
git commit -m "feat(bg-slider): 遮罩改 CSS 变量 + 加按钮/popover/滑块样式

- 亮/暗色遮罩 opacity 改读 --bg-overlay-opacity（默认 0.5）
- .post-block 改 transparent（配合滑块，文字直接叠背景图）
- 新增 .custom-header-bg 按钮样式（复用 .theme-toggle 骨架）
- 新增 .bg-popover / .bg-slider 样式（跨浏览器 thumb）
- 移动端 popover 满宽（< 768px）"
```

---

## Task 3：body-end.njk 加 IIFE（滑块逻辑 + popover 开关）

**Files:**
- Modify: `source/_data/body-end.njk`（在主题切换 IIFE 之后、GSAP CDN 之前插入）

**Interfaces:**
- Consumes: Task 1 的 `#bg-toggle` / `#bg-popover` / `#bg-slider` DOM；Task 2 的 `--bg-overlay-opacity` CSS 变量
- Produces: 滑块拖动时 `document.documentElement.style.setProperty('--bg-overlay-opacity', ...)`；localStorage key `bg-opacity`

- [ ] **Step 1: 读取 body-end.njk 确认插入位置**

Run: `cat source/_data/body-end.njk | head -45`
Expected: 看到主题切换 IIFE（`})();` 结尾约在第 36-37 行），之后是 GSAP CDN `<script defer src=...>`。

- [ ] **Step 2: 在主题切换 IIFE 之后插入背景滑块 IIFE**

在 `source/_data/body-end.njk` 第 37 行 `})();` 之后、第 39 行 `{# === GSAP + ScrollTrigger` 之前，插入：

```njk

{# === 背景明暗滑块逻辑（独立 IIFE，不依赖 GSAP） === #}
{# 读 localStorage → 设 CSS 变量 → 滑块 input 更新 → popover 开关 #}
{# 工程兜底：localStorage 用 try/catch 防隐私模式抛错；DOM 缺失则 return #}
<script>
(function () {
  var STORAGE_KEY = 'bg-opacity';
  var DEFAULT = 50;   // 0=完全隐藏背景图，100=完全可见

  // 滑块值（0-100）→ 遮罩 opacity（1-0）：值越大，遮罩越透明，背景图越清晰
  function applyOpacity(sliderVal) {
    var overlayOpacity = 1 - sliderVal / 100;
    document.documentElement.style.setProperty('--bg-overlay-opacity', overlayOpacity);
  }

  // Layer 1: 初始化（首次读 localStorage）
  var stored = null;
  try { stored = parseInt(localStorage.getItem(STORAGE_KEY), 10); } catch (e) {}
  var initial = (isNaN(stored) || stored < 0 || stored > 100) ? DEFAULT : stored;

  var slider = document.getElementById('bg-slider');
  var toggleBtn = document.getElementById('bg-toggle');
  var popover = document.getElementById('bg-popover');
  // 任一 DOM 缺失则静默退出，不阻塞其他脚本
  if (!slider || !toggleBtn || !popover) return;

  slider.value = initial;
  applyOpacity(initial);

  // Layer 2: 滑块拖动（实时更新 CSS 变量 + debounce 写 localStorage）
  var saveTimer = null;
  slider.addEventListener('input', function () {
    var v = parseInt(slider.value, 10);
    applyOpacity(v);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) {}
    }, 200);
  });

  // Layer 3: popover 开关
  function open() {
    popover.hidden = false;
    toggleBtn.setAttribute('aria-expanded', 'true');
    slider.focus();
  }
  function close() {
    popover.hidden = true;
    toggleBtn.setAttribute('aria-expanded', 'false');
  }
  function isOpen() { return !popover.hidden; }

  // 点按钮 toggle（stopPropagation 防触发下面的"点外部关闭"）
  toggleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (isOpen()) { close(); } else { open(); }
  });
  // 点 popover 外部关闭
  document.addEventListener('click', function (e) {
    if (!isOpen()) return;
    if (!popover.contains(e.target) && e.target !== toggleBtn) close();
  });
  // Esc 关闭，焦点回按钮
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      close();
      toggleBtn.focus();
    }
  });
})();
</script>
```

- [ ] **Step 3: 构建验证 JS 注入成功**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -5`
Expected: 无 ERROR，419+ 个文件。

Run: `grep -c "STORAGE_KEY = 'bg-opacity'" public/aiero-intro/index.html`
Expected: `1`

Run: `grep -c "applyOpacity\|bg-overlay-opacity" public/aiero-intro/index.html`
Expected: `>= 2`

- [ ] **Step 4: Commit**

```bash
git add source/_data/body-end.njk
git commit -m "feat(bg-slider): body-end 加滑块逻辑 IIFE

- Layer 1: 读 localStorage(bg-opacity) → 设 --bg-overlay-opacity CSS 变量
- Layer 2: 滑块 input 实时更新变量 + debounce 200ms 写存储
- Layer 3: popover 开关（点按钮 toggle / 点外部关 / Esc 关 / 焦点管理）
- 独立 IIFE，不依赖 GSAP；localStorage 用 try/catch 防隐私模式抛错"
```

---

## Task 4：端到端验证（手动 + 自动）

**Files:**
- 只读：构建产物 `public/`

**Interfaces:**
- Consumes: Task 1-3 的全部产物

- [ ] **Step 1: 全量重新构建**

Run: `npx hexo clean && npx hexo generate 2>&1 | tail -10`
Expected: 无 ERROR，无 WARNING（stylus 编译警告也要看），生成 419+ 个文件。

- [ ] **Step 2: 验证关键页面都注入了三件套**

Run:
```bash
for page in public/index.html public/archives/index.html public/aiero-intro/index.html; do
  echo "=== $page ==="
  echo "bg-toggle:   $(grep -c 'id="bg-toggle"' "$page")"
  echo "bg-popover:  $(grep -c 'id="bg-popover"' "$page")"
  echo "bg-slider:   $(grep -c 'id="bg-slider"' "$page")"
  echo "IIFE:        $(grep -c "STORAGE_KEY = 'bg-opacity'" "$page")"
done
```
Expected: 每个页面的每行都输出 `1`（或 `>= 1`）。

- [ ] **Step 3: 启动本地预览**

Run: `npm run server`（在另一个终端窗口，或后台运行）
Expected: 监听 http://localhost:4000/zzh-notes/

- [ ] **Step 4: 手动验证交互（浏览器打开 http://localhost:4000/zzh-notes/）**

按 spec §10 验证清单逐项确认：

- [ ] 任意文章页，header 右侧能看到 🖼 图标按钮（在搜索按钮左边）
- [ ] 点击 🖼 → popover 弹出，含滑块（默认在中间）
- [ ] 默认状态下背景图半隐半现（CSS 变量 = 0.5）
- [ ] 拖滑块到最左（"隐"端）→ 背景图完全消失，只剩纯色底
- [ ] 拖滑块到最右（"显"端）→ 背景图完全清晰，正文直接叠在图上
- [ ] 拖动过程中实时变化（不用松手才生效）
- [ ] 刷新页面 → 滑块恢复到上次位置（localStorage 生效）
- [ ] 切换主题（🌙 按钮）→ 遮罩颜色变（白雾 ↔ 黑雾），但滑块位置不变
- [ ] popover 打开时按 Esc → popover 关闭，焦点回到 🖼 按钮
- [ ] popover 打开时点页面任意位置 → popover 关闭
- [ ] 移动端尺寸（DevTools 切到 < 768px）→ popover 满宽显示
- [ ] Tab 键能聚焦到 🖼 按钮；popover 打开后焦点自动跳进滑块

- [ ] **Step 5: 验证降级（关 JS）**

浏览器 DevTools → 禁用 JavaScript → 刷新。

Expected:
- 页面不崩，内容正常显示
- 背景图保持半隐半现（CSS 变量默认 0.5）
- 🖼 按钮仍可见（但点击无反应，因为 popover 用 `hidden` 属性，JS 没运行就不会打开）
- 文章正文可读（CSS 变量 0.5 时遮罩足够厚）

- [ ] **Step 6: 验证 reduced-motion**

浏览器 DevTools → Rendering → Emulate CSS `prefers-reduced-motion: reduce`。

Expected:
- 🖼 按钮 hover/transition 关闭（瞬切）
- 滑块功能仍正常（滑块本身不动效）

- [ ] **Step 7: 如果 Step 4-6 有任何项失败**

立即停止，回到对应 Task 修复，重新构建，重新验证。**不带着已知 bug 进入下一步。**

- [ ] **Step 8: 推送上线**

```bash
git log --oneline -5    # 确认 3 个 Task 的 commit 都在
git push origin main
```

Expected: push 成功，GitHub Actions 自动触发部署。

- [ ] **Step 9: 等待部署完成，验证线上**

等 2-3 分钟（Actions 跑完），打开 https://zzh-learner.github.io/zzh-notes/

Expected: 线上和本地表现一致。

也可用 `gh run list --limit 1` 看 Actions 状态。

- [ ] **Step 10: 完成**

所有验证通过后，这个 feature 完成。

---

## Self-Review

### Spec coverage 检查

| Spec 章节 | 对应 Task |
|----------|----------|
| §1 目标 | Task 1-3 整体 |
| §3 决策摘要（位置、范围、透明、持久化、默认值、主题联动） | Task 1（DOM）+ Task 2（CSS）+ Task 3（JS）全覆盖 |
| §4 方案 A（CSS 变量 + 单一遮罩） | Task 2 Step 1-2 |
| §5.2 DOM 结构 | Task 1 Step 2 |
| §5.3 CSS 改动（遮罩 + 文章卡片 + 不动的部分） | Task 2 Step 1-4 |
| §5.4 JS 三层逻辑 | Task 3 Step 2 |
| §5.5 localStorage | Task 3 Step 2（STORAGE_KEY = 'bg-opacity'） |
| §6 popover 与滑块样式 | Task 2 Step 4 |
| §7 a11y | Task 1 Step 2（aria 属性）+ Task 2 Step 4（focus-visible）+ Task 3 Step 2（Esc/焦点）+ Task 4 Step 4 手动验证 |
| §8 降级与兜底 | Task 3 Step 2（try/catch + DOM 检查）+ Task 4 Step 5（禁 JS 验证） |
| §9 已知风险 | 不需 task（用户已接受） |
| §10 验证清单（11 项） | Task 4 Step 2-6 全覆盖 |
| §11 不在本期范围 | 不需 task（明确排除） |

无遗漏。

### Placeholder 扫描

- 无 TBD / TODO / "实现 details" / "类似 Task N"
- 每个 step 都有完整代码或精确命令
- 所有文件路径精确到行号或位置描述

✅

### Type/命名一致性

| 名字 | 出现位置 | 一致性 |
|------|---------|-------|
| `--bg-overlay-opacity` | Task 2 Step 1/2（CSS）+ Task 3 Step 2（JS） | ✅ 一致 |
| `bg-opacity`（localStorage key） | Task 3 Step 2（读写都用） | ✅ 一致 |
| `#bg-toggle` / `#bg-popover` / `#bg-slider` | Task 1 Step 2（HTML）+ Task 3 Step 2（JS getElementById） | ✅ 一致 |
| `.custom-header-bg` / `.bg-popover` / `.bg-slider` | Task 1 Step 2（HTML class）+ Task 2 Step 4（CSS 选择器） | ✅ 一致 |
| `applyOpacity()` | Task 3 Step 2（定义 + 两处调用） | ✅ 一致 |
| `DEFAULT = 50` | Task 3 Step 2 + Task 2 Step 1 CSS 默认值 `0.5`（1 - 50/100 = 0.5） | ✅ 数学一致 |

✅
