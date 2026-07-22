# 星空背景（Three.js）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将博客静态照片背景替换为 Three.js 渲染的全屏星空 canvas（星点 + 星云 + 流星 + 缓慢漂移），在暗色模式下展示，亮色模式降为纯色底。

**Architecture:** 一块 `position:fixed; z-index:-2` 的全屏 `<canvas id="starfield">` 由 JS 动态注入 body 首子节点。Three.js 从 jsdelivr CDN 以 ES module 动态 `import()` 加载，渲染固定相机的粒子星空。现有明暗滑块的 `--bg-overlay-opacity` CSS 变量改绑到 canvas 容器 opacity（语义从"遮罩透明度"变为"星空可见度"）。主题切换通过 MutationObserver 监听 `data-theme`，亮色停 RAF + canvas 淡出。全链路兜底：CDN 失败/WebGL 不支持/运行异常均降级为纯色底，内容照常可读。

**Tech Stack:** Three.js 0.160.0（CDN ES module）、WebGL、现有 Hexo/NexT custom_file_path 注入机制（`source/_data/*.njk` + `styles.styl`）。

**设计文档：** `docs/superpowers/specs/2026-07-22-starfield-background-design.md`

## Global Constraints

- **不新增 npm 依赖**：three.module.js 走浏览器端 CDN `import()`，不写入 `package.json`，不参与 Node 构建（红线 2 精神）。
- **构建必须通过**：每个涉及 `_config` / `package.json` / `source/_data/` 的任务后跑 `npx hexo clean && npx hexo generate`，确认无 ERROR 且 `index.html`、`archives/index.html`、文章页生成（红线 3）。
- **url/root 不动**：`_config.yml` 的 `url: https://zzh-learner.github.io/zzh-notes/` 不可改（红线 4）。
- **CDN URL 固定**：`https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`（与现有 GSAP 同 CDN 商）。
- **所有降级走 `console.warn('[ZZH] ...')`**，不抛未捕获异常，与现有 GSAP 兜底日志风格一致。
- **滑块 IIFE 不改逻辑**：`body-end.njk:42-107` 的 `applyOpacity()` / localStorage / popover 逻辑全部保留，只改 CSS 消费端。
- **Three.js 用 `THREE` 命名空间**（`import * as THREE from ...`），与 SOLARIS 源码惯例一致。

---

## 文件结构

| 文件 | 责任 | 本计划改动 |
|------|------|-----------|
| `source/_data/styles.styl` | 全站样式 | 改：删背景图+遮罩、加 `#starfield` 定位/opacity/亮色隐藏、加滑块亮色禁用态 |
| `source/_data/body-end.njk` | body 末注入脚本 | 改：删 parallax 段、新增星空 module 脚本 |
| `source/_data/header.njk` | header DOM | **不改**（滑块按钮/popover 全保留） |
| `source/images/background.webp` | 旧背景图 | 删（Task 5，git 历史保留） |

---

### Task 1: 删除旧背景图样式 + 加 canvas 定位与滑块消费端

**目标**：移除 `background.webp` + `body::before` 遮罩，body 改纯色兜底；新增 `#starfield` 的 fixed 定位、opacity 绑滑块变量、亮色隐藏；加亮色下滑块按钮禁用态。此任务后，页面背景变成纯色（星空 canvas 还没注入，Task 3 才有），滑块控制一个还不存在的元素（无害，Task 3 接通）。

**Files:**
- Modify: `source/_data/styles.styl:58-80`（背景图 + 遮罩段）
- Modify: `source/_data/styles.styl:104-106`（暗色遮罩段）
- Modify: `source/_data/styles.styl`（新增 `#starfield` 段 + 滑块禁用态）

**Interfaces:**
- Produces（CSS 契约，供 Task 3 的 JS 依赖）：
  - `#starfield` 元素需被 JS 创建并 `insertBefore(body, body.firstChild)`，设 `id="starfield"`。
  - CSS `#starfield { opacity: var(--bg-overlay-opacity, 0.5) }`——滑块 IIFE 写入 `--bg-overlay-opacity` 到 `<html>`，级联生效。
  - 亮色模式 `[data-theme="light"] #starfield { opacity: 0; visibility: hidden; pointer-events: none }`。

