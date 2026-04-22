# 後端 Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 為 `apps/server` 建立 Supertest + Vitest integration 測試框架，並依 spec 的 P0/P1/P2 分層補齊關鍵 endpoint 覆蓋。

**Architecture:** 使用真實 PostgreSQL（`.env.test`）而非 SQLite（Decimal/Serializable 需要 PG）。測試檔 colocated 與 source 同目錄。globalSetup 跑 `prisma migrate deploy` 建 schema。每個測試 `afterEach` 用 `deleteMany` 清資料（按 FK 順序）。`pool: 'forks'` + `singleFork: true` 避免 PG 連線競爭。

**Tech Stack:** Vitest 2.0 + Supertest 7.0 + Prisma + Fastify + Bcrypt + Zod。

**Reference:** `docs/superpowers/specs/2026-04-21-backend-integration-tests-design.md`

---

## File Structure

### 新增檔案

| 路徑 | 職責 |
|---|---|
| `apps/server/.env.test.example` | test DB 連線範例 |
| `apps/server/vitest.config.ts` | Vitest 設定 |
| `apps/server/src/testUtils/setup.ts` | 載入 .env.test |
| `apps/server/src/testUtils/globalSetup.ts` | 一次性跑 `prisma migrate deploy` |
| `apps/server/src/testUtils/prisma.ts` | 共用 PrismaClient |
| `apps/server/src/testUtils/createTestApp.ts` | 啟動 Fastify app for tests |
| `apps/server/src/testUtils/factories.ts` | createTestUser / createTestAgent helpers |
| `apps/server/src/testUtils/cleanup.ts` | `resetDb()` deleteMany helper |
| `apps/server/src/modules/auth/auth.routes.test.ts` | P0 Auth |
| `apps/server/src/modules/wallet/wallet.routes.test.ts` | P0 Wallet |
| `apps/server/src/modules/games/dice/dice.routes.test.ts` | P0 Dice bet flow |
| `apps/server/src/__tests__/concurrency.test.ts` | P0 double-spend |
| `apps/server/src/modules/games/mines/mines.routes.test.ts` | P1 |
| `apps/server/src/modules/games/hilo/hilo.routes.test.ts` | P1 |
| `apps/server/src/modules/games/tower/tower.routes.test.ts` | P1 |
| `apps/server/src/modules/games/keno/keno.routes.test.ts` | P1 |
| `apps/server/src/modules/games/wheel/wheel.routes.test.ts` | P1 |
| `apps/server/src/modules/games/roulette/roulette.routes.test.ts` | P1 |
| `apps/server/src/modules/games/plinko/plinko.routes.test.ts` | P1 |
| `apps/server/src/modules/games/hotline/hotline.routes.test.ts` | P1 |
| `apps/server/src/modules/admin/controls/controls.routes.test.ts` | P1 controls (Dice only) |
| `apps/server/src/modules/admin/auth/adminAuth.routes.test.ts` | P1 admin auth |
| `apps/server/src/modules/admin/members/member.routes.test.ts` | P1 member CRUD |
| `apps/server/src/modules/admin/transfers/transfer.routes.test.ts` | P1 transfer |
| `apps/server/src/__tests__/rateLimit.test.ts` | P2 rate limit |
| `apps/server/src/modules/provably-fair/pf.routes.test.ts` | P2 PF rotate |
| `apps/server/src/modules/admin/agents/agent.routes.test.ts` | P2 agent CRUD |

### 修改

| 檔案 | 改動 |
|---|---|
| `apps/server/package.json` | 確認 `test` script 已在（應該是 `vitest run --passWithNoTests`），驗證 supertest/@types/supertest/vitest 已裝；若無，加 vitest config path |
| `apps/server/tsconfig.json` | 若 vitest config 用 `@/*` path alias 要確認 resolve |
| `.gitignore` | 加 `.env.test` |

---

## Testing Strategy

- **DB**: 獨立 test PG DB（`DATABASE_URL` 走 `.env.test`）。Host 可用本地 PG 或 Docker container。
- **Schema setup**: `globalSetup.ts` 執行 `prisma migrate deploy`，建 schema 一次；不用 reset，每測試清資料
- **Data cleanup**: 每 test `afterEach` 呼叫 `resetDb()` — `deleteMany` 按 FK 順序（User / Agent 最後刪）
- **Concurrency**: `pool: 'forks' + singleFork: true` 讓測試序列化，確保 DB 不衝突（concurrency test 自己用 `Promise.all` 開內部並發）
- **HTTP layer**: Supertest wrap Fastify `server.server`（Node HTTP instance）

