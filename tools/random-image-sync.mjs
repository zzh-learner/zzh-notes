#!/usr/bin/env node
/**
 * tools/random-image-sync.mjs —— 「随机一图」图池同步工具
 *
 * 设计文档为唯一事实来源（random-image 设计 JSON）。要点：
 * - 零第三方依赖：仅 node:crypto / node:fs / node:path / node:os / node:child_process + 全局 fetch。
 * - 绝不放 scripts/（hexo 会把 scripts/*.js 当构建插件加载）；本工具不被 hexo 感知。
 * - 运行模式：
 *     （默认 / --daily [N]）每日刷新：三夹并集均匀随机抽 ≤N 张新图入池，淘汰超上限最旧图（CI 用）
 *     --seed [N]           种子模式：每夹 N 张（默认 4，首轮用）
 *     --dry-run            只打印选中文件名与计划，不写任何文件
 *     --folder <slug>      只处理指定夹：xiaoyu|tuanzi|chengzi（调试用）
 *     --limit <n>          每夹最多枚举 n 张图（调试用，截断枚举，不用于正式跑）
 *     --upload-secret      把本机夸克 CLI 鉴权材料经 stdin 上传到 GitHub secret QUARK_AUTH_CONFIG
 *                          （当前 CI 看门狗不使用该 secret；保留供未来 runner 侧同步恢复时复用）
 *     --auth-config <path> 覆盖本机夸克 CLI 鉴权配置路径
 * - 退出码：0 成功或无事可做；1 一般失败；42 鉴权失效。
 * - 执行环境定论（2026-09-27 实测，Actions run 36314590608）：GitHub 海外 runner 访问
 *   夸克 open API 全部 ETIMEDOUT（本机可跑通），夸克 API 对海外 IP 不可达——
 *   图池同步只能在本机执行，push 后由 deploy.yml 自动发布（source/** 在其 paths 内）；
 *   .github/workflows/random-image.yml 已改为图池新鲜度看门狗（不再调夸克 API、不使用 secret）。
 * - 日志红线：只打印计数与输出文件名；绝不打印 accessToken / refreshToken / clientToken /
 * - 日志红线：只打印计数与输出文件名；绝不打印 accessToken / refreshToken / clientToken /
 *   配置原文 / download_url（含 auth_key 签名）。临时文件只写 os.tmpdir() 并 finally 清理。
 * - 写入范围仅三处：source/random/pool/**、source/random/manifest.json、tools/random-image-state.json。
 *
 * 夸克 API 细节（字段名出自 CLI 包 quark-drive.cjs 实读，调研已实测跑通）：
 * - base https://open-api-drive.quark.cn（production/pre/daily 同址）。
 * - POST /open/v1/file/list：body {parent_fid, size, sort:"updated_at:desc", query_cursor?}；
 *   响应 {status:0, data:{file_list[], last_page, next_query_cursor:{version,token}}}；
 *   file_list 条目实测含 fid/filename/size/file_type/category/format_type/created_at/updated_at
 *   （线上字段名是 filename 无下划线；file_name 是 CLI 内部命名）；
 *   目录判定：String(file_type)==="0" 或 category===0（CLI 的 yw 映射：0:"folder",3:"image"）。
 *   错误体 {status:!0, errno, error_info}。
 * - POST /open/v1/file/get_download_url：body {fid} → data.download_url（限时签名 CDN 直链）。
 * - 鉴权三件套：Authorization: Bearer + query access_token；签名头
 *   x-pan-client-id=third_party_agent / x-pan-tm=<毫秒> / x-pan-token=sha256("POST&<path>&<tm>&<signKey>")；
 *   CDN 下载 Cookie: x_pan_client_id=third_party_agent;x_pan_access_token=<t>[;x_pan_client_token=<c>]。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ===== 常量 =====

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RANDOM_DIR = path.join(REPO_ROOT, 'source', 'random');
const POOL_DIR = path.join(RANDOM_DIR, 'pool');
const MANIFEST_PATH = path.join(RANDOM_DIR, 'manifest.json');
const STATE_PATH = path.join(REPO_ROOT, 'tools', 'random-image-state.json');

// 三夹 FID —— 从设计文档逐字复制，含竖线尾串，绝不截断
const FOLDERS = [
  {
    slug: 'xiaoyu',
    name: '小语会员图包',
    fid: '~1inIyphOb9tUx9RhIK_PyZ9BlHkGtQlOgE4DV5SNJZ0JtvW2ejgGF5OFTPJbz6foXjptu3VCnPRNAPyHr4QPE5o|VfQPKJCgnWg',
  },
  {
    slug: 'tuanzi',
    name: '团子朋友圈原图',
    fid: '~1MfFRYaE9-iUQCyn5HM6Ev23U4W-7jC7PDODIcynOkT7HOHoi5wjda0w4DCNVIXbpQYUHF6yoJuQfhlIOF23C08|2HVA6ABs7pY',
  },
  {
    slug: 'chengzi',
    name: '橙子的照片',
    fid: '~1rPfOpWDr_4ES8oQhEvf-QJPWLELEdVGbHUyn8ocgPQwkDsikF-AV8faCav3aaEUzi0pwFHrv0Qib9rnr9NtXF4|2mtVj91U2ig',
  },
];

const API_BASE = 'https://open-api-drive.quark.cn';
const API_LIST = '/open/v1/file/list';
const API_DOWNLOAD = '/open/v1/file/get_download_url';
const API_SEARCH = '/agent/v1/file/search';
const CLIENT_ID = 'third_party_agent'; // CLI 打包内置公共常量，非用户机密
const SIGN_KEY = 'cf134812e2de4032bd1cb7c3727e84b3'; // 同上

const POOL_CAP_DEFAULT = 24; // 池上限
const DAILY_NEW_DEFAULT = 4; // 每日新图数
const SEED_PER_FOLDER_DEFAULT = 4; // 种子模式每夹张数
const LIST_PAGE_SIZE = 50; // 调研实测 size=50 翻页零重叠（API 上限 100）
const LIST_CONCURRENCY = 3; // 调研建议并发 ≤4，取 3
const LIST_CALLS_LIMIT = 8000; // 安全阀：三夹全量约 1400 次，超出视为异常
const PAGES_PER_DIR_LIMIT = 2000; // 单目录翻页安全阀
const SIZE_BUDGET = 409600; // 400KB 预算（对齐 new-post 技能口径）
const MAX_EDGE = 1600;
const AUTH_ERRNOS = new Set([11001, 11017, 12003, 12004]);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']); // 不带点，与 imageExt() 返回值一致
const SCALE_EXPR = `scale='min(${MAX_EDGE},iw)':'min(${MAX_EDGE},ih)':force_original_aspect_ratio=decrease`;

const EXIT_OK = 0;
const EXIT_FAIL = 1;
const EXIT_AUTH = 42;

const TARGET_REPO = 'zzh-learner/zzh-notes';
const SECRET_NAME = 'QUARK_AUTH_CONFIG';
const DEFAULT_PROXY = 'http://127.0.0.1:7897'; // 本机直连 GitHub 超时，gh 走一次性代理
const GH_CANDIDATES = [
  process.env.GH_BIN,
  'C:\\Program Files\\GitHub CLI\\gh.exe',
  'gh',
].filter(Boolean);
const AUTH_CONFIG_DEFAULT = path.join(
  os.homedir(), '.zcode', 'skills', 'quarkclouddrive', 'claudecode', 'config.json'
);

// ===== 基础工具 =====

const log = (msg) => console.log('[random-image-sync] ' + msg);
const warn = (msg) => console.error('[random-image-sync] WARN ' + msg);

class AuthError extends Error {}
class UsageError extends Error {}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 北京时间（UTC+8）的日期/时间片段，与宿主机时区无关 */
export function bjNow(now = Date.now()) {
  const d = new Date(now + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    ymd: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    ymd8: `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`,
    iso: d.toISOString().slice(0, 19) + '+08:00',
  };
}

