---
title: 随机一图
date: 2026-09-27 10:00:00
---

<div class="zzh-random" id="zzh-random">
<div class="zzh-random-stage" id="zzh-random-stage">正在抽取…</div>
<div class="zzh-random-frame" id="zzh-random-frame" hidden>
<img class="zzh-random-img" id="zzh-random-img" alt="随机一图">
</div>
<button type="button" class="zzh-random-refresh" id="zzh-random-refresh">换一张</button>
</div>

<style>
.zzh-random {
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
}
.zzh-random-stage {
  color: #9aa0a6;
  font-size: 15px;
  padding: 40px 0;
}
.zzh-random-frame {
  display: inline-block;
  background: rgba(255, 255, 255, .03);
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 8px;
  padding: 8px;
}
.zzh-random-img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 8px;
}
.zzh-random-refresh {
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 255, 255, .18);
  color: #e8e8e8;
  border-radius: 6px;
  padding: 6px 18px;
  font-size: 14px;
  margin-top: 16px;
  cursor: pointer;
}
.zzh-random-refresh:hover {
  background: rgba(255, 255, 255, .16);
}
.zzh-random-refresh:disabled {
  opacity: .5;
  cursor: default;
}
.zzh-random [hidden] {
  display: none;
}
</style>

<script>
(function() {
  'use strict';

  var stage = document.getElementById('zzh-random-stage');
  var frame = document.getElementById('zzh-random-frame');
  var img = document.getElementById('zzh-random-img');
  var btn = document.getElementById('zzh-random-refresh');

  var images = [];
  var currentItem = null;
  var retriedAfterError = false;
  var pendingPreload = null;

  function notice(text) {
    stage.hidden = false;
    stage.textContent = text;
  }

  function clearNotice() {
    stage.hidden = true;
    stage.textContent = '';
  }

  // 拒绝采样的均匀随机 [0, n)：先把 2^32 截成 n 的整数倍，落在上界外就重抽
  function randInt(n) {
    if (n <= 0) return 0;
    var limit = Math.floor(4294967296 / n) * n;
    var buf = new Uint32Array(1);
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % n;
  }

  // excludeSrc 非空时从排除它的剩余集合里抽；池仅 1 张时允许重复抽同一张
  function pick(excludeSrc) {
    var pool = images;
    if (excludeSrc && pool.length > 1) {
      pool = pool.filter(function(it) { return it.src !== excludeSrc; });
    }
    return pool[randInt(pool.length)] || null;
  }

  function showItem(item) {
    currentItem = item;
    frame.hidden = true;
    if (item.w > 0 && item.h > 0) {
      img.setAttribute('width', item.w);
      img.setAttribute('height', item.h);
    } else {
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
    img.src = item.src;
  }

  // 消费 manifest：images[] 里只留 src 为非空字符串的条目；空池返回 false
  function applyManifest(data) {
    var list = Array.isArray(data && data.images) ? data.images : [];
    images = list.filter(function(it) {
      return it && typeof it.src === 'string' && it.src;
    });
    if (!images.length) {
      notice('图池暂时是空的，明天再来看看');
      btn.hidden = true;
      btn.disabled = true;
      return false;
    }
    btn.hidden = false;
    return true;
  }

  function fetchManifest() {
    return fetch('manifest.json').then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  img.addEventListener('load', function() {
    clearNotice();
    frame.hidden = false;
    btn.disabled = false;
    preloadAnother();
  });

  img.addEventListener('error', function() {
    if (!retriedAfterError) {
      // 应对清单与文件短暂不一致（如 CDN 缓存差）：重取一次 manifest 再重抽
      retriedAfterError = true;
      var bad = currentItem && currentItem.src;
      fetchManifest().then(function(data) {
        if (!applyManifest(data)) return;
        showItem(pick(bad));
      }).catch(function() {
        notice('这张图加载失败了，再抽一张试试');
        btn.disabled = false;
      });
      return;
    }
    notice('这张图加载失败了，再抽一张试试');
    btn.disabled = false;
  });

  btn.addEventListener('click', function() {
    if (!images.length || !currentItem) return;
    btn.disabled = true;
    notice('正在抽取…');
    retriedAfterError = false;
    var next = null;
    if (pendingPreload && pendingPreload.ok && pendingPreload.item.src !== currentItem.src) {
      next = pendingPreload.item;
    }
    pendingPreload = null;
    if (!next) next = pick(currentItem.src);
    if (!next) {
      notice('这张图加载失败了，再抽一张试试');
      btn.disabled = false;
      return;
    }
    showItem(next);
  });

  // READY 后静默预载另一张，让「换一张」秒切；失败无感（置空即可）
  function preloadAnother() {
    if (images.length < 2 || !currentItem) return;
    var item = pick(currentItem.src);
    if (!item || item.src === currentItem.src) return;
    var entry = { item: item, ok: false };
    pendingPreload = entry;
    var holder = new Image();
    holder.onload = function() { entry.ok = true; };
    holder.onerror = function() {
      if (pendingPreload === entry) pendingPreload = null;
    };
    holder.src = item.src;
  }

  fetchManifest().then(function(data) {
    if (applyManifest(data)) showItem(pick(''));
  }).catch(function() {
    notice('图池清单加载失败，请刷新重试');
    btn.disabled = true;
  });
})();
</script>