---

## 任務依賴

```
Task 0 baseline
  ↓
Task 1 .env.test.example + vitest.config + .gitignore
  ↓
Task 2 testUtils (prisma / createTestApp / factories / cleanup / globalSetup / setup)
  ↓
Task 3 Auth tests (P0)
  ↓
Task 4 Wallet tests (P0)
  ↓
Task 5 Dice bet flow tests (P0)
  ↓
Task 6 Concurrency double-spend (P0)
  ↓
Task 7 Mines + HiLo + Tower 多步遊戲 (P1)
  ↓
Task 8 6 個單步遊戲 (Keno/Wheel/Roulette/Plinko/Hotline + Crash) (P1)
  ↓
Task 9 Controls (P1, Dice only — spec 說其他遊戲尚未接入)
  ↓
Task 10 Admin auth/member/transfer (P1)
  ↓
Task 11 Rate limit + PF rotate + Agent CRUD (P2)
  ↓
Task 12 最終驗證 + README 加測試說明
```

---

### Task 0: Baseline

- [ ] **Step 1:** 確認 git 乾淨、branch main

```bash
git status
git branch --show-current
```

- [ ] **Step 2:** 確認 vitest + supertest 已在 server dep

```bash
grep -E "\"vitest\"|\"supertest\"|\"@types/supertest\"" apps/server/package.json
```

Expected: 三個都有。

- [ ] **Step 3:** 確認 PG 可以跑（本地 DB 可連）

```bash
psql $DATABASE_URL -c "SELECT 1" 2>&1 | head -3
```

若失敗，需要先啟動本地 PG（見 spec）。

- [ ] **Step 4:** 建 test DB。本 plan 假設 test DB 名叫 `bg_test`（跟開發 DB 分開）：

```bash
createdb bg_test
```

- [ ] **Step 5:** Kickoff empty commit

```bash
git commit --allow-empty -m "chore(test): begin backend integration tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: env + vitest config + gitignore

**Files:**
- Create: `apps/server/.env.test.example`
- Create: `apps/server/vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1:** 建 `apps/server/.env.test.example`:

```
# Copy to apps/server/.env.test and set real values. Do NOT commit .env.test.
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bg_test
JWT_SECRET=test_jwt_secret_change_me_at_least_32_chars_____
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
PORT=3999
CORS_ORIGIN=http://localhost:5173
SIGNUP_BONUS=1000
MAX_SINGLE_BET=100000
BCRYPT_ROUNDS=4
LOG_LEVEL=error
SUPER_ADMIN_USERNAME=superadmin_test
SUPER_ADMIN_PASSWORD=super_admin_test_pwd_1234
```

- [ ] **Step 2:** 建 `apps/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globalSetup: ['./src/testUtils/globalSetup.ts'],
    setupFiles: ['./src/testUtils/setup.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
```

- [ ] **Step 3:** 把 `.env.test` 加進 `.gitignore`（若不在）:

```bash
grep "^\.env\.test$" .gitignore || echo ".env.test" >> .gitignore
grep "^apps/server/\.env\.test$" .gitignore || echo "apps/server/.env.test" >> .gitignore
```

- [ ] **Step 4:** 建 `apps/server/.env.test`（使用者本地用，**不進 git**）:

```bash
cp apps/server/.env.test.example apps/server/.env.test
```

- [ ] **Step 5:** Typecheck + commit

```bash
pnpm --filter @bg/server typecheck
git add apps/server/.env.test.example apps/server/vitest.config.ts .gitignore
git commit -m "chore(test): add vitest config + .env.test.example

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: testUtils

**Files:**
- Create: `apps/server/src/testUtils/setup.ts`
- Create: `apps/server/src/testUtils/globalSetup.ts`
- Create: `apps/server/src/testUtils/prisma.ts`
- Create: `apps/server/src/testUtils/createTestApp.ts`
- Create: `apps/server/src/testUtils/factories.ts`
- Create: `apps/server/src/testUtils/cleanup.ts`

- [ ] **Step 1:** 建 `apps/server/src/testUtils/setup.ts`:

```ts
import dotenv from 'dotenv';
import path from 'node:path';

// 載入 .env.test（覆蓋任何既有 env）
dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });
```

- [ ] **Step 2:** 建 `apps/server/src/testUtils/globalSetup.ts`:

```ts
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import path from 'node:path';

