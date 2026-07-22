# 删除亮色模式（强制恒定暗色）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除博客的亮/暗主题切换体系，强制恒定暗色（黑底星空），删除切换按钮、切换 IIFE、键盘快捷键、星空主题联动、所有 `[data-theme="light"]` CSS 规则。

**Architecture:** `data-theme` 永久钉为 `dark`（head.njk FOUC 脚本写死），复用现有 `[data-theme="dark"]` 变量覆盖体系。纯删除任务——无新逻辑、无新依赖。改动跨 4 个文件，按文件边界切 3 个任务（head+header+body-end 的 JS/DOM 为一体的"前端交互层"，styles.styl 为"样式层"，末尾一个验证任务）。

**Tech Stack:** Hexo 7 + NexT 8、Nunjucks 模板、Stylus。

**设计文档：** `docs/superpowers/specs/2026-07-22-remove-light-mode-design.md`

## Global Constraints

- **构建必须通过**：每个任务后跑 `npx hexo clean && npx hexo generate`，确认无新 ERROR（pre-existing 的 `header.njk` `url_for` 错误与本任务无关，忽略）、`index.html` / `archives/index.html` / 文章页均生成（红线 3）。
- **不动 `_config.yml` / `_config.next.yml` / `package.json`**（本任务只动 `source/_data/` 下的注入文件）。
- **不删 `[data-theme="dark"]` 规则**：它们是站点实际配色载体，删了裸奔。只删 `[data-theme="light"]` 和 `.theme-toggle` 相关。
- **不动背景明暗滑块**：它控制星空亮度，与主题无关。
- **行号会随删除漂移**：任务里给的是"当前"行号，实现者删除时用"待删内容"的唯一代码片段匹配，不要死盯行号。

---

### Task 1: 简化 FOUC + 删切换按钮 + 删切换 IIFE + 简化星空主题联动

**目标**：一次性删除前端交互层的所有主题切换机制——head.njk 写死 dark、header.njk 删按钮、body-end.njk 删切换 IIFE 和星空主题联动。

**Files:**
- Modify: `source/_data/head.njk:7-27`（FOUC 脚本）
- Modify: `source/_data/header.njk:36-44`（切换按钮）
- Modify: `source/_data/body-end.njk:4-37`（切换 IIFE）
- Modify: `source/_data/body-end.njk:395`（visibilitychange 去 currentThemeIsDark）
- Modify: `source/_data/body-end.njk:411-439`（删主题联动整段）

- [ ] **Step 1: 简化 head.njk FOUC 脚本**

把 `source/_data/head.njk:7-27`（从 `{# === 主题切换 FOUC 防护` 到 FOUC `</script>` 结束、含内部 `})();`）替换为：

```njk
{# === 强制暗色（站点不再有亮色模式）：CSS 应用前同步设 data-theme，防任何闪烁 === #}
<script>
  document.documentElement.setAttribute('data-theme', 'dark');
</script>
```

注意：删除整个 IIFE（含 try/catch、localStorage 读取、prefers-color-scheme 判断），只留一行 setAttribute。保留 `<script>` 标签和注释（注释改写）。

- [ ] **Step 2: 删 header.njk 切换按钮**

把 `source/_data/header.njk:36-44`（从 `{# 主题切换按钮：两个图标都渲染` 注释到 `#theme-toggle` 按钮的闭合 `</button>`）整段删除。精确待删内容：

```njk
      {# 主题切换按钮：两个图标都渲染，CSS 按 data-theme 控制显隐，避免 JS 加载前错位 #}
      <button type="button"
              class="theme-toggle"
              id="theme-toggle"
              aria-label="切换深浅色主题"
              title="切换深浅色">
        <i class="theme-toggle-icon theme-toggle-sun fa fa-sun" aria-hidden="true"></i>
        <i class="theme-toggle-icon theme-toggle-moon fa fa-moon" aria-hidden="true"></i>
      </button>
```

删除后，`.custom-header-nav` 内只剩导航链接 + 背景明暗按钮 + 搜索按钮。注意删除时连同上方空行处理干净（按钮前一行是搜索按钮的 `</button>` + `{%- endif %}`，保留那个，删掉本按钮段及其前后多余空行，使 `</nav>` 紧接最后一个按钮）。

- [ ] **Step 3: 删 body-end.njk 切换 IIFE**

