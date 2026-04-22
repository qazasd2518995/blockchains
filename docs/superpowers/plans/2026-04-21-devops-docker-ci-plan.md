# Implementation Plan: DevOps Docker CI
**Spec**: `docs/superpowers/specs/2026-04-21-devops-docker-ci-design.md`  
**Date**: 2026-04-21  
**Status**: 待執行

---

## 總覽

本 plan 共 10 個 task（Task 0 ～ Task 9），將為 `blockchain-game` monorepo 補齊：
- 三份 Dockerfile（server / web / admin）
- 兩份 nginx.conf（web / admin）
- 根目錄 `.dockerignore`
- 根目錄 `docker-compose.yml`
- `.github/workflows/ci.yml`
- `ARCHITECTURE.md`（正式架構文件）
- README / QUICKSTART Docker 章節補充

執行順序：Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

每個 task 獨立可驗證，可以跳過已完成的。

---

## Task 0 — Baseline check + kickoff commit

### 目的
確認工作目錄乾淨、相依工具可用，然後做第一次 kickoff commit 標記工作開始。

### 驗證指令

```bash
# 確認 pnpm 版本
pnpm --version
# 應輸出 9.15.4

# 確認 docker 可用
docker --version
# 應輸出 Docker version 24.x 以上

# 確認 git 狀態乾淨
git status
# 應輸出 nothing to commit, working tree clean

# 確認現有 CI / Docker 文件不存在（pre-condition）
ls .github/workflows/ 2>/dev/null || echo "OK: no workflows yet"
ls apps/server/Dockerfile 2>/dev/null || echo "OK: no Dockerfile yet"

# 確認 pnpm lint + typecheck + test 目前可過（快照基線）
pnpm lint
pnpm typecheck
pnpm test
```

### Commit 訊息

```
chore(devops): kickoff docker + ci implementation plan
```

---

## Task 1 — `.dockerignore`（根目錄）

### 目的
排除 node_modules、dist、.env、.git、docs 等不必要的資料夾進入 Docker build context，縮短傳輸時間並防止敏感資訊進入 image。

### 檔案路徑
`/Users/justin/blockchain-game/.dockerignore`

### 完整檔案內容

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

### 驗證指令

```bash
# 確認檔案存在
cat .dockerignore

# 確認 node_modules 不會進 context（用 docker build 的 --dry-run 模擬）
# 用真正 build 前先確認 context 大小是否合理（應 < 5MB）
docker build --no-cache -f apps/server/Dockerfile . --dry-run 2>/dev/null | head -5 || \
  echo "Note: --dry-run not supported on this docker version, skip size check"
```

### Commit 訊息

```
chore(docker): add root .dockerignore
```

---

## Task 2 — `apps/server/Dockerfile`（三階段多階段 build）

### 目的
建立 server 的三階段 Dockerfile（deps → builder → runner），在 alpine 內完成 Prisma generate + tsc 編譯，runner stage 以 non-root node user 執行。

### 關鍵設計決策
- 三個 stage：deps（安裝所有依賴）→ builder（複製 source + 編譯）→ runner（只含生產所需檔案）
- `prisma generate` 在 builder stage 執行，native query engine binary（linux-musl）留在 node_modules/.pnpm
- runner stage 用 `pnpm install --frozen-lockfile --prod` 安裝生產依賴，但因 `postinstall` 不在 `--prod` 時觸發，需從 builder 手動複製 `node_modules/.pnpm` 完整內容（含 .prisma binary）
- `prisma migrate deploy` 放到 docker-compose command，不放 CMD
- WORKDIR 最終切到 `/app/apps/server`，CMD 執行 `node dist/index.js`

### 檔案路徑
`/Users/justin/blockchain-game/apps/server/Dockerfile`

### 完整檔案內容

```dockerfile
# ── Stage 1: deps ──────────────────────────────────────────────────────────────
# 只安裝依賴，利用 layer cache 加速後續 build
FROM node:20-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 只複製 workspace manifest（讓 pnpm install 的 layer 可被 cache）
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/package.json           packages/shared/package.json
COPY packages/provably-fair/package.json    packages/provably-fair/package.json
COPY apps/server/package.json               apps/server/package.json

RUN pnpm install --frozen-lockfile

# ── Stage 2: builder ───────────────────────────────────────────────────────────
# 複製全部 source，按依賴順序編譯
FROM deps AS builder
WORKDIR /app

# 複製 packages source（shared、provably-fair 需要 build）
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/           packages/shared/
COPY packages/provably-fair/    packages/provably-fair/

# 複製 server source（含 prisma schema）
COPY apps/server/               apps/server/

# 按依賴順序 build：shared → provably-fair → server（prisma gen + tsc）
RUN pnpm --filter @bg/shared run build && \
    pnpm --filter @bg/provably-fair run build && \
    pnpm --filter @bg/server exec prisma generate && \
    pnpm --filter @bg/server run build

# ── Stage 3: runner ────────────────────────────────────────────────────────────
# 最小化最終 image：只含生產所需的編譯產物 + prisma binary + node_modules
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 複製 workspace manifest，讓 pnpm install --prod 可運作
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/package.json         packages/tsconfig/package.json
COPY packages/shared/package.json           packages/shared/package.json
COPY packages/provably-fair/package.json    packages/provably-fair/package.json
COPY apps/server/package.json               apps/server/package.json

# --prod 不觸發 postinstall（prisma generate），故 .prisma binary 從 builder 複製
RUN pnpm install --frozen-lockfile --prod

# 從 builder 複製編譯產物
COPY --from=builder /app/packages/shared/dist/          packages/shared/dist/
COPY --from=builder /app/packages/provably-fair/dist/   packages/provably-fair/dist/
COPY --from=builder /app/apps/server/dist/              apps/server/dist/

# 複製 Prisma schema（migrate deploy 需要）
COPY --from=builder /app/apps/server/prisma/            apps/server/prisma/

# 複製 .pnpm store（含 Prisma native binary + @prisma/client generated code）
# 這是讓 prisma query engine 在 runner 中可用的關鍵
COPY --from=builder /app/node_modules/.pnpm/            node_modules/.pnpm/

# 非 root 執行（node user 是 node:20-alpine 內建）
USER node

EXPOSE 3000

# 切到 server 目錄執行
WORKDIR /app/apps/server

# migrate deploy 在 docker-compose command 層執行，CMD 只啟動 server
CMD ["node", "dist/index.js"]
```

