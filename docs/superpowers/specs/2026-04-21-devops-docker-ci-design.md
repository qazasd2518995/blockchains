# DevOps 基礎設施設計：Docker 化 + CI + ARCHITECTURE.md

**日期**：2026-04-21  
**狀態**：待實作  
**範圍**：投產前基礎設施補齊  

---

## 1. 背景與現況

### 現況探索結果

| 項目 | 現況 |
|------|------|
| Monorepo 工具 | pnpm 9.15.4 + Turborepo 2 |
| Node 版本 | `>=20`（engines 明確）|
| Build 指令 | `turbo run build`（有依賴順序：`^build`）|
| 後端啟動 | `node dist/index.js`（TypeScript → tsc 編譯到 dist/）|
| 前端建置 | `tsc -b && vite build`（SPA，產出 `apps/web/dist`）|
| Admin 建置 | `tsc -b && vite build`（SPA，產出 `apps/admin/dist`）|
| 資料庫 | **PostgreSQL**（`datasource db { provider = "postgresql" }`）|
| Prisma 特殊點 | server `postinstall` 會 `prisma generate`；build script `prisma generate && tsc` |
| 部署參考 | `render.yaml` 已描述三服務建置順序（shared → provably-fair → server/web/admin）|
| 環境變數 | `apps/server/.env.example` 有完整列表 |
| CI/CD | **完全空白**，無 `.github/workflows/` |
| Docker | **完全空白**，無任何 Dockerfile |
| ARCHITECTURE.md | 有 `docs/architecture.md`，但內容是非正式開發筆記，非正式架構文件 |

### 五個 Packages 建置順序依賴圖

```
@bg/tsconfig        (無依賴)
@bg/eslint-config   (無依賴)
@bg/ui-tokens       (無依賴)
    ↓
@bg/shared          (依賴 tsconfig)
    ↓
@bg/provably-fair   (依賴 shared + tsconfig)
@bg/game-engine     (依賴 shared + tsconfig)
    ↓
@bg/server          (依賴 shared + provably-fair → prisma generate → tsc)
@bg/web             (依賴 shared + provably-fair + game-engine + ui-tokens)
@bg/admin           (依賴 shared + ui-tokens)
```

Turbo 的 `"dependsOn": ["^build"]` 已自動處理此順序。

---

## 2. Docker 化設計

### 決策清單

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| server base image | `node:20-alpine` | 輕量；官方 LTS |
| server 多階段 | 是（deps → builder → runner）| Prisma generate 需要 native binary；builder 可拋 |
| web/admin base | nginx:1.27-alpine（serve stage）| SPA 不需 node runtime；nginx 緩存友善 |
| web/admin build | `node:20-alpine` as builder | 和 server 一致 |
| Postgres | `postgres:16-alpine` | 符合 Prisma schema；alpine 輕量 |
| non-root user | 是（server: `node` 內建 user）| 安全最佳實踐 |
| pnpm 安裝方式 | `corepack enable && corepack prepare pnpm@9.15.4 --activate` | 和 render.yaml 一致 |

### 2.1 `apps/server/Dockerfile`