/** fid 派生的确定性短哈希（输出文件名防重防撞） */
export function fidHash8(fid) {
  return crypto.createHash('sha1').update(fid, 'utf8').digest('hex').slice(0, 8);
}

export function poolFileName(fid, now = Date.now()) {
  return `${bjNow(now).ymd8}-${fidHash8(fid)}.jpg`;
}

/** 均匀随机抽 n 个（不放回）；n 超过数组长度时全抽 */
export function pickRandom(arr, n) {
  const idx = arr.map((_, i) => i);
  const out = [];
  while (out.length < n && idx.length > 0) {
    const i = crypto.randomInt(idx.length);
    out.push(arr[idx[i]]);
    idx.splice(i, 1);
  }
  return out;
}

// ===== 鉴权 =====

function readLocalAuthFile(cfgPath) {
  let raw;
  try {
    raw = fs.readFileSync(cfgPath, 'utf8');
  } catch {
    throw new AuthError(`本机夸克 CLI 鉴权配置不可读：${cfgPath}（可用 --auth-config 覆盖）`);
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    throw new AuthError(`本机夸克 CLI 鉴权配置不是合法 JSON：${cfgPath}`);
  }
  // 实测结构：顶层键 deviceId / platform / currentUserId / agent_auth / <userId>（用户对象直接挂在顶层 userId 键下）
  const uid = j.currentUserId;
  const user = typeof uid === 'string' ? j[uid] : null;
  if (!user || typeof user !== 'object' || typeof user.accessToken !== 'string' || !user.accessToken) {
    throw new AuthError(`本机夸克 CLI 鉴权配置缺少 config[currentUserId].accessToken：${cfgPath}`);
  }
  return {
    accessToken: user.accessToken,
    refreshToken: typeof user.refreshToken === 'string' ? user.refreshToken : '',
    clientToken: typeof user.clientToken === 'string' ? user.clientToken : '',
    deviceId: typeof j.deviceId === 'string' ? j.deviceId : '',
  };
}

