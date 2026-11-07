/* 全站账户坞脚本（zzh-account-dock，由 _config.redefine.yml 的 inject.footer 注入 DOM，
 * 本文件经 inject.footer 外链加载）。
 * 2026-10-19 主题迁移：从 NexT 时代 source/_partials/header.njk 的内联脚本原样迁出，
 * 逻辑零改动——它持有多副本键名约定的其中一份（红线 8），改这里必须同步：
 *   scripts/login-page.js 的 logout()、scripts/zzh-post-cipher.js 注入脚本、
 *   登录页写作台脚本（共四份运行时副本）。
 * 路径说明：/zzh-notes/ 前缀写死（root 由「url/仓库名不改」红线钉死，可安全硬编码）。 */
(function () {
  'use strict';
  var KEY = 'zzh-auth';
  window.ZzhAuth = {
    read: function () {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return null;
        var s = JSON.parse(raw);
        if (!s || typeof s.u !== 'string' ||
            (s.r !== 'admin' && s.r !== 'user') ||
            typeof s.e !== 'number' || s.e <= Date.now()) {
          localStorage.removeItem(KEY);
          localStorage.removeItem('zzh-gh-token'); // 会话过期即清写作台令牌（登出/过期同清，与 logout() 同步）
          return null;
        }
        return s;
      } catch (e) { return null; }
    },
    logout: function () {
      // 登出四键同清：'zzh-cek'（内容密钥）、'zzh-pkey'（私密板块密钥，仅 admin）、
      // 'zzh-gh-token'（写作台访问令牌，仅 admin）与 'zzh-auth'（登录态）同生共死。
      // 同步副本：scripts/login-page.js 的 logout()（含写作台键）与 scripts/zzh-post-cipher.js
      // 注入脚本的 GCM 失败清理——三处改一处必须同步其余（会话多键 + 私钥约定）。
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem('zzh-cek');
        localStorage.removeItem('zzh-pkey');
        localStorage.removeItem('zzh-gh-token');
      } catch (e) {}
      location.reload();
    }
  };
  var s = window.ZzhAuth.read();
  var chip = document.getElementById('zzh-auth-chip');
  if (s && chip) {
    chip.hidden = false;
    var name = chip.querySelector('.zzh-auth-chip-name');
    if (name) name.textContent = s.u;
    if (s.r === 'admin') chip.classList.add('is-admin');
  }
  // 私密板块入口：仅 admin 会话显示（登出 logout() reload 后本脚本重跑即隐藏）。
  // URL 在页面源码中可见属客户端门禁固有局限，保密靠 /private/ 的 PKEY 加密而非入口隐藏。
  var priv = document.getElementById('zzh-private-nav');
  if (priv) priv.hidden = !(s && s.r === 'admin');
  var btn = document.getElementById('zzh-auth-chip-logout');
  if (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      window.ZzhAuth.logout();
    });
  }
})();
