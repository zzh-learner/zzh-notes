/* global hexo */
'use strict';

// AI 生图聚合页 —— 构建期把命中过滤标签的文章渲染成卡片 HTML，追加到
// source/ai/index.md（front-matter type: ai）的 page.content 末尾。
// 过滤标签读 _config.yml 的 ai_gallery.tags（与 scripts/index-generator.js 共用一份配置）。
// 任何异常均静默跳过（仅 warn），绝不阻断构建；注入失败时页面退化为纯 Markdown 说明文字。
//
// 设计说明：与 scripts/tag-weights.js 同款挂 template_locals 而非 before_generate——
// template_locals 收到的 locals.page 正是渲染器要用的对象。before_generate 阶段
// hexo 已把 _content 渲染成 HTML 写进 page.content（hexo/dist/plugins/filter/
// before_generate/render_post.js:8-11），所以这里拼接的是最终 HTML，直接追加即可。
//
// 顺带负责菜单文案：_config.next.yml 的 menu 加了 ai 键，NexT 语言文件没有 menu.ai
// 词条，hexo-i18n 缺 key 会原样显示 "menu.ai"（hexo-i18n/dist/i18n.js:56）。这里包一层
// locals.__ 兜底翻译成「生图」。hexo 核心的 template_locals i18n filter 在 init() 里
// 先注册先执行（hexo/dist/hexo/index.js:189），scripts/ 后加载后执行（load_plugins），
// 拿到的 locals.__ 一定是核心 filter 刚设好的函数，包一层安全。

const MARKER_START = '<!--zzh-ai-gallery-start-->';
const MARKER_END = '<!--zzh-ai-gallery-end-->';
const MARKER_RE = /<!--zzh-ai-gallery-start-->[\s\S]*?<!--zzh-ai-gallery-end-->/;
const MENU_LABEL = '生图';

// 默认过滤标签：_config.yml 缺 ai_gallery 段时的兜底，值与 _config.yml 保持一致。
// 只用生图帖必带的「摄影」（/new-post 规定生图文固定打 AI、摄影，Cosplay 为其子集）；
// 裸「AI」和 AI观察/人工智能/图灵测试/多模态/国产卡等也打在"聊 AI 的文字随笔"上，
// 圈进来会把随笔误收进 /ai/（见 _config.yml 口径注释）。
// ⚠ scripts/index-generator.js 有一份同值副本（hexo 对 scripts/ 是 vm 包装逐个执行，
// 见 hexo/dist/hexo/index.js:240-255，跨脚本 require 会二次执行源码）——改这里必须同步那份。
const DEFAULT_TAGS = ['摄影', 'Cosplay'];

// 统一的过滤标签解析（index-generator.js 有一份相同实现，改动必须同步）：
// tags 是非空数组 → 用配置；缺失 / 写错（含写成字符串）/ 空数组 → 退回 DEFAULT_TAGS。
// 两端必须同进退，否则配置写坏时会出现"画廊还在聚合、首页却不过滤"的分叉。
function resolveGalleryTags(config) {
  const cfg = (config && config.ai_gallery) || {};
  return Array.isArray(cfg.tags) && cfg.tags.length ? cfg.tags : DEFAULT_TAGS;
}

hexo.extend.filter.register('template_locals', locals => {
  // 1) 菜单 i18n 兜底：所有页面都要（菜单在公共 header 里，桌面 header.njk 与
  //    NexT 移动端 menu-item.njk 都用 __('menu.' + name) 取文案）
  try {
    const __ = locals.__;
    if (typeof __ === 'function' && !__._zzhAiMenuWrapped) {
      const wrapped = function(...args) {
        if (args[0] === 'menu.ai') return MENU_LABEL;
        return __.apply(this, args);
      };
      wrapped._zzhAiMenuWrapped = true;
      locals.__ = wrapped;
    }
  } catch (e) {
    hexo.log.warn(`ai-gallery: 菜单文案兜底跳过 - ${e.message}`);
  }

  // 2) 聚合页注入：只在 source/ai/ 页面（front-matter type: ai）
  const page = locals.page;
  if (!page || page.type !== 'ai') {
    return locals;
  }

  try {
    const filterTags = resolveGalleryTags(hexo.config);

    // 命中任一过滤标签的文章，按日期倒序
    const posts = locals.site.posts.toArray()
      .filter(post => post.tags.map(t => t.name).some(name => filterTags.indexOf(name) >= 0))
      .sort((a, b) => b.date - a.date);

    page.content = render(hexo, posts, String(page.content || ''));
  } catch (e) {
    hexo.log.warn(`ai-gallery: 聚合页注入跳过 - ${e.message}`);
  }

  return locals;
});