### 驗證指令

```bash
# 在專案根目錄執行
docker build -f apps/server/Dockerfile -t bg-server:test .

# 確認 build 成功
echo "Exit code: $?"

# 確認 image 存在
docker image ls bg-server:test

# 確認 node user（非 root）
docker run --rm bg-server:test whoami
# 預期輸出: node

# 確認 dist/index.js 存在
docker run --rm bg-server:test ls dist/index.js

# 清理
docker rmi bg-server:test
```

### Commit 訊息

```
feat(docker): add apps/server three-stage Dockerfile
```

---

## Task 3 — `apps/web/Dockerfile` + `apps/web/nginx.conf`

### 目的
建立 web 前端的兩階段 Dockerfile（builder → serve），builder 使用 node:20-alpine 執行 `vite build`，serve stage 用 nginx:1.27-alpine 提供靜態檔案，並設定 SPA fallback。`VITE_API_BASE` 與 `VITE_SOCKET_BASE` 透過 Docker build ARG 傳入。

### 關鍵設計決策
- `VITE_API_BASE` 是 build-time 變數，Vite 會嵌入 JS bundle，**不能是 runtime env**
- web 依賴：shared + provably-fair + game-engine + ui-tokens（注意 game-engine 沒有 build script，直接引用 src/）
- nginx.conf 需設定 `try_files $uri $uri/ /index.html` SPA fallback
- 靜態資產（js/css/woff2/png/svg）設定 1 年 cache + immutable

### 檔案 1：`apps/web/Dockerfile`

```dockerfile
# ── Stage 1: builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 接受 build-time 環境變數（vite build 時嵌入 bundle）
ARG VITE_API_BASE=http://localhost:3001
ARG VITE_SOCKET_BASE=http://localhost:3001
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_SOCKET_BASE=$VITE_SOCKET_BASE

# 先只複製 manifest，利用 layer cache
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/package.json           packages/shared/package.json
COPY packages/provably-fair/package.json    packages/provably-fair/package.json
COPY packages/game-engine/package.json      packages/game-engine/package.json
COPY packages/ui-tokens/package.json        packages/ui-tokens/package.json
COPY apps/web/package.json                  apps/web/package.json

RUN pnpm install --frozen-lockfile

# 複製所有 package source
COPY packages/ packages/
COPY apps/web/ apps/web/

# 按依賴順序 build（game-engine 直接引 src/，不需 build step）
RUN pnpm --filter @bg/shared run build && \
    pnpm --filter @bg/provably-fair run build && \
    pnpm --filter @bg/ui-tokens run build && \
    pnpm --filter @bg/web run build

# ── Stage 2: serve ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# 複製 vite build 產物
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# SPA fallback 設定
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### 檔案 2：`apps/web/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback：所有未匹配的路由導向 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 靜態資產長期緩存（js/css/字型/圖片）
    location ~* \.(js|css|woff2|png|svg|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 禁止存取隱藏檔案（.env, .git 等）
    location ~ /\. {
        deny all;
    }
}
```

### 驗證指令

```bash
# build image（可不傳 VITE_API_BASE，使用預設 localhost:3001）
docker build -f apps/web/Dockerfile -t bg-web:test .

# 確認 build 成功
echo "Exit code: $?"

# 啟動 container（detached）
docker run -d --name bg-web-test -p 18080:80 bg-web:test

# 等待 nginx 啟動
sleep 2

# 測試首頁回 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/
# 預期輸出: 200

# 測試 SPA fallback（任意路由應回 200 + index.html）
curl -s -o /dev/null -w "%{http_code}" http://localhost:18080/some/spa/route
# 預期輸出: 200

# 清理
docker stop bg-web-test && docker rm bg-web-test && docker rmi bg-web:test
```

### Commit 訊息

```
feat(docker): add apps/web Dockerfile + nginx.conf with SPA fallback
```

---

## Task 4 — `apps/admin/Dockerfile` + `apps/admin/nginx.conf`

### 目的
與 Task 3 結構相同，但 admin 不依賴 game-engine，只需要 shared + ui-tokens。

### 關鍵設計決策
- admin 依賴：shared + ui-tokens（不含 provably-fair、game-engine）
- nginx.conf 內容與 web 完全相同（SPA fallback 邏輯一致）
- VITE_API_BASE 透過 build ARG 傳入

### 檔案 1：`apps/admin/Dockerfile`

```dockerfile
# ── Stage 1: builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# 接受 build-time 環境變數
ARG VITE_API_BASE=http://localhost:3001
ENV VITE_API_BASE=$VITE_API_BASE

# 先只複製 manifest，利用 layer cache
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/tsconfig/         packages/tsconfig/
COPY packages/shared/package.json           packages/shared/package.json
COPY packages/ui-tokens/package.json        packages/ui-tokens/package.json
COPY apps/admin/package.json                apps/admin/package.json

RUN pnpm install --frozen-lockfile

# 複製所有 package source（shared、ui-tokens 需要 build）
COPY packages/tsconfig/   packages/tsconfig/
COPY packages/shared/     packages/shared/
COPY packages/ui-tokens/  packages/ui-tokens/
COPY apps/admin/          apps/admin/

# 按依賴順序 build
RUN pnpm --filter @bg/shared run build && \
    pnpm --filter @bg/ui-tokens run build && \
    pnpm --filter @bg/admin run build

# ── Stage 2: serve ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner

# 複製 vite build 產物
COPY --from=builder /app/apps/admin/dist /usr/share/nginx/html

# SPA fallback 設定
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

### 檔案 2：`apps/admin/nginx.conf`

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback：所有未匹配的路由導向 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 靜態資產長期緩存（js/css/字型/圖片）
    location ~* \.(js|css|woff2|png|svg|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 禁止存取隱藏檔案（.env, .git 等）
    location ~ /\. {
        deny all;
    }
}
```

### 驗證指令

```bash
# build image
docker build -f apps/admin/Dockerfile -t bg-admin:test .

