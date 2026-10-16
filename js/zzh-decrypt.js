
(function () {
  'use strict';
  var CEK_KEY = 'zzh-cek';
  var AUTH_KEY = 'zzh-auth'; // 与 header.njk / scripts/login-page.js 同键（会话双键副本约定，注释互指）
  var PKEY_KEY = 'zzh-pkey'; // 私密板块密钥：全局解密失败登出时随之清除（与 login-page.js / header.njk 清除点同步）
  var GH_KEY = 'zzh-gh-token'; // 写作台访问令牌：GCM 失败登出时随会话清除（多副本键名：scripts/login-page.js 登录 IIFE 与写作台脚本 / source/_partials/header.njk / 本脚本各持一份，改一处必须同步其余）
  var dataEl = document.getElementById('zzh-cipher-data');
  var gateEl = document.getElementById('zzh-gate');
  var errEl = document.getElementById('zzh-gate-err');

  function fail(msg) {
    if (gateEl) gateEl.classList.remove('is-loading'); // 还原锁卡：加载态只在解密尝试期间存在
    if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
  }

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(fn, 0); });
    } else {
      setTimeout(fn, 0);
    }
  }

  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // 与 header.njk 的 ZzhAuth.read 同构的防御校验副本：形状损坏/过期即删
  function readCek() {
    try {
      var raw = localStorage.getItem(CEK_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || typeof s.k !== 'string' || !/^[0-9a-f]{64}$/.test(s.k) ||
          typeof s.e !== 'number' || s.e <= Date.now()) {
        localStorage.removeItem(CEK_KEY);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  var rebindDone = false;
  function rebind() {
    if (rebindDone) return;
    rebindDone = true;
    document.body.classList.add('zzh-decrypted'); // 隐藏详情页头部固定引导行（styles.styl）
    try { document.dispatchEvent(new Event('page:loaded', { bubbles: true })); } catch (e) {}
    var utils = window.NexT && window.NexT.utils;
    if (utils) {
      if (typeof utils.wrapTableWithBox === 'function') { try { utils.wrapTableWithBox(); } catch (e) {} }
      if (typeof utils.registerCodeblock === 'function') { try { utils.registerCodeblock(); } catch (e) {} }
      if (typeof utils.registerTabsTag === 'function') { try { utils.registerTabsTag(); } catch (e) {} }
      if (typeof utils.registerVideoIframe === 'function') { try { utils.registerVideoIframe(); } catch (e) {} }
    }
    rebuildToc();
    if (utils && typeof utils.registerSidebarTOC === 'function') { try { utils.registerSidebarTOC(); } catch (e) {} }
    // refresh 强制同步 layout，推迟到下一帧再修阅读进度条 end（其余重放保持同步不动）
    if (window.ScrollTrigger) {
      try {
        window.requestAnimationFrame(function () {
          try { window.ScrollTrigger.refresh(); } catch (e) {}
        });
      } catch (e) {}
    }
  }

  // 客户端重建侧栏 TOC（本站当前未开 toc，未来开启时此路径生效）
  function rebuildToc() {
    var wrap = document.querySelector('.post-toc-wrap');
    if (!wrap) return;
    var box = wrap.querySelector('.post-toc');
    if (box && box.children.length) return;
    var body = document.querySelector('.post-body');
    if (!body) return;
    var hs = body.querySelectorAll('h2, h3');
    if (!hs.length) return;
    var ol = document.createElement('ol');
    ol.className = 'nav';
    Array.prototype.forEach.call(hs, function (h) {
      if (!h.id) return;
      var li = document.createElement('li');
      li.className = 'toc-item toc-level-' + h.tagName.toLowerCase().slice(1);
      var a = document.createElement('a');
      a.className = 'toc-link';
      a.href = '#' + h.id;
      var span = document.createElement('span');
      span.className = 'toc-text';
      span.textContent = h.textContent;
      a.appendChild(span);
      li.appendChild(a);
      ol.appendChild(li);
    });
    if (!ol.children.length) return;
    if (!box) {
      box = document.createElement('div');
      box.className = 'post-toc animated';
      wrap.appendChild(box);
    }
    box.appendChild(ol);
  }

  function inject(plainHtml) {
    if (!gateEl || !gateEl.parentNode) return;
    var tpl = document.createElement('template');
    tpl.innerHTML = plainHtml; // template 内容惰性，<script> 解析后不执行（spec：已置 already-started）
    // 收集内容里的内联脚本，插入后逐个换新节点触发执行（随机一图页等内容带脚本；
    // 直接搬旧节点不会执行——template 里的 script 移入文档也被跳过）。文档顺序执行。
    var scripts = Array.prototype.slice.call(tpl.content.querySelectorAll('script'));
    // 顶层元素标记 data-zzh-injected：styles.styl 据此做整体淡入；body-end.njk 的
    // fade-up 过滤据此跳过注入内容（防 window.load 后「先归零再淡入」的重闪）
    var roots = [];
    for (var r = 0; r < tpl.content.childNodes.length; r++) {
      if (tpl.content.childNodes[r].nodeType === 1) roots.push(tpl.content.childNodes[r]);
    }
    for (var m = 0; m < roots.length; m++) roots[m].setAttribute('data-zzh-injected', '');
    gateEl.parentNode.replaceChild(tpl.content, gateEl);
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var s = document.createElement('script');
      for (var j = 0; j < old.attributes.length; j++) {
        s.setAttribute(old.attributes[j].name, old.attributes[j].value);
      }
      s.text = old.text; // 仅内联脚本（门禁内容页的 script 均为内联，无 src）
      if (old.parentNode) old.parentNode.replaceChild(s, old);
    }
    if (dataEl && dataEl.parentNode) dataEl.parentNode.removeChild(dataEl);
    rebind();
  }

  // 跨标签页：另一标签登录/登出（zzh-cek 变化）后本标签自动刷新出正文/引导卡
  window.addEventListener('storage', function (ev) {
    if (ev && ev.key === CEK_KEY) location.reload();
  });

  // —— 早启动：脚本解析即读 CEK/密文并开跑 AES-GCM，不等 DOMContentLoaded ——
  // GSAP 走 CDN 且 defer，DOMContentLoaded 可能被网络拖慢；解密是纯计算，先跑完，
  // DOMContentLoaded 一到（NexT boot 跑完 + 1 拍，见 rebindingPlan）立刻注入。
  // CEK 有效即切加载态（锁卡文案让位给「正在解密」，解密完整个节点被正文替换；
  // 失败路径 fail() 会移除 is-loading 还原锁卡）。
  var subtle = window.crypto && window.crypto.subtle;
  var cek = readCek();
  var payload = null;
  try { payload = JSON.parse(dataEl.textContent); } catch (e) { payload = null; }
  var payloadOk = !!payload && payload.v === 1 && typeof payload.iv === 'string' && typeof payload.ct === 'string';
  function startCipher() {
    return subtle.importKey('raw', hexToBytes(cek.k), 'AES-GCM', false, ['decrypt']).then(function (key) {
      return subtle.decrypt({ name: 'AES-GCM', iv: hexToBytes(payload.iv) }, key, b64ToBytes(payload.ct));
    });
  }
  var cipherPromise = null;
  if (subtle && cek && payloadOk) {
    if (gateEl) gateEl.classList.add('is-loading');
    cipherPromise = startCipher();
  }

  whenReady(function () {
    if (!subtle) { fail('当前环境不支持解密（需 HTTPS 或 localhost 访问）'); return; }
    if (!cek) {
      var logged = false;
      try { logged = !!localStorage.getItem(AUTH_KEY); } catch (e) {}
      if (logged) fail('已登录但本浏览器没有有效的内容密钥（可能密钥已轮换），请重新登录');
      return;
    }
    if (!payloadOk) { fail('密文数据损坏，请重新构建'); return; }
    if (!cipherPromise) cipherPromise = startCipher(); // 兜底：正常在解析期已启动
    cipherPromise.then(function (plain) {
      inject(new TextDecoder().decode(plain));
    }).catch(function () {
      try { localStorage.removeItem(CEK_KEY); localStorage.removeItem(AUTH_KEY); localStorage.removeItem(PKEY_KEY); localStorage.removeItem(GH_KEY); } catch (e) {}
      fail('解密失败：内容密钥已轮换，已自动登出，请重新登录');
    });
  });
})();
