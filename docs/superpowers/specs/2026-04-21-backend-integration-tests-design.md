# Backend Integration Tests — Design Spec

**Date:** 2026-04-21  
**Status:** Draft  
**Scope:** `apps/server` — Supertest + Vitest integration tests  
**Out of scope:** E2E browser tests, frontend unit tests, CI pipeline

---

## 1. 現況盤點

### 1.1 模組清單

```
apps/server/src/modules/
├── auth/          auth.routes.ts, auth.service.ts, auth.schema.ts, player-seeds.ts
├── wallet/        wallet.routes.ts
├── provably-fair/ pf.routes.ts
├── games/
│   ├── _common/   BaseGameService.ts, controls.ts
│   ├── dice/      POST /api/games/dice/bet
│   ├── mines/     POST /api/games/mines/start|reveal|cashout  GET /active
│   ├── hilo/      POST /api/games/hilo/start|guess|skip|cashout  GET /active
│   ├── keno/      POST /api/games/keno/bet
│   ├── wheel/     POST /api/games/wheel/bet
│   ├── plinko/    POST /api/games/plinko/bet
│   ├── roulette/  POST /api/games/mini-roulette/bet  POST /api/games/carnival/bet
│   ├── hotline/   POST /api/games/hotline/bet
│   └── tower/     POST /api/games/tower/start|pick|cashout  GET /active
└── admin/
    ├── auth/      POST /api/admin/auth/login|refresh|logout  GET /me
    ├── agents/    CRUD /api/admin/agents/*
    ├── members/   CRUD /api/admin/members/*
    ├── transfers/ POST /api/admin/transfers/agent-to-agent|agent-to-member|cs-agent|cs-member
    ├── controls/  CRUD /api/admin/controls/win-loss|win-cap|deposit|agent-line
    ├── hierarchy/ GET /api/admin/hierarchy/*
    ├── reports/   GET /api/admin/reports/*
    └── audit/     GET /api/admin/audit/*
```

### 1.2 已注意到的特殊點

- `POST /api/auth/register` 回 404（已關閉，只允許由代理後台建立會員）
- `applyControls()` 目前只有 Dice 遊戲呼叫，其他遊戲（Hotline、Mines 等）尚未接入 — **測試需反映此差異**
- Mines / Hi-Lo / Tower 為多步驟 round 模式，需跨請求測試 session 狀態
- Crash 遊戲（Rocket、Aviator 等）走 Socket.IO，不在本 spec 範圍

---

## 2. 測試策略決策

### 2.1 資料庫：dedicated test PostgreSQL（不用 SQLite）

**決策：使用真實 PostgreSQL，透過 `.env.test` 注入 `DATABASE_URL`**

理由：
- Prisma `Decimal(20,2)` 欄位在 SQLite 下失去精度語意
- `Serializable` 隔離等級是 PG 特性，SQLite 不支援
- `FOR UPDATE` 行鎖測試需要真實 PG

排除 Testcontainers（在 CI 導入前不強制 Docker-in-Docker）。本 spec 假設開發者本機 / CI runner 已有 PG，透過 `.env.test` 提供 `DATABASE_URL`。

**`.env.test` 範例（不進 git）：**
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bgame_test
JWT_SECRET=test-secret-32-chars-minimum-here
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
NODE_ENV=test
```

`.env.test.example` 只記錄變數名，無實值（進 git）。

### 2.2 Migrate 策略

在 vitest `globalSetup` 執行一次 `prisma migrate deploy`，測試開始前確保 schema 最新：

```ts
// apps/server/src/testUtils/globalSetup.ts
import { execSync } from 'node:child_process';

