# 星空背景（Three.js）— 设计文档

- **日期**：2026-07-22
- **状态**：已通过 brainstorming，待写实施计划
- **作者**：ZZH（与 ZCode 协作）
- **相关文件**：`source/_data/styles.styl`、`source/_data/body-end.njk`、`source/_data/header.njk`
- **前序设计**：`2026-07-21-background-opacity-slider-design.md`（明暗滑块，本设计复用其滑块机制）

## 1. 目标

将博客当前的静态照片背景（`background.webp` + 半透明遮罩）替换为一块全屏 Three.js 星空 canvas，在暗色模式下渲染：星点 + 星云 + 偶发流星 + 整体缓慢漂移。参考站点 <https://solaris-qwen38max.vercel.app/> 的星空氛围，但作为博客背景层（被动、不交互）而非主体内容。

## 2. 非目标（YAGNI）

- 不做鼠标拖拽/滚轮缩放/视差跟随（背景必须被动，不能和滚动、点击抢交互）
- 不接 OrbitControls、不做 3D 行星模型（SOLARIS 那种是主体内容，不是背景）
- 不引外部图片资源（星云纹理程序生成）
- 不做星空与文章内容的联动（如阅读进度影响星空亮度等）
- 不做用户可调的流星频率/星云颜色等"控制台"——明暗滑块是唯一用户控件
- 不替换现有 GSAP 动效体系（进度条、fade-up、header 收缩保留）

## 3. 用户决策摘要

brainstorming 阶段已确认的关键选择：

| 维度 | 选择 |
|------|------|
| 背景替换方式 | **完全替换** `background.webp`，星空成为唯一背景层 |
| 视觉档位 | **C 档**：流星 + 星云 + 漂移闪烁，全套氛围 |
| 滑块语义 | 滑块改控**星空亮度**（canvas 容器 opacity），复用现有 `--bg-overlay-opacity` 机制与 localStorage |
| 亮色模式行为 | 亮色模式自动降为**纯色底**（`--body-bg-color`），星空隐藏；滑块按钮在亮色下**禁用变灰** |
| 实现技术 | **方案 3：Three.js（WebGL）** |
| 交互性质 | **不接鼠标交互**，纯程序驱动的被动背景 |
| reduced-motion | 渲染**一帧静态星空**（星点固定，不闪不漂无流星）后停 RAF |
| canvas 注入 | 由 JS **动态创建**，失败则无 canvas、零残留 |

## 4. 技术张力说明（需实施时牢记）

`AGENTS.md` 红线 2 的精神是"不乱加依赖、保持可离线构建"。Three.js 是从 CDN 加载的外部重依赖（gzip 后约 250KB），与该精神存在张力。化解方式与现有 GSAP 一致：**CDN 失败 / WebGL 不支持 / 运行异常时静默降级为纯黑底，内容照常可读**。兜底是本设计的一等公民，不是事后补丁（见第 8 节）。three.module.js 不写入 `package.json`（它是浏览器端 CDN import，不参与 Node 构建），因此不影响 `npx hexo generate`。

## 5. 整体架构与分层

### 5.1 层级结构（暗色模式）

```
body (背景色 #0f0f11，纯黑兜底)
  └─ #starfield  fixed / inset:0 / z-index:-2 / opacity 由滑块控制
       └─ Three.js: 黑色 clear + 星点 + 星云 + 流星 + 缓慢漂移
  └─ …内容区（z-index ≥ 0，原样不动）
```

- canvas 放 `z-index:-2`（低于内容区可能的负 z 层），保证星空永远在最底。
- canvas 的 CSS `opacity` 绑 `--bg-overlay-opacity`：值衰减时露出 body 的 `#0f0f11` 兜底黑，过渡自然。
- 内容区（`.main-inner` 等）现状透明，叠在星空之上，文字仍是主角——与现状设计目标一致。

### 5.2 与现有背景部件的关系