function loadAuth(opts) {
  const envRaw = process.env.QUARK_AUTH_CONFIG;
  if (typeof envRaw === 'string' && envRaw.trim() !== '') {
    let j;
    try {
      j = JSON.parse(envRaw);
    } catch {
      throw new AuthError('QUARK_AUTH_CONFIG 环境变量不是合法 JSON（应为 {accessToken,…} 形态）');
    }
    if (!j || typeof j.accessToken !== 'string' || !j.accessToken) {
      throw new AuthError('QUARK_AUTH_CONFIG 环境变量缺少 accessToken');
    }
    return {
      accessToken: j.accessToken,
      refreshToken: typeof j.refreshToken === 'string' ? j.refreshToken : '',
      clientToken: typeof j.clientToken === 'string' ? j.clientToken : '',
      deviceId: typeof j.deviceId === 'string' ? j.deviceId : '',
      source: 'env',
    };
  }
  const a = readLocalAuthFile(opts.authConfig || AUTH_CONFIG_DEFAULT);
  a.source = 'local';
  return a;
}

// ===== 夸克 API =====

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function cdnCookie(auth) {
  let c = `x_pan_client_id=${CLIENT_ID};x_pan_access_token=${auth.accessToken}`;
  if (auth.clientToken) c += `;x_pan_client_token=${auth.clientToken}`;
  return c;
}

function pickErrno(j) {
  if (!j || typeof j !== 'object') return null;
  const cands = [j.errno, j.error_code, j.code, j.status, j.error && (j.error.errno ?? j.error.code)];
  for (const c of cands) {
    const n = typeof c === 'string' ? parseInt(c, 10) : c;
    if (typeof n === 'number' && Number.isFinite(n) && n !== 0) return n;
  }
  return null;
}

function pickMsg(j) {
  if (!j || typeof j !== 'object') return '';
  return String(j.error_info || j.message || j.msg || (j.error && (j.error.reason || j.error.message)) || '');
}

async function apiPostOnce(apiPath, body, auth) {
  const tm = String(Date.now());
  const url = new URL(API_BASE + apiPath);
  url.searchParams.set('req_id', crypto.randomUUID());
  url.searchParams.set('access_token', auth.accessToken);
  if (auth.deviceId) url.searchParams.set('device_id', auth.deviceId);
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-pan-client-id': CLIENT_ID,
    'x-pan-tm': tm,
    'x-pan-token': sha256Hex(`POST&${apiPath}&${tm}&${SIGN_KEY}`),
  };
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  } catch (e) {
    const err = new Error(`网络请求失败（${apiPath}，${e.cause?.code || e.message}）`);
    err.transient = true;
    throw err;
  }
  let j = null;
  if (res.status !== 204) {
    try {
      j = await res.json();
    } catch {}
  }
  if (j && typeof j === 'object' && j.status === 0) return j.data || {};
  const errno = pickErrno(j);
  const msg = pickMsg(j);
  const fail = (Err, text) => {
    const e = new Err(text);
    e.errno = errno;
    e.httpStatus = res.status;
    throw e;
  };
  if (res.status === 401 || res.status === 403) fail(AuthError, `HTTP ${res.status}（${apiPath}）`);
  if (errno !== null && AUTH_ERRNOS.has(errno)) fail(AuthError, `API 鉴权失败（errno ${errno}，${apiPath}）`);
  if (/token|auth/i.test(msg)) fail(AuthError, `API 鉴权失败（${apiPath}）`);
  if (res.status >= 500) {
    const e = new Error(`HTTP ${res.status}（${apiPath}）`);
    e.transient = true;
    throw e;
  }
  fail(Error, `API 失败（${apiPath}）：HTTP ${res.status} status=${j && j.status} errno=${errno ?? '-'} ${msg}`.trim());
}

/** 网络抖动 / 5xx：工具内重试 2 次（1s/3s 退避）；鉴权失败与确定的 21001（文件不存在）不重试 */
async function apiPost(apiPath, body, auth) {
  let lastErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      return await apiPostOnce(apiPath, body, auth);
    } catch (e) {
      lastErr = e;
      if (e instanceof AuthError) throw e;
      if (e.errno === 21001) throw e; // 「文件找不到」是确定性结果，重试无意义
      if (attempt < 2) await sleep(attempt === 0 ? 1000 : 3000);
    }
  }
  throw lastErr;
}