export async function setup(): Promise<void> {
  execSync('pnpm prisma migrate deploy', {
    cwd: new URL('../../..', import.meta.url).pathname,
    env: { ...process.env },
    stdio: 'inherit',
  });
}
```

### 2.3 隔離策略：transaction rollback per test

每個測試用 Prisma transaction 包裹，測試結束 rollback — 避免 truncate 造成 schema 殘留狀態問題。

實作細節：`createTestApp()` 回傳的 `prisma` 是可注入的，`afterEach` 執行 rollback helper。

若 rollback 在 concurrency 測試（需要平行 TX）下不適用，則改用 `DELETE FROM "Bet"...` truncate 特定表。

---

## 3. 測試輔助模組（`testUtils/`）

```
apps/server/src/testUtils/
├── createTestApp.ts    — buildServer() + inject TEST_DATABASE_URL
├── factories.ts        — createTestUser, createTestAgent, loginAs, loginAsAdmin
├── globalSetup.ts      — prisma migrate deploy
└── vitest.config.ts    — (或直接在根 vitest.config.ts 加 globalSetup)
```

### 3.1 `createTestApp.ts`

```ts
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';

let _app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (_app) return _app;
  process.env.NODE_ENV = 'test';
  _app = await buildServer();
  await _app.ready();
  return _app;
}

export async function closeTestApp(): Promise<void> {
  await _app?.close();
  _app = null;
}
```

呼叫 `buildServer()` 時 `config.ts` 已讀 `NODE_ENV=test`，Fastify logger 自動切到 `warn` 等級（已在 `server.ts` 實作）。

### 3.2 `factories.ts`

```ts
// 建一個玩家，直接寫 DB（跳過已關閉的 /register）
export async function createTestUser(
  prisma: PrismaClient,
  opts?: { balance?: number; username?: string }
): Promise<{ userId: string; username: string; password: string }>;

// 取得 Bearer token（呼叫 POST /api/auth/login）
export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string
): Promise<string>;  // returns accessToken

// 建一個 SUPER_ADMIN agent（直接寫 DB）
export async function createTestSuperAdmin(
  prisma: PrismaClient
): Promise<{ agentId: string; username: string; password: string }>;

// 取得 admin Bearer token
export async function loginAsAdmin(
  app: FastifyInstance,
  username: string,
  password: string
): Promise<string>;
```

`createTestUser` 直接用 `prisma.user.create` + `bcrypt.hash`，設定 initialBalance，並建立 `clientSeed` + `serverSeed`（參照 `prisma/seed.ts` 模式），不透過 HTTP。

---

## 4. vitest config

```ts
// apps/server/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./src/testUtils/globalSetup.ts'],
    setupFiles: ['./src/testUtils/setup.ts'],  // dotenv .env.test
    pool: 'forks',           // 避免 ESM + 共享 prisma connection 問題
    poolOptions: { forks: { singleFork: true } },  // 序列化測試，避免 DB race
    testTimeout: 30_000,
  },
});
```

`setup.ts` 用 `dotenv.config({ path: '.env.test' })` 載入 test DB URL。

---

## 5. 測試檔放置策略

**決策：colocated `*.test.ts`，與 source 放同一目錄**

理由：改 routes 時立刻看到測試、PR diff 更集中。

```
apps/server/src/modules/
├── auth/auth.routes.test.ts
├── wallet/wallet.routes.test.ts
├── provably-fair/pf.routes.test.ts
└── games/
    ├── dice/dice.routes.test.ts
    ├── mines/mines.routes.test.ts
    ├── hilo/hilo.routes.test.ts
    ├── keno/keno.routes.test.ts
    ├── wheel/wheel.routes.test.ts
    ├── plinko/plinko.routes.test.ts
    ├── roulette/roulette.routes.test.ts
    ├── hotline/hotline.routes.test.ts
    └── tower/tower.routes.test.ts
