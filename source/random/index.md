---
title: 随机一图
date: 2026-09-27 10:00:00
---

<div class="zzh-random" id="zzh-random">
<div class="zzh-random-stage" id="zzh-random-stage">正在抽取…</div>
<div class="zzh-random-view">
<button type="button" class="zzh-random-prev" id="zzh-random-prev" aria-label="上一张">&lt;</button>
<div class="zzh-random-frame" id="zzh-random-frame" hidden>
<img class="zzh-random-img" id="zzh-random-img" alt="随机一图">
</div>
<button type="button" class="zzh-random-next" id="zzh-random-next" aria-label="下一张">&gt;</button>
</div>
<div class="zzh-random-count" id="zzh-random-count" hidden></div>
</div>

<style>
/* 本页隐藏文章标题头（浏览器标签与 SEO 的 title 仍保留） */
.post-block:has(.zzh-random) .post-header {
  display: none;
}
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
.zzh-random-view {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.zzh-random-frame {
  display: inline-block;
  background: rgba(255, 255, 255, .03);
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 8px;
  padding: 6px;
}
.zzh-random-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 150px);
  object-fit: contain;
  border-radius: 8px;
}
.zzh-random-count {
  color: #9aa0a6;
  font-size: 13px;
  margin-top: 10px;
}
.zzh-random-count[hidden] {
  display: none;
}
.zzh-random-prev,
.zzh-random-next {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .08);
  border: 1px solid rgba(255, 255, 255, .18);
  color: #e8e8e8;
  font-size: 22px;
  line-height: 1;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.zzh-random-prev:hover:not(:disabled),
.zzh-random-next:hover:not(:disabled) {
  background: rgba(255, 255, 255, .16);
}
.zzh-random-prev:disabled,
.zzh-random-next:disabled {
  opacity: .5;
  cursor: default;
}
.zzh-random [hidden] {
  display: none !important;
}
@media (max-width: 480px) {
  .zzh-random-view {
    gap: 8px;
  }
  .zzh-random-prev,
  .zzh-random-next {
    width: 36px;
    height: 36px;
    font-size: 18px;
  }
  .zzh-random-img {
    max-height: calc(100vh - 130px);
  }
}
</style>

<script>
(function() {
  'use strict';

  var stage = document.getElementById('zzh-random-stage');
  var count = document.getElementById('zzh-random-count');
  var frame = document.getElementById('zzh-random-frame');
  var img = document.getElementById('zzh-random-img');
  var prevBtn = document.getElementById('zzh-random-prev');
  var nextBtn = document.getElementById('zzh-random-next');

  var images = [];
  var current = -1;
  var retriedAfterError = false;

  function notice(text) {
    stage.hidden = false;
    stage.textContent = text;
  }

  function clearNotice() {
    stage.hidden = true;
    stage.textContent = '';
  }

  function setButtons(disabled) {
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;
  }

  // 拒绝采样的均匀随机 [0, n)：先把 2^32 截成 n 的整数倍，落在上界外就重抽（仅用于进页时随机起点）
  function randInt(n) {
    if (n <= 0) return 0;
    var limit = Math.floor(4294967296 / n) * n;
    var buf = new Uint32Array(1);
    do {
      crypto.getRandomValues(buf);
    } while (buf[0] >= limit);
    return buf[0] % n;
  }

  function showIndex(i) {
    current = i;
    var item = images[i];
    frame.hidden = true;
    count.hidden = false;
    count.textContent = (i + 1) + '/' + images.length;
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
      count.hidden = true;
      prevBtn.hidden = true;
      nextBtn.hidden = true;
      setButtons(true);
      return false;
    }
    prevBtn.hidden = false;
    nextBtn.hidden = false;
    return true;
  }

  function fetchManifest() {
    return fetch('manifest.json').then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  // step 为 +1 / -1，按 manifest 顺序循环翻页
  function go(step) {
    if (!images.length || current < 0) return;
    setButtons(true);
    notice('正在加载…');
    retriedAfterError = false;
    showIndex((current + step + images.length) % images.length);
  }

  img.addEventListener('load', function() {
    clearNotice();
    frame.hidden = false;
    setButtons(false);
    // 静默预载下一张，让「下一张」大概率秒切；失败无感
    if (images.length > 1 && current >= 0) {
      var holder = new Image();
      holder.src = images[(current + 1) % images.length].src;
    }
  });

  img.addEventListener('error', function() {
    if (!retriedAfterError) {
      // 应对清单与文件短暂不一致（如 CDN 缓存差）：重取一次 manifest 后停在原序号重试
      retriedAfterError = true;
      var keep = current;
      fetchManifest().then(function(data) {
        if (!applyManifest(data)) return;
        showIndex(Math.min(Math.max(keep, 0), images.length - 1));
      }).catch(function() {
        notice('这张图加载失败了，换个方向试试');
        setButtons(false);
      });
      return;
    }
    notice('这张图加载失败了，换个方向试试');
    setButtons(false);
  });

  prevBtn.addEventListener('click', function() { go(-1); });
  nextBtn.addEventListener('click', function() { go(1); });

  // 进页随机起点，「上一张 / 下一张」按顺序循环浏览
  fetchManifest().then(function(data) {
    if (applyManifest(data)) showIndex(randInt(images.length));
  }).catch(function() {
    notice('图池清单加载失败，请刷新重试');
    setButtons(true);
  });
})();
</script>
