# 背景图明暗滑块 — 设计文档

- **日期**：2026-07-21
- **状态**：已通过 brainstorming，待写实施计划
- **作者**：ZZH（与 ZCode 协作）
- **相关文件**：`source/_data/styles.styl`、`source/_data/body-end.njk`、`source/_data/header.njk`

## 1. 目标

在网页顶部 header 增加一个图标按钮，点击后弹出 popover，内含一个滑块。用户拖动滑块即可实时调节全站背景图（`source/images/background.webp`）的可见度——从**完全不可见**（纯色底）到**完全可见**（背景图清晰，正文直接叠在图上）。

## 2. 非目标（YAGNI）

- 不做滑块旁的实时百分比数字
- 不做双击重置
- 不做滑块刻度
- 不做亮/暗模式分别存值
- 不改背景图本身、不动 GSAP parallax

## 3. 用户决策摘要

brainstorming 阶段已确认的关键选择：

| 维度 | 选择 |
|------|------|
| 滑块位置 | header 右侧加图标按钮，点击展开 popover |
| 调节范围 | 0（完全不可见）↔ 100（完全可见），绝对范围，不锚定当前 `0.92`/`0.88` 默认 |
| 文字可读性策略 | 文章区也透明，文字直接叠在背景图上（用户明确接受可读性风险） |
| 持久化 | localStorage 记忆，跨会话恢复 |
| 默认值 | 50%（中间，半隐半现） |
| 主题联动 | 滑块控制可见度（opacity），颜色（白雾/黑雾）跟随当前 `[data-theme]`，两个维度正交 |

## 4. 方案选型

**采用方案 A：CSS 变量 + 单一遮罩层**。

| 方案 | 评价 |
|------|------|
| **A. CSS 变量 + 单一遮罩层（采用）** | 改动最小、性能最好（CSS 变量原生优化）、与现有 `body::before` 架构契合、亮暗色自动走各自颜色 |
| B. 双层独立控制（图 + 遮罩各一变量） | 过度工程，两个变量同步变化无意义 |
| C. JS 直接操作 inline style | 要手算 rgba 字符串、和 `[data-theme]` 优先级打架 |

### 核心映射

```
滑块值 sliderValue (0-100)
        ↓
--bg-overlay-opacity = 1 - sliderValue / 100   (范围 1-0)
        ↓
body::before background: rgba(<色>, var(--bg-overlay-opacity, 0.5))
```

- `sliderValue = 0`（隐）→ overlay-opacity = 1（遮罩全不透明 → 背景图完全看不见）
- `sliderValue = 100`（显）→ overlay-opacity = 0（遮罩全透明 → 背景图完全清晰）

## 5. 架构与组件

### 5.1 受影响文件

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `source/_data/header.njk` | 新增 DOM | 图标按钮 + popover 容器 |
| `source/_data/styles.styl` | 修改 + 新增 | 改遮罩读 CSS 变量；文章卡片改透明；新增按钮 + popover + 滑块样式 |
| `source/_data/body-end.njk` | 新增 IIFE | 滑块逻辑 + popover 开关 + localStorage |

### 5.2 DOM 结构（`header.njk` 的 `.custom-header-nav` 内）

插入位置：在搜索按钮（`.custom-header-search`）**之前**，即从左到右顺序为「背景 → 搜索 → 主题切换」。

```html
<button type="button" class="custom-header-bg popover-trigger"
        id="bg-toggle" aria-label="调节背景明暗" title="背景明暗"
        aria-haspopup="true" aria-expanded="false">
  <i class="fa fa-image" aria-hidden="true"></i>
</button>

<div class="bg-popover" id="bg-popover" role="dialog"
     aria-label="背景明暗调节" hidden>
  <span class="bg-popover-label">背景明暗</span>
  <div class="bg-popover-row">
    <span class="bg-popover-min">隐</span>
    <input type="range" min="0" max="100" value="50" step="1"
           class="bg-slider" id="bg-slider"
           aria-label="背景可见度">
    <span class="bg-popover-max">显</span>
  </div>
</div>
```

### 5.3 CSS 改动（`styles.styl`）

**① 替换遮罩块**（原 `styles.styl:70-77` 亮色 + `styles.styl:100-102` 暗色）：

```styl
// 亮色：白雾遮罩，不透明度由滑块控制（默认 0.5 = 滑块 50%）
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: rgba(250, 250, 250, var(--bg-overlay-opacity, 0.5));
  z-index: -1;
  pointer-events: none;
}
[data-theme="dark"] body::before {
  background: rgba(15, 15, 17, var(--bg-overlay-opacity, 0.5));
}
```

**② 文章卡片改透明**（满足"文章区也透明"决策）：

```styl
.posts-expand .post-block,
.post-block {
  background: transparent !important;
}
```

**③ 新增按钮 + popover + 滑块样式**（详见 §6）。

**④ 不改的地方**：
- `body` 的 `background-image` / `background-attachment: fixed` / `background-size` 等
- `.main-inner { background: transparent }`（维持现状）
- GSAP parallax（`body-end.njk` 中的 `backgroundPositionY` 动画）

### 5.4 JavaScript（`body-end.njk` 新增 IIFE）

独立 IIFE，不依赖 GSAP。三层职责：

```
Layer 1: 初始化 — 读 localStorage → 没有就用 50 → 设 CSS 变量 + 滑块 value
Layer 2: 滑块 input — 实时更新 CSS 变量，debounce 200ms 写 localStorage
Layer 3: popover 开关 — 点按钮 toggle / 点外部关 / Esc 关 / 焦点管理
```

### 关键代码骨架

