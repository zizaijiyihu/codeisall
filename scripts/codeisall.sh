#!/bin/bash
# codeisall — 启动 DDD 领域建模可视化服务
#
# 用法：
#   ./scripts/codeisall.sh /path/to/your-project    # 启动（指定项目目录）
#   ./scripts/codeisall.sh                           # 启动（用自带 example/）
#   ./scripts/codeisall.sh stop                      # 停止所有服务
#   ./scripts/codeisall.sh status                    # 查看状态
#
# 端口约定：
#   8502 = API server（FastAPI）
#   5171 = 前端（Vite dev，用户访问入口）

set -e

# 定位 skill 根目录（无论从哪里调用都能找到）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VIEWER_DIR="$SKILL_ROOT/viewer"
SCRIPTS_DIR="$SKILL_ROOT/scripts"
DEFAULT_PROJECT="$SKILL_ROOT/example"

API_PORT=8502
FRONTEND_PORT=5171

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[codeisall]${NC} $1"; }
ok()   { echo -e "${GREEN}[codeisall]${NC} $1"; }
warn() { echo -e "${YELLOW}[codeisall]${NC} $1"; }
err()  { echo -e "${RED}[codeisall]${NC} $1"; }

# ========== stop ==========
do_stop() {
  log "停止服务..."
  local api_pid=$(lsof -ti :$API_PORT 2>/dev/null)
  local fe_pid=$(lsof -ti :$FRONTEND_PORT 2>/dev/null)
  [ -n "$api_pid" ] && kill $api_pid 2>/dev/null && ok "API server (PID $api_pid) 已停止"
  [ -n "$fe_pid" ] && kill $fe_pid 2>/dev/null && ok "前端 (PID $fe_pid) 已停止"
  [ -z "$api_pid" ] && [ -z "$fe_pid" ] && warn "没有正在运行的服务"
}

# ========== status ==========
do_status() {
  echo ""
  local api_pid=$(lsof -ti :$API_PORT 2>/dev/null)
  local fe_pid=$(lsof -ti :$FRONTEND_PORT 2>/dev/null)

  if [ -n "$api_pid" ]; then
    local src=$(curl -sf http://localhost:$API_PORT/api/source 2>/dev/null)
    local project=$(echo "$src" | python3 -c "import json,sys; print(json.load(sys.stdin).get('example_dir','?'))" 2>/dev/null || echo "?")
    ok "API server  :$API_PORT  PID=$api_pid  项目=$project"
  else
    err "API server  :$API_PORT  未运行"
  fi

  if [ -n "$fe_pid" ]; then
    ok "前端        :$FRONTEND_PORT  PID=$fe_pid  → http://localhost:$FRONTEND_PORT/"
  else
    err "前端        :$FRONTEND_PORT  未运行"
  fi
  echo ""
}

# ========== start ==========
do_start() {
  local project="${1:-$DEFAULT_PROJECT}"

  # 验证项目目录
  if [ ! -d "$project" ]; then
    err "项目目录不存在：$project"
    exit 1
  fi
  project="$(cd "$project" && pwd)"  # 绝对路径

  log "skill 目录：$SKILL_ROOT"
  log "项目目录：$project"

  # 检查 viewer/node_modules 是否存在
  if [ ! -d "$VIEWER_DIR/node_modules" ]; then
    log "首次启动，安装前端依赖..."
    cd "$VIEWER_DIR" && npm install --silent
  fi

  # 如果已经有服务在跑，先杀掉
  local old_api=$(lsof -ti :$API_PORT 2>/dev/null)
  local old_fe=$(lsof -ti :$FRONTEND_PORT 2>/dev/null)
  [ -n "$old_api" ] && kill $old_api 2>/dev/null && warn "已停止旧 API server"
  [ -n "$old_fe" ] && kill $old_fe 2>/dev/null && warn "已停止旧前端"
  sleep 1

  # 启动 API server
  log "启动 API server (:$API_PORT)..."
  cd "$SCRIPTS_DIR"
  EXAMPLE_DIR="$project" nohup python3 -m uvicorn server:app --port $API_PORT --log-level warning > /tmp/codeisall-api.log 2>&1 &
  local api_pid=$!

  # 等待 API 就绪
  for i in {1..15}; do
    if curl -sf http://localhost:$API_PORT/api/source > /dev/null 2>&1; then
      ok "API server 就绪 (PID $api_pid)"
      break
    fi
    sleep 0.5
  done
  if ! curl -sf http://localhost:$API_PORT/api/source > /dev/null 2>&1; then
    err "API server 启动失败，查看日志：/tmp/codeisall-api.log"
    exit 1
  fi

  # 启动前端
  log "启动前端 (:$FRONTEND_PORT)..."
  cd "$VIEWER_DIR"
  nohup npx vite > /tmp/codeisall-vite.log 2>&1 &
  local fe_pid=$!

  # 等待前端就绪
  for i in {1..15}; do
    if curl -sf http://localhost:$FRONTEND_PORT/ > /dev/null 2>&1; then
      ok "前端就绪 (PID $fe_pid)"
      break
    fi
    sleep 0.5
  done
  if ! curl -sf http://localhost:$FRONTEND_PORT/ > /dev/null 2>&1; then
    err "前端启动失败，查看日志：/tmp/codeisall-vite.log"
    exit 1
  fi

  # 验证
  echo ""
  echo -e "  ${GREEN}✓ codeisall 已启动${NC}"
  echo ""
  echo -e "  看板入口：${CYAN}http://localhost:$FRONTEND_PORT/${NC}"
  echo -e "  API 端口：${CYAN}http://localhost:$API_PORT/api/model${NC}"
  echo -e "  项目目录：$project"
  echo ""
  echo -e "  停止服务：${YELLOW}$(basename $0) stop${NC}"
  echo -e "  查看状态：${YELLOW}$(basename $0) status${NC}"
  echo ""
}

# ========== 入口 ==========
case "${1:-}" in
  stop)
    do_stop
    ;;
  status)
    do_status
    ;;
  -h|--help|help)
    echo "用法："
    echo "  ./scripts/codeisall.sh [项目目录]    启动服务（默认用 skill 自带 example/）"
    echo "  ./scripts/codeisall.sh stop          停止服务"
    echo "  ./scripts/codeisall.sh status        查看状态"
    echo ""
    echo "端口：8502 (API) + 5171 (前端)"
    echo "用户访问：http://localhost:5171/"
    ;;
  *)
    do_start "$1"
    ;;
esac