```

Admin 測試集中在：
```
apps/server/src/modules/admin/
├── auth/adminAuth.routes.test.ts
├── members/member.routes.test.ts
├── transfers/transfer.routes.test.ts
└── controls/controls.routes.test.ts
```

Concurrency 測試（跨 service）放在：
```
apps/server/src/__tests__/concurrency.test.ts
```

---

## 6. 必測 Endpoint 清單與優先級

### P0：必測（阻塞釋出）

#### 6.1 Auth — `auth/auth.routes.test.ts`

| # | Method | Path | 測試案例 | 關鍵斷言 |
|---|--------|------|---------|---------|
| 1 | POST | `/api/auth/register` | 任意 body | 回 `404` + `REGISTRATION_CLOSED` |
| 2 | POST | `/api/auth/login` | 正確帳密 | 200, `accessToken`/`refreshToken` 非空, `user.balance` 是 string 且可 parseFloat |
| 3 | POST | `/api/auth/login` | 錯誤密碼 | 401 + `INVALID_CREDENTIALS` |
| 4 | POST | `/api/auth/login` | 不存在用戶 | 401 + `INVALID_CREDENTIALS` |
| 5 | POST | `/api/auth/refresh` | 有效 refreshToken | 200, 新 `accessToken` 不同於舊 |
| 6 | POST | `/api/auth/refresh` | 已使用 refreshToken（replay） | 401 |
| 7 | POST | `/api/auth/logout` | 有效 refreshToken | 204 |
| 8 | POST | `/api/auth/logout` | 登出後 refresh | 401 |
| 9 | GET  | `/api/auth/me` | 有效 token | 200, `id`/`username` 存在 |
| 10 | GET | `/api/auth/me` | 無 token | 401 |

#### 6.2 Wallet — `wallet/wallet.routes.test.ts`

| # | Path | 測試案例 | 關鍵斷言 |
|---|------|---------|---------|
| 1 | GET `/api/wallet/balance` | 登入用戶 | 200, `balance` 符合 DB 值，toFixed(2) 格式 |
| 2 | GET `/api/wallet/balance` | 無 token | 401 |
| 3 | GET `/api/wallet/transactions` | 初始用戶（有 SIGNUP_BONUS） | 200, `items` 陣列非空, 每項有 `id/type/amount/balanceAfter/createdAt` |
| 4 | GET `/api/wallet/transactions?limit=2` | 超過 2 筆交易 | 200, `items.length === 2`, `nextCursor` 非 null |
| 5 | GET `/api/wallet/transactions?cursor=X` | cursor 分頁 | 200, 不重複前一頁資料 |

#### 6.3 Dice 完整 bet flow — `games/dice/dice.routes.test.ts`

| # | 測試案例 | 關鍵斷言 |
|---|---------|---------|
| 1 | 正常下注（amount=10, target=50, direction=under） | 200, `betId` 存在, `roll` in [0,99.99], `amount=="10.00"`, `newBalance` 精確 = 初始 balance ± 金額 |
| 2 | 下注後 `GET /api/wallet/balance` | balance 對帳：贏 = initial + payout - amount；輸 = initial - amount |
| 3 | 下注後 `GET /api/wallet/transactions` | 有 `BET_PLACE` tx，贏局有 `BET_WIN` tx |
| 4 | `amount = 0` | 400 + `INVALID_BET` |
| 5 | `amount = -1` | 400 |
| 6 | `amount > MAX_SINGLE_BET` | 400 + `BET_OUT_OF_RANGE` |
| 7 | balance 不足 | 400 + `INSUFFICIENT_FUNDS` |
| 8 | 無 token | 401 |
| 9 | `target` 超出範圍 | 400 |
| 10 | 帶 `clientSeed` | 200, response 中 `clientSeed` 與送出一致 |
| 11 | 前端送 `won=true/payout=99999`（惡意欄位） | 後端仍按真實計算，惡意欄位不影響結果 |

#### 6.4 Concurrency 防 double-spend — `__tests__/concurrency.test.ts`

測試情境：同一個 user balance=50，同時發出 2 個各 amount=40 的 bet，預期只有 1 個成功（另一個 `INSUFFICIENT_FUNDS`）。

```
createTestUser({ balance: 50 })
並發 Promise.all([
  POST /api/games/dice/bet { amount: 40, target: 50, direction: 'under' },
  POST /api/games/dice/bet { amount: 40, target: 50, direction: 'under' },
])
斷言:
  - 其中一個 200，另一個 400 INSUFFICIENT_FUNDS
  - 最終 GET /api/wallet/balance <= 50（不會超扣）
  - DB: Transaction 表中 BET_PLACE 記錄只有 1 筆