# 確認 build 成功
echo "Exit code: $?"

# 啟動 container
docker run -d --name bg-admin-test -p 18081:80 bg-admin:test

# 等待 nginx 啟動
sleep 2

# 測試首頁回 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:18081/
# 預期輸出: 200

# 測試 SPA fallback
curl -s -o /dev/null -w "%{http_code}" http://localhost:18081/agents/login
# 預期輸出: 200

# 清理
docker stop bg-admin-test && docker rm bg-admin-test && docker rmi bg-admin:test
```

### Commit 訊息

```
feat(docker): add apps/admin Dockerfile + nginx.conf with SPA fallback
```

---

## Task 5 — `docker-compose.yml`（根目錄）

### 目的
建立根目錄 `docker-compose.yml`，串接 postgres、server、web、admin 四個服務，設定雙 network（internal / external）隔離 DB 存取，postgres healthcheck 鏈確保啟動順序正確。

### 關鍵設計決策
- postgres 只在 `internal` network，外部無法直連 DB
- server 同時在 `internal`（連 postgres）與 `external`（接受前端請求）
- web / admin 只在 `external`，無法繞過 server 直接碰 DB
- server command 覆蓋執行 `prisma migrate deploy` 後再啟動 `node dist/index.js`
- postgres 使用 named volume `postgres_data` 持久化
- server 對外 port 3001（避免與本地 dev server 的 3000 衝突）
- web 對外 port 8080，admin 對外 port 8081
- 所有必填 secret 環境變數用 `:?` 語法（compose 啟動時缺少即報錯）

### 檔案路徑
`/Users/justin/blockchain-game/docker-compose.yml`

### 完整檔案內容

```yaml
name: blockchain-game

networks:
  internal:
    # server ↔ postgres 專用，外部不可見
    driver: bridge
  external:
    # server ↔ web/admin 通信
    driver: bridge

volumes:
  postgres_data:

services:

  # ── PostgreSQL ──────────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    networks:
      - internal
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-bguser}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?must set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: ${POSTGRES_DB:-blockchains}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-bguser}"]
      interval: 5s
      timeout: 5s
      retries: 10

  # ── Server（Fastify + Prisma + Socket.IO）──────────────────────────────────
  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    restart: unless-stopped
    networks:
      - internal
      - external
    ports:
      - "3001:3000"
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER:-bguser}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-blockchains}
      JWT_SECRET: ${JWT_SECRET:?must set JWT_SECRET in .env}
      JWT_ACCESS_TTL: ${JWT_ACCESS_TTL:-15m}
      JWT_REFRESH_TTL: ${JWT_REFRESH_TTL:-7d}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:8080,http://localhost:8081}
      SIGNUP_BONUS: ${SIGNUP_BONUS:-1000}
      MAX_SINGLE_BET: ${MAX_SINGLE_BET:-100000}
      SUPER_ADMIN_USERNAME: ${SUPER_ADMIN_USERNAME:-superadmin}
      SUPER_ADMIN_PASSWORD: ${SUPER_ADMIN_PASSWORD:?must set SUPER_ADMIN_PASSWORD in .env}
      HOST: 0.0.0.0
      PORT: 3000
    # prisma migrate deploy 先跑，然後啟動 server
    # 利用 shell -c 串接兩個指令，migrate 失敗則 server 不啟動
    command: >
      sh -c "
        cd /app/apps/server &&
        npx prisma migrate deploy &&
        node dist/index.js
      "
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

  # ── Web（玩家前端，nginx 靜態）──────────────────────────────────────────────
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

  # ── Admin（代理後台，nginx 靜態）────────────────────────────────────────────
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

### 前置步驟：建立 `.env`（compose 需要的環境變數）

在專案根目錄建立 `.env`（不進 git，已在 .gitignore）：

```bash
# 複製範本後填入真實值
cat > .env << 'EOF'
POSTGRES_PASSWORD=bgpassword_local
JWT_SECRET=change-me-to-a-64-char-hex-generated-by-openssl-rand-hex-32
SUPER_ADMIN_PASSWORD=SuperAdmin@123
EOF
```

### 驗證指令

```bash
# 確認 .env 存在
ls .env

# 啟動所有服務（背景執行）
docker compose up --build -d

# 等待服務啟動（postgres healthcheck + server migrate + nginx 啟動）
echo "Waiting 60s for services to start..."
sleep 60

# 檢查所有 container 狀態（應全是 Up）
docker compose ps

# 測試 server health endpoint
curl -s http://localhost:3001/api/health
# 預期: {"ok":true,"env":"production"}

# 測試 web 前端（應回 200 + HTML）
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
# 預期: 200

# 測試 admin 前端
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/
# 預期: 200

# 測試 web SPA fallback
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/games/dice
# 預期: 200

# 測試 admin SPA fallback
curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/agents/login
# 預期: 200

# 查看 server logs（確認 migrate deploy 成功）
docker compose logs server | grep -E "migrate|Listening|health"

# 清理（移除 container + volume）
docker compose down -v
```

### Commit 訊息

```
feat(docker): add root docker-compose.yml with postgres/server/web/admin services
```

---

## Task 6 — `.github/workflows/ci.yml`

### 目的
建立 GitHub Actions CI workflow，在 push / PR to main 時執行：checkout → setup pnpm → install → typecheck → lint → test → build。pnpm store 使用 actions/cache 加速，turbo cache 跨 run 保留。

### 關鍵設計決策
- 不需要 postgres service（PF 測試為純函式，server test `--passWithNoTests`）
- Node 20 / pnpm 9.15.4（和 packageManager 鎖定版本一致）
- timeout-minutes 15（防止 hung build 消耗無謂 CI 分鐘）
- `fetch-depth: 2` 讓 turbo 可比較前一個 commit 做 cache 判斷
- `pnpm build` 包含 `prisma generate`（server build script 自帶），無需額外設定

### 前置步驟：建立目錄

```bash
mkdir -p .github/workflows
```

### 檔案路徑
`/Users/justin/blockchain-game/.github/workflows/ci.yml`

