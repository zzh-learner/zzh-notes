#!/usr/bin/env bash
# 随机一图·Gitee Go 流水线 shell 步骤（粘贴到图形化编排的 shell 步骤里，或由
# .workflow/random-image.yml 直接调用；本文件由 GitHub 桥接 workflow 镜像进 Gitee 仓库）。
#
# 需要预先在 Gitee Go 流水线里配置 4 个私有环境变量：
#   QUARK_AUTH_CONFIG  夸克鉴权 JSON（本机跑 node tools/random-image-sync.mjs --secret-to-file <仓库外路径> 生成后粘贴）
#   GITEE_TOKEN        Gitee 私人令牌（勾选 projects 权限，用于推送）
#   GITEE_USER         Gitee 用户名
#   GITEE_REPO         桥接仓库名，如 yourname/zzh-notes-bridge
set -e

echo "== 随机一图·图池同步（Gitee Go）=="
: "${QUARK_AUTH_CONFIG:?未配置流水线变量 QUARK_AUTH_CONFIG}"
: "${GITEE_TOKEN:?未配置流水线变量 GITEE_TOKEN}"
: "${GITEE_USER:?未配置流水线变量 GITEE_USER}"
: "${GITEE_REPO:?未配置流水线变量 GITEE_REPO}"

command -v node >/dev/null 2>&1 || { echo "构建环境缺 node"; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "构建环境缺 ffmpeg"; exit 1; }

# 定位仓库检出目录（不同构建环境的工作目录可能不同，做有界探测）
if [ ! -f tools/random-image-sync.mjs ]; then
  for d in "$PWD" "$WORKSPACE" /root /home /workspace /tmp; do
    [ -n "$d" ] && [ -f "$d/tools/random-image-sync.mjs" ] && cd "$d" && break
  done
  if [ ! -f tools/random-image-sync.mjs ]; then
    d=$(find /root /home /workspace /tmp -maxdepth 4 -name random-image-sync.mjs -path '*/tools/*' 2>/dev/null | head -n 1)
    [ -n "$d" ] && cd "$(dirname "$(dirname "$d")")"
  fi
fi
if [ ! -f tools/random-image-sync.mjs ]; then
  echo "未找到 tools/random-image-sync.mjs——先在 GitHub 侧手动运行一次 Random image Gitee bridge workflow 完成种子镜像"
  exit 1
fi

node tools/random-image-sync.mjs --daily

if git status --porcelain | grep -q .; then
  git config user.name "gitee-go-bot"
  git config user.email "gitee-go-bot@users.noreply.gitee.com"
  git add source/random tools/random-image-state.json
  git commit -m "chore(random-image): pool refresh"
  git push "https://${GITEE_USER}:${GITEE_TOKEN}@gitee.com/${GITEE_REPO}.git" HEAD:master
  echo "== 已入池并推送到 Gitee；GitHub 桥接（10:33）会拉回并发布 =="
else
  echo "== 本次无新图入池 =="
fi