```dockerfile
# ── Stage 1: deps ──────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 只複製 workspace manifest（利用 layer cache）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/package.json packages/shared/
COPY packages/provably-fair/package.json packages/provably-fair/
COPY apps/server/package.json   apps/server/

RUN pnpm install --frozen-lockfile

# ── Stage 2: builder ───────────────────────────────
FROM deps AS builder
WORKDIR /app

# 複製全部 source（packages + apps/server）
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/           packages/shared/
COPY packages/provably-fair/    packages/provably-fair/
COPY apps/server/               apps/server/

# 按順序 build（shared → provably-fair → server）
RUN pnpm --filter @bg/shared run build && \
    pnpm --filter @bg/provably-fair run build && \
    pnpm --filter @bg/server exec prisma generate && \
    pnpm --filter @bg/server run build

# ── Stage 3: runner ────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 生產所需的 manifest + lock
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json         packages/tsconfig/
COPY packages/shared/package.json           packages/shared/
COPY packages/provably-fair/package.json    packages/provably-fair/
COPY apps/server/package.json               apps/server/

RUN pnpm install --frozen-lockfile --prod

# 從 builder 複製編譯產物
COPY --from=builder /app/packages/shared/dist/       packages/shared/dist/
COPY --from=builder /app/packages/provably-fair/dist/ packages/provably-fair/dist/
COPY --from=builder /app/apps/server/dist/           apps/server/dist/
# Prisma schema + generated client（native binary 在 node_modules 裡）
COPY --from=builder /app/apps/server/prisma/         apps/server/prisma/
COPY --from=builder /app/node_modules/.pnpm/         node_modules/.pnpm/

# 非 root 執行
USER node

EXPOSE 3000

WORKDIR /app/apps/server
# migrate deploy 在 startCommand（docker-compose command 層），不在 ENTRYPOINT
CMD ["node", "dist/index.js"]
```

**關鍵決策說明**：
- `prisma generate` 必須在 builder stage 執行，因為它下載 native query engine binary
- runner stage 的 `pnpm install --prod` 不觸發 `postinstall`（prisma generate），故 generated client 從 builder 複製過來
- `prisma migrate deploy` 不放 Dockerfile CMD；放到 `docker-compose.yml` 的 `command` 覆蓋，讓 migrate → start 串接

### 2.2 `apps/web/Dockerfile`

```dockerfile
# ── Stage 1: builder ───────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/package.json packages/shared/
COPY packages/provably-fair/package.json packages/provably-fair/
COPY packages/game-engine/package.json packages/game-engine/
COPY packages/ui-tokens/package.json packages/ui-tokens/
COPY apps/web/package.json      apps/web/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/
COPY apps/web/ apps/web/

# build 依賴鏈
RUN pnpm --filter @bg/shared run build && \
    pnpm --filter @bg/provably-fair run build && \
    pnpm --filter @bg/game-engine run build && \
    pnpm --filter @bg/ui-tokens run build && \
    pnpm --filter @bg/web run build

# ── Stage 2: serve ─────────────────────────────────
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# SPA fallback：所有路由導向 index.html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

**注意**：需要額外建立 `apps/web/nginx.conf`（見受影響檔案清單）。

### 2.3 `apps/admin/Dockerfile`

結構與 web 相同，差異：
- 不依賴 `game-engine`
- 產出路徑：`apps/admin/dist`
- 複製：`apps/admin/nginx.conf`

```dockerfile
FROM node:20-alpine AS builder
# ... （同 web，但過濾 @bg/admin，不含 game-engine）

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 2.4 `docker-compose.yml`（root）

```yaml
name: blockchain-game

networks:
  internal:           # server ↔ postgres 專用，外部不可見
  external:           # server ↔ web/admin 通信（不同 network 隔離）
    driver: bridge

volumes:
  postgres_data:

services:

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    networks:
      - internal
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-bguser}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?must set POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:-blockchains}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER:-bguser}"]
      interval: 5s
      timeout: 5s
      retries: 10

  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    restart: unless-stopped
    networks:
      - internal
      - external
    ports:
      - "3001:3000"     # 對外 3001，避免與本地 dev 3000 衝突
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-bguser}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-blockchains}
      JWT_SECRET: ${JWT_SECRET:?must set JWT_SECRET}
      JWT_ACCESS_TTL: ${JWT_ACCESS_TTL:-15m}
      JWT_REFRESH_TTL: ${JWT_REFRESH_TTL:-7d}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:8080,http://localhost:8081}
      SIGNUP_BONUS: ${SIGNUP_BONUS:-1000}
      MAX_SINGLE_BET: ${MAX_SINGLE_BET:-100000}
      SUPER_ADMIN_USERNAME: ${SUPER_ADMIN_USERNAME:-superadmin}
      SUPER_ADMIN_PASSWORD: ${SUPER_ADMIN_PASSWORD:?must set SUPER_ADMIN_PASSWORD}
      HOST: 0.0.0.0
      PORT: 3000
    # migrate deploy 先跑，再啟動 server
    command: >
      sh -c "node -e \"require('child_process').execSync('npx prisma migrate deploy', {stdio:'inherit', cwd:'/app/apps/server'})\"
             && node dist/index.js"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        VITE_API_BASE: ${VITE_API_BASE:-http://localhost:3001}
        VITE_SOCKET_BASE: ${VITE_SOCKET_BASE:-http://localhost:3001}
    restart: unless-stopped
    networks:
      - external
    ports:
      - "8080:80"

  admin:
    build:
      context: .
      dockerfile: apps/admin/Dockerfile
      args:
        VITE_API_BASE: ${VITE_API_BASE:-http://localhost:3001}
    restart: unless-stopped
    networks:
      - external
    ports:
      - "8081:80"
```