### 完整檔案內容

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
          fetch-depth: 2

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

      - name: Lint
        run: pnpm lint

      - name: Test
        run: pnpm test
        env:
          NODE_ENV: test

      - name: Build
        run: pnpm build

      - name: Cache turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-
```

### 驗證指令

**本地驗證（不需要 push）**：

```bash
# 確認 YAML 格式正確
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"

# 本地模擬 CI 步驟（手動執行每一步）
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
echo "All CI steps passed locally"
```

**Push 後驗證**：

```bash
# Commit + push 後在 GitHub 確認 Actions 跑起來
git push origin main
# 前往 https://github.com/<owner>/blockchain-game/actions 確認 CI 綠色通過
```

**（選用）使用 act 本地執行 GitHub Actions**：

```bash
# 安裝 act（macOS）
brew install act

# 執行 CI workflow
act push --workflows .github/workflows/ci.yml
```

### Commit 訊息

```
feat(ci): add GitHub Actions CI workflow (typecheck/lint/test/build)
```

---

## Task 7 — `ARCHITECTURE.md`（根目錄正式架構文件）

### 目的
建立根目錄 `ARCHITECTURE.md`，13 節完整技術架構文件，取代 `docs/architecture.md` 的非正式開發筆記，作為新人與審計者的第一份技術參考。

### 資訊來源（已讀取）
- `apps/server/prisma/schema.prisma`：20 個 model 確認
- `apps/server/src/server.ts`：所有 route prefix 確認
- `apps/server/src/realtime/crashRoom.ts`：Crash 狀態機確認
- `apps/server/src/modules/games/_common/controls.ts`：applyControls hook 確認
- `apps/server/src/config.ts`：所有環境變數 schema 確認

### 檔案路徑
`/Users/justin/blockchain-game/ARCHITECTURE.md`

### 完整檔案內容

```markdown
# ARCHITECTURE.md

> 本文件是 `blockchain-game` monorepo 的正式技術架構參考。  
> 適用讀者：新加入開發者、外部審計者、部署維護人員。

---

## 1. 概覽

`blockchain-game` 是假幣博彩遊戲研究平台（不接受真實存提款），由三個應用程式（apps）與五個共用套件（packages）組成的 **pnpm monorepo**，以 Turborepo 管理 build 依賴順序。

```
blockchain-game/
├── apps/
│   ├── server/     # Fastify API + Socket.IO（Node 20）
│   ├── web/        # 玩家前端（React + Pixi.js SPA）
│   └── admin/      # 代理後台（React SPA）
└── packages/
    ├── tsconfig/        # 共用 TypeScript 設定
    ├── eslint-config/   # 共用 ESLint 設定
    ├── shared/          # 跨 app 共用型別、DTO、GameId enum
    ├── provably-fair/   # PF 演算法（純函式，HMAC-SHA256）
    ├── game-engine/     # Pixi.js 遊戲引擎基底（前端專用）
    └── ui-tokens/       # Tailwind 設計 token
```

**技術棧一覽**：

| 層 | 技術 |
|---|---|
| 後端框架 | Fastify 4 + TypeScript |
| ORM | Prisma 5（PostgreSQL 16）|
| 即時通訊 | Socket.IO 4 |
| 前端框架 | React 18 + React Router 6 |
| 前端 Canvas | Pixi.js 8 + GSAP 3 |
| 狀態管理 | Zustand |
| 表單 | React Hook Form + Zod |
| 金額運算 | Decimal.js（嚴禁 Number/Float）|
| Build 工具 | Vite 5（前端）、tsc（後端）|
| Monorepo | pnpm 9.15.4 + Turborepo 2 |

---

## 2. 模組地圖

### packages/

| 名稱 | 路徑 | 說明 | 對外介面 |
|------|------|------|----------|
| `@bg/tsconfig` | `packages/tsconfig/` | 共用 tsconfig.base.json | `extends` 繼承 |
| `@bg/eslint-config` | `packages/eslint-config/` | 共用 ESLint flat config | ESLint `extends` |
| `@bg/shared` | `packages/shared/` | `GameId` enum、所有 DTO（bet request/result）、shared 型別 | `dist/index.js` |
| `@bg/provably-fair` | `packages/provably-fair/` | HMAC-SHA256 PF 演算法（dice、mines、hilo、keno、wheel、plinko、roulette、hotline、tower、crash）| `dist/index.js` |
| `@bg/game-engine` | `packages/game-engine/` | Pixi.js BaseGame 基底類別、Renderer 抽象、asset loader | `src/index.ts`（直接引用）|
| `@bg/ui-tokens` | `packages/ui-tokens/` | Tailwind preset、global CSS 設計 token | `tailwind.preset.ts` |

### apps/server/ — 路由前綴

| 前綴 | 模組 | 說明 |
|------|------|------|
| `/api/auth` | `modules/auth/` | 玩家 register、login、logout、refresh token |
| `/api/admin` | `modules/admin/` | 代理後台：agents、members、controls、reports、transfers、hierarchy |
| `/api/wallet` | `modules/wallet/` | 餘額查詢、Transaction 歷史 |
| `/api/pf` | `modules/provably-fair/` | Server seed 查詢、rotate seed、reveal seed |
| `/api/games/dice` | `modules/games/dice/` | 骰子（單步驟）|
| `/api/games/mines` | `modules/games/mines/` | 踩地雷（多步驟）|
| `/api/games/hilo` | `modules/games/hilo/` | Hi-Lo（多步驟）|
| `/api/games/keno` | `modules/games/keno/` | Keno（單步驟）|
| `/api/games/wheel` | `modules/games/wheel/` | Color Wheel（單步驟）|
| `/api/games/plinko` | `modules/games/plinko/` | Plinko（單步驟）|
| `/api/games/roulette` | `modules/games/roulette/` | Mini Roulette（單步驟）|
| `/api/games/hotline` | `modules/games/hotline/` | Hotline 老虎機（單步驟）|
| `/api/games/tower` | `modules/games/tower/` | Tower X（多步驟）|
| `Socket.IO /crash/*` | `realtime/crashRoom.ts` | Crash 即時遊戲（8 個房間）|