```

此測試驗證 `runSerializable` + `Serializable` 隔離的核心契約。

---

### P1：應測（Sprint 1 後補齊）

#### 6.5 Mines flow — `games/mines/mines.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST /start → `roundId` 存在, status=ACTIVE, `minePositions` 不在回應中 |
| 2 | POST /reveal（安全格）→ hitMine=false, `currentMultiplier` 上升 |
| 3 | POST /reveal（踩雷）→ hitMine=true, status=BUSTED, `minePositions` 回應中揭露, balance扣款 |
| 4 | POST /cashout（至少 reveal 1 格）→ status=CASHED_OUT, balance 增加 payout |
| 5 | POST /cashout（未 reveal）→ 400 INVALID_ACTION |
| 6 | GET /active（有進行中 round）→ 正確 state |
| 7 | POST /start（已有 active round）→ 400 INVALID_ACTION |
| 8 | balance 對帳：cashout 後 balance = initial - amount + payout |

#### 6.6 Hi-Lo flow — `games/hilo/hilo.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST /start → roundId, currentCard 存在 |
| 2 | POST /guess higher|lower → multiplier 更新 |
| 3 | 猜錯 → bust，balance 扣款 |
| 4 | POST /skip → 跳過當前 card |
| 5 | POST /cashout → balance 增加 payout |
| 6 | GET /active → 回傳進行中狀態 |

#### 6.7 Tower flow — `games/tower/tower.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST /start { amount, difficulty } → roundId, 初始 state |
| 2 | POST /pick { roundId, col } 正確格 → 升一層 |
| 3 | POST /pick 踩炸彈 → bust |
| 4 | POST /cashout → payout 正確 |
| 5 | GET /active → 回傳進行中狀態 |

#### 6.8 單步驟遊戲 — 各自 `*.routes.test.ts`

對 Keno / Wheel / Plinko / Roulette / Hotline，每款各需：

| # | 測試案例 |
|---|---------|
| 1 | 正常下注 → 200, betId 存在, balance 對帳正確 |
| 2 | 無 token → 401 |
| 3 | 無效 body（缺必填欄位）→ 400 |

Keno 額外：`selected` 陣列超過 KENO_MAX_PICKS → 400。  
Wheel 額外：`segments` 不在 `[10,20,30,40,50]` → 400。  
Roulette 額外：`bets` 陣列長度超過 10 → 400；測試 `carnival` + `mini-roulette` 兩個 endpoint。

**P1 估計：10-12 個 task（每款遊戲 1 task，controls 2 task）**

#### 6.9 Controls — `admin/controls/controls.routes.test.ts`

測試目標：驗證 `applyControls()` 在 Dice 遊戲的實際效果（目前唯一接入 controls 的遊戲）。

| # | 情境 | 斷言 |
|---|------|------|
| 1 | 建立 WinLossControl（lossControl=true, controlPercentage=100） → POST dice/bet | 多次下注均輸，balance 持續減少 |
| 2 | 建立 WinCapControl（winCapAmount=50）, user 已贏 50 → POST dice/bet | 後續贏局被翻轉為輸 |
| 3 | 建立 MemberDepositControl（controlWinRate=0）→ POST dice/bet | 不會贏 |
| 4 | 翻轉發生時 → WinLossControlLogs 有對應記錄（`controlId`, `flipReason`, `originalResult`, `finalResult`） |
| 5 | 非 super-admin 嘗試 POST /api/admin/controls/win-loss → 403 |
| 6 | toggle → isActive 更新 |
| 7 | DELETE → 204 |

注意：controls 涉及隨機，`controlPercentage=100` 或 `0` 才能確定性測試。

#### 6.10 Admin Auth — `admin/auth/adminAuth.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST /api/admin/auth/login（正確帳密）→ 200, `accessToken` 包含 `aud: 'admin'` |
| 2 | POST /api/admin/auth/login（錯誤密碼）→ 401 |
| 3 | POST /api/admin/auth/refresh → 200 |
| 4 | GET /api/admin/auth/me（有效 token）→ 200 |
| 5 | GET /api/admin/auth/me（player token，無 admin aud）→ 401 |