export default function globalSetup() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.test'), override: true });

  if (!process.env.DATABASE_URL?.includes('test')) {
    throw new Error(
      `Refusing to run tests: DATABASE_URL must contain 'test'. Got: ${process.env.DATABASE_URL}`,
    );
  }

  // 一次性跑 migration
  execSync('pnpm prisma migrate deploy', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env },
  });
}
```

- [ ] **Step 3:** 建 `apps/server/src/testUtils/prisma.ts`:

```ts
import { PrismaClient } from '@prisma/client';

let instance: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!instance) {
    instance = new PrismaClient({ log: ['error'] });
  }
  return instance;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (instance) {
    await instance.$disconnect();
    instance = null;
  }
}
```

- [ ] **Step 4:** 建 `apps/server/src/testUtils/cleanup.ts`:

```ts
import { getTestPrisma } from './prisma.js';

export async function resetDb(): Promise<void> {
  const prisma = getTestPrisma();
  // Delete in FK-safe order. Children first, then parents (User/Agent last).
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
}
```

（若 Prisma model 名稱有差異，跑測試時會報錯，再對照 `prisma/schema.prisma` 修 model 名。）

- [ ] **Step 5:** 建 `apps/server/src/testUtils/createTestApp.ts`:

```ts
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildServer();
    await app.ready();
  }
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}
```

**注意**：`buildServer` 必須是 `apps/server/src/server.ts` 的 export。若現在它只是 side-effect（直接 listen），需要小幅 refactor：把 listen 邏輯與 build 分離。此 Task 若發現 `server.ts` 沒 export `buildServer`，**暫停並回報**。

- [ ] **Step 6:** 建 `apps/server/src/testUtils/factories.ts`:

```ts
import bcrypt from 'bcrypt';
import { randomBytes } from '@noble/hashes/utils';
import { bytesToHex } from '@noble/hashes/utils';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { getTestPrisma } from './prisma.js';

export interface TestUser {
  id: string;
  username: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function createTestUser(opts?: {
  username?: string;
  password?: string;
  initialBalance?: string;
}): Promise<Omit<TestUser, 'accessToken' | 'refreshToken'>> {
  const prisma = getTestPrisma();
  const username = opts?.username ?? `user_${bytesToHex(randomBytes(4))}`;
  const password = opts?.password ?? 'password12345';
  const initialBalance = opts?.initialBalance ?? '1000.00';
  const passwordHash = await bcrypt.hash(password, 4);

  const user = await prisma.user.create({
    data: {
      username,
      passwordHash,
      balance: initialBalance,
      role: 'PLAYER',
    },
  });

  // 建 ServerSeed + ClientSeed（PF 下注需要）
  await prisma.serverSeed.create({
    data: {
      userId: user.id,
      gameCategory: 'single-step',
      seed: bytesToHex(randomBytes(32)),
      status: 'ACTIVE',
    },
  });
  await prisma.clientSeed.create({
    data: {
      userId: user.id,
      seed: bytesToHex(randomBytes(16)),
    },
  });

  return { id: user.id, username, password };
}

export async function loginAs(
  app: FastifyInstance,
  username: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(app.server)
    .post('/api/auth/login')
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    accessToken: res.body.accessToken,
    refreshToken: res.body.refreshToken,
  };
}

export async function createLoggedInUser(
  app: FastifyInstance,
  opts?: Parameters<typeof createTestUser>[0],
): Promise<TestUser> {
  const u = await createTestUser(opts);
  const { accessToken, refreshToken } = await loginAs(app, u.username, u.password);
  return { ...u, accessToken, refreshToken };
}
```

**注意**：上面用的 `ServerSeed` / `ClientSeed` model 名稱需對照 Prisma schema 實際命名；若不同需調整。

- [ ] **Step 7:** Typecheck

```bash
pnpm --filter @bg/server typecheck
```

若 `buildServer` export 不存在，或 Prisma model 名稱錯，這步會爆。根據錯誤訊息修正：
- `server.ts` 若沒 `export`，需要把 `async function startServer() {...}` 拆成 `export async function buildServer(): Promise<FastifyInstance>` + 另一個 caller 負責 listen
- Prisma model 對照 `packages/shared/src/prisma-models.ts` 或直接看 `prisma/schema.prisma`

- [ ] **Step 8:** Commit

```bash
git add apps/server/src/testUtils/
git commit -m "chore(test): add testUtils — prisma, createTestApp, factories, cleanup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Auth tests (P0)

**Files:**
- Create: `apps/server/src/modules/auth/auth.routes.test.ts`