---

## 3. 資料流：下注一局的完整生命週期

以 Dice 下注為例：

```
玩家按「投注」
    │
    ▼
Zustand store 鎖住按鈕（防連點）
    │
    ▼
Axios POST /api/games/dice/bet
  headers: Authorization: Bearer <accessToken>
    │
    ▼
Fastify（server）
  1. @fastify/rate-limit：600 req/min per user
  2. fastify.authenticate：驗 JWT → 寫入 req.userId
  3. Zod schema 驗證 body（amount、clientSeed 可接受）
  4. DiceService.bet()
    │
    ▼
Prisma $transaction（isolationLevel: Serializable）
  a. SELECT balance FROM User WHERE id = userId FOR UPDATE
  b. 驗 amount > 0、amount <= MAX_SINGLE_BET
  c. SeedHelper.getActiveBundle()：取或建 ServerSeed + ClientSeed，nonce++
  d. diceDetermine(serverSeed, clientSeed, nonce, target, direction)
     → @bg/provably-fair → HMAC-SHA256 → roll number
  e. applyControls()：檢查 WinLossControl / MemberWinCapControl / etc.
  f. 寫 Bet record（含 resultData: { rawWon, finalWon }）
  g. debitAndRecord：扣下注金額 → 寫 Transaction(BET_PLACE)
  h. 若贏：creditAndRecord → 寫 Transaction(BET_WIN)
    │
    ▼
HTTP 200 回傳 DiceBetResult
  { roll, won, payout, multiplier, newBalance, serverSeedHash, nonce, controlled }
    │
    ▼
前端
  DiceScene.playRoll()：播放 Pixi 動畫（1.5s）
  Zustand 更新 balance、bet history
```

**不變量**：任何下注前後，`User.balance` 嚴格反映真實餘額；`Transaction.balanceAfter` 單調遞增或遞減。

---

## 4. Provably Fair 信任模型

```
玩家開始遊戲
    │
    ▼
Server 產生 serverSeed = crypto.randomBytes(32).toString('hex')
  serverSeedHash = SHA256(serverSeed)  ← 立即公開給玩家
    │
    ▼
每次下注：nonce + 1
  HMAC = HMAC-SHA256(serverSeed, clientSeed:nonce)
  → 轉換為遊戲結果（各遊戲演算法不同）
    │
    ▼
玩家旋轉 seed（rotate）
  舊 serverSeed 揭露（revealedAt 設定）
  玩家可自行驗證：SHA256(revealedSeed) === 原始公開的 serverSeedHash
  產生新 serverSeed，nonce 歸 0
```

- **Seed 只在 `revealedAt` 設定後才能透過 API 取得明文**（`/api/pf/seeds` 路由）
- 每個遊戲類別（gameCategory）獨立 seed 對，互不影響
- PF 演算法測試向量在 `packages/provably-fair/__tests__/`，是信任根基

---

## 5. 控制介入機制與 PF 的關係

代理後台可對特定會員或代理線設定輸贏控制，但不破壞 PF 可驗證性：

```
PF HMAC 計算（永遠執行）
    │
    ▼
rawWon / rawMultiplier / rawPayout  ← 寫入 Bet.resultData.rawWon
    │
    ▼
applyControls()（apps/server/src/modules/games/_common/controls.ts）
  依序檢查（優先順序由高到低）：
  1. MemberDepositControl：入金後控制 controlWinRate
  2. MemberWinCapControl：今日贏額達 winCapAmount → 強制 loss
  3. AgentLineWinCap：代理線今日贏額達 dailyCap → 強制 loss
  4. WinLossControl：依 mode + controlPercentage 翻轉輸贏
    │
    ▼
finalWon / finalMultiplier / finalPayout  ← 寫入 Bet 及回傳前端
    │
    ▼
翻轉時：強制寫入 WinLossControlLogs
  { controlId, betId, userId, gameId, originalResult, finalResult, flipReason }
```

- API 回應帶 `controlled: boolean` 旗標
- Super Admin 以外角色無法建立/修改控制規則
- HMAC 計算永遠可驗證；控制介入永遠可審計

---

## 6. 代理樹資料模型

```
Agent（自引用樹）
  id, parentId → Agent（nullable，root = Super Admin）
  level: number（0 = Super Admin, 1 = 代理, 2 = 子代理...）
  role: AdminRole（SUPER_ADMIN | CS | AGENT | SUB_AGENT）
  balance: Decimal（代理自身點數，與 User 帳號獨立）
  
User
  agentId → Agent（所屬代理）
  marketType: MarketType（D | A，影響返水計算）
```

**控制模型**：

| 模型 | 說明 |
|------|------|
| `WinLossControl` | 輸贏控制（支援 NORMAL/AGENT_LINE/SINGLE_MEMBER/AUTO_DETECT 四種模式）|
| `MemberWinCapControl` | 會員贏額封頂（每日 winCapAmount）|
| `MemberDepositControl` | 入金控制（controlWinRate 調整）|
| `AgentLineWinCap` | 代理線每日贏額上限 |

---

## 7. 遊戲分類

| 類型 | 遊戲 | 機制 |
|------|------|------|
| 單步驟（1 API call）| Dice、Keno、Color Wheel、Plinko、Mini Roulette、Hotline | POST bet → 立即結算 → 回傳結果 |
| 多步驟（round 狀態追蹤）| Mines、Hi-Lo、Tower | POST start → POST reveal/guess（多次）→ POST cashout/bust |
| 即時 Socket.IO | Rocket、Aviator、JetX、JetX3、Space Fleet、Balloon、Double X、Plinko X | 加入房間 → BETTING → RUNNING → CRASHED |

---

## 8. 多步驟遊戲的狀態機

### Mines（踩地雷）

```
POST /api/games/mines/start
    │ 建立 MinesRound（status: ACTIVE）
    │ 預先決定所有地雷位置（PF 演算法）
    ▼
POST /api/games/mines/reveal { position }
    │ status = ACTIVE → 檢查是否踩到雷
    ├── 踩到雷 → status = BUSTED，Bet 結算（payout = 0）
    │
    ▼
POST /api/games/mines/cashout
    │ status = ACTIVE → 結算當前倍率 → status = CASHED_OUT
    ▼
```