| 现有部件 | 处理 |
|----------|------|
| `body { background-image: url(background.webp) }` | **删除**，改为纯色 `#0f0f11` 兜底 |
| `body::before` 半透明遮罩 | **删除**（canvas 直出黑底星空，不再需要遮罩层） |
| 明暗滑块 IIFE（`body-end.njk:42-107`） | **完全保留**，消费端改绑 canvas opacity |
| `--bg-overlay-opacity` CSS 变量 | **保留**，语义从"遮罩透明度"变为"星空可见度" |
| GSAP parallax（`body-end.njk:219-229`） | **删除**（配 fixed 背景本就不生效，换 canvas 后彻底无意义） |
| 其余 GSAP 动效 | **全保留**（进度条、fade-up、header 收缩） |

## 6. Three.js 场景内容与参数

一个固定相机（`PerspectiveCamera`，fov 60°，z=1，不移动），看向一个 root `Group`，Group 内含三层数据。**全程序驱动，不交互**。

### 6.1 Layer 1：星点（静态布满 + 闪烁）

- **数量**：约 800–1200 个点，球面随机分布（半径范围 5–50，相机在球心）。
- **实现**：`THREE.Points` + 自定义 `ShaderMaterial`（非 `PointsMaterial`，需逐星闪烁与大小差异）。
- **每星 attribute**：`position`（vec3）、`aScale`（float，0.5–2.0 随机）、`aPhase`（float，0–2π 错开闪烁）、`aColor`（vec3，90% 暖白 `#fff5e6`，10% 偏蓝 `#cce8ff`，模拟色温分布）。
- **uniform**：`uTime`（每帧更新）、`uPixelRatio`（管 hidri 大小）。
- **shader**：
  - 顶点：`gl_PointSize = aScale * baseSize * (300.0 / -mvPosition.z)`（近大远小）。
  - 片元：`distance(gl_PointCoord, vec2(0.5))` 做软边圆（非硬方块），亮度 `0.6 + 0.4 * sin(uTime * twinkleSpeed + aPhase)`（呼吸闪烁）。

### 6.2 Layer 2：星云（3–4 团软光晕）

- **实现**：每团 `PlaneGeometry` + 径向渐变纹理（**Canvas 程序生成**，不引外部图片），`MeshBasicMaterial` + `AdditiveBlending`、`depthWrite:false`。
- **参数**：3–4 团，位置球面随机，朝向相机（`lookAt(camera)`）。半径 8–15，alpha 0.15–0.25，颜色低饱和——深紫 `#2a1a4a` / 深青 `#0a3a4a` / 暗红 `#3a1a1a` 各一。
- **运动**：极慢自转（0.02–0.05 rad/s，方向随机），制造"云在涌动"错觉。

### 6.3 Layer 3：流星（偶发，JS 管生命周期）

- **触发**：JS 侧每 **3–8 秒**（随机间隔）生成一颗。
- **形态**：线段（`Line` + `LineBasicMaterial`），顶点颜色 alpha 渐变实现头部亮、尾部透明拖尾。
- **运动**：从屏幕外随机点出发，沿随机方向匀速直线移动 **0.8–1.5 秒**后消失。RAF 内检查到期则从 scene 移除。
- **亮度**：拖尾头部 alpha 可到 0.9，但存在时间短，整体视觉占比小。

### 6.4 Layer 4：整体漂移

- root `Group` 绕 Y 轴极慢自转（`group.rotation.y += 0.0013/frame`，约 **80 秒一圈**：2π / 0.0013 ≈ 4833 帧 ÷ 60fps ≈ 80s），模拟天球周日运动。
- **不做视差/鼠标跟随**，保持被动。
- **星云朝向协调**：group 自转会使星云的 `lookAt(camera)` 初始朝向偏移。实现时星云的 `lookAt` 要在每帧 group 自转之后重新执行（或把星云挂在不参与自转的独立子层），保证星云始终正面朝相机。

### 6.5 参数总览