- [ ] **Step 1: 替换背景图 + 遮罩段为纯色兜底 + canvas 样式**

把 `styles.styl:58-80`（从 `// === 背景图 + 强遮罩（亮色 92%） ===` 到 `body::before { ... }` 的结束 `}`）整段替换为：

```stylus
// === 背景：Three.js 星空 canvas（暗色）/ 纯色兜底（亮色或 JS 失败） ===
// body 底色是兜底：canvas 未注入或降级时，暗色显 #0f0f11 黑底。
// 三层结构：body 兜底底色 → #starfield canvas（z-index:-2）→ 内容区（z-index≥0）
body {
  background-color: #0f0f11;
  position: relative;
  min-height: 100vh;
}

// 星空 canvas：JS 动态创建（body-end.njk Task 3），失败则无此元素。
// opacity 绑 --bg-overlay-opacity（滑块 IIFE 写入 <html>）：
//   滑块 0 → opacity 1（全黑无星）反转？不——滑块语义：值越大星空越清晰。
//   applyOpacity(): overlayOpacity = 1 - sliderVal/100，写 --bg-overlay-opacity。
//   滑块 100 → --bg-overlay-opacity = 0 → canvas opacity 0 → 全黑？错。
//   修正：applyOpacity 的 overlayOpacity 语义是"遮罩不透明度"，对 canvas 应反用。
//   解法：canvas opacity = sliderVal/100（直接用滑块值）。但 IIFE 写的是遮罩变量。
//   最简：canvas opacity = 1 - var(--bg-overlay-opacity)，即把遮罩变量再反一次。
//   滑块 100 → --bg-overlay-opacity=0 → canvas opacity=1（全亮）✓
//   滑块 0   → --bg-overlay-opacity=1 → canvas opacity=0（隐藏）✓
#starfield {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -2;
  pointer-events: none;
  opacity: calc(1 - var(--bg-overlay-opacity, 0.5));
  transition: opacity 0.4s ease, visibility 0.4s ease;
}
```

- [ ] **Step 2: 替换暗色遮罩段为暗色 body 底色**

把 `styles.styl:101-106`（从 `// === 暗色模式遮罩` 到 `[data-theme="dark"] body::before { ... }` 的 `}`）替换为：

```stylus
// === 暗色模式 body 底色（canvas 降级时的兜底黑） ===
[data-theme="dark"] body {
  background-color: #0f0f11;
}
```

- [ ] **Step 3: 加亮色模式 canvas 隐藏 + 滑块禁用态**

在 `styles.styl` 末尾（`// === 移动端 popover 满宽 ===` 段之后，文件最后）追加：

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

- [ ] **Step 4: 验证构建**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR，`index.html` 生成。此时页面背景应为纯色（canvas 还没注入，Task 3 做）。

Run: `grep -c "background.webp" source/_data/styles.styl`
Expected: `0`（旧背景图引用已全删）

- [ ] **Step 5: Commit**

```bash
git add source/_data/styles.styl
git commit -m "feat(starfield): 删旧背景图样式，加 #starfield canvas 定位与亮色禁用"
```

---

### Task 2: 删除失效的 GSAP parallax 段

**目标**：移除 `body-end.njk:219-229` 的背景图 parallax（配 `background-attachment:fixed` 本就不生效，换 canvas 后无意义）。此任务独立、风险低，先做掉。

**Files:**
- Modify: `source/_data/body-end.njk:219-229`

- [ ] **Step 1: 删除 parallax 段**

把 `body-end.njk:219-229` 整段（从 `    // === 动效 5：背景图 parallax ===` 到对应的 `    });`）删除。删除后，`// === 动效 4` 段（图片 lazyload）的结束 `});` 直接接 `// === header 滚动收缩 ===` 段。

精确待删内容（连同上方空行和注释）：

```javascript

    // === 动效 5：背景图 parallax ===
    gsap.to('body', {
      backgroundPositionY: '+=5%',
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true
      }
    });
```

- [ ] **Step 2: 验证构建**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR。