#### 6.11 Member CRUD（代理後台）— `admin/members/member.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST / 建立會員 → 201, `id/username/balance` 存在 |
| 2 | POST / 重複 username → 409 USERNAME_TAKEN |
| 3 | GET /:id → 200 |
| 4 | PATCH /:id/status { status: 'FROZEN' } → 200, 該用戶登入受限 |
| 5 | POST /:id/adjust-balance → balance 變更 |
| 6 | GET /:id/bets → 分頁陣列 |

#### 6.12 Transfers — `admin/transfers/transfer.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST /agent-to-member → agent balance 扣, member balance 加 |
| 2 | POST /cs-member（super-admin）→ 成功 |
| 3 | POST /cs-member（non super-admin）→ 403 |
| 4 | 轉帳金額超過 agent balance → 400 INSUFFICIENT_FUNDS |

**P1 controls + admin 估計：6-8 個 task**

---

### P2：nice-to-have（後續 Sprint）

#### 6.13 PF Seed Rotate — `provably-fair/pf.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | GET /api/pf/active → seeds 陣列 |
| 2 | POST /api/pf/rotate { gameCategory: 'dice' } → `revealedServerSeed` + `newSeedHash` 存在 |
| 3 | POST /api/pf/rotate 無 active seed → 400 SEED_NOT_REVEALED |
| 4 | POST /api/pf/client-seed → 204 |
| 5 | 輪換後下注 → nonce 從 1 開始 |

#### 6.14 Rate Limit

| # | 測試案例 |
|---|---------|
| 1 | 連發 601 次 `GET /api/health`（同 IP）→ 第 601 次回 429 |

注意：rate limit 上限是 600/min，此測試較慢，標記 `test.skip` 預設跳過，CI 可選擇性執行。

#### 6.15 Agent CRUD — `admin/agents/agent.routes.test.ts`

| # | 測試案例 |
|---|---------|
| 1 | POST /api/admin/agents → 201 |
| 2 | GET /api/admin/agents/:id → 200 |
| 3 | 下層代理嘗試操作上層 → 403 FORBIDDEN |

**P2 估計：5-6 個 task**

---

## 7. DB Teardown 策略

每個 test file 的 `afterEach`：

```ts
afterEach(async () => {
  const prisma = getTestPrisma();
  // 刪除本次測試建立的資料（按外鍵順序）
  await prisma.winLossControlLogs.deleteMany();
  await prisma.winLossControl.deleteMany();
  await prisma.memberWinCapControl.deleteMany();
  await prisma.memberDepositControl.deleteMany();
  await prisma.agentLineWinCap.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.minesRound.deleteMany();
  await prisma.hiLoRound.deleteMany();
  await prisma.towerRound.deleteMany();
  await prisma.clientSeed.deleteMany();
  await prisma.serverSeed.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.agentRefreshToken.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.agentTransaction.deleteMany();
  await prisma.user.deleteMany();
  await prisma.agent.deleteMany();
});
```

此方式比 transaction rollback 更適合 concurrency 測試（需要平行提交的 TX）。

---

## 8. 受影響的新增檔案

