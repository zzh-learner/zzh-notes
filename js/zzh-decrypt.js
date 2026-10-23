
(function () {
  'use strict';
  var CEK_KEY = 'zzh-cek';
  var AUTH_KEY = 'zzh-auth'; // 与 source/js/zzh-site.js / scripts/login-page.js 同键（会话双键副本约定，注释互指）
  var PKEY_KEY = 'zzh-pkey'; // 私密板块密钥：全局解密失败登出时随之清除（与 login-page.js / zzh-site.js 清除点同步）
  var GH_KEY = 'zzh-gh-token'; // 写作台访问令牌：GCM 失败登出时随会话清除（多副本键名：scripts/login-page.js 登录 IIFE 与写作台脚本 / source/js/zzh-site.js / 本脚本各持一份，改一处必须同步其余）
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

  // 与 source/js/zzh-site.js 的 ZzhAuth.read 同构的防御校验副本：形状损坏/过期即删
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
    document.body.classList.add('zzh-decrypted'); // 解密态样式钩子（source/css/zzh.css）
    // Redefine 的整体重放：main.js 在 window 上监听 'redefine:page:refresh' 并重跑
    // initPage（imageViewer 重建图片节点缓存 / lazyload / 代码块复制）。旧 NexT 时代
    // 的 page:loaded + NexT.utils 五调用 / TOC 重建 / ScrollTrigger.refresh 已随主题
    // 迁移删除——Redefine 的 imageViewer 是 document 级点击委托，解密后新插入的
    // <img> 本就免重建即可点击放大，这里派发事件只为刷新其导航缓存与懒加载。
    try { window.dispatchEvent(new Event('redefine:page:refresh')); } catch (e) {}
  }

  function inject(plainHtml) {
    if (!gateEl || !gateEl.parentNode) return;
    var tpl = document.createElement('template');
    tpl.innerHTML = plainHtml; // template 内容惰性，<script> 解析后不执行（spec：已置 already-started）
    // 收集内容里的内联脚本，插入后逐个换新节点触发执行（随机一图页等内容带脚本；
    // 直接搬旧节点不会执行——template 里的 script 移入文档也被跳过）。文档顺序执行。
    var scripts = Array.prototype.slice.call(tpl.content.querySelectorAll('script'));
    // 顶层元素标记 data-zzh-injected：source/css/zzh.css 据此做整体淡入
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
  // 解密是纯计算，先跑完；DOMContentLoaded 一到立刻注入。CEK 有效即切加载态
  // （锁卡文案让位给「正在解密」，解密完整个节点被正文替换；失败路径 fail()
  // 会移除 is-loading 还原锁卡）。
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