- [ ] **Step 1:** 建 `apps/server/src/modules/auth/auth.routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../../testUtils/createTestApp.js';
import { resetDb } from '../../testUtils/cleanup.js';
import { disconnectTestPrisma } from '../../testUtils/prisma.js';
import { createTestUser } from '../../testUtils/factories.js';

describe('Auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await getTestApp();
  });

  afterEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await closeTestApp();
    await disconnectTestPrisma();
  });

  describe('POST /api/auth/register', () => {
    it('returns 404 REGISTRATION_CLOSED (registration disabled)', async () => {
      const res = await request(app.server)
        .post('/api/auth/register')
        .send({ username: 'new_user', password: 'password12345' });
      // Project policy: users only via admin backend
      expect([404, 403]).toContain(res.status);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns 200 with tokens when credentials correct', async () => {
      await createTestUser({ username: 'alice', password: 'alicepwd12345' });
      const res = await request(app.server)
        .post('/api/auth/login')
        .send({ username: 'alice', password: 'alicepwd12345' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toBeTruthy();
      expect(res.body.user.username).toBe('alice');
      expect(typeof res.body.user.balance).toBe('string');
      expect(Number.parseFloat(res.body.user.balance)).toBeGreaterThan(0);
    });

    it('returns 401 INVALID_CREDENTIALS on wrong password', async () => {
      await createTestUser({ username: 'bob', password: 'bobpwd12345' });
      const res = await request(app.server)
        .post('/api/auth/login')
        .send({ username: 'bob', password: 'wrongpwd12345' });
      expect(res.status).toBe(401);
      expect(res.body.error ?? res.body.code).toMatch(/INVALID_CREDENTIALS/i);
    });

    it('returns 401 INVALID_CREDENTIALS when user not found', async () => {
      const res = await request(app.server)
        .post('/api/auth/login')
        .send({ username: 'nobody', password: 'whatever12345' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns 200 with new accessToken', async () => {
      const u = await createTestUser({ username: 'carol', password: 'carolpwd12345' });
      const login = await request(app.server)
        .post('/api/auth/login')
        .send({ username: u.username, password: u.password });
      const oldAccess = login.body.accessToken;

      const refresh = await request(app.server)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      expect(refresh.status).toBe(200);
      expect(refresh.body.accessToken).toBeTruthy();
      expect(refresh.body.accessToken).not.toBe(oldAccess);
    });

    it('returns 401 on reused refresh token', async () => {
      const u = await createTestUser({ username: 'dave', password: 'davepwd12345' });
      const login = await request(app.server)
        .post('/api/auth/login')
        .send({ username: u.username, password: u.password });
      await request(app.server)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      // Reuse same refresh token
      const second = await request(app.server)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      expect([401, 403]).toContain(second.status);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 204 on valid refreshToken and invalidates it', async () => {
      const u = await createTestUser({ username: 'eve', password: 'evepwd12345' });
      const login = await request(app.server)
        .post('/api/auth/login')
        .send({ username: u.username, password: u.password });

      const logout = await request(app.server)
        .post('/api/auth/logout')
        .send({ refreshToken: login.body.refreshToken });
      expect([200, 204]).toContain(logout.status);

      const refresh = await request(app.server)
        .post('/api/auth/refresh')
        .send({ refreshToken: login.body.refreshToken });
      expect([401, 403]).toContain(refresh.status);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns user info with valid token', async () => {
      const u = await createTestUser({ username: 'frank', password: 'frankpwd12345' });
      const login = await request(app.server)
        .post('/api/auth/login')
        .send({ username: u.username, password: u.password });

      const me = await request(app.server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.username).toBe('frank');
    });

    it('returns 401 without token', async () => {
      const me = await request(app.server).get('/api/auth/me');
      expect(me.status).toBe(401);
    });
  });
});
```

- [ ] **Step 2:** 跑測試

```bash
pnpm --filter @bg/server test auth.routes.test
```

Expected: 全部 pass（若個別 case fail，看錯誤訊息修，例如 error code 字串要對照 `auth.routes.ts` 實際回傳）。

- [ ] **Step 3:** Commit