Run: `grep -c "背景图 parallax\|backgroundPositionY" source/_data/body-end.njk`
Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add source/_data/body-end.njk
git commit -m "refactor(body-end): 删除失效的背景图 parallax 动效"
```

---

### Task 3: 注入星空 canvas + Three.js 场景（星点层）

**目标**：在 `body-end.njk` 新增一个 `<script type="module">`，动态 `import()` Three.js，创建 canvas 注入 body 首子节点，初始化 WebGL renderer + 场景。本任务只做**星点层**（Layer 1）+ 基础兜底（CDN 失败、WebGL 不支持）。星云/流星/漂移放 Task 4。

**Files:**
- Modify: `source/_data/body-end.njk`（在滑块 IIFE `</script>` 之后、GSAP `<script defer>` 之前插入新 module 脚本）

**Interfaces:**
- Consumes: `#starfield` 的 CSS 契约（Task 1 定义：id、fixed、z-index:-2、opacity 绑变量）。
- Produces（供 Task 4 扩展）：模块内的 `scene`、`camera`、`renderer`、`group`（root Group）、`animate()`（RAF 回调）需在 module 作用域可被 Task 4 的代码扩展。由于是单 `<script type="module">`，Task 4 直接在同一 script 块内追加代码即可访问。

- [ ] **Step 1: 在 body-end.njk 插入星空 module 脚本骨架（含兜底 + 星点层）**

在 `body-end.njk` 的滑块 IIFE `</script>`（第 108 行）之后、`{# === GSAP + ScrollTrigger` 注释（第 110 行）之前，插入以下完整脚本：

```njk

{# === 星空背景（Three.js，ES module，动态 import + 全链路兜底） === #}
{# 降级链：CDN 失败/WebGL 不支持/运行异常 → 静默降级为纯色底，内容照常可读 #}
<script type="module">
  (async function () {
    var THREE;
    // ① CDN 加载兜底
    try {
      THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    } catch (e) {
      console.warn('[ZZH] Three.js 加载失败，星空降级为纯色底');
      return;
    }

    // ② WebGL 支持检测
    var testCtx = document.createElement('canvas').getContext('webgl2') ||
                 document.createElement('canvas').getContext('webgl');
    if (!testCtx) {
      console.warn('[ZZH] WebGL 不支持，星空降级为纯色底');
      return;
    }

    try {
      // === 创建 canvas 注入 body 首子节点（失败则无残留） ===
      var canvas = document.createElement('canvas');
      canvas.id = 'starfield';
      document.body.insertBefore(canvas, document.body.firstChild);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.z = 1;

      var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);

      // root Group：Task 4 的整体漂移挂这里
      var group = new THREE.Group();
      scene.add(group);

      // === Layer 1：星点（球面随机分布 + 逐星闪烁） ===
      var STAR_COUNT = 1000;
      var positions = new Float32Array(STAR_COUNT * 3);
      var scales = new Float32Array(STAR_COUNT);
      var phases = new Float32Array(STAR_COUNT);
      var colors = new Float32Array(STAR_COUNT * 3);

      var warmColor = new THREE.Color('#fff5e6');
      var blueColor = new THREE.Color('#cce8ff');

      for (var i = 0; i < STAR_COUNT; i++) {
        // 球面均匀分布：半径 5-50
        var r = 5 + Math.random() * 45;
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        scales[i] = 0.5 + Math.random() * 1.5;
        phases[i] = Math.random() * Math.PI * 2;

        var c = Math.random() < 0.1 ? blueColor : warmColor;
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }

      var starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      starGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
      starGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      starGeo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));

      var starMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
        },
        vertexShader: [
          'attribute float aScale;',
          'attribute float aPhase;',
          'attribute vec3 aColor;',
          'varying vec3 vColor;',
          'varying float vTwinkle;',
          'uniform float uTime;',
          'uniform float uPixelRatio;',
          'void main() {',
          '  vColor = aColor;',
          '  vTwinkle = 0.6 + 0.4 * sin(uTime * 2.0 + aPhase);',  // ~3s 周期闪烁
          '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
          '  gl_PointSize = aScale * 2.0 * uPixelRatio * (50.0 / -mvPosition.z);',
          '  gl_Position = projectionMatrix * mvPosition;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'varying vec3 vColor;',
          'varying float vTwinkle;',
          'void main() {',
          '  vec2 uv = gl_PointCoord - vec2(0.5);',
          '  float d = length(uv);',
          '  if (d > 0.5) discard;',                  // 软边圆，非硬方块
          '  float alpha = (1.0 - d * 2.0) * vTwinkle;',
          '  gl_FragColor = vec4(vColor, alpha);',
          '}'
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });

      var stars = new THREE.Points(starGeo, starMat);
      group.add(stars);

      // === RAF 循环（Task 3 只做星点；Task 4 加星云/流星/漂移） ===
      var rafId = null;
      var running = false;
      var clock = new THREE.Clock();

      function animate() {
        rafId = requestAnimationFrame(animate);
        var t = clock.getElapsedTime();
        starMat.uniforms.uTime.value = t;
        // group.rotation.y 在 Task 4 加（漂移），此处暂留星点静态
        renderer.render(scene, camera);
      }

      function start() {
        if (running) return;
        running = true;
        animate();
      }
      function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      }

      // === reduced-motion：渲染一帧静态星空后停 ===
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        starMat.uniforms.uTime.value = 0;
        renderer.render(scene, camera);
        console.warn('[ZZH] prefers-reduced-motion，星空渲染静态一帧后停止动画');
      } else {
        start();
      }

      // === tab 可见性：隐藏时停 RAF 省电 ===
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          stop();
        } else if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          start();
        }
      });

      // === resize：debounce 150ms ===
      var resizeTimer = null;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          camera.aspect = window.innerWidth / window.innerHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(window.innerWidth, window.innerHeight);
        }, 150);
      });

      // 暴露给 Task 4 的主题联动（MutationObserver 在 Task 4 加，此处先占位）
      window.__zzhStarfield = { start: start, stop: stop, scene: scene, camera: camera, renderer: renderer, group: group, THREE: THREE };

    } catch (err) {
      console.warn('[ZZH] 星空场景初始化异常，降级为纯色底：', err);
      // 移除可能半创建的 canvas，零残留
      var bad = document.getElementById('starfield');
      if (bad) bad.remove();
    }
  })();
</script>
```

