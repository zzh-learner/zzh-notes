/* global hexo */
'use strict';

// 文章修订历史 diff —— 构建时读 git 历史，为每篇文章生成行级 diff HTML
// 挂在 NexT postBodyEnd 注入点，文章详情页末尾展示
// 任何 git 错误均静默跳过（仅 warn），绝不阻断构建

const { execSync } = require('child_process');
const path = require('path');
const Diff = require('diff');

// 惰性缓存：post.full_source → revisionHtml
// 在 template_locals（每页渲染时）首次访问才计算，避开 before_generate 时机问题
const revisionCache = new Map();

// ASCII unit separator，不会出现在 commit message 里
const SEP = '\x1f';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function git(args, cwd) {
  return execSync(args, { cwd, encoding: 'utf8' });
}

// 拿该文件的所有提交（含重命名跟踪），返回 [{hash, date, message}]
// git log 默认按时间倒序，commits[0] = HEAD（最新）
function getFileCommits(relPath, cwd) {
  const out = git(
    `git log --follow --no-merges --pretty=format:%H%x1f%ci%x1f%s -- "${relPath}"`,
    cwd
  ).trim();
  if (!out) return [];
  return out.split('\n').map(line => {
    const [hash, date, message] = line.split(SEP);
    return { hash, date, message: message || '' };
  });
}

// 取某次提交时该文件的完整内容（含 front-matter）
function getFileAtCommit(hash, relPath, cwd) {
  return git(`git show ${hash}:"${relPath}"`, cwd);
}

// 算行级 diff，渲染成 HTML
// 只显示增删行，连续未变行折叠成「… N 行未变」
function renderDiff(oldContent, newContent) {
  const parts = Diff.diffLines(oldContent, newContent);
  let html = '';
  let unchangedBuffer = 0;

  const flushUnchanged = () => {
    if (unchangedBuffer > 0) {
      html += `<span class="rev-ctx">… ${unchangedBuffer} 行未变</span>\n`;
      unchangedBuffer = 0;
    }
  };

  for (const part of parts) {
    // diffLines 的 value 末尾通常带 \n，split 会产生末尾空串，去掉
    const lines = part.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();

    if (part.added) {
      flushUnchanged();
      for (const line of lines) {
        html += `<ins>${escapeHtml(line) || ' '}</ins>\n`;
      }
    } else if (part.removed) {
      flushUnchanged();
      for (const line of lines) {
        html += `<del>${escapeHtml(line) || ' '}</del>\n`;
      }
    } else {
      unchangedBuffer += lines.length;
    }
  }
  flushUnchanged();
  return html;
}

// 生成全部历史版本的修订 HTML
// commits[0] = HEAD = 当前版本（正文已展示），只渲染 index 1 起的历史版本
function renderRevisions(commits, currentContent, relPath, cwd) {
  const historical = commits.slice(1);
  if (historical.length === 0) return '';

  let html = '';
  historical.forEach(commit => {
    let body;
    try {
      const oldContent = getFileAtCommit(commit.hash, relPath, cwd);
      const diffHtml = renderDiff(oldContent, currentContent);
      body = diffHtml.trim()
        ? `<div class="rev-diff">${diffHtml}</div>`
        : `<p class="rev-same">（与当前版本一致）</p>`;
    } catch (e) {
      body = `<p class="rev-err">无法读取该版本内容</p>`;
    }

    const dateShort = commit.date.slice(0, 10); // YYYY-MM-DD
    html += `<details class="rev-item">
  <summary>
    <span class="rev-date">${escapeHtml(dateShort)}</span>
    <span class="rev-msg">${escapeHtml(commit.message)}</span>
  </summary>
  ${body}
</details>`;
  });

  return html;
}

// 为单篇文章计算修订历史 HTML（惰性，带缓存）
function computeRevision(post) {
  if (!post || !post.full_source) return '';
  if (revisionCache.has(post.full_source)) {
    return revisionCache.get(post.full_source);
  }

  let html = '';
  try {
    const baseDir = hexo.base_dir;
    const relPath = path.relative(baseDir, post.full_source).replace(/\\/g, '/');
    const commits = getFileCommits(relPath, baseDir);
    if (commits.length === 0) return ''; // 新文件未提交，静默跳过
    html = renderRevisions(commits, post.raw || '', relPath, baseDir);
  } catch (e) {
    hexo.log.warn(`git-revision: 跳过 ${post.path} - ${e.message}`);
    return '';
  }

  revisionCache.set(post.full_source, html);
  if (html) {
    hexo.log.info(`git-revision: 生成 ${post.path} 的修订历史`);
  }
  return html;
}

// template_locals：每页渲染时触发，此时 page 数据完整
// 只对文章详情页（layout === 'post'）计算，惰性求值
hexo.extend.filter.register('template_locals', locals => {
  const page = locals.page;
  if (page && page.layout === 'post' && page.full_source) {
    const html = computeRevision(page);
    if (html) page.revisionHtml = html;
  }
  return locals;
});