```js
(function () {
  var STORAGE_KEY = 'bg-opacity';
  var DEFAULT = 50;

  function applyOpacity(sliderVal) {
    var overlayOpacity = 1 - sliderVal / 100;
    document.documentElement.style.setProperty(
      '--bg-overlay-opacity', overlayOpacity
    );
  }

  // Layer 1: 初始化
  var stored = null;
  try { stored = parseInt(localStorage.getItem(STORAGE_KEY), 10); } catch (e) {}
  var initial = (isNaN(stored) || stored < 0 || stored > 100) ? DEFAULT : stored;

  var slider = document.getElementById('bg-slider');
  var toggleBtn = document.getElementById('bg-toggle');
  var popover = document.getElementById('bg-popover');
  if (!slider || !toggleBtn || !popover) return;

  slider.value = initial;
  applyOpacity(initial);

  // Layer 2: 滑块拖动
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

  toggleBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    isOpen() ? close() : open();
  });
  document.addEventListener('click', function (e) {
    if (!isOpen()) return;
    if (!popover.contains(e.target) && e.target !== toggleBtn) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) {
      close();
      toggleBtn.focus();
    }
  });
})();
```

### 5.5 localStorage

- **Key**：`bg-opacity`（独立于现有 `theme` key）
- **Value**：字符串形式的整数 0-100
- **默认值**：50（无存储 / 越界 / 解析失败时）

## 6. popover 与滑块样式细节

### 6.1 popover

```styl
.bg-popover {
  position: fixed;
  top: 72px;              // header 高度
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
.bg-popover[hidden] { display: none; }
```

### 6.2 移动端

```styl
@media (max-width: 767px) {
  .bg-popover {
    top: 100px;            // 移动端 header 纵向堆叠更高
    right: 12px;
    left: 12px;
    min-width: 0;
  }
}
```

### 6.3 滑块（跨浏览器）

```styl
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
  box-shadow: 0 0 0 4px rgba(8, 145, 178, 0.2);
}
```

### 6.4 触发按钮（复用 `.theme-toggle` 骨架）

```styl
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
```

## 7. 无障碍（a11y）

| 项 | 处理 |
|----|------|
| 键盘聚焦 | 按钮 Tab 可达；popover 打开时焦点跳进滑块 |
| 键盘操作 | 滑块 ← → 微调 ±1；Home/End 跳到 0/100 |
| Esc 关闭 | popover 打开时按 Esc 关闭，焦点回到按钮 |
| 点击外部关闭 | 点 popover 外任意区域关闭 |
| 屏幕阅读器 | `aria-label` / `aria-haspopup` / `aria-expanded` / `role="dialog"` |
| 动效偏好 | `prefers-reduced-motion` 下按钮 transition 关闭 |

## 8. 降级与兜底

| 场景 | 行为 |
|----|------|
| **JS 失败**（CDN/脚本崩了） | CSS 变量回落 `0.5`，背景图半隐半现；按钮仍可见但点击无效，不会让页面报错 |
| **localStorage 被禁**（隐私模式） | try/catch 吞掉，每次用默认 50%，功能正常 |
| **CSS 变量不被支持**（古董浏览器） | `rgba(..., var(--bg-overlay-opacity, 0.5))` 回落到 `0.5`，固定半隐半现，不可调但不崩 |
| **Font Awesome 加载失败** | 按钮空白，但仍可点击（`aria-label` 标识） |
| **DOM 元素缺失** | IIFE 内 `if (!slider \|\| !toggleBtn \|\| !popover) return` 静默退出，不阻塞其他脚本 |

## 9. 已知风险与权衡

| 风险 | 缓解 |
|------|------|
| **滑块拉到最右时正文难以辨认**（背景图复杂时） | 用户在 brainstorming §3 已明确接受。如未来想缓解，可考虑给 `.post-block` 加一层很淡的 `backdrop-filter: blur(2px)`，但**本期不做**（YAGNI） |
| **首次访问者看到 50% 半隐背景图**，可能与原"几乎看不见"的默认观感差异较大 | 这是用户明确选择的默认值；若反馈不佳可改 `DEFAULT = 10` |
| **iOS Safari 的 `background-attachment: fixed` 已知 bug** | 现有问题，本设计不动它，不在本期修复范围 |

## 10. 验证清单

实施完成后必须通过：

- [ ] `npx hexo clean && npx hexo generate` 无 ERROR，419+ 个文件生成
- [ ] 首页 / 归档页 / 文章页都包含 `#bg-toggle` 和 `#bg-popover`
- [ ] 点击按钮 → popover 显示，再点击 → 隐藏
- [ ] 拖动滑块 → 背景图可见度实时变化
- [ ] 刷新页面 → 滑块值恢复（localStorage 生效）
- [ ] 切换主题 → 遮罩颜色变（白雾 ↔ 黑雾），滑块值不变
- [ ] 按 Esc → popover 关闭，焦点回到按钮
- [ ] 点 popover 外部 → 关闭
- [ ] 移动端（< 768px）popover 满宽显示，不被遮挡
- [ ] `prefers-reduced-motion: reduce` 下按钮 transition 关闭，滑块仍可用
- [ ] 关闭 JS（浏览器禁用）→ 页面不崩，背景图保持 50% 半隐

## 11. 不在本期范围

- 滑块旁实时百分比 / 双击重置 / 刻度
- 亮/暗分别存值
- iOS `background-attachment: fixed` bug 修复
- 背景图本身替换 / parallax 调整
- 滑块拖动时的动效（如背景图淡入过渡）

如未来需要以上任何一项，再开新 spec。