**Network 隔離邏輯**：
- `postgres` 只在 `internal` → 外部無法直連 DB
- `server` 同時在 `internal`（連 postgres）和 `external`（接受 web/admin 請求）
- `web` / `admin` 只在 `external`，無法繞過 server 直接碰 DB

### 2.5 `.dockerignore`（root）

```
# 依賴（container 內重新安裝）
node_modules
**/node_modules

# 編譯產物（container 內重新 build）
dist
**/dist
build
**/.turbo

# 環境變數（絕對不進 image）
.env
**/.env
.env.*
!**/.env.example

# Git 歷史（不需要）
.git
.gitignore

# 文件（減小 build context）
*.md
docs/

# 測試覆蓋率
coverage
**/coverage

# IDE
.vscode
.idea
*.swp
```

### 2.6 `nginx.conf`（web 與 admin 共用結構）

需要建立 `apps/web/nginx.conf` 和 `apps/admin/nginx.conf`，內容相同：

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 靜態資產長期緩存
    location ~* \.(js|css|woff2|png|svg|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 禁止存取隱藏檔案
    location ~ /\. {
        deny all;
    }
}
```

---

## 3. CI 設計（GitHub Actions）

### 決策

| 決策點 | 選擇 | 理由 |
|--------|------|------|
| 觸發 | `push` + `pull_request` to `main` | 標準 |
| Node | `20` | engines 要求 |
| pnpm | `9.15.4` | packageManager 鎖定版本 |
| Cache | `pnpm store` + `turbo` cache | 雙層加速 |
| DB for tests | 不需要（目前 PF 測試為純函式單元測試；server test `passWithNoTests`）| 降低 CI 複雜度 |
| Docker build | 不做（CI 只跑 node 層：typecheck + lint + test）| 非目標 |
| Fail fast | 是（`strategy.fail-fast: true`）| 節省 CI 分鐘 |

### `.github/workflows/ci.yml` 骨架

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: "20"
  PNPM_VERSION: "9.15.4"

jobs:
  ci:
    name: Typecheck / Lint / Test / Build
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2        # turbo 比較 prev commit 用

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm           # 自動 cache ~/.pnpm-store

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck
        # turbo run typecheck → 各 package tsc --noEmit

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test
        env:
          # PF 測試為純函式，不需要 DATABASE_URL
          NODE_ENV: test

      - name: Build
        run: pnpm build
        # turbo run build → shared → provably-fair → server(prisma gen + tsc) → web → admin
        # 若 build 成功，代表全專案可編譯

      # 可選：上傳 turbo cache（跨 run 加速）
      - name: Upload turbo cache
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-
```

**注意**：`pnpm build` 包含 `prisma generate`（server build script），但不跑 `prisma migrate`（需要真實 DB）。CI 內不配置 PostgreSQL service，因為目前無需 DB 的整合測試。

---

## 4. ARCHITECTURE.md 大綱設計

> 目的：取代現有的非正式 `docs/architecture.md`，成為新人 / 審計者的第一份技術參考。

