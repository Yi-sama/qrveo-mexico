#!/bin/sh
# 官方 nginx 镜像在启动前执行。把控制台 / API / 观看页地址写入官网运行时脚本。
set -eu

HTML_ROOT="${VOD_HTML_ROOT:-/usr/share/nginx/html}"
OUT="${HTML_ROOT}/mexico/private-runtime.js"

trim_slash() {
  printf '%s' "$1" | sed 's#/*$##'
}

js_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

API_HOST="$(js_escape "$(trim_slash "${VOD_API_HOST:-http://127.0.0.1:30015}")")"
ADMIN_DOMAIN="$(js_escape "$(trim_slash "${VOD_ADMIN_DOMAIN:-http://127.0.0.1:30081}")")"
WATCH_DOMAIN="$(js_escape "$(trim_slash "${VOD_WATCH_DOMAIN:-http://127.0.0.1:30112}")")"

mkdir -p "$(dirname "${OUT}")"
cat > "${OUT}" <<EOF
window.__VOD_PRIVATE__ = {
  apiOrigin: "${API_HOST}",
  consoleOrigin: "${ADMIN_DOMAIN}",
  watchOrigin: "${WATCH_DOMAIN}"
};
EOF