| 元素 | 数量/频率 | 关键参数 |
|------|-----------|----------|
| 星点 | ~1000 | 半径 5–50，scale 0.5–2，闪烁周期 ~3s，10% 蓝色调 |
| 星云 | 3–4 团 | 半径 8–15，alpha 0.15–0.25，3 种低饱色 |
| 流星 | 3–8s 一颗 | 生命周期 0.8–1.5s，直线匀速 |
| 漂移 | 80s/圈 | group.rotation.y，无鼠标交互 |

### 6.6 渲染循环与性能

- 单个 `requestAnimationFrame`：每帧更新 `uTime` → 推进流星 → 旋转 group → `renderer.render()`。
- **DPR 限制**：`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`，cap 在 2，避免 4K/Retina 过渲染。

## 7. 与现有系统的对接

### 7.1 明暗滑块 → 改控星空亮度

滑块 IIFE（`body-end.njk:42-107`）逻辑不动：读 `localStorage('bg-opacity')` → `applyOpacity()` 写 `--bg-overlay-opacity`。**唯一改动是 CSS 消费端**：

```
滑块 value(0-100)
  → applyOpacity(): overlayOpacity = 1 - value/100   （现有逻辑，不变）
  → 写入 CSS 变量 --bg-overlay-opacity
  → CSS: #starfield { opacity: var(--bg-overlay-opacity, 0.5) }   （新消费端）
```

语义映射与现状一致，用户无感：

| 滑块值 | 现在（照片背景） | 新（星空背景） |
|--------|------------------|----------------|
| 0 | 遮罩全不透 → 照片隐藏，纯色底 | canvas opacity 0 → 星空隐藏，body 黑兜底 |
| 50 | 遮罩半透 → 照片若隐若现 | canvas opacity 0.5 → 星空半亮 |
| 100 | 遮罩全透 → 照片全清晰 | canvas opacity 1.0 → 星空全亮 |

**关键细节**：滑块控制 canvas 容器 CSS `opacity`（合成层 fade），**不**触碰 shader 亮度。拖动 60fps 丝滑，`opacity:0` 时 canvas 完全透明。

### 7.2 亮色模式行为

- **canvas 隐藏**：不用 `display:none`（不可 transition），改用 `opacity:0; pointer-events:none; visibility:hidden` + `transition: opacity .4s`，实现切换时淡出而非硬切。
- **滑块按钮禁用**：`[data-theme="light"] .custom-header-bg { pointer-events:none; opacity:.4 }`，tooltip/title 改"星空仅暗色可见"。
- body 底色用现有 `--body-bg-color`（亮色值 `#fafafa`）。

### 7.3 主题切换过渡

- **暗 → 亮**：`data-theme` 变 light → canvas 淡出（opacity transition）+ body 底色切浅 + RAF stop。
- **亮 → 暗**：canvas 淡入 + RAF start。
- **RAF 联动**：亮色时 canvas 不可见，跑 RAF 是浪费，必须 `cancelAnimationFrame`。通过 `MutationObserver` 监听 `<html data-theme>` 触发，不侵入现有主题切换按钮代码（解耦）。

### 7.4 删除失效 parallax

`body-end.njk:219-229` 的 GSAP parallax 配 `background-attachment:fixed` 当前本就不生效，换 canvas 后彻底无意义，删除。其余 GSAP 动效保留。

## 8. 兜底与生命周期

**核心原则**：任何环节失败，博客都必须可读，只是没了星空。

### 8.1 失败链路与降级

```
加载 three.module.js(CDN) ──失败──→ THREE 未定义 ──→ 降级 ①
        │ 成功                                            ↓
创建 WebGLRenderer ──失败/不支持──→ 降级 ②
        │ 成功                                            ↓
运行场景脚本 ──抛异常──→ try/catch ──→ 降级 ③
        │ 正常                                            ↓
正常运行 ──tab隐藏/reduced-motion──→ 暂停 ④（节能，非降级）
```

