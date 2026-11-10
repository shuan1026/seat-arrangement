#!/bin/sh
# 容器啟動：先套用資料庫 migration，失敗就結束（平台規格）；成功後啟動 Next.js。
# Log 依 docs/standard/LOG_Design_Guideline.md 輸出單行 JSON，不輸出連線字串或密碼。
set -e

log() {
  printf '{"severity":"%s","service":"seat-arrangement","env":"%s","eventType":"%s","message":"%s","timestamp":"%s"}\n' \
    "$1" "${APP_ENV:-prod}" "$2" "$3" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

MIGRATE_TIMEOUT_SEC="${MIGRATE_TIMEOUT_SEC:-120}"

log INFO migrate_started "prisma migrate deploy"
cd /opt/migrate
if ! timeout "$MIGRATE_TIMEOUT_SEC" npx --no-install prisma migrate deploy; then
  log ERROR migrate_failed "migrate deploy 失敗或逾時，請檢查 DATABASE_* 環境變數與資料庫連線" >&2
  exit 1
fi
log INFO migrate_completed "migrate deploy 完成"

cd /app
log INFO server_starting "啟動 Next.js（PORT=${PORT:-8080}）"
exec node server.js