function isDirEntry(e) {
  // 出自 CLI quark-drive.cjs：pd() 判 file_type==="0" 为 folder；yw 映射 category 0=folder
  if (String(e.file_type) === '0') return true;
  if (e.category === 0) return true;
  return false;
}

function entryName(e) {
  // 实测线上字段名是 filename（无下划线）；file_name 是 CLI 内部命名，兼容兜底
  return e.filename || e.file_name || '';
}

function imageExt(name) {
  const i = name.lastIndexOf('.');
  if (i === -1 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

function isImageEntry(e) {
  return IMAGE_EXTS.has(imageExt(entryName(e)));
}

/** 单目录全量翻页（游标为对象 {version,token}，原样回传） */
async function listDirAllPages(parentFid, auth, stats) {
  const out = [];
  let cursor = null;
  for (let page = 1; page <= PAGES_PER_DIR_LIMIT; page++) {
    const body = { parent_fid: parentFid, size: LIST_PAGE_SIZE, sort: 'updated_at:desc' };
    if (cursor) body.query_cursor = cursor;
    const data = await apiPost(API_LIST, body, auth);
    stats.listCalls++;
    if (Array.isArray(data.file_list)) out.push(...data.file_list);
    if (data.last_page === true || !data.next_query_cursor) break;
    cursor = data.next_query_cursor;
  }
  return out;
}

/** 递归枚举一个夹里的全部图片（广度优先，file/list 并发 3） */
async function listFolderImages(folder, rootFid, auth, limit) {
  const stats = { listCalls: 0, dirs: 0, images: 0, skippedNonImage: 0 };
  const images = [];
  const queue = [{ fid: rootFid, prefix: '' }];
  while (queue.length > 0) {
    if (stats.listCalls > LIST_CALLS_LIMIT) {
      warn(`[${folder.slug}] file/list 次数超过安全阀 ${LIST_CALLS_LIMIT}，提前停止枚举`);
      break;
    }
    const batch = queue.splice(0, LIST_CONCURRENCY);
    const results = await Promise.all(batch.map(async (d) => ({ d, entries: await listDirAllPages(d.fid, auth, stats) })));
    for (const { d, entries } of results) {
      stats.dirs++;
      for (const e of entries) {
        if (!e || typeof e.fid !== 'string' || !e.fid) continue;
        const name = entryName(e);
        if (isDirEntry(e)) {
          queue.push({ fid: e.fid, prefix: d.prefix + name + '/' });
        } else if (isImageEntry(e)) {
          if (!limit || images.length < limit) {
            images.push({ fid: e.fid, fileName: name, size: typeof e.size === 'number' ? e.size : 0, display: d.prefix + name });
          }
        } else {
          stats.skippedNonImage++;
        }
      }
    }
    if (limit && images.length >= limit) break;
  }
  stats.images = images.length;
  return { images, stats };
}

/**
 * 解析夹的可用根 FID。快路径=设计常量 FID（转存副本，稳定）；
 * 若失效（errno 21001 / HTTP 404，实测会发生：转存副本被删或分享被重新转存后 FID 漂移），
 * 则按夹名走 /agent/v1/file/search 搜同名目录兜底（注意：搜索返回的分享源虚拟 FID 按请求易变，
 * 仅本次运行内有效，跨天判重依赖 state 的二级键 slug|文件名|字节数）。
 */
async function resolveFolderFid(folder, auth) {
  try {
    await apiPost(API_LIST, { parent_fid: folder.fid, size: 1, sort: 'updated_at:desc' }, auth);
    return { fid: folder.fid, viaSearch: false };
  } catch (e) {
    if (e instanceof AuthError) throw e;
    const notFound = e.errno === 21001 || e.httpStatus === 404 || /文件找不到|not\s*found/i.test(String(e.message));
    if (!notFound) throw e;
    const data = await apiPost(API_SEARCH, { keyword: folder.name, search_type: 'mix', size: 50 }, auth);
    const hits = (Array.isArray(data.file_list) ? data.file_list : [])
      .filter((x) => x && String(x.file_type) === '0' && entryName(x) === folder.name);
    if (hits.length === 0) {
      throw new Error(`设计 FID 已失效，且按名称「${folder.name}」搜索未命中同名目录`);
    }
    return { fid: hits[0].fid, viaSearch: true };
  }
}

async function getDownloadUrl(fid, auth) {
  const data = await apiPost(API_DOWNLOAD, { fid }, auth);
  const u = data && data.download_url;
  if (typeof u !== 'string' || !u) throw new Error('响应缺少 download_url');
  return u;
}

/** 下载文件字节：同一直链内网络重试（1s/3s），403/404/410 视为直链过期重取一次 */
async function downloadBuffer(fid, auth) {
  let lastErr = null;
  for (let round = 0; round < 2; round++) {
    const url = await getDownloadUrl(fid, auth); // 直链含 auth_key 签名，绝不打印
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(attempt === 1 ? 1000 : 3000);
      try {
        const res = await fetch(url, { headers: { Cookie: cdnCookie(auth) }, redirect: 'follow', signal: AbortSignal.timeout(180000) });
        if (res.ok || res.status === 206) return Buffer.from(await res.arrayBuffer());
        if (res.status === 403 || res.status === 404 || res.status === 410) {
          lastErr = new Error(`CDN HTTP ${res.status}（直链疑似过期）`);
          break; // 换新直链再来一轮
        }
        lastErr = new Error(`CDN HTTP ${res.status}`);
      } catch (e) {
        lastErr = new Error(`CDN 网络失败（${e.cause?.code || e.message}）`);
      }
    }
  }
  throw lastErr || new Error('下载失败');
}

/** 图片魔数校验（夸克调研口径：JPEG/PNG/WebP/GIF） */
export function sniffImageKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.slice(0, 3).toString('latin1') === 'GIF') return 'gif';
  return null;
}