把 `source/_data/body-end.njk:4-37`（从 `{# === 主题切换逻辑` 注释到切换 IIFE 的 `</script>` 结束）整段删除。精确待删内容（从第 4 行到第 37 行）：

```njk
{# === 主题切换逻辑（独立 IIFE，不依赖 GSAP，保证 GSAP 失败时切换仍可用） === #}
{# head.njk 已在 CSS 应用前同步设好 data-theme，这里只处理点击切换 + 持久化 #}
<script>
(function () {
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
    // 更新按钮 aria-label
    var btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色' : '切换到深色');
    }
  }
  // 等 DOM 就绪后绑定点击（脚本在 body 末尾，DOM 已就绪）
  var btn = document.getElementById('theme-toggle');
  if (btn) {
    // 初始化 aria-label
    btn.setAttribute('aria-label', getTheme() === 'dark' ? '切换到浅色' : '切换到深色');
    btn.addEventListener('click', function () {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }
  // 键盘快捷键：Ctrl/Cmd + Shift + L 切换主题（可选，无障碍辅助）
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    }
  });
})();
</script>
```

删除后，文件开头直接是滑块 IIFE（`{# === 背景明暗滑块逻辑`）。

- [ ] **Step 4: 去 visibilitychange 的 currentThemeIsDark 检查**

把 `source/_data/body-end.njk:395` 这一行：

```js
        } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && currentThemeIsDark()) {
```

改为（去掉 `&& currentThemeIsDark()`）：

```js
        } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
```

- [ ] **Step 5: 删星空主题联动整段**

把 `source/_data/body-end.njk:414-439`（从 `// === 主题联动：亮色停 RAF` 注释到 `themeObserver.observe(...)` 行）整段删除。精确待删内容：