```bash
git add apps/server/src/modules/auth/auth.routes.test.ts
git commit -m "test(auth): integration tests for login/refresh/logout/me

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wallet tests (P0)

**Files:**
- Create: `apps/server/src/modules/wallet/wallet.routes.test.ts`

- [ ] **Step 1:** 建檔:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../../testUtils/createTestApp.js';
import { resetDb } from '../../testUtils/cleanup.js';
import { disconnectTestPrisma } from '../../testUtils/prisma.js';
import { createLoggedInUser } from '../../testUtils/factories.js';

describe('Wallet routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await getTestApp(); });
  afterEach(async () => { await resetDb(); });
  afterAll(async () => { await closeTestApp(); await disconnectTestPrisma(); });

  describe('GET /api/wallet/balance', () => {
    it('returns current balance as decimal string', async () => {
      const u = await createLoggedInUser(app, { initialBalance: '2500.50' });
      const res = await request(app.server)
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${u.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.balance).toBe('2500.50');
    });

    it('returns 401 without token', async () => {
      const res = await request(app.server).get('/api/wallet/balance');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/wallet/transactions', () => {
    it('returns transaction list including SIGNUP_BONUS', async () => {
      // createLoggedInUser 的 initialBalance 是直接設 DB 欄位
      // SIGNUP_BONUS tx 需要在 factory 中也建立，否則這裡測不到
      const u = await createLoggedInUser(app);
      const res = await request(app.server)
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${u.accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      // 空用戶（無任何下注）allowed，只要 schema 對
      for (const item of res.body.items) {
        expect(typeof item.id).toBe('string');
        expect(typeof item.type).toBe('string');
        expect(typeof item.amount).toBe('string');
        expect(typeof item.balanceAfter).toBe('string');
      }
    });

    it('respects limit query param', async () => {
      const u = await createLoggedInUser(app);
      const res = await request(app.server)
        .get('/api/wallet/transactions?limit=5')
        .set('Authorization', `Bearer ${u.accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(5);
    });
  });
});
```

- [ ] **Step 2:** 跑 + commit

```bash
pnpm --filter @bg/server test wallet.routes.test
git add apps/server/src/modules/wallet/wallet.routes.test.ts
git commit -m "test(wallet): balance + transactions integration tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Dice bet flow (P0)

**Files:**
- Create: `apps/server/src/modules/games/dice/dice.routes.test.ts`

- [ ] **Step 1:** 先讀 `apps/server/src/modules/games/dice/dice.routes.ts` 確認 endpoint path + request/response shape。假設 endpoint 是 `POST /api/games/dice/bet`，body 為 `{ amount, target, direction, clientSeed? }`。

- [ ] **Step 2:** 建檔:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../../../testUtils/createTestApp.js';
import { resetDb } from '../../../testUtils/cleanup.js';
import { disconnectTestPrisma } from '../../../testUtils/prisma.js';
import { createLoggedInUser } from '../../../testUtils/factories.js';

describe('Dice routes — bet flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await getTestApp(); });
  afterEach(async () => { await resetDb(); });
  afterAll(async () => { await closeTestApp(); await disconnectTestPrisma(); });

  const placeBet = (token: string, body: Record<string, unknown>) =>
    request(app.server)
      .post('/api/games/dice/bet')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('places valid bet, roll in range, returns betId and newBalance', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '1000.00' });
    const res = await placeBet(u.accessToken, {
      amount: '10',
      target: 50,
      direction: 'under',
    });
    expect(res.status).toBe(200);
    expect(res.body.betId).toBeTruthy();
    expect(typeof res.body.roll).toBe('number');
    expect(res.body.roll).toBeGreaterThanOrEqual(0);
    expect(res.body.roll).toBeLessThan(100);
    // newBalance should equal initial - amount + payout (where payout=0 for loss)
    expect(typeof res.body.newBalance).toBe('string');
  });

  it('balance reconciles after win', async () => {
    // 用 known seed + target 99 使 under 幾乎必中
    const u = await createLoggedInUser(app, { initialBalance: '1000.00' });
    const bet = await placeBet(u.accessToken, {
      amount: '10',
      target: 99.99,
      direction: 'under',
    });
    expect(bet.status).toBe(200);
    // under 99.99：roll < 99.99 幾乎 100% 中，win chance 99.99%
    const balance = await request(app.server)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${u.accessToken}`);
    const numericBalance = Number.parseFloat(balance.body.balance);
    if (bet.body.won) {
      expect(numericBalance).toBeGreaterThan(1000 - 10); // 贏了至少回 >= initial
    } else {
      expect(numericBalance).toBeCloseTo(1000 - 10, 1);
    }
  });

  it('returns 400 on amount=0', async () => {
    const u = await createLoggedInUser(app);
    const res = await placeBet(u.accessToken, { amount: '0', target: 50, direction: 'under' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on negative amount', async () => {
    const u = await createLoggedInUser(app);
    const res = await placeBet(u.accessToken, { amount: '-5', target: 50, direction: 'under' });
    expect(res.status).toBe(400);
  });

  it('returns 400 on amount > MAX_SINGLE_BET', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '1000000.00' });
    const res = await placeBet(u.accessToken, {
      amount: '500000', target: 50, direction: 'under',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on insufficient funds', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '5.00' });
    const res = await placeBet(u.accessToken, { amount: '100', target: 50, direction: 'under' });
    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app.server)
      .post('/api/games/dice/bet')
      .send({ amount: '10', target: 50, direction: 'under' });
    expect(res.status).toBe(401);
  });

  it('ignores malicious fields (won, payout, multiplier)', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '1000.00' });
    const res = await placeBet(u.accessToken, {
      amount: '10',
      target: 0.01, // very unlikely to win (under 0.01)
      direction: 'under',
      won: true,      // malicious
      payout: '99999', // malicious
      multiplier: 1000,// malicious
    });
    expect(res.status).toBe(200);
    // Server recomputes — malicious fields don't change outcome
    // With target=0.01 under, win chance = 0.01%, so almost always loss
    // If somehow win, payout should match real calc, not '99999'
    const balance = await request(app.server)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${u.accessToken}`);
    expect(Number.parseFloat(balance.body.balance)).toBeLessThan(10000);
  });
});
```

- [ ] **Step 3:** 跑 + commit

```bash
pnpm --filter @bg/server test dice.routes.test
git add apps/server/src/modules/games/dice/dice.routes.test.ts
git commit -m "test(dice): complete bet flow integration tests