### 章節與每節一句摘要

```
# ARCHITECTURE.md

## 1. 概覽
Monorepo（3 apps + 5 packages），pnpm workspaces + Turborepo 管理依賴順序。

## 2. 模組地圖
每個 package / app 的職責一覽表（名稱、路徑、對外介面）。

## 3. 資料流：下注一局的完整生命週期
  user click → Axios POST → Fastify JWT auth → Zod validate
  → Prisma Serializable tx [lock user → get seed → PF HMAC → write Bet + Tx]
  → HTTP response → Pixi animation

## 4. Provably Fair 信任模型
  server seed commitment（hash 先公開）→ nonce 遞增 → revealedAt 後可驗證

## 5. 控制介入機制與 PF 的關係
  rawWon（HMAC 計算）vs finalWon（控制翻轉後），WinLossControlLogs 全程審計

## 6. 代理樹資料模型
  Agent self-referential tree（parentId）、AdminRole 分級、餘額獨立

## 7. 遊戲分類
  單步驟（1 API）/ 多步驟（round 表追蹤中間狀態）/ Crash 即時（Socket.IO room）

## 8. 多步驟遊戲的狀態機
  MinesRound / HiLoRound / TowerRound：ACTIVE → BUSTED / CASHED_OUT

## 9. Crash 引擎（Socket.IO 流程）
  BETTING → RUNNING → CRASHED，CrashRound + CrashBet，廣播 tick

## 10. 部署架構
  (文字版圖)
  Internet → [Reverse Proxy / LB]
    → bg-server (Node:3000) → PostgreSQL:5432
    → bg-web (nginx:80, static SPA)
    → bg-admin (nginx:80, static SPA)

## 11. 安全考量
  JWT 雙 token（accessToken 15m + refreshToken 7d + DB revocation）
  Serializable tx + SELECT FOR UPDATE（防 race）
  @fastify/rate-limit（下注頻率）
  Prisma parameterized query（防 SQL injection）
  @fastify/helmet（HTTP headers）
  bcrypt password hashing
  non-root docker user

## 12. 環境變數一覽
  （見下一節）

## 13. 開發者快速上手
  pnpm install → cp .env.example → prisma migrate dev → pnpm dev
```

---

## 5. 環境變數文件化

> 目前 `apps/server/.env.example` 已完整，以下整理為可貼入 ARCHITECTURE.md 第 12 節的表格。

| 變數名 | 必填 | 預設值 | 說明 |
|--------|------|--------|------|
| `DATABASE_URL` | 是 | — | PostgreSQL 連線字串，格式：`postgresql://user:pw@host:5432/db` |
| `JWT_SECRET` | 是 | — | 64 char hex，`openssl rand -hex 32` 產生 |
| `JWT_ACCESS_TTL` | 否 | `15m` | Access token 有效期 |
| `JWT_REFRESH_TTL` | 否 | `7d` | Refresh token 有效期 |
| `PORT` | 否 | `3000` | Fastify 監聽 port |
| `HOST` | 否 | `0.0.0.0` | Fastify 監聽 host |
| `NODE_ENV` | 否 | `development` | `production` 時關閉 pino-pretty |
| `CORS_ORIGIN` | 是（production）| `http://localhost:5173` | 逗號分隔，允許的前端 origin |
| `SIGNUP_BONUS` | 否 | `1000` | 新會員初始點數 |
| `MAX_SINGLE_BET` | 否 | `100000` | 單注上限（Decimal） |
| `SUPER_ADMIN_USERNAME` | 是 | `superadmin` | seed-agent 建立的 Super Admin 帳號 |
| `SUPER_ADMIN_PASSWORD` | 是 | — | 至少 12 字元 |

**前端 Vite 環境變數**（`apps/web/.env` / `apps/admin/.env`）：

| 變數名 | 說明 |
|--------|------|
| `VITE_API_BASE` | 後端 API base URL，例如 `https://api.example.com` |
| `VITE_SOCKET_BASE` | Socket.IO server URL（通常同 API base）|