```
apps/server/
├── .env.test.example                                    (新增, 進 git)
├── vitest.config.ts                                     (新增或修改)
├── src/
│   └── testUtils/
│       ├── globalSetup.ts                               (新增)
│       ├── setup.ts                                     (新增, dotenv)
│       ├── createTestApp.ts                             (新增)
│       └── factories.ts                                 (新增)
│   └── __tests__/
│       └── concurrency.test.ts                          (新增, P0)
│   └── modules/
│       ├── auth/auth.routes.test.ts                     (新增, P0)
│       ├── wallet/wallet.routes.test.ts                 (新增, P0)
│       ├── games/dice/dice.routes.test.ts               (新增, P0)
│       ├── games/mines/mines.routes.test.ts             (新增, P1)
│       ├── games/hilo/hilo.routes.test.ts               (新增, P1)
│       ├── games/tower/tower.routes.test.ts             (新增, P1)
│       ├── games/keno/keno.routes.test.ts               (新增, P1)
│       ├── games/wheel/wheel.routes.test.ts             (新增, P1)
│       ├── games/plinko/plinko.routes.test.ts           (新增, P1)
│       ├── games/roulette/roulette.routes.test.ts       (新增, P1)
│       ├── games/hotline/hotline.routes.test.ts         (新增, P1)
│       ├── admin/auth/adminAuth.routes.test.ts          (新增, P1)
│       ├── admin/controls/controls.routes.test.ts       (新增, P1)
│       ├── admin/members/member.routes.test.ts          (新增, P1)
│       ├── admin/transfers/transfer.routes.test.ts      (新增, P1)
│       ├── provably-fair/pf.routes.test.ts              (新增, P2)
│       └── admin/agents/agent.routes.test.ts            (新增, P2)
```

**不修改任何現有 source 檔案**（`buildServer()` 已有 `NODE_ENV=test` 靜音 logger 的設定）。

---

## 9. 工作量估計

| 優先級 | 內容 | 估計 Tasks |
|-------|------|-----------|
| P0 | testUtils 基建（4 個 helper 檔 + vitest config） | 2 tasks |
| P0 | Auth 測試（10 個 case） | 1 task |
| P0 | Wallet 測試（5 個 case） | 1 task |
| P0 | Dice 完整 flow（11 個 case） | 1 task |
| P0 | Concurrency 防 double-spend | 1 task |
| **P0 小計** | | **6 tasks** |
| P1 | Mines flow（8 個 case） | 1 task |
| P1 | Hi-Lo flow（6 個 case） | 1 task |
| P1 | Tower flow（5 個 case） | 1 task |
| P1 | Keno + Wheel + Plinko（各 3-4 case） | 1 task |
| P1 | Roulette + Hotline（各 3 case） | 1 task |
| P1 | Controls（7 個 case） | 2 tasks |
| P1 | Admin Auth（5 個 case） | 1 task |
| P1 | Member CRUD（6 個 case） | 1 task |
| P1 | Transfers（4 個 case） | 1 task |
| **P1 小計** | | **10 tasks** |
| P2 | PF Seed rotate（5 個 case） | 1 task |
| P2 | Rate limit | 1 task |
| P2 | Agent CRUD（3 個 case） | 1 task |
| **P2 小計** | | **3 tasks** |
| **總計** | | **~19 tasks** |

---

## 10. 執行指令

```bash
# 跑全部 server 測試
cd apps/server && pnpm test

# watch mode
cd apps/server && pnpm test:watch

# 只跑 P0（tag filter 需 vitest --reporter verbose）
cd apps/server && pnpm test src/modules/auth src/modules/wallet src/modules/games/dice src/__tests__

# 從 monorepo root
pnpm --filter @bg/server test
```

---

## 11. 重要設計決策紀錄（ADR）

**ADR-1：不用 SQLite**  
Decimal 精度 + Serializable 隔離 + `FOR UPDATE` 行鎖是本平台的核心保障，任何不支援這些特性的 DB 替代都會讓測試失去意義。

**ADR-2：colocated test files vs. `__tests__/` 資料夾**  
選擇 colocated，跨 service 的測試（concurrency）放 `__tests__/`。理由：routes 和 tests 要一起移動、一起 review。

**ADR-3：deleteMany teardown vs. transaction rollback**  
選擇 deleteMany，因為 concurrency 測試需要多個平行 Serializable TX 真實提交，transaction rollback 無法涵蓋此場景。deleteMany 在 `afterEach` 按外鍵順序清除，略慢但語意正確。

**ADR-4：controls 測試只覆蓋 Dice**  
`applyControls()` 目前只在 `dice.service.ts` 中呼叫（`grep -rn "applyControls" apps/server/src/modules/games/` 確認）。其他遊戲尚未接入，測試不應假設未存在的行為。待其他遊戲接入後再擴充。
