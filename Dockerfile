# syntax=docker/dockerfile:1
# aiborn 動態網站：平台以這個 Dockerfile 建映像、部署到 Cloud Run（docs/architecture.md 第 2、14 節）。
# 啟動時先執行 prisma migrate deploy，再啟動 Next.js standalone server（埠號 8080）。

FROM node:24-bookworm-slim AS base
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- 安裝依賴：--ignore-scripts 不執行套件的 install script，降低供應鏈風險；只明確執行 prisma generate
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/server/database-config.ts ./src/server/database-config.ts
RUN npm ci --ignore-scripts && npx prisma generate

# ---- 建置
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
COPY --from=deps /app/src/generated ./src/generated
ENV NEXT_TELEMETRY_DISABLED=1
# prisma/seed-data/ 只在第一次手動上傳的 ZIP 才有（D-007）；沒有時建立空資料夾，seed 會跳過
RUN npm run build && mkdir -p prisma/seed-data

# ---- 啟動時執行 migration 用的 Prisma CLI（和專案同版本），獨立一個資料夾，不放進 Next.js standalone
FROM base AS migrator
WORKDIR /opt/migrate
RUN npm init -y >/dev/null \
  && npm install --ignore-scripts --no-audit --no-fund prisma@7.10.1 \
  && npx --no-install prisma --version
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/server/database-config.ts ./src/server/database-config.ts

# ---- 執行
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Taipei \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    SEED_IMPORT=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=migrator --chown=nextjs:nodejs /opt/migrate /opt/migrate
COPY --from=builder --chown=nextjs:nodejs /app/prisma/seed-data ./prisma/seed-data
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# aiborn 用舊版 Docker 建置器（不是 BuildKit），不支援 COPY --chmod，所以複製後另外設定執行權限
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
USER nextjs
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]