// ===== ffmpeg / ffprobe =====

function runCapture(bin, args, timeoutMs = 180000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      resolve({ code: -1, out: '', err: String((e && e.message) || e) });
      return;
    }
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
    const timer = setTimeout(() => { try { child.kill(); } catch {} finish({ code: -1, out, err: err || 'timeout' }); }, timeoutMs);
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', (e) => finish({ code: -1, out, err: String((e && e.message) || e) }));
    child.on('close', (code) => finish({ code: code ?? -1, out, err }));
  });
}

export async function probeDims(file) {
  const r = await runCapture('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file,
  ], 60000);
  if (r.code !== 0) throw new Error(`ffprobe 失败：${(r.err || '').slice(0, 300)}`);
  const m = /(\d+)\s*,\s*(\d+)/.exec(r.out || '');
  if (!m) throw new Error('ffprobe 未返回尺寸');
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

async function probePixFmt(file) {
  const r = await runCapture('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', file,
  ], 60000);
  return r.code === 0 ? (r.out || '').trim() : '';
}

/**
 * 两步压缩（设计 compressionSpec）：
 * 1) 视觉无损档 -q:v 2；2) 产物 >409600B 时从临时原图重压 -q:v 4（绝不二次压缩已有产物）。
 * scale 表达式保证最长边 ≤1600 且绝不放大小图；输出恒为 JPEG（重编码剥离 EXIF/GPS）。
 * alpha 源（rgba/pal8/yuva 等）补 format=yuvj420p；多帧源（gif/webp 动图）取首帧。
 */
export async function compressToJpeg(tmpSrc, outPath) {
  const pixFmt = await probePixFmt(tmpSrc);
  const vf = /alpha|rgba|pal8|yuva/i.test(pixFmt) ? `${SCALE_EXPR},format=yuvj420p` : SCALE_EXPR;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  let lastSize = 0;
  for (const q of [2, 4]) {
    const r = await runCapture('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', tmpSrc, '-vf', vf, '-frames:v', '1', '-q:v', String(q), outPath,
    ]);
    if (r.code !== 0) throw new Error(`ffmpeg 失败（q${q}）：${(r.err || '').slice(0, 300)}`);
    lastSize = fs.statSync(outPath).size;
    if (lastSize <= SIZE_BUDGET) break;
  }
  return lastSize;
}

// ===== manifest / state =====

export function loadManifest() {
  let raw;
  try {
    raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    return { version: 1, updatedAt: '', poolCap: POOL_CAP_DEFAULT, images: [] }; // 首跑：manifest 尚不存在
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch (e) {
    throw new Error(`manifest.json 已存在但不是合法 JSON，拒绝覆盖（人工检查）：${e.message}`);
  }
  if (!j || !Array.isArray(j.images) || !Number.isInteger(j.poolCap)) {
    throw new Error('manifest.json 已存在但结构不符合 schema（缺 images/poolCap），拒绝覆盖（人工检查）');
  }
  return j;
}

export function saveManifest(m) {
  const ordered = {
    version: 1,
    updatedAt: m.updatedAt,
    poolCap: m.poolCap,
    images: m.images.map((e) => ({ src: e.src, folder: e.folder, slug: e.slug, addedAt: e.addedAt, w: e.w, h: e.h })),
  };
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
}

export function loadState() {
  let raw;
  try {
    raw = fs.readFileSync(STATE_PATH, 'utf8');
  } catch {
    return { version: 1, seen: {}, seenKeys: {} };
  }
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.seen === 'object' && j.seen !== null && !Array.isArray(j.seen)) {
      // seenKeys 为可选二级判重（slug|文件名|字节数），防 FID 漂移（转存/分享源虚拟化）后同图重复入池
      if (j.seenKeys && typeof j.seenKeys !== 'object') j.seenKeys = {};
      return j;
    }
  } catch {}
  throw new Error('random-image-state.json 已存在但无法解析，拒绝覆盖（人工检查）');
}