```js
      // === 主题联动：亮色停 RAF + canvas 淡出，暗色启 RAF + 淡入 ===
      // 用 MutationObserver 监听 <html data-theme>，不侵入现有主题切换按钮代码。
      function currentThemeIsDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
      }
      var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      function syncTheme() {
        if (currentThemeIsDark()) {
          if (!reducedMotion) start();
        } else {
          stop();
        }
      }
      // 初始同步（页面加载时已是亮色则停）
      syncTheme();

      var themeObserver = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].attributeName === 'data-theme') {
            syncTheme();
            break;
          }
        }
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

删除后，`window.__zzhStarfield = {...}` 行（412）直接接 `} catch (err) {`（441）。

注意：`// 暴露给 Task 4 的主题联动` 注释（411 行）也一并删或改为更准确的注释，因为它引用了已删的 Task 4 联动。建议改为：

```js
      // 暴露给调试/外部（start/stop + 场景对象）
```

- [ ] **Step 6: 验证构建**

Run: `npx hexo clean && npx hexo generate`
Expected: 无新 ERROR（pre-existing `header.njk` url_for 错误忽略），`index.html` / `archives/index.html` / 文章页生成。

Run: `grep -c "theme-toggle" source/_data/header.njk source/_data/body-end.njk`
Expected: `0`（按钮和 IIFE 都删了）

Run: `grep -c "getTheme\|setTheme\|currentThemeIsDark\|themeObserver\|syncTheme" source/_data/body-end.njk`
Expected: `0`

- [ ] **Step 7: 浏览器验证**

serve `public/`（`python -m http.server`，注意子路径），浏览器开页面，确认：
- header 上**没有**太阳/月亮按钮（只剩背景明暗 + 搜索两个工具按钮）。
- `document.documentElement.getAttribute('data-theme')` 恒为 `"dark"`。
- 控制台**无 JS 报错**（特别确认没有 `currentThemeIsDark is not defined` 之类的残留引用）。
- Ctrl+Shift+L 按了无反应（快捷键已删）。
- 星空正常渲染（RAF 跑，groupRotationY 推进）。
- 切走 tab 再回来，RAF 正常恢复（visibilitychange 的 reduced-motion 判断仍在，主题门已去）。

- [ ] **Step 8: Commit**

```bash
git add source/_data/head.njk source/_data/header.njk source/_data/body-end.njk
git commit -m "feat: 删除亮色模式切换（FOUC 写死 dark + 删按钮/IIFE/主题联动）"
```

---

### Task 2: 删 styles.styl 的 light 规则 + 切换按钮样式

**目标**：删除所有 `[data-theme="light"]` CSS 规则和 `.theme-toggle` 按钮样式，保留 `[data-theme="dark"]` 变量与暗色样式。

**Files:**
- Modify: `source/_data/styles.styl:5-9`（顶部主题切换注释）
- Modify: `source/_data/styles.styl:30-52`（`[data-theme="light"]` 变量块）
- Modify: `source/_data/styles.styl:56`（`[data-theme="light"] img`）
- Modify: `source/_data/styles.styl:242-282`（`.theme-toggle` 全部样式）
- Modify: `source/_data/styles.styl:574-585`（星空亮色隐藏 + 滑块禁用）

- [ ] **Step 1: 改顶部主题注释（5-9 行）**

把 `source/_data/styles.styl:5-9`（从 `// === 主题切换：[data-theme] 控制` 到 `// [data-theme="dark"] 覆盖，让手动按钮生效（优先级高于媒体查询）。`）替换为：

```stylus
// === 恒定暗色：data-theme 永久为 dark（head.njk FOUC 写死） ===
// NexT 原生 _colors.styl 走 @media (prefers-color-scheme: dark)，我们用
// [data-theme="dark"] 覆盖（特异性高于媒体查询），钉死暗色变量。
```

- [ ] **Step 2: 删 [data-theme="light"] 变量块 + img 规则**

把 `source/_data/styles.styl:30-56`（从 `// === 强制亮色（解决...` 注释到 `[data-theme="light"] img { opacity: 1; }`）整段删除。待删内容（含中间的 light 变量块和两行 img 规则）：

```stylus
// === 强制亮色（解决"系统暗色 + 用户切亮色"冲突） ===
// 没有这个块的话：用户系统是暗色、却手动切到亮色时，NexT 的
// @media (prefers-color-scheme: dark) 仍会激活，把变量又改回暗色。
// 这个 [data-theme="light"] 块强制覆盖回亮色值。
[data-theme="light"] {
  --body-bg-color: #fafafa;
  --content-bg-color: #ffffff;
  --card-bg-color: #f5f5f5;
  --text-color: #09090b;
  --selection-bg: #0891b2;
  --selection-color: #ffffff;
  --blockquote-color: #52525b;
  --link-color: #09090b;
  --link-hover-color: #0891b2;
  --brand-color: #ffffff;
  --brand-hover-color: #ffffff;
  --table-row-odd-bg-color: #f9f9f9;
  --table-row-hover-bg-color: #f5f5f5;
  --menu-item-bg-color: #f5f5f5;
  --theme-color: #0891b2;
  --border-color: #e4e4e7;
  color-scheme: light;
}
// 图片透明度随主题（对齐 NexT 默认行为：暗色下 img opacity .75）
[data-theme="dark"] img { opacity: 0.75; }
[data-theme="dark"] img:hover { opacity: 0.9; }
[data-theme="light"] img { opacity: 1; }
```

**注意**：`[data-theme="dark"] img` 两行（54-55）**保留**——它们是暗色图片调暗，仍需要。只删 `[data-theme="light"] img { opacity: 1; }`（56 行）。所以实际删除范围是 30-52（light 变量块）+ 56（light img），保留 53-55（dark img 两行 + 注释）。

精确做法：删 30-52（light 变量块 + 其上方注释），再单独删 56 行（`[data-theme="light"] img { opacity: 1; }`）。删完后 53 行的注释 `// 图片透明度随主题` 紧接 `[data-theme="dark"] img`。

- [ ] **Step 3: 删 .theme-toggle 全部样式（242-282 行）**

把 `source/_data/styles.styl:242-282`（从 `// === 主题切换按钮 ===` 注释到 reduced-motion 下 `.theme-toggle { transition: none; }` 的闭合 `}`）整段删除。这段包含：`.theme-toggle`、`:hover`、`[data-theme="dark"] .theme-toggle`、`:hover`、`.theme-toggle-icon`、moon/sun 显隐、reduced-motion 块。

- [ ] **Step 4: 删星空亮色隐藏 + 滑块禁用（574-585 行）**

把 `source/_data/styles.styl:574-585`（从 `// === 亮色模式：星空隐藏` 注释到 `[data-theme="light"] .custom-header-bg { ... }` 的闭合 `}`）整段删除。待删内容：

```stylus
// === 亮色模式：星空隐藏（白底上看不见星），滑块禁用 ===
// canvas 用 opacity+visibility 而非 display:none，实现切换时淡出过渡。
[data-theme="light"] #starfield {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}
// 亮色下滑块按钮变灰禁用（星空仅暗色可见）
[data-theme="light"] .custom-header-bg {
  opacity: 0.4;
  pointer-events: none;
}
```

- [ ] **Step 5: 验证构建 + grep**

Run: `npx hexo clean && npx hexo generate`
Expected: 无新 ERROR，关键页面生成。

Run: `grep -c 'data-theme="light"' source/_data/styles.styl`
Expected: `0`

Run: `grep -c "theme-toggle" source/_data/styles.styl`
Expected: `0`

- [ ] **Step 6: 浏览器验证**

serve + 浏览器确认：
- 页面暗色正常（黑底星空、暗色文字、暗色 header）。
- 无残留亮色闪烁或亮色变量生效。
- 控制台无 CSS 解析错误。

- [ ] **Step 7: Commit**

```bash
git add source/_data/styles.styl
git commit -m "feat: 删除 styles.styl 亮色规则 + 主题切换按钮样式"
```

---

### Task 3: 全量验证与回归

**目标**：确认删除无回归——非主题功能（搜索、背景明暗滑块、星空、GSAP 动效、移动端）全部正常。

**Files:** 无改动，纯验证。

- [ ] **Step 1: 构建无错**

Run: `npx hexo clean && npx hexo generate`
Expected: 无新 ERROR。

Run: `ls public/index.html public/archives/index.html` 确认存在。
Run: 任挑一篇 `ls public/<某文章>/index.html` 确认存在。

- [ ] **Step 2: grep 总查**

Run: `grep -rn "theme-toggle" source/_data/`
Expected: `0`（全项目无残留）

Run: `grep -rn 'data-theme="light"' source/_data/`
Expected: `0`

Run: `grep -rn "currentThemeIsDark\|themeObserver\|syncTheme\|getTheme\|setTheme" source/_data/`
Expected: `0`

- [ ] **Step 3: 浏览器功能回归**

serve + 浏览器，逐项确认：
- header 无切换按钮，只有背景明暗 + 搜索按钮。
- 页面恒暗色（改系统偏好也无变化——可模拟 `prefers-color-scheme: light`，页面仍暗）。
- 背景明暗滑块：拖动星空亮度变化，刷新后恢复（localStorage `bg-opacity`）。
- 搜索按钮：点击弹搜索层，能搜。
- 星空：星点/星云/流星/漂移正常，切 tab 停 RAF，回来恢复。
- GSAP 动效：阅读进度条、文章卡片/标题 fade-up、图片 lazyload、header 滚动收缩——都正常。
- 控制台无任何 JS/CSS 报错。

- [ ] **Step 4: 移动端验证**

DevTools 切移动端视口，确认 header 纵向堆叠正常、汉堡按钮可见可点、星空不卡。

- [ ] **Step 5: 无未提交改动**

Run: `git status`
Expected: clean（所有改动已分任务提交）。

---

## Self-Review 结果

**1. Spec 覆盖检查：**
- §4.1 FOUC 简化 → Task 1 Step 1 ✓
- §4.2 删切换按钮 → Task 1 Step 2 ✓
- §4.3 删切换 IIFE → Task 1 Step 3 ✓
- §4.3 简化星空主题联动（删 currentThemeIsDark/syncTheme/MutationObserver + 去 visibilitychange 门）→ Task 1 Step 4-5 ✓
- §4.4 删 light 变量块 → Task 2 Step 2 ✓
- §4.4 删 light img → Task 2 Step 2 ✓
- §4.4 删 .theme-toggle 样式 → Task 2 Step 3 ✓
- §4.4 删星空亮色隐藏 + 滑块禁用 → Task 2 Step 4 ✓
- §4.4 顶部注释改写 → Task 2 Step 1 ✓
- §5 验证 → Task 3 ✓

**2. Placeholder 扫描：** 无 TBD/TODO，每步给了精确待删代码片段。✓

**3. 类型/命名一致性：** `currentThemeIsDark` 在 Task 1 Step 4（去引用）和 Step 5（删定义）一致 ✓。无跨任务命名冲突。