- [ ] **Step 2: 验证构建**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR，`index.html` 生成。

Run: `grep -c "three.module.js" source/_data/body-end.njk`
Expected: `1`

- [ ] **Step 3: 本地预览验证**

Run: `npm run server`（后台），浏览器开 `http://localhost:4000/zzh-notes/`，暗色模式下确认：
- 纯黑底上出现星点（约 1000 个，大小不一，10% 偏蓝）。
- 星点缓慢闪烁（呼吸式亮度变化）。
- 拖动 header 背景明暗滑块，星点亮度实时变化（滑到 0 星点消失变纯黑，滑到 100 全亮）。
- 控制台无报错（CDN 通时）。

降级测试：断网或临时把 CDN URL 改成 `three@0.160.0-INVALID`，刷新，确认控制台 warn `[ZZH] Three.js 加载失败` 且页面纯黑底可读。验证后改回正确 URL。

- [ ] **Step 4: Commit**

```bash
git add source/_data/body-end.njk
git commit -m "feat(starfield): 注入 Three.js 星空 canvas + 星点层 + 全链路兜底"
```

---

### Task 4: 加星云层 + 流星层 + 整体漂移 + 主题联动

**目标**：在 Task 3 的同一 `<script type="module">` 块内，扩充场景：星云（Layer 2）、流星（Layer 3）、group 漂移（Layer 4），并加 MutationObserver 监听 `data-theme` 实现亮色停 RAF / 暗色启 RAF。本任务改的是 Task 3 刚插入的脚本块，在 `window.__zzhStarfield = {...}` 这行**之前**插入星云/流星/漂移代码，并把 MutationObserver 加在 `window.__zzhStarfield` 之后。

**Files:**
- Modify: `source/_data/body-end.njk`（Task 3 插入的 module 脚本块）