export function saveState(s) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  const out = { version: 1, seen: s.seen };
  if (s.seenKeys && Object.keys(s.seenKeys).length > 0) out.seenKeys = s.seenKeys;
  fs.writeFileSync(STATE_PATH, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

/** 扫描池内已有文件名 → {slug → Set(8位哈希)}，state 丢失时的判重兜底 */
export function scanPoolHashes() {
  const map = new Map(FOLDERS.map((f) => [f.slug, new Set()]));
  let files = 0;
  for (const f of FOLDERS) {
    const dir = path.join(POOL_DIR, f.slug);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const m = /^(\d{8})-([0-9a-f]{8})\.jpg$/.exec(name);
      if (m) {
        map.get(f.slug).add(m[2]);
        files++;
      }
    }
  }
  return { map, files };
}

/** 入池 + 淘汰的纯函数：队头最旧先淘汰，同批按数组序（设计 manifest 契约①） */
export function applyPoolChanges(currentImages, newEntries, cap) {
  const images = currentImages.slice().concat(newEntries);
  const evicted = [];
  while (images.length > cap) {
    const head = images.shift();
    evicted.push(head);
  }
  return { images, evicted };
}

// ===== 主流程 =====

function parseArgs(argv) {
  const opts = {
    mode: 'daily', count: DAILY_NEW_DEFAULT, dryRun: false,
    folder: null, limit: 0, authConfig: null, uploadSecret: false, help: false,
  };
  const slugs = FOLDERS.map((f) => f.slug);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const intArg = () => {
      const v = argv[i + 1];
      if (v && /^\d+$/.test(v)) { i++; return parseInt(v, 10); }
      return null;
    };
    if (a === '--daily') {
      opts.mode = 'daily';
      const n = intArg(); if (n) opts.count = n;
    } else if (a === '--seed') {
      opts.mode = 'seed';
      const n = intArg();
      opts.count = n || SEED_PER_FOLDER_DEFAULT;
    } else if (a === '--dry-run') {
      opts.dryRun = true;
    } else if (a === '--folder') {
      const v = argv[i + 1];
      if (!v || !slugs.includes(v)) throw new UsageError(`--folder 需要 ${slugs.join('|')} 之一`);
      i++; opts.folder = v;
    } else if (a === '--limit') {
      const n = intArg();
      if (!n || n < 1) throw new UsageError('--limit 需要正整数');
      opts.limit = n;
    } else if (a === '--auth-config') {
      const v = argv[i + 1];
      if (!v) throw new UsageError('--auth-config 需要路径');
      i++; opts.authConfig = v;
    } else if (a === '--upload-secret') {
      opts.uploadSecret = true;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    } else {
      throw new UsageError(`未知参数：${a}`);
    }
  }
  return opts;
}

const USAGE = `用法：node tools/random-image-sync.mjs [--daily [N]] [--seed [N]] [--dry-run] [--folder xiaoyu|tuanzi|chengzi] [--limit N] [--auth-config <path>] [--upload-secret]
  默认/--daily：三夹并集均匀随机抽 ≤N（默认 ${DAILY_NEW_DEFAULT}）张新图入池并淘汰超上限最旧图
  --seed：每夹 N（默认 ${SEED_PER_FOLDER_DEFAULT}）张
  --dry-run：只打印选中文件名，不写任何文件
  --upload-secret：本机鉴权材料经 stdin 上传 GitHub secret ${SECRET_NAME}（gh 走 ${DEFAULT_PROXY}）`;

