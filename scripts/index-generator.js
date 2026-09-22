/* global hexo */
'use strict';

// 覆盖首页 index generator —— 命中 _config.yml ai_gallery.tags 任一标签的文章
// 不出现在首页列表（含分页）。归档(archives)/标签页/RSS(atom.xml)/搜索(search.xml)/
// 文章页是各自独立的 generator，完全不受影响。
//
// 同名覆盖原理：hexo 先加载 node_modules 的 hexo-* 插件、后加载 scripts/ 目录
// （hexo/dist/hexo/load_plugins.js），generator register 同名后注册者覆盖前者
// （hexo/dist/extend/generator.js 直接 this.store[name] = ...）。
//
// 逻辑照抄 hexo-generator-index@4.0.0（index.js 默认值合并 + lib/generator.js 主体），
// 仅多一步按标签过滤。默认值合并自带一份，npm 插件的同段合并先执行过也无冲突；
// 即使将来卸载 hexo-generator-index，本脚本仍独立可跑（hexo-pagination 是其依赖，
// AGENTS.md 红线 2 要求依赖清单保持完整，不会单独卸掉）。
//
// 兜底：过滤阶段任何异常都回退到"不过滤"的原版逻辑并 warn——首页宁可多显示，
// 也不能静默缺页面。标签解析则与 scripts/ai-gallery.js 完全同源（同一份
// DEFAULT_TAGS 兜底）：配置缺失/写坏时两端一致退回默认标签集，不会出现
// "画廊还在聚合、首页却不过滤"（或反之）的分叉。

const pagination = require('hexo-pagination');

// ⚠ 与 scripts/ai-gallery.js 的 DEFAULT_TAGS 同值副本——hexo 对 scripts/ 是 vm 包装
// 逐个执行（hexo/dist/hexo/index.js:240-255），跨脚本 require 会二次执行源码，所以
// 宁可选两份小副本。改任意一份必须同步另一份。
const DEFAULT_TAGS = ['AI', 'AI观察', '人工智能', '图灵测试', '多模态', '国产卡', '摄影', 'Cosplay'];

// 与 scripts/ai-gallery.js 的 resolveGalleryTags 相同（改动必须同步）：tags 是非空
// 数组 → 用配置；缺失 / 写错（含写成字符串，防止 indexOf 退化成子串匹配）/ 空数组
// → 退回 DEFAULT_TAGS。永远返回数组，excludeTags.indexOf(name) 因此是精确匹配。
function resolveGalleryTags(config) {
  const cfg = (config && config.ai_gallery) || {};
  return Array.isArray(cfg.tags) && cfg.tags.length ? cfg.tags : DEFAULT_TAGS;
}

function indexGenerator(locals) {
  const config = this.config;

  // 与 hexo-generator-index/index.js:5-9 相同的默认值合并（幂等）
  const indexConfig = Object.assign({
    per_page: typeof config.per_page === 'undefined' ? 10 : config.per_page,
    order_by: '-date',
    layout: ['index', 'archive']
  }, config.index_generator);

  const paginationDir = indexConfig.pagination_dir || config.pagination_dir || 'page';
  const path = indexConfig.path || '';

  // === 本脚本唯一的增量：剔除聚合页命中的文章（解析规则与 ai-gallery.js 同源） ===
  const excludeTags = resolveGalleryTags(config);
  let posts = locals.posts;

  if (excludeTags.length) {
    try {
      posts = posts.filter(post => {
        const names = post.tags.map(t => t.name);
        return !names.some(name => excludeTags.indexOf(name) >= 0);
      });
    } catch (e) {
      hexo.log.warn(`index-generator: 首页过滤跳过（本次不过滤）- ${e.message}`);
      posts = locals.posts;
    }
  }

  // 以下照抄 hexo-generator-index/lib/generator.js:7-21
  posts = posts.sort(indexConfig.order_by);
  posts.data.sort((a, b) => (b.sticky || 0) - (a.sticky || 0));

  return pagination(path, posts, {
    perPage: indexConfig.per_page,
    layout: indexConfig.layout || ['index', 'archive'],
    format: paginationDir + '/%d/',
    data: {
      __index: true
    }
  });
}

hexo.extend.generator.register('index', indexGenerator);