### Hi-Lo（猜大小）

```
POST /api/games/hilo/start
    │ 建立 HiLoRound（status: ACTIVE）
    │ 發第一張牌（PF 決定整個牌序）
    ▼
POST /api/games/hilo/guess { direction: HI | LO | SKIP }
    │ 每猜一次抽下一張牌，倍率累積
    ├── 猜錯 → status = BUSTED
    ├── 猜對 → 繼續或 cashout
    ▼
POST /api/games/hilo/cashout
    │ 結算當前倍率 → status = CASHED_OUT
    ▼
```

### Tower X（爬塔）

```
POST /api/games/tower/start { difficulty }
    │ 建立 TowerRound（status: ACTIVE）
    │ difficulty 決定每層格數與地雷數
    ▼
POST /api/games/tower/step { column }
    │ 每層選一格，倍率乘以 level multiplier
    ├── 踩到雷 → status = BUSTED
    ├── 安全 → 繼續下一層或 cashout
    ▼
POST /api/games/tower/cashout
    │ 結算當前倍率 → status = CASHED_OUT
    ▼
```

**DB 關鍵設計**：
- `MinesRound.minePositions`（JSON）、`HiLoRound.deck`（JSON）、`TowerRound.gridData`（JSON）存放 PF 預算的完整局面
- `status` 欄位確保每個 round 只能在正確狀態下操作（防止重入攻擊）

---

## 9. Crash 引擎（Socket.IO 即時流程）

```
CrashRoomRegistry
  ├── /crash/rocket
  ├── /crash/aviator
  ├── /crash/jetx
  ├── /crash/jetx3
  ├── /crash/space_fleet
  ├── /crash/balloon
  ├── /crash/double_x
  └── /crash/plinko_x
```

每個房間（CrashRoom）的生命週期：

```
[BETTING 5s]
  玩家發送 join-bet → 後端記錄 CrashBet（status: PENDING）
      │
      ▼
[RUNNING]
  每 100ms emit crash:tick { multiplier }
  multiplier = e^(GROWTH_RATE * elapsed_ms)
  自動 cashout：multiplier >= autoCashOut → 結算
      │
      ▼
[CRASHED]
  crashPoint（PF HMAC 決定）觸發 → emit crash:crashed { crashPoint }
  未 cashout 的 CrashBet → status: BUSTED，payout = 0
  POST_CRASH 3s 後 → 回到 BETTING
```

**DB 模型**：
- `CrashRound`：每局一筆（serverSeedHash、serverSeed 揭露後填入、crashPoint）
- `CrashBet`：每個玩家的下注（autoCashOut、cashedOutAt、payout）

---

## 10. 部署架構

### Docker Compose（本地/單機）

```
Internet
    │
    ├── :8080 ──→ [bg-web:nginx]  ──→ apps/web/dist（SPA）
    │
    ├── :8081 ──→ [bg-admin:nginx] ──→ apps/admin/dist（SPA）
    │
    └── :3001 ──→ [bg-server:node] ──→ :3000（Fastify + Socket.IO）
                        │
                   [internal network]
                        │
                   :5432 ──→ [postgres:16-alpine]
                              └── volume: postgres_data
```

**Network 隔離**：
- `internal` network：server ↔ postgres（外部不可直連 DB）
- `external` network：server ↔ web/admin（前端透過 server API 存取資料）

### Render 雲端（production）

- `bg-api`：Render Web Service（Node），健康檢查 `/api/health`
- `bg-web`：Render Static Site，SPA rewrite `/* → /index.html`
- `bg-admin`：Render Static Site，SPA rewrite `/* → /index.html`
- PostgreSQL：Render Managed PostgreSQL（同 region）

---

## 11. 安全考量

| 機制 | 說明 |
|------|------|
| JWT 雙 token | accessToken 15m + refreshToken 7d，DB 存 hash 支援 revocation |
| Serializable transaction + SELECT FOR UPDATE | 防止下注 race condition |
| @fastify/rate-limit | 600 req/min per user，防暴力攻擊 |
| Prisma parameterized query | 防 SQL injection（無 raw string 拼接）|
| @fastify/helmet | 安全 HTTP headers（CSP、HSTS 等）|
| bcrypt password hashing | 密碼永不明文儲存 |
| Non-root Docker user | container 以 `node` user 執行，非 root |
| .env 不進 git | `.env` 在 .gitignore；`.env.example` 只有變數名 |
| CORS 白名單 | `CORS_ORIGIN` 明確列出允許的前端 origin |
| 前端送來的結果一律丟棄 | multiplier / payout / won 由後端 PF 計算，不信任前端 |

---

## 12. 環境變數一覽

### apps/server（後端）

| 變數名 | 必填 | 預設值 | 說明 |
|--------|------|--------|------|
| `DATABASE_URL` | 是 | — | PostgreSQL 連線字串，格式：`postgresql://user:pw@host:5432/db` |
| `JWT_SECRET` | 是 | — | 至少 32 字元 hex，`openssl rand -hex 32` 產生 |
| `JWT_ACCESS_TTL` | 否 | `15m` | Access token 有效期 |
| `JWT_REFRESH_TTL` | 否 | `7d` | Refresh token 有效期 |
| `PORT` | 否 | `3000` | Fastify 監聽 port |
| `HOST` | 否 | `0.0.0.0` | Fastify 監聽 host |
| `NODE_ENV` | 否 | `development` | `production` 時關閉 pino-pretty |
| `CORS_ORIGIN` | 是（production）| `http://localhost:5173` | 逗號分隔，允許的前端 origin |
| `SIGNUP_BONUS` | 否 | `1000` | 新會員建立時的初始點數 |
| `MAX_SINGLE_BET` | 否 | `100000` | 單注上限（Decimal）|
| `SUPER_ADMIN_USERNAME` | 是 | `superadmin` | seed-agent 建立的 Super Admin 帳號 |
| `SUPER_ADMIN_PASSWORD` | 是 | — | 至少 12 字元 |

### apps/web / apps/admin（前端 Vite build-time）