**docker-compose 額外環境變數**（`.env` at root）：

| 變數名 | 說明 |
|--------|------|
| `POSTGRES_USER` | Compose postgres service 用戶名，預設 `bguser` |
| `POSTGRES_PASSWORD` | Compose postgres 密碼（必填）|
| `POSTGRES_DB` | Compose postgres 資料庫名，預設 `blockchains` |

---

## 6. 受影響檔案清單

### 新增檔案

| 路徑 | 說明 |
|------|------|
| `apps/server/Dockerfile` | 三階段 build：deps / builder / runner（node:20-alpine）|
| `apps/web/Dockerfile` | 兩階段：builder（node:20-alpine）+ runner（nginx:1.27-alpine）|
| `apps/admin/Dockerfile` | 同 web 模式 |
| `apps/web/nginx.conf` | nginx SPA fallback 設定 |
| `apps/admin/nginx.conf` | nginx SPA fallback 設定（同 web）|
| `docker-compose.yml` | root 層，4 services + 2 networks + 1 volume |
| `.dockerignore` | root 層，排 node_modules / dist / .env / .git / docs |
| `.github/workflows/ci.yml` | push/PR to main：install → typecheck → lint → test → build |
| `ARCHITECTURE.md` | 正式架構文件（取代 docs/architecture.md 或另存 root）|
| `docs/ENVIRONMENT.md` | 環境變數一覽（或合入 ARCHITECTURE.md 第 12 節）|

### 可能需要修改的現有檔案

| 路徑 | 原因 |
|------|------|
| `apps/server/package.json` | `start` script 確認使用 `node dist/index.js`（目前已是，無需改）|
| `apps/web/package.json` | 確認 `build` script 輸出到 `dist/`（目前已是）|
| `apps/admin/package.json` | 同上 |
| `apps/server/src/index.ts` | `process.env.NODE_ENV` 確認 production 行為（目前用 `config.ts`，需確認）|

---

## 7. 實作風險與注意事項

### 7.1 Prisma 在 Docker 多階段 build 的 native binary 問題

Prisma 的 query engine 是 platform-specific binary。`prisma generate` 在 `node:20-alpine`（linux-musl）裡生成 musl binary，runner stage 是同一 alpine base，所以沒問題。

**若 CI 機器是 ubuntu（glibc）而 container 是 alpine（musl）**，CI 跑 `pnpm build`（含 prisma generate）時生成的是 glibc binary，但 CI 只做 typecheck/lint/test/build 驗證，不實際跑 server，因此不影響。

### 7.2 Vite 環境變數需要在 docker build time 傳入

`VITE_API_BASE` 在 `vite build` 時會被嵌入 JS bundle（不是 runtime env）。docker-compose 裡的 `build.args` 必須傳遞這些 ARG，Dockerfile 也需要 `ARG VITE_API_BASE` + `ENV VITE_API_BASE=$VITE_API_BASE`。

### 7.3 `prisma migrate deploy` 時機

放在 docker-compose 的 `command` 覆蓋，讓 `depends_on: postgres: condition: service_healthy` 確保 DB 就緒後才執行。不放在 Dockerfile CMD 是因為 migrate 屬於 runtime 操作，不同環境（staging vs production）可能有不同需求。

### 7.4 CI 不測試 Docker build

Docker build 有較長的 build time（npm install + tsc + vite build × 3）。CI 目的是快速回饋，故只跑 node 層驗證。Docker build 正確性由本地 `docker compose build` 驗證。

---

## 8. 非目標（明確排除）

- Kubernetes manifests（YAGNI，目前 Render 或單機就夠）
- CD pipeline / auto-deploy（另一個 feature）
- docker image push to registry（CI 只跑測試）
- 監控 / logging infra（Datadog / Grafana / Sentry）
- Multi-stage CI matrix（只需單一 Node 20）
- Docker layer 掃描 / container security scan（投產前再考慮）
