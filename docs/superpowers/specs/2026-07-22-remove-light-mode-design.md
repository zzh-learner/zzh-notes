# 删除亮色模式（强制恒定暗色）— 设计文档

- **日期**：2026-07-22
- **状态**：已通过 brainstorming，待写实施计划
- **作者**：ZZH（与 ZCode 协作）
- **相关文件**：`source/_data/head.njk`、`source/_data/header.njk`、`source/_data/body-end.njk`、`source/_data/styles.styl`
- **前序设计**：`2026-07-22-starfield-background-design.md`（星空背景，本设计删除其亮色模式分支）

## 1. 目标

将博客从"亮/暗双主题切换"改为"强制恒定暗色"。移除主题切换按钮、切换 IIFE、键盘快捷键、星空的主题联动逻辑、所有 `[data-theme="light"]` CSS 规则。`data-theme` 永久钉为 `dark`，复用现有 `[data-theme="dark"]` 变量覆盖体系。站点永远黑底星空。

## 2. 非目标（YAGNI）

- 不重构 `[data-theme="dark"]` 选择器为无前缀（恒为 dark 后理论上可简化，但属可选代码美化，不做——保留属性选择器零风险且改动量小）
- 不动 NexT 原生的 `@media (prefers-color-scheme)` 源码（靠 `[data-theme="dark"]` 特异性覆盖即可）
- 不删 localStorage 里的 `theme` 键（遗留数据无害，浏览器侧无读取者即可）
- 不动背景明暗滑块（它控制星空亮度，与主题无关，保留）

## 3. 用户决策摘要

| 维度 | 选择 |
|------|------|
| 删除方式 | **强制恒定暗色**（A），无切换、无系统跟随 |
| NexT 暗色处理 | **FOUC 写死 `data-theme="dark"`**，靠现有 `[data-theme="dark"]` 覆盖（A） |
| 星空亮色规则 | **直接删**（A），`[data-theme="light"] #starfield` 等死代码移除 |

## 4. 改动详情（按文件）

### 4.1 `source/_data/head.njk` — FOUC 脚本简化

**现状**（7-27 行）：读 `localStorage('theme')` → 有则用 → 否则读 `prefers-color-scheme` → 都没有默认 light。含 try/catch 防隐私模式。

**改为**：直接写死 `data-theme="dark"`。删除 localStorage 读取、系统偏好判断、try/catch（不再需要——无分支无异常源）。FOUC 防护本身保留（仍是 `<head>` 内同步脚本，确保 CSS 应用前属性已设）。

```js
document.documentElement.setAttribute('data-theme', 'dark');
```

注释更新：从"优先级 localStorage > 系统偏好"改为"强制暗色（站点不再有亮色模式）"。

### 4.2 `source/_data/header.njk` — 删切换按钮

**删除**（36-44 行）：整个 `#theme-toggle` 按钮及其注释、两个图标 `<i>`（sun/moon）。搜索按钮（28-35 行）和背景明暗按钮（16-24 行）保留不动。

### 4.3 `source/_data/body-end.njk` — 删切换 IIFE + 简化星空主题联动

**删除切换 IIFE**（4-37 行）：整个 `getTheme`/`setTheme`/点击监听/Ctrl+Shift+L 快捷键 IIFE。这段唯一的职责是主题切换，恒暗后无存在意义。

**简化星空主题联动**（body-end.njk 星空 `<script type="module">` 内，约 411-441 行）：

现状：
```js
function currentThemeIsDark() { ... }
var reducedMotion = ...;
function syncTheme() { if (currentThemeIsDark()) { if (!reducedMotion) start(); } else { stop(); } }
syncTheme();
var themeObserver = new MutationObserver(...);
themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

改为：data-theme 恒为 dark，不再变化，MutationObserver/`currentThemeIsDark`/`syncTheme` 全部删除。初始 RAF 启停逻辑已在更上方（reduced-motion 分支 + `start()`），无需主题判断。具体：
- 删除 `currentThemeIsDark` 函数定义（416-418 行）
- 删除 `reducedMotion` 变量（418 行）—— 注意 reduced-motion 的判断在更上方已有（Task 3 的静态渲染分支用 `window.matchMedia('(prefers-reduced-motion: reduce)')`），这里的 `reducedMotion` 变量是 Task 4 MutationObserver 用的，删它不影响上方
- 删除 `syncTheme` 函数 + 初始调用（420-428 行）
- 删除 `themeObserver` 创建 + observe（430-439 行）
- visibilitychange 处理器（391-397 行）去掉 `&& currentThemeIsDark()` 条件，恢复为纯 `!window.matchMedia('(prefers-reduced-motion: reduce)').matches` 判断（data-theme 恒 dark，无需主题门；注意该处理器用的是内联 matchMedia 调用，不依赖被删的 `reducedMotion` 变量）

### 4.4 `source/_data/styles.styl` — 删 light 规则 + 切换按钮样式

**删除**：
- `[data-theme="light"]` 整块（34-52 行）—— 亮色变量定义
- `[data-theme="light"] img { opacity: 1; }`（56 行）
- 顶部主题切换注释块（5-9 行）—— 改为说明"恒定暗色"
- `.theme-toggle` 全部相关样式（244-282 行：`.theme-toggle`、`:hover`、dark 变体、`.theme-toggle-icon`、moon/sun 显隐、reduced-motion）
- `[data-theme="light"] #starfield { ... }`（576-581 行）—— 星空亮色隐藏
- `[data-theme="light"] .custom-header-bg { ... }`（582-586 行）—— 滑块亮色禁用

**保留**（不动）：
- `[data-theme="dark"]` 整块（10-28 行）—— 暗色变量是站点实际配色，删了裸奔
- 所有 `[data-theme="dark"] xxx` 选择器（header/nav/search/bg-popover 等）—— 它们是暗色下的具体样式，仍生效
- `[data-theme="dark"] body { background-color: #0f0f11; }`（105 行）—— 黑底兜底
- `[data-theme="dark"] img { opacity: 0.75; }`（54 行）—— 暗色图片调暗

## 5. 验证方法

1. `npx hexo clean && npx hexo generate`，确认无新 ERROR（pre-existing 的 `url_for` 错误无关，忽略）、`index.html` / `archives/index.html` / 文章页均生成。
2. 本地预览，确认：
   - header 上**没有**太阳/月亮切换按钮（只剩搜索 + 背景明暗两个按钮）。
   - 页面永远是暗色（黑底星空），无论系统是亮色还是暗色偏好。
   - 背景明暗滑块仍正常控制星空亮度。
   - Ctrl+Shift+L 快捷键不再触发任何切换。
3. grep 确认无残留：
   - `grep -c "theme-toggle" source/_data/` → 0
   - `grep -c "getTheme\|setTheme" source/_data/body-end.njk` → 0
   - `grep -c "currentThemeIsDark\|themeObserver\|syncTheme" source/_data/body-end.njk` → 0
   - `grep -c 'data-theme="light"' source/_data/styles.styl` → 0
4. 控制台无 JS 报错（原切换 IIFE 删了，但若有其他代码引用 `theme-toggle` 会报错——确认无）。