| 變數名 | 說明 |
|--------|------|
| `VITE_API_BASE` | 後端 API base URL，例如 `https://api.example.com` |
| `VITE_SOCKET_BASE` | Socket.IO server URL（web 專用，通常同 API base）|

### docker-compose 額外環境變數（根目錄 `.env`）

| 變數名 | 必填 | 預設值 | 說明 |
|--------|------|--------|------|
| `POSTGRES_PASSWORD` | 是 | — | postgres service 密碼 |
| `POSTGRES_USER` | 否 | `bguser` | postgres service 用戶名 |
| `POSTGRES_DB` | 否 | `blockchains` | postgres service 資料庫名 |
| `POSTGRES_PASSWORD` | 是 | — | 必填（compose 啟動時缺少即報錯）|

---

## 13. 開發者快速上手

### 本地開發

```bash
# 1. 安裝依賴
pnpm install

# 2. 設定環境變數
cp apps/server/.env.example apps/server/.env
# 編輯 apps/server/.env，填入 DATABASE_URL 和 JWT_SECRET

# 3. 初始化資料庫
pnpm --filter @bg/server exec prisma migrate dev

# 4. 啟動開發伺服器（全部）
pnpm dev
# 後端: http://localhost:3000
# 玩家前端: http://localhost:5173
# 代理後台: http://localhost:5174

# 5. 跑測試（PF 演算法）
pnpm test
```

### Docker 啟動（本地完整環境）

```bash
# 1. 設定 compose 環境變數
cp .env.example .env   # 或手動建立
# 編輯 .env，填入 POSTGRES_PASSWORD、JWT_SECRET、SUPER_ADMIN_PASSWORD

# 2. 啟動所有服務
docker compose up --build -d

# 3. 確認服務健康
curl http://localhost:3001/api/health   # {"ok":true}
# 玩家前端: http://localhost:8080
# 代理後台: http://localhost:8081

# 4. 停止並清理
docker compose down -v
```

### 常用指令

```bash
pnpm dev                                      # 啟動全部開發伺服器
pnpm build                                    # 全專案 build
pnpm typecheck                                # 全專案 TS 型別檢查
pnpm lint                                     # 全專案 lint
pnpm test                                     # 全專案測試
pnpm --filter @bg/server exec prisma studio   # 瀏覽資料庫
pnpm --filter @bg/server db:seed:agent        # 建立 Super Admin（初次部署）
pnpm --filter @bg/provably-fair test          # 跑 PF 演算法測試向量
docker compose logs -f server                 # 查看 server 即時 logs
```
```

### 驗證指令

```bash
# 確認檔案存在
ls ARCHITECTURE.md

# 確認 markdown 格式無明顯問題（行數統計）
wc -l ARCHITECTURE.md

# 確認所有 ## 章節都有（應有 13 個）
grep "^## " ARCHITECTURE.md | wc -l
# 預期輸出: 13
```

### Commit 訊息

```
docs: add formal ARCHITECTURE.md with 13-section technical reference
```

---

## Task 8 — README.md / QUICKSTART.md 更新（加 Docker 啟動章節）

### 目的
在現有 `QUICKSTART.md` 中加入「Docker 啟動」章節，讓使用者可以用一行 `docker compose up --build` 啟動整個平台，不需要手動設定 Node/pnpm 環境。

### 修改位置

`/Users/justin/blockchain-game/QUICKSTART.md`：在「第三步：安裝相依」**之前**插入新的「Docker 快速啟動」章節。

### 插入的完整新章節

```markdown
---

## Docker 快速啟動（推薦用於本地完整測試）

如果你想要跑完整的 postgres + server + web + admin 環境，不需要手動安裝 Node/pnpm：

### 前置條件

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安裝並啟動

### 步驟

**1. 建立根目錄 `.env`**

```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=bgpassword_local
JWT_SECRET=請用-openssl-rand-hex-32-產生並貼在這裡
SUPER_ADMIN_PASSWORD=SuperAdmin@123
EOF
```

> ⚠️ `JWT_SECRET` 請用 `openssl rand -hex 32` 產生真實的 64 字元 hex 字串

**2. 啟動所有服務**

```bash
docker compose up --build -d
```

首次執行約需 3-5 分鐘（下載 image + 編譯）。

**3. 確認服務啟動**

```bash
# 查看服務狀態（所有應顯示 Up）
docker compose ps

# 確認 server 健康
curl http://localhost:3001/api/health
# 預期: {"ok":true,"env":"production"}
```

**4. 開啟瀏覽器**

- 玩家前端：http://localhost:8080
- 代理後台：http://localhost:8081

**5. 停止環境**

```bash
# 停止並保留資料庫資料
docker compose down

# 停止並清除所有資料（含資料庫 volume）
docker compose down -v
```

---
```

### 驗證指令

```bash
# 確認 QUICKSTART.md 包含 Docker 章節
grep -n "Docker" QUICKSTART.md | head -10

# 確認章節內容存在
grep "docker compose up" QUICKSTART.md
```

### Commit 訊息

```
docs(quickstart): add Docker quick-start section
```

---

## Task 9 — 最終驗證 + ship commit

### 目的
執行完整的端對端驗證，確認所有 task 產出物可正常工作，然後做最終 ship commit。

### 驗證 checklist

#### 9.1 靜態驗證（不需 Docker）

```bash
# 確認所有新增檔案存在
ls .dockerignore && echo "OK: .dockerignore"
ls apps/server/Dockerfile && echo "OK: server Dockerfile"
ls apps/web/Dockerfile && echo "OK: web Dockerfile"
ls apps/web/nginx.conf && echo "OK: web nginx.conf"
ls apps/admin/Dockerfile && echo "OK: admin Dockerfile"
ls apps/admin/nginx.conf && echo "OK: admin nginx.conf"
ls docker-compose.yml && echo "OK: docker-compose.yml"
ls .github/workflows/ci.yml && echo "OK: ci.yml"
ls ARCHITECTURE.md && echo "OK: ARCHITECTURE.md"

# 確認 ARCHITECTURE.md 有 13 個章節
SECTION_COUNT=$(grep "^## " ARCHITECTURE.md | wc -l)
echo "ARCHITECTURE.md sections: $SECTION_COUNT (expected: 13)"