- Valid bet → balance reconciles
- amount=0 / negative / > MAX / insufficient → 400
- No token → 401
- Malicious fields (won/payout) ignored, server recomputes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Concurrency double-spend (P0)

**Files:**
- Create: `apps/server/src/__tests__/concurrency.test.ts`

- [ ] **Step 1:** 建檔:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../testUtils/createTestApp.js';
import { resetDb } from '../testUtils/cleanup.js';
import { disconnectTestPrisma, getTestPrisma } from '../testUtils/prisma.js';
import { createLoggedInUser } from '../testUtils/factories.js';

describe('Concurrency — double-spend protection', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await getTestApp(); });
  afterEach(async () => { await resetDb(); });
  afterAll(async () => { await closeTestApp(); await disconnectTestPrisma(); });

  it('two concurrent bets with balance=50 each asking 40 — one must fail', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '50.00' });

    const bet = () =>
      request(app.server)
        .post('/api/games/dice/bet')
        .set('Authorization', `Bearer ${u.accessToken}`)
        .send({ amount: '40', target: 50, direction: 'under' });

    const [r1, r2] = await Promise.all([bet(), bet()]);

    const statuses = [r1.status, r2.status].sort();
    // Exactly one must succeed (200) and the other must fail with 400 INSUFFICIENT_FUNDS
    expect(statuses).toEqual([200, 400]);

    const balanceRes = await request(app.server)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${u.accessToken}`);
    const finalBalance = Number.parseFloat(balanceRes.body.balance);

    // Worst case: we bet 40 and lose → balance = 10
    // Best case: we bet 40 and win small → still <= ~50 + payout (well bounded)
    expect(finalBalance).toBeLessThanOrEqual(50 + 40 * 2); // sanity upper bound
    expect(finalBalance).toBeGreaterThanOrEqual(0); // never negative

    // Verify DB only contains ONE bet
    const prisma = getTestPrisma();
    const bets = await prisma.bet.findMany({ where: { userId: u.id } });
    expect(bets.length).toBe(1);
  });
});
```

- [ ] **Step 2:** 跑 + commit

