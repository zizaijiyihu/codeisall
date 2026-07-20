#!/usr/bin/env bash
# 安装 codeisall viewer 前端依赖到插件持久化目录，并软链回 viewer/node_modules。
# 由插件 SessionStart hook 调用。仅当 viewer/package.json 变化时才重装，
# 避免每次插件更新（目录被换）后重新 npm install。
#
# 环境变量（由 Claude Code 注入）：
#   CLAUDE_PLUGIN_ROOT  插件安装目录（随更新变化，视为临时）
#   CLAUDE_PLUGIN_DATA  跨更新持久化目录（~/.claude/plugins/data/<id>/）
set -e

VIEWER_DIR="${CLAUDE_PLUGIN_ROOT}/skills/codeisall/viewer"
PKG_SRC="${VIEWER_DIR}/package.json"
DATA_DIR="${CLAUDE_PLUGIN_DATA}"
PKG_CACHE="${DATA_DIR}/package.json"
NM_REAL="${DATA_DIR}/node_modules"
NM_LINK="${VIEWER_DIR}/node_modules"

mkdir -p "$DATA_DIR"

# 始终确保软链存在（插件更新后 viewer/ 目录被替换，软链会丢失）
ln -sfn "$NM_REAL" "$NM_LINK" 2>/dev/null || true

# package.json 没变 → 跳过安装
if diff -q "$PKG_SRC" "$PKG_CACHE" >/dev/null 2>&1; then
  exit 0
fi

# 首次安装或依赖变更 → 装到持久目录
cd "$DATA_DIR"
cp "$PKG_SRC" .
npm install --silent
ln -sfn "$NM_REAL" "$NM_LINK"
