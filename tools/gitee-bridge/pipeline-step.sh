#!/usr/bin/env bash
# 随机一图·Gitee Go「基于镜像的脚本执行」插件的构建命令（粘贴用）。
# 推荐镜像：node:20（自带 node 与 git，基于 Debian；ffmpeg 脚本自装）。
# 需要流水线「通用变量」里预先配好 4 个变量：
#   QUARK_AUTH_CONFIG / GITEE_TOKEN / GITEE_USER / GITEE_REPO
# 若拉取 docker.io 镜像超时，把镜像换成 docker.m.daocloud.io/library/node:20 再试。
set -e

echo "== 随机一图·图池同步（Gitee Go·镜像执行）=="
: "${QUARK_AUTH_CONFIG:?未配置变量 QUARK_AUTH_CONFIG}"
: "${GITEE_TOKEN:?未配置变量 GITEE_TOKEN}"
: "${GITEE_USER:?未配置变量 GITEE_USER}"
: "${GITEE_REPO:?未配置变量 GITEE_REPO}"

command -v node >/dev/null 2>&1 || { echo "镜像缺 node（换 node:20 镜像）"; exit 1; }
command -v git  >/dev/null 2>&1 || { echo "镜像缺 git（换 node:20 镜像）";  exit 1; }
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "安装 ffmpeg（换国内源）…"
  (sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null ||
   sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list 2>/dev/null || true)
  apt-get update -qq && apt-get install -y -qq ffmpeg >/dev/null
  command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg 安装失败"; exit 1; }
fi

# 检出桥接仓库（公开仓库，匿名克隆；若构建机已自动检出则跳过）
if [ ! -f tools/random-image-sync.mjs ]; then
  rm -rf repo && git clone --depth 1 "https://gitee.com/${GITEE_REPO}.git" repo && cd repo
fi
[ -f tools/random-image-sync.mjs ] || { echo "未找到 tools/random-image-sync.mjs"; exit 1; }

node tools/random-image-sync.mjs --daily

if git status --porcelain | grep -q .; then
  git config user.name "gitee-go-bot"
  git config user.email "gitee-go-bot@users.noreply.gitee.com"
  git add source/random tools/random-image-state.json
  git commit -m "chore(random-image): pool refresh"
  git push "https://${GITEE_USER}:${GITEE_TOKEN}@gitee.com/${GITEE_REPO}.git" HEAD:master
  echo "== 已入池并推送到 Gitee；GitHub 桥接（每天 10:33）拉回后自动发布 =="
else
  echo "== 本次无新图入池 =="
fi