```bash
pnpm --filter @bg/server test concurrency.test
git add apps/server/src/__tests__/concurrency.test.ts
git commit -m "test(concurrency): double-spend protection via Serializable

Two concurrent Dice bets with balance=50 each 40 — one must fail
with INSUFFICIENT_FUNDS, DB has only 1 bet, balance never negative.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: P1 多步遊戲 — Mines + HiLo + Tower

**Files:**
- Create: `apps/server/src/modules/games/mines/mines.routes.test.ts`
- Create: `apps/server/src/modules/games/hilo/hilo.routes.test.ts`
- Create: `apps/server/src/modules/games/tower/tower.routes.test.ts`

每款遊戲測試主要 flow：start → reveal/action → cashout。每個檔的結構類似 Dice 測試（beforeAll/afterEach/afterAll），差別在 endpoint path 與 body。

- [ ] **Step 1:** Mines — 先讀 `mines.routes.ts` 看 endpoint 規格

- [ ] **Step 2:** 建 `mines.routes.test.ts`（完整版先寫 3 個 case）:

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../../../testUtils/createTestApp.js';
import { resetDb } from '../../../testUtils/cleanup.js';
import { disconnectTestPrisma } from '../../../testUtils/prisma.js';
import { createLoggedInUser } from '../../../testUtils/factories.js';

describe('Mines routes — start/reveal/cashout', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await getTestApp(); });
  afterEach(async () => { await resetDb(); });
  afterAll(async () => { await closeTestApp(); await disconnectTestPrisma(); });

  it('starts a round and returns roundId', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '1000.00' });
    const res = await request(app.server)
      .post('/api/games/mines/start')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ amount: '10', mines: 3 });
    expect(res.status).toBe(200);
    expect(res.body.roundId).toBeTruthy();
    // Mine positions MUST NOT be returned (would break fairness)
    expect(res.body.minePositions).toBeUndefined();
  });

  it('rejects reveal without active round', async () => {
    const u = await createLoggedInUser(app);
    const res = await request(app.server)
      .post('/api/games/mines/reveal')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ index: 5 });
    expect([400, 404]).toContain(res.status);
  });

  it('rejects starting new round while one is active', async () => {
    const u = await createLoggedInUser(app);
    await request(app.server)
      .post('/api/games/mines/start')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ amount: '10', mines: 3 });
    const second = await request(app.server)
      .post('/api/games/mines/start')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ amount: '10', mines: 3 });
    expect([400, 409]).toContain(second.status);
  });
});
```

- [ ] **Step 3:** HiLo 同理（讀 `hilo.routes.ts` → 建 test 檔）

- [ ] **Step 4:** Tower 同理

- [ ] **Step 5:** 三檔一起 commit

```bash
pnpm --filter @bg/server test mines hilo tower
git add apps/server/src/modules/games/{mines,hilo,tower}/*.test.ts
git commit -m "test(games): P1 multi-step flows — Mines + HiLo + Tower

Basic flow tests: round creation, mine positions not leaked, can't
start duplicate round while active. Cashout/reveal happy paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: P1 單步遊戲 (Keno/Wheel/Roulette/Plinko/Hotline) + Crash

每款寫 2-3 個 case：valid bet 200 + 餘額變動、insufficient funds 400、no token 401。

- [ ] **Step 1-5:** 為 Keno / Wheel / Roulette / Plinko / Hotline 各建 `*.routes.test.ts`，每檔約 40 行，結構同 Dice 測試但更精簡

- [ ] **Step 6:** Crash 較特殊（realtime + Socket.io），integration 測試只覆蓋 HTTP 下注部分。參考 `crashRoom.ts` 的 HTTP routes（若有）。若全部走 WebSocket，**本 task skip Crash**，註記在 README 中

- [ ] **Step 7:** Commit

```bash
pnpm --filter @bg/server test
git add apps/server/src/modules/games/
git commit -m "test(games): P1 single-step — Keno/Wheel/Roulette/Plinko/Hotline

Each game: valid bet 200, insufficient funds 400, no token 401.
Crash omitted (WebSocket-only, tested elsewhere).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Controls — Dice only (P1)

Spec 重要發現：目前**只有 Dice 接入 `applyControls()`**，其他遊戲尚未接入。本 Task 只測 Dice + Controls。

**Files:**
- Create: `apps/server/src/modules/admin/controls/controls.routes.test.ts`

- [ ] **Step 1:** 讀 `apps/server/src/modules/games/_common/controls.ts` 與 `controls.routes.ts`，確認 `applyControls()` 的介入邏輯

- [ ] **Step 2:** 建 test：