async function runSync(opts) {
  const auth = loadAuth(opts);
  const bj = bjNow();
  const manifest = loadManifest();
  const state = loadState();
  const cap = manifest.poolCap || POOL_CAP_DEFAULT;
  const pool = scanPoolHashes();
  const folders = opts.folder ? FOLDERS.filter((f) => f.slug === opts.folder) : FOLDERS;

  log(`模式=${opts.mode}${opts.dryRun ? '（dry-run）' : ''} 抽选数=${opts.count} 池=${manifest.images.length}/${cap}（auth 来源=${auth.source}，池内文件 ${pool.files} 个，判重历史 ${Object.keys(state.seen).length} 条）`);

  // 1) 解析各夹根 FID → 递归枚举 → 判重（fid 一级键 + slug|文件名|字节二级键 + 池内文件哈希兜底）
  const seenKeys = state.seenKeys || {};
  const perFolder = [];
  let resolveFailures = 0;
  for (const f of folders) {
    let resolved;
    try {
      resolved = await resolveFolderFid(f, auth);
    } catch (e) {
      resolveFailures++;
      warn(`[${f.slug}] ${f.name}：根目录解析失败，本夹跳过——${e.message}`);
      perFolder.push({ folder: f, unseen: [] });
      continue;
    }
    if (resolved.viaSearch) warn(`[${f.slug}] ${f.name}：设计 FID 已失效，已按名称搜索重解析（该虚拟 FID 仅本次运行有效）`);
    const { images, stats } = await listFolderImages(f, resolved.fid, auth, opts.limit);
    const unseen = images
      .filter((img) => {
        if (state.seen[img.fid]) return false;
        if (seenKeys[`${f.slug}|${img.fileName}|${img.size}`]) return false;
        if (pool.map.get(f.slug).has(fidHash8(img.fid))) return false;
        return true;
      })
      .map((img) => ({ ...img, slug: f.slug, folderName: f.name }));
    log(`[${f.slug}] ${f.name}：目录 ${stats.dirs} 个，file/list ${stats.listCalls} 次，图片 ${images.length} 张（非图片跳过 ${stats.skippedNonImage}），未入池 ${unseen.length} 张`);
    perFolder.push({ folder: f, unseen });
  }
  if (resolveFailures === folders.length) {
    throw new Error(
      `所有夹的根目录均解析失败（${folders.length} 个），视为本次同步失败。` +
      '若在本机运行：检查本地网络对夸克 open API 的连通性；' +
      '海外网络/CI runner 访问夸克 API 不可达属已知限制（2026-09-27 实测），请在本机执行同步。'
    );
  }

  // 2) 抽选（daily=三夹并集均匀随机即数量加权；seed=每夹配额）
  let chosen = [];
  if (opts.mode === 'seed') {
    for (const { folder, unseen } of perFolder) {
      const picked = pickRandom(unseen, opts.count);
      log(`[${folder.slug}] 种子抽选 ${picked.length} 张`);
      chosen.push(...picked);
    }
  } else {
    const union = perFolder.flatMap((x) => x.unseen);
    chosen = pickRandom(union, opts.count);
  }

  // 3) 打印抽选结果（输出文件名确定性派生：入池日 + fid 哈希）
  if (chosen.length === 0) {
    log('没有可入池的新图（三夹候选均已入过池或无候选）');
  } else {
    log(`抽选 ${chosen.length} 张：`);
    for (const img of chosen) {
      log(`  pool/${img.slug}/${bj.ymd8}-${fidHash8(img.fid)}.jpg  ← ${img.folderName}/${img.display}`);
    }
  }
  const wouldEvict = Math.max(0, manifest.images.length + chosen.length - cap);
  if (wouldEvict > 0) log(`将淘汰最旧 ${wouldEvict} 张（池上限 ${cap}）`);

  if (opts.dryRun) {
    log('dry-run：未写入任何文件');
    return;
  }

  // 4) 下载 → 压缩 → 落盘（单项失败记录并继续）
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zzh-random-'));
  const added = [];
  let failedCount = 0;
  try {
    let seq = 0;
    for (const img of chosen) {
      const outName = `${bj.ymd8}-${fidHash8(img.fid)}.jpg`;
      const outPath = path.join(POOL_DIR, img.slug, outName);
      const existedBefore = fs.existsSync(outPath);
      try {
        if (existedBefore) {
          log(`已存在，跳过重压：pool/${img.slug}/${outName}`);
        } else {
          const buf = await downloadBuffer(img.fid, auth);
          const kind = sniffImageKind(buf);
          if (!kind) throw new Error('内容不是图片（魔数校验失败）');
          const tmpSrc = path.join(tmpDir, `src-${String(seq).padStart(3, '0')}-${fidHash8(img.fid)}.${kind}`);
          seq++;
          fs.writeFileSync(tmpSrc, buf);
          await compressToJpeg(tmpSrc, outPath);
          log(`入池：pool/${img.slug}/${outName}（${fs.statSync(outPath).size}B）`);
        }
        const { w, h } = await probeDims(outPath);
        added.push({
          src: `pool/${img.slug}/${outName}`,
          folder: img.folderName,
          slug: img.slug,
          addedAt: bj.iso,
          w, h,
          fid: img.fid,
          fileName: img.fileName || '',
          size: img.size || 0,
        });
      } catch (e) {
        failedCount++;
        warn(`跳过 1 张（${img.slug}/${img.display}）：${e.message}`);
        if (!existedBefore) {
          // 失败不留半成品（压缩失败的残片/尺寸探测失败的产物），防下次被误判"已存在"
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch {}
        }
      }
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }

  // 5) 淘汰 + 落盘（仅在实际入池/淘汰时更新 updatedAt）
  const newEntries = added.map(({ fid, ...e }) => e);
  const { images, evicted } = applyPoolChanges(manifest.images, newEntries, cap);
  for (const e of evicted) {
    try {
      fs.unlinkSync(path.join(RANDOM_DIR, e.src));
    } catch (err) {
      warn(`淘汰文件删除失败（${e.src}）：${err.code || err.message}`);
    }
  }
  if (added.length > 0 || evicted.length > 0) {
    manifest.images = images;
    manifest.updatedAt = bj.iso;
    saveManifest(manifest);
    for (const a of added) {
      state.seen[a.fid] = bj.ymd;
      if (!state.seenKeys) state.seenKeys = {};
      state.seenKeys[`${a.slug}|${a.fileName}|${a.size}`] = bj.ymd;
    }
    saveState(state);
    log(`入池 ${added.length} 张${failedCount ? `，失败跳过 ${failedCount} 张` : ''}，淘汰 ${evicted.length} 张；池内现存 ${images.length}/${cap} 张（manifest 与 state 已更新）`);
    log('发布提示：git add source/random tools/ 后提交并推送（本机 push 自动触发 deploy.yml；直连超时时用一次性代理 git -c http.proxy=http://127.0.0.1:7897 push）');
  } else {
    log(`本次无入池${failedCount ? `（失败跳过 ${failedCount} 张）` : '（无事可做）'}：manifest 与 state 未改动`);
  }

  if (chosen.length > 0 && added.length === 0) {
    throw new Error(`选中 ${chosen.length} 张全部失败，视为本次同步失败`);
  }
}

// ===== secret 上传 =====

function resolveGh() {
  for (const c of GH_CANDIDATES) {
    if (c === 'gh') return 'gh';
    try {
      if (fs.existsSync(c)) return c;
    } catch {}
  }
  return 'gh';
}

function spawnPiped(bin, args, env, stdinData) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      reject(e);
      return;
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`gh 退出码 ${code}：${(err || out).trim().slice(0, 300)}`));
    });
    child.stdin.write(stdinData);
    child.stdin.end();
  });
}