降级共同终态：body 保持 `#0f0f11`（暗色）或 `--body-bg-color`（亮色），内容区正常，用户只见一个无星点的纯色博客，功能完整。

### 8.2 各层具体实现

- **① CDN 失败**：动态 `import()` three.module.js + try/catch。失败 `console.warn('[ZZH] Three.js 加载失败，星空降级为纯黑底')`，不创建 canvas，body 黑底兜底。
- **② WebGL 不支持**：创建 renderer 前检测 `document.createElement('canvas').getContext('webgl')`，null 走降级。覆盖老旧设备/禁用 WebGL 浏览器。
- **③ 场景脚本异常**：初始化 + RAF 循环包 try/catch，崩了 `cancelAnimationFrame` + 移除 canvas。
- **④ 运行时暂停**：
  - `document.hidden` → `cancelAnimationFrame`，可见时恢复（避免后台烧 GPU）。
  - `prefers-reduced-motion: reduce` → 渲染**一帧静态星空**（星点固定，不闪不漂无流星）后停 RAF。尊重无障碍偏好，但仍让用户看到静态星点美感。

### 8.3 RAF 生命周期集中控制

模块级 `start()` / `stop()` + `running` 标志，三处触发：

| 触发 | 动作 |
|------|------|
| 初始化成功（暗色） | start RAF |
| tab 隐藏 | stop RAF |
| tab 可见（暗色） | start RAF |
| 切到亮色 | stop RAF + canvas 淡出 |
| 切到暗色 | canvas 淡入 + start RAF |
| reduced-motion | 渲染一帧后 stop |

### 8.4 resize 处理

`renderer.setSize` + `camera.aspect` 更新，**debounce 150ms**。如 6.6 所述，星点为球面分布，resize 只改变投影范围、不改星点空间位置，因此 resize 不会让星点"露出边界"或重叠，无需重算星点坐标。

### 8.5 canvas DOM 注入

`#starfield` 由 JS 动态创建，`document.body.insertBefore(canvas, body.firstChild)`。**不在 header.njk 写死**——Three.js 加载失败则 DOM 里不留空 canvas，零残留。

### 8.6 兜底日志规范

所有降级走 `console.warn('[ZZH] ...')`，与现有 GSAP 兜底日志（`body-end.njk:124`）风格一致。不抛未捕获异常，不上报。

## 9. 改动文件清单

| 文件 | 改动 |
|------|------|
| `source/_data/styles.styl` | 删 `body` 背景图 + `body::before` 遮罩；body 改纯色兜底；加 `#starfield` 定位/opacity/亮色隐藏 + 滑块禁用态 |
| `source/_data/body-end.njk` | 滑块 IIFE **不改**；删 parallax 段（219-229）；新增星空 `<script type="module">`（含动态 import、场景、RAF、兜底） |
| `source/_data/header.njk` | **不改**（滑块按钮/popover DOM 全保留） |
| `source/images/background.webp` | 删除（可选，git 历史保留） |

## 10. 验证方法

实施完成后按以下步骤验证：

1. `npx hexo clean && npx hexo generate`，确认无 ERROR、`index.html` / 文章页均生成。
2. `npm run server` 本地预览，暗色模式下确认：
   - 星点闪烁、星云缓转、流星偶现、整体缓慢漂移。
   - 拖动明暗滑块，星空亮度实时变化，刷新后恢复（localStorage）。
3. 切换亮色模式：canvas 淡出、滑块按钮变灰不可点、body 底色变浅。
4. 切回暗色：canvas 淡入、滑块恢复可用。
5. 兜底测试：
   - 断网/改 CDN URL 为无效值 → 控制台 warn、博客纯黑底可读。
   - 浏览器开发者工具模拟 `prefers-reduced-motion: reduce` → 静态一帧后不动。
   - 切走 tab → 后台不烧 CPU（Performance 面板确认 RAF 停）。
6. 移动端（窄屏）确认不卡顿、不发热严重。