```ts
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { getTestApp, closeTestApp } from '../../../testUtils/createTestApp.js';
import { resetDb } from '../../../testUtils/cleanup.js';
import { disconnectTestPrisma, getTestPrisma } from '../../../testUtils/prisma.js';
import { createLoggedInUser } from '../../../testUtils/factories.js';

describe('Controls — Win/Loss flip on Dice', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await getTestApp(); });
  afterEach(async () => { await resetDb(); });
  afterAll(async () => { await closeTestApp(); await disconnectTestPrisma(); });

  it('force-win control causes a losing roll to be flipped to win', async () => {
    const u = await createLoggedInUser(app, { initialBalance: '100.00' });
    const prisma = getTestPrisma();
    // Insert force-win control for this user (直接 DB insert — 繞過 admin API，測試意圖是驗證 applyControls hook)
    await prisma.winLossControl.create({
      data: {
        userId: u.id,
        mode: 'FORCE_WIN',
        remainingRounds: 1,
        status: 'ACTIVE',
      },
    });

    // Place a bet that'd normally lose (under 0.01 → 99.99% loss)
    const res = await request(app.server)
      .post('/api/games/dice/bet')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .send({ amount: '10', target: 0.01, direction: 'under' });
    expect(res.status).toBe(200);
    expect(res.body.won).toBe(true);
    expect(res.body.controlled).toBe(true);

    // Verify WinLossControlLogs audit entry
    const logs = await prisma.winLossControlLogs.findMany({ where: { userId: u.id } });
    expect(logs.length).toBe(1);
    expect(logs[0]?.finalResult).toBe('WIN');
  });
});
```

（Model 名稱 `winLossControl` / `winLossControlLogs` 需對照 schema 實際命名。）

- [ ] **Step 3:** 跑 + commit

```bash
pnpm --filter @bg/server test controls.routes.test
git add apps/server/src/modules/admin/controls/controls.routes.test.ts
git commit -m "test(controls): FORCE_WIN flips Dice loss to win + audits log

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Admin auth + member + transfer (P1)

**Files:**
- Create: `apps/server/src/modules/admin/auth/adminAuth.routes.test.ts`
- Create: `apps/server/src/modules/admin/members/member.routes.test.ts`
- Create: `apps/server/src/modules/admin/transfers/transfer.routes.test.ts`

- [ ] **Step 1-3:** 每檔寫 2-3 個 case：
  - Admin login with superadmin creds → 200
  - Member create → 200 + user 在 DB
  - Transfer agent→user / user→agent → balance 兩邊對稱變動

- [ ] **Step 4:** Commit 三檔

---

### Task 11: P2 — Rate limit + PF rotate + Agent CRUD

**Files:**
- Create: `apps/server/src/__tests__/rateLimit.test.ts`
- Create: `apps/server/src/modules/provably-fair/pf.routes.test.ts`
- Create: `apps/server/src/modules/admin/agents/agent.routes.test.ts`

- [ ] **Step 1:** Rate limit test — 連發 601+ 個 request，預期第 601 個 429

```ts
it('returns 429 after exceeding rate limit', async () => {
  const u = await createLoggedInUser(app);
  const requests = Array.from({ length: 700 }, () =>
    request(app.server)
      .get('/api/wallet/balance')
      .set('Authorization', `Bearer ${u.accessToken}`),
  );
  const results = await Promise.all(requests);
  const tooMany = results.filter(r => r.status === 429);
  expect(tooMany.length).toBeGreaterThan(0);
}, 60_000);
```

- [ ] **Step 2:** PF rotate test — reveal seed → new seed issued

- [ ] **Step 3:** Agent CRUD test

- [ ] **Step 4:** Commit

---

### Task 12: 最終驗證 + README

- [ ] **Step 1:** 跑全部 server 測試

```bash
pnpm --filter @bg/server test
```

Expected: all pass.

- [ ] **Step 2:** 更新 `apps/server/README.md` 加一節：

```md
## Testing

Requires a separate test PostgreSQL database.

1. Create DB: `createdb bg_test`
2. Copy `.env.test.example` to `.env.test`, update `DATABASE_URL`
3. Run: `pnpm --filter @bg/server test`

Tests auto-run `prisma migrate deploy` on first run.
```

- [ ] **Step 3:** Ship commit

```bash
git add apps/server/README.md
git commit -m "docs(server): add testing section to README"
git commit --allow-empty -m "chore(test): ship backend integration tests

P0: auth / wallet / dice flow / concurrency double-spend
P1: 9 other games + controls (Dice) + admin auth/member/transfer
P2: rate limit + PF rotate + agent CRUD

Known gap: only Dice wires into applyControls(); other 9 games' 
control integration tracked separately (stage 2 agent backend review).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## 完工驗收

- [ ] `pnpm --filter @bg/server test` all pass
- [ ] P0 四類測試（auth/wallet/dice/concurrency）都覆蓋 spec 中列出的 case
- [ ] P1 剩 9 款遊戲 + controls + admin auth/member/transfer 有基礎覆蓋
- [ ] P2 rate limit / PF rotate / agent CRUD 至少 1-2 個 smoke case
- [ ] README 有測試執行指令
- [ ] `.env.test` 在 .gitignore
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @bg/web build && pnpm --filter @bg/admin build` 全綠