async function uploadSecret(opts) {
  const cfgPath = opts.authConfig || AUTH_CONFIG_DEFAULT;
  const a = readLocalAuthFile(cfgPath); // 含令牌，绝不打印
  const payload = JSON.stringify({
    accessToken: a.accessToken,
    refreshToken: a.refreshToken,
    clientToken: a.clientToken,
    deviceId: a.deviceId,
  });
  const gh = resolveGh();
  const env = { ...process.env };
  if (!env.HTTPS_PROXY && !env.https_proxy) env.HTTPS_PROXY = DEFAULT_PROXY; // 本机直连 GitHub 超时
  // 值经 stdin 直达 gh，不落终端、不进日志
  await spawnPiped(gh, ['secret', 'set', SECRET_NAME, '--repo', TARGET_REPO], env, payload);
  const listOut = await spawnPiped(gh, ['secret', 'list', '--repo', TARGET_REPO], env, '');
  const found = listOut.split(/\r?\n/).some((line) => line.trim().startsWith(SECRET_NAME + '\t') || line.trim() === SECRET_NAME);
  if (!found) throw new Error(`gh secret set 成功但 secret list 未见 ${SECRET_NAME}`);
  log(`已上传 secret ${SECRET_NAME} 到 ${TARGET_REPO} 并确认存在（4 个鉴权字段，值未回显；gh=${gh}）`);
}

// ===== 入口 =====

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(USAGE);
    return EXIT_OK;
  }
  if (opts.uploadSecret) {
    await uploadSecret(opts);
    return EXIT_OK;
  }
  await runSync(opts);
  return EXIT_OK;
}

const isMain = (() => {
  try {
    return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  main().then(
    (code) => process.exit(code ?? 0),
    (e) => {
      if (e instanceof UsageError) {
        console.error('[random-image-sync] 参数错误：' + e.message);
        console.error(USAGE);
        process.exit(EXIT_FAIL);
      }
      if (e instanceof AuthError) {
        console.error('[random-image-sync] 鉴权失败（退出码 42）：' + e.message);
        process.exit(EXIT_AUTH);
      }
      console.error('[random-image-sync] 失败（退出码 1）：' + ((e && e.stack) || e));
      process.exit(EXIT_FAIL);
    }
  );
}
