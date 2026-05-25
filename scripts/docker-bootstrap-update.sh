#!/bin/sh

set -eu

CONTAINER_NAME="${1:-userscript-hub}"
PACKAGE_DIR="${2:-$(pwd)}"

SERVER_SRC_DIR="$PACKAGE_DIR/server/src"
SERVER_PACKAGE_JSON="$PACKAGE_DIR/server/package.json"
CLIENT_DIST_DIR="$PACKAGE_DIR/client/dist"

if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未找到 docker 命令"
  exit 1
fi

if [ ! -d "$SERVER_SRC_DIR" ]; then
  echo "[错误] 缺少目录: $SERVER_SRC_DIR"
  exit 1
fi

if [ ! -f "$SERVER_PACKAGE_JSON" ]; then
  echo "[错误] 缺少文件: $SERVER_PACKAGE_JSON"
  exit 1
fi

if [ ! -d "$CLIENT_DIST_DIR" ]; then
  echo "[错误] 缺少目录: $CLIENT_DIST_DIR"
  exit 1
fi

if ! docker ps -a --format '{{.Names}}' | grep -Fx "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "[错误] 容器不存在: $CONTAINER_NAME"
  exit 1
fi

echo "[1/4] 复制后端源码到容器 /app/src"
docker cp "$SERVER_SRC_DIR/." "$CONTAINER_NAME:/app/src/"

echo "[2/4] 复制后端 package.json 到容器 /app/package.json"
docker cp "$SERVER_PACKAGE_JSON" "$CONTAINER_NAME:/app/package.json"

echo "[3/4] 复制前端构建产物到容器 /app/public"
docker cp "$CLIENT_DIST_DIR/." "$CONTAINER_NAME:/app/public/"

echo "[4/4] 重启容器"
docker restart "$CONTAINER_NAME" >/dev/null

echo "完成：已将更新注入容器 $CONTAINER_NAME"
echo "建议随后检查：/api/health、首页、程序管理、脚本下载"