**Interfaces:**
- Consumes: Task 3 的 `scene`、`camera`、`renderer`、`group`、`THREE`、`start`/`stop`、`animate`（均在同一 module 作用域）。
- Produces: 完整星空背景（星点+星云+流星+漂移+主题联动）。

- [ ] **Step 1: 在 animate() 内加 group 漂移**

在 Task 3 的 `function animate()` 内，`renderer.render(scene, camera);` 这行**之前**插入：

```javascript
        // Layer 4：整体漂移（约 80s 一圈，2π/0.0013 ≈ 4833 帧 ÷ 60fps ≈ 80s）
        group.rotation.y += 0.0013;
```

- [ ] **Step 2: 在 `window.__zzhStarfield = {...}` 之前插入星云层**

在 `      // 暴露给 Task 4 的主题联动` 这行**之前**插入星云代码：

```javascript
      // === Layer 2：星云（3-4 团软光晕，Canvas 程序生成径向渐变纹理） ===
      var nebulaColors = ['#2a1a4a', '#0a3a4a', '#3a1a1a', '#1a2a4a'];
      var nebulaCount = 3 + Math.floor(Math.random() * 2);  // 3 或 4 团

      // 生成径向渐变纹理（64x64，中心透明→边缘透明，中圈有色）
      function makeNebulaTexture(hexColor) {
        var size = 128;
        var c = document.createElement('canvas');
        c.width = size; c.height = size;
        var ctx = c.getContext('2d');
        var grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
        grad.addColorStop(0, hexColor);
        grad.addColorStop(0.5, hexColor);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        var tex = new THREE.CanvasTexture(c);
        return tex;
      }

      var nebulaGroup = new THREE.Group();
      group.add(nebulaGroup);  // 挂在 group 下，随漂移一起转

      for (var n = 0; n < nebulaCount; n++) {
        var r = 10 + Math.random() * 30;
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        var geo = new THREE.PlaneGeometry(8 + Math.random() * 7, 8 + Math.random() * 7);
        var mat = new THREE.MeshBasicMaterial({
          map: makeNebulaTexture(nebulaColors[n % nebulaColors.length]),
          transparent: true,
          opacity: 0.15 + Math.random() * 0.10,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi)
        );
        mesh.userData.spinSpeed = (0.02 + Math.random() * 0.03) * (Math.random() < 0.5 ? -1 : 1);
        nebulaGroup.add(mesh);
      }

      // === Layer 3：流星（偶发，JS 管生命周期） ===
      var meteors = [];
      var nextMeteorTime = 3 + Math.random() * 5;  // 首颗 3-8s 后

      function spawnMeteor() {
        // 屏幕外随机起点（NDC ±1.5），随机方向
        var startX = (Math.random() - 0.5) * 3;
        var startY = (Math.random() - 0.5) * 3;
        var startZ = -0.5;
        var pts = [
          new THREE.Vector3(startX, startY, startZ),
          new THREE.Vector3(startX, startY, startZ)  // 尾部初始同点
        ];
        var geo = new THREE.BufferGeometry().setFromPoints(pts);
        // 顶点颜色 alpha 渐变（头部亮，尾部透明）
        var vertColors = new Float32Array([
          1.0, 1.0, 1.0,  // 头部白
          1.0, 1.0, 1.0   // 尾部白（alpha 由 LineBasicMaterial.transparent 管，此处用 opacity 整体）
        ]);
        geo.setAttribute('color', new THREE.BufferAttribute(vertColors, 3));
        var mat = new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending
        });
        var line = new THREE.Line(geo, mat);
        // 投影到星空球面（半径 8，在星点层前方）
        var dir = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          0
        ).normalize();
        line.userData = {
          dir: dir,
          speed: 0.08 + Math.random() * 0.05,
          life: 0,
          maxLife: 0.8 + Math.random() * 0.7,  // 0.8-1.5s
          startWorld: new THREE.Vector3(startX * 8, startY * 8, startZ * 8)
        };
        group.add(line);
        meteors.push(line);
      }
```

- [ ] **Step 3: 在 animate() 内加流星推进 + 星云自转**