// 幂等拼接：after_generate 的 save_database 会把 page.content 连同注入块存进 db.json，
// 不 clean 直接再 generate 时 content 非 null、render_post 跳过重渲染，直接追加会重复。
// 所以先剥掉旧注入块再拼新的。
function render(hexo, posts, oldContent) {
  const base = oldContent.replace(MARKER_RE, '').trimEnd();
  return base + '\n\n' + MARKER_START + '\n<div class="ai-gallery">' + posts.map(card).join('') + '</div>\n' + MARKER_END + '\n';
}

function card(post) {
  const root = hexo.config.root || '/';
  const href = post.path ? joinUrl(root, post.path) : post.permalink;
  const title = escapeHtml(post.title || post.slug || '(无标题)');
  const date = fmtDate(post.date);
  const tags = post.tags.map(t => t.name).map(escapeHtml).join(' · ');
  const cover = firstImage(post);

  const coverHtml = cover
    ? `<img class="ai-gallery-cover" src="${escapeAttr(cover)}" alt="${title}" loading="lazy" decoding="async">`
    : `<div class="ai-gallery-cover ai-gallery-cover-empty" aria-hidden="true"></div>`;

  return `<a class="ai-gallery-item" href="${escapeAttr(href)}">${coverHtml}` +
    `<div class="ai-gallery-info"><div class="ai-gallery-title">${title}</div>` +
    `<div class="ai-gallery-meta"><time datetime="${date}">${date}</time>${tags ? ' · ' + tags : ''}</div>` +
    `</div></a>`;
}

// 取第一张图做封面：优先渲染后的 <img src>（marked prependRoot 已把相对文件名补全成
// /zzh-notes/<permalink>/xxx.jpg），兜底再从 raw markdown 的 ![](...) 里解析相对文件名自己拼。
function firstImage(post) {
  const sources = [post.content, post.raw, post._content];
  const root = hexo.config.root || '/';

  for (const s of sources) {
    if (typeof s !== 'string' || !s) continue;

    let m = s.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) {
      const src = m[1];
      // 渲染后的 src 已是完整路径（/zzh-notes/... 或外链），直接用
      if (/^(https?:)?\/\//i.test(src) || src.charAt(0) === '/') return src;
      return joinUrl(root, post.path, src);
    }

    m = s.match(/!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/);
    if (m) {
      const src = m[1];
      if (/^(https?:)?\/\//i.test(src) || src.charAt(0) === '/') return src;
      // 相对文件名 → 该文章的资源夹（post_asset_folder: true）
      return joinUrl(root, post.path, src);
    }
  }
  return '';
}

// post.date 是 moment 对象（warehouse SchemaTypeMoment cast，带 Asia/Shanghai 时区）
function fmtDate(d) {
  if (!d) return '';
  if (typeof d.format === 'function') {
    try { return d.format('YYYY-MM-DD'); } catch (e) { /* fall through */ }
  }
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const p = n => (n < 10 ? '0' + n : String(n));
  return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
}

function joinUrl() {
  // 只用于 root+path+文件名 的相对拼接（无协议头），多余的 / 压成一个
  return Array.prototype.join.call(arguments, '/').replace(/([^:])\/{2,}/g, '$1/');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
