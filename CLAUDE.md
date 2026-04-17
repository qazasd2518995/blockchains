# Claude Code 專案規則

本專案是 **加密博彩遊戲平台**（假幣點數），由 Claude Code 自動生成。開發時請遵守以下規則。

---

## 三條鐵律（不可破）

### 1. 錢永遠用 Decimal

- 所有金錢欄位（balance、amount、payout、multiplier）用 **`Prisma.Decimal` / PostgreSQL `Decimal(20, 2)`**
- **絕不使用 Number / Float**（避免 IEEE 754 誤差）
- 在 TypeScript 中用 `Decimal.js` 或 Prisma 的 `Decimal` 型別
- 前端顯示可以 `.toFixed(2)`，但計算不得用 Number

### 2. 所有下注操作用 Prisma Transaction + Serializable

```ts
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT balance FROM "User" WHERE id = ${userId} FOR UPDATE`;
  // ... 扣款、判定、派獎、寫 Bet、寫 Transaction
}, { isolationLevel: 'Serializable' });
```

永遠**不可以**用 `findUnique` 再 `update` 的模式（race condition）。

### 3. 所有結果 100% 由後端判定

- 前端送來的 `amount`、`clientSeed` 可接受
- 前端送來的 `multiplier`、`payout`、`won`、`result` **一律丟棄不信任**
- 任何結果由後端呼叫 `@bg/provably-fair` 算出，寫入 DB，再回傳給前端播動畫

---

## Monorepo 規則

- **永遠用 pnpm**（不是 npm / yarn），專案根目錄有 `pnpm-workspace.yaml`
- 新 dependency 前先看 `packages/*` 有無現成的
- 跨 package 引用用 `@bg/xxx` 名稱（例如 `import { diceRoll } from '@bg/provably-fair'`）
- 修改 `packages/*` 的 `src/**` 即可，`dist/**` 由 turbo build 自動產生

---

## Provably Fair 規則

- Server seed 生成：`crypto.randomBytes(32).toString('hex')`
- Seed 只在 `revealedAt` 設定後才能回 API
- Rotate seed 必產新 seed、舊揭露、nonce 歸 0
- 每新增一款遊戲：先在 `packages/provably-fair/src/__tests__/` 加測試向量
- **測試向量是信任根基**，改 PF 演算法時測試必須一起更新

---

## 新增一款遊戲的步驟（Template）

假設要加 `xxx` 遊戲：

1. `packages/shared/src/games.ts` 加入 `GameId.XXX`
2. `packages/shared/src/dto/xxx.ts` 定義 bet request / result
3. `packages/provably-fair/src/xxx.ts` 實作演算法
4. `packages/provably-fair/src/__tests__/xxx.test.ts` 寫 10 組測試向量
5. `apps/server/src/modules/games/xxx/` 建 service（繼承 `BaseGameService`）、routes、schema
6. `apps/server/prisma/schema.prisma` 若需特殊 round 表則加，否則用 `Bet` 表 + `resultData` JSON
7. `apps/web/src/games/xxx/` 建 XxxGame.ts（繼承 `BaseGame`）、Renderer.ts、UI.tsx、assets.ts
8. `apps/web/src/pages/games/XxxPage.tsx` 組合 UI + Pixi
9. `apps/web/src/router.tsx` 加路由
10. `apps/web/src/pages/LobbyPage.tsx` 加卡片

---

## 安全與敏感資訊

- **絕不把密碼、API Key、DB 連線字串寫進程式碼**
- 所有機密走 `process.env.XXX`
- `.env` 永遠不進 git（已在 `.gitignore`）
- `.env.example` 只寫變數名、不寫實值
- 若發現使用者在對話中貼出密碼，**立即提醒他旋轉（regenerate）**

---

## 下注濫用防護

- 單次下注上限：`min(user.balance * 1, 100000)`
- 每日下注次數上限（`@fastify/rate-limit`）
- 負數金額、0 金額、NaN 金額一律拒絕

---

## 測試慣例

- PF 演算法：Vitest 單元測試 + 測試向量（必要）
- 後端服務：Supertest integration 測試
- 前端元件：暫時不強制測試（Pixi 測試困難）

提交前跑 `pnpm lint && pnpm typecheck && pnpm test`。

---

## 法律與道德

- 這是 **技術研究用假幣** 平台，不接受真實存/提款
- **沒有「購買點數」、「提領」按鈕或連結**
- 加密博彩在台灣違法，README 與註冊頁明確標註

---

## Claude Code 程式碼風格

- TypeScript 嚴格模式（`strict: true` + `noUncheckedIndexedAccess`）
- 函式預設 `async/await`，避免 `.then()` 鏈
- 錯誤訊息中文可，程式碼變數名英文
- 不寫多餘註解（讓命名自我說明）
- 關鍵複雜邏輯（如 PF 演算法）可寫 1-2 行 WHY 註解