在 Task 3 的 `function animate()` 内，刚加的 `group.rotation.y += 0.0013;` 之后、`renderer.render(scene, camera);` 之前，插入：

```javascript
        // 星云缓慢自转（每团方向随机）
        for (var ni = 0; ni < nebulaGroup.children.length; ni++) {
          nebulaGroup.children[ni].rotation.z += nebulaGroup.children[ni].userData.spinSpeed * 0.01;
          // 星云始终朝相机（抵消 group 自转导致的朝向偏移）
          nebulaGroup.children[ni].lookAt(camera.position);
        }
        // 星云 group 要在 group 自转后重新朝相机，否则会随 group 转到背面
        // 解法：nebulaGroup 不挂 group，独立挂 scene？但那样不随漂移。
        // 设计决策（spec §6.4）：星云挂 group 随漂移，但每帧 lookAt 相机保证正面。
        // group.rotation.y 已改了星云世界坐标，lookAt(camera.position) 用世界坐标对齐。

        // 流星推进 + 生命周期回收
        var dt = clock.getDelta();
        clock.getDelta();  // 消耗这次 delta 防累积（getDelta 两次调第二次返回近 0）
        if (t >= nextMeteorTime) {
          spawnMeteor();
          nextMeteorTime = t + 3 + Math.random() * 5;  // 下一颗 3-8s 后
        }
        for (var mi = meteors.length - 1; mi >= 0; mi--) {
          var m = meteors[mi];
          m.userData.life += dt;
          if (m.userData.life >= m.userData.maxLife) {
            group.remove(m);
            m.geometry.dispose();
            m.material.dispose();
            meteors.splice(mi, 1);
          } else {
            // 头部沿 dir 移动，尾部跟随（拖尾长度随速度）
            var head = m.userData.startWorld.clone().add(
              m.userData.dir.clone().multiplyScalar(m.userData.speed * m.userData.life * 60)
            );
            var tail = head.clone().sub(
              m.userData.dir.clone().multiplyScalar(2.5)  // 拖尾长度
            );
            var posAttr = m.geometry.attributes.position;
            posAttr.setXYZ(0, head.x, head.y, head.z);
            posAttr.setXYZ(1, tail.x, tail.y, tail.z);
            posAttr.needsUpdate = true;
            // 淡出：生命后半 alpha 衰减
            m.material.opacity = m.userData.life > m.userData.maxLife * 0.6
              ? 0.9 * (1 - (m.userData.life - m.userData.maxLife * 0.6) / (m.userData.maxLife * 0.4))
              : 0.9;
          }
        }
```

- [ ] **Step 4: 在 `window.__zzhStarfield = {...}` 之后加主题联动 MutationObserver**

在 `window.__zzhStarfield = {...};` 这行**之后**（仍在 try 块内）插入：

```javascript

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

- [ ] **Step 5: 验证构建**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR。

- [ ] **Step 6: 本地预览验证（暗色全套）**

Run: `npm run server`，暗色模式确认：
- 星点闪烁（Task 3 已有）。
- **星云**：3-4 团低饱色软光晕（深紫/深青/暗红/深蓝），缓慢自转，始终正面朝相机。
- **流星**：每 3-8 秒一颗，从屏外划过，带拖尾，0.8-1.5 秒后淡出消失。
- **整体漂移**：星空极缓慢旋转（盯着看约 80 秒能察觉明显移动）。
- 拖动滑块：全套星空亮度实时变化。
- 切到**亮色**：canvas 淡出（0.4s 过渡），星空消失，滑块按钮变灰不可点，Performance 面板确认 RAF 停。
- 切回**暗色**：canvas 淡入，星空恢复，RAF 重启。
- 切走浏览器 tab：后台 RAF 停（Performance 面板确认）。
- 控制台无报错。

- [ ] **Step 7: Commit**

```bash
git add source/_data/body-end.njk
git commit -m "feat(starfield): 加星云层 + 流星层 + 整体漂移 + 主题联动"
```

---

### Task 5: 删除旧背景图文件

**目标**：`background.webp` 已无任何引用（Task 1 删了 CSS 引用，Task 2 删了 parallax），删除文件释放空间。git 历史保留，需要时 `git checkout` 可找回。

**Files:**
- Delete: `source/images/background.webp`

- [ ] **Step 1: 确认无引用**

Run: `grep -rn "background.webp" source/ _config.next.yml _config.yml 2>/dev/null`
Expected: 无输出（Task 1/2 已删所有引用）。

- [ ] **Step 2: 删除文件**

```bash
git rm source/images/background.webp
```

- [ ] **Step 3: 验证构建**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR，`index.html`、`archives/index.html`、文章页均生成。

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: 删除旧背景图 background.webp（已由星空 canvas 替代）"
```

