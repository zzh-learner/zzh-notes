/* global hexo */
'use strict';

// 标签权重数据 —— 构建期把 site.tags 序列化成 [{name, count, path}] 挂到模板 locals
// 供 source/_data/body-end.njk 的 wordcloud2.js 词云脚本内联使用
// 任何异常均静默跳过（仅 warn），绝不阻断构建
//
// 设计说明：跟 scripts/git-revision.js / git-updated.js 同款用 template_locals 而非 before_generate。
// template_locals 收到的 locals 正是渲染器要用的对象，直接赋值即可被 njk 模板读取。

hexo.extend.filter.register('template_locals', locals => {
  const page = locals.page;
  // 只在标签云页（front-matter type: tags）注入，避免污染其它页面
  if (!page || page.type !== 'tags') {
    return locals;
  }

  try {
    // site.tags 每个 tag：name=标签名，length=文章数（PostTag 关联数，比 posts.length 快），
    // path=形如 "tags/读书/"，前端拼 root 前缀即跳转链接
    locals.tagWeights = locals.site.tags.toArray().map(t => ({
      name: t.name,
      count: t.length,
      path: t.path
    }));
  } catch (e) {
    hexo.log.warn(`tag-weights: 跳过标签数据注入 - ${e.message}`);
  }

  return locals;
});
