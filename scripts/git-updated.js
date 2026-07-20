/* global hexo */
'use strict';

// 文章更新时间 —— 构建时读 git 历史，按 commit 数决定是否填 page.updated
// 规则：commit 数 0（未提交）或 1（只发布过）→ 不填；≥2（改过）→ 填最新 commit 的 %ci
// 挂在 template_locals，渲染期为每篇 post 详情页计算（覆盖 Hexo 默认 updated_option: 'empty'）
// 任何 git 错误均静默跳过（仅 warn），绝不阻断构建
//
// 设计说明：跟 scripts/git-revision.js 同款用 template_locals 而非 before_generate。
// 原因：warehouse 的 Post.forEach / Post.toArray() 每次 query 都返回新的 Document 实例
// （p1 !== p2 !== p3 已实测），在 before_generate 里改 post.updated 只动到临时对象，
// _runGenerators 阶段重新 query 时读不到，page.updated 还是 undefined。
// template_locals 收到的 locals.page 正是渲染器要用的对象，直接赋值即可生效。

const { execSync } = require('child_process');
const path = require('path');

function git(args, cwd) {
  return execSync(args, { cwd, encoding: 'utf8' });
}

// 取该文件所有提交的 committer date（%ci，ISO 8601 带时区），按时间倒序
// commits[0] = HEAD（最新）。--follow 跟踪重命名，--no-merges 排除 merge commit
function getCommitDates(relPath, cwd) {
  const out = git(
    `git log --follow --no-merges --pretty=format:%ci -- "${relPath}"`,
    cwd
  ).trim();
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

// template_locals：每页渲染时触发，locals.page 即将被送进渲染器
// 只对文章详情页（layout === 'post'）计算，惰性求值
hexo.extend.filter.register('template_locals', locals => {
  const page = locals.page;
  if (!page || page.layout !== 'post' || !page.full_source) {
    return locals;
  }

  try {
    const baseDir = hexo.base_dir;
    const relPath = path.relative(baseDir, page.full_source).replace(/\\/g, '/');
    const commits = getCommitDates(relPath, baseDir);

    if (commits.length >= 2) {
      // 最新 commit 的 %ci 解析成 Date（带时区，new Date 能正确解析）
      const updated = new Date(commits[0]);
      if (!isNaN(updated.getTime())) {
        page.updated = updated;
      }
    }
    // commits.length < 2 时不赋值，page.updated 保持原值（undefined）
  } catch (e) {
    hexo.log.warn(`git-updated: 跳过 ${page.path} - ${e.message}`);
  }

  return locals;
});