---

### Task 6: 全量验证与回归

**目标**：按设计文档 §10 的验证清单全量跑一遍，确认无回归（现有功能不受影响）。

**Files:** 无改动，纯验证。

- [ ] **Step 1: 构建无错**

Run: `npx hexo clean && npx hexo generate`
Expected: 无 ERROR。

Run: `ls public/index.html public/archives/index.html`
Expected: 两个文件都存在。

Run: 随便挑一篇 `public/` 下的文章页确认存在（如 `ls public/*/index.html | head -3`）。

- [ ] **Step 2: 本地预览功能回归**

Run: `npm run server`，浏览器验证：
- 暗色：星空全套（星点/星云/流星/漂移）+ 滑块控亮度。
- 亮色：纯色底 + 滑块禁用。
- 主题切换：淡入淡出过渡，RAF 联动。
- **回归**（非星空功能不受影响）：
  - header 导航链接可点。
  - 搜索按钮（header 内）可弹搜索层。
  - 阅读进度条随滚动增长。
  - 文章卡片/标题 fade-up 正常。
  - 文章图片 lazyload fade 正常。
  - header 滚动收缩正常。

- [ ] **Step 3: 兜底回归**

- 断网 / CDN 改无效 URL → warn + 纯色底可读（改回正确 URL）。
- DevTools → Rendering → `prefers-reduced-motion: reduce` → 星空静态一帧后不动（星点可见但不闪不漂无流星）。
- 切走 tab → Performance 面板 RAF 停。

- [ ] **Step 4: 移动端验证**

浏览器 DevTools 切移动端视口（如 iPhone 12），确认：
- 星空正常渲染，不卡顿。
- header 纵向堆叠正常，背景明暗按钮在亮色下禁用。
- 滑动滚动流畅。

- [ ] **Step 5: 无未提交改动**

Run: `git status`
Expected: clean（所有改动已分任务提交）。

---

## Self-Review 结果

**1. Spec 覆盖检查：**
- §3 决策（替换/C档/滑块控亮度/亮色降纯色/Three.js/不交互/reduced-motion静态一帧/JS动态创建canvas）→ Task 1-4 全覆盖 ✓
- §5 架构分层（z-index:-2/opacity绑变量/删遮罩/删parallax）→ Task 1-2 ✓
- §6 场景内容（星点1000/星云3-4/流星3-8s/漂移80s）→ Task 3（星点）+ Task 4（星云/流星/漂移）✓
- §7 滑块对接（复用IIFE/消费端改绑/亮色禁用/主题过渡/MutationObserver）→ Task 1（CSS消费端+禁用）+ Task 4（MutationObserver）✓
- §8 兜底（CDN/WebGL/异常/visibility/reduced-motion/resize/JS注入canvas/日志）→ Task 3 全覆盖 ✓
- §9 文件清单 → Task 1-5 ✓
- §10 验证 → Task 6 ✓

**2. Placeholder 扫描：** 无 TBD/TODO，所有代码块完整。✓

**3. 类型/命名一致性：**
- `#starfield` id 全计划一致 ✓
- `--bg-overlay-opacity` 变量名与现有 IIFE 一致 ✓
- `scene`/`camera`/`renderer`/`group`/`animate`/`start`/`stop`/`THREE` 命名在 Task 3 定义、Task 4 使用，一致 ✓
- `meteors`/`nebulaGroup`/`nebulaCount` 在 Task 4 内定义即用 ✓