# 確認 CI YAML 格式正確
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('CI YAML valid')"

# 確認 docker-compose.yml YAML 格式正確
python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml')); print('compose YAML valid')"

# 確認 .dockerignore 包含關鍵規則
grep -q "node_modules" .dockerignore && echo "OK: node_modules excluded"
grep -q "\.env" .dockerignore && echo "OK: .env excluded"
grep -q "\.git" .dockerignore && echo "OK: .git excluded"
```

#### 9.2 本地 CI 步驟驗證

```bash
# 模擬 CI pipeline（應全部通過）
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
echo "All CI steps passed"
```

#### 9.3 Docker build 驗證（個別）

```bash
# Server（最複雜，先單獨驗證）
docker build -f apps/server/Dockerfile -t bg-server:final . && \
  echo "OK: server build"

# Web
docker build -f apps/web/Dockerfile -t bg-web:final . && \
  echo "OK: web build"

# Admin
docker build -f apps/admin/Dockerfile -t bg-admin:final . && \
  echo "OK: admin build"
```

#### 9.4 Docker Compose 整合驗證

```bash
# 確認 .env 存在（Task 5 應已建立）
ls .env || (echo "ERROR: .env missing, run Task 5 setup first" && exit 1)

# 啟動
docker compose up --build -d

# 等待服務健康
echo "Waiting 60s for all services to be healthy..."
sleep 60

# 驗證所有服務
docker compose ps

# Server health
HEALTH=$(curl -s http://localhost:3001/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'fail')")
echo "Server health: $HEALTH"

# Web 200
WEB_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/)
echo "Web status: $WEB_STATUS (expected: 200)"

# Admin 200
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/)
echo "Admin status: $ADMIN_STATUS (expected: 200)"

# Web SPA fallback
SPA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/games/dice)
echo "Web SPA fallback: $SPA_STATUS (expected: 200)"

# Admin SPA fallback
ASPA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8081/agents/login)
echo "Admin SPA fallback: $ASPA_STATUS (expected: 200)"

# 清理
docker compose down -v
echo "Compose down complete"
```

#### 9.5 Git 狀態確認

```bash
git status
git diff --stat HEAD

# 確認新增的檔案都有被 track
git status --porcelain | grep "^??" | head -20
```

### 最終 Commit 訊息

```
chore(devops): complete docker + ci + architecture docs implementation

- Three-stage Dockerfile for server (deps/builder/runner, node:20-alpine)
- Two-stage Dockerfile for web and admin (builder/nginx:1.27-alpine)
- SPA nginx.conf for web and admin with 1y cache headers
- Root .dockerignore excluding node_modules, dist, .env, .git, docs
- Root docker-compose.yml: postgres/server/web/admin, dual network isolation
- GitHub Actions CI: typecheck/lint/test/build on push+PR to main
- ARCHITECTURE.md: 13-section formal technical reference
- QUICKSTART.md: Docker quick-start section
```

---

## 附錄 A：檔案清單

| 路徑 | Task | 動作 |
|------|------|------|
| `.dockerignore` | 1 | 新增 |
| `apps/server/Dockerfile` | 2 | 新增 |
| `apps/web/Dockerfile` | 3 | 新增 |
| `apps/web/nginx.conf` | 3 | 新增 |
| `apps/admin/Dockerfile` | 4 | 新增 |
| `apps/admin/nginx.conf` | 4 | 新增 |
| `docker-compose.yml` | 5 | 新增 |
| `.github/workflows/ci.yml` | 6 | 新增 |
| `ARCHITECTURE.md` | 7 | 新增 |
| `QUICKSTART.md` | 8 | 修改（插入 Docker 章節）|

共 9 個新增檔案，1 個修改檔案。

---

## 附錄 B：常見問題排解

### Prisma native binary 找不到（runner stage）

**症狀**：`docker run bg-server node dist/index.js` 報 `PrismaClientInitializationError: query engine binary not found`

**原因**：`COPY --from=builder /app/node_modules/.pnpm/ node_modules/.pnpm/` 這行沒有複製完整的 .pnpm store，或 runner stage 的 `pnpm install --prod` 覆蓋了某些 symlink。

**解法**：確認 Dockerfile runner stage 的 COPY 順序：先 `pnpm install --prod`，再 `COPY --from=builder /app/node_modules/.pnpm/ node_modules/.pnpm/`，讓 builder 的 binary 覆蓋 runner 安裝的版本。

### docker compose up 時 server 一直重啟

**症狀**：`docker compose ps` 顯示 server 狀態是 `Restarting`

**原因**：通常是 `DATABASE_URL` 格式錯誤，或 postgres healthcheck 尚未通過（DB 還在初始化），或 `JWT_SECRET` 太短（< 32 字元）。

**解法**：
```bash
# 查看 server 啟動 log
docker compose logs server | tail -30

# 確認 .env 的環境變數格式
grep -E "DATABASE_URL|JWT_SECRET" .env
```

### vite build 找不到 VITE_API_BASE

**症狀**：前端開啟後 API 呼叫到錯誤的 URL（如 `undefined/api/...`）

**原因**：`docker compose build` 時沒有傳入 `VITE_API_BASE` build arg，Vite 嵌入了空值。

**解法**：確認 `.env` 有設定 `VITE_API_BASE`，或在 `docker compose up --build` 前 export：
```bash
export VITE_API_BASE=http://localhost:3001
docker compose up --build -d
```

### CI 在 `pnpm build` 失敗（prisma generate 找不到 schema）

**症狀**：GitHub Actions CI 在 build step 報 `Error: Could not find a schema.prisma file`

**原因**：CI 執行 `pnpm --filter @bg/server run build`（含 `prisma generate`），Prisma 會在 `apps/server/prisma/schema.prisma` 找 schema，通常是因為工作目錄不對。

**解法**：這是已知問題，Prisma 需要從 server 目錄或使用 `--schema` flag。確認 `apps/server/package.json` 的 build script 是 `prisma generate && tsc`（Prisma 會自動找相對路徑的 schema）。
