# Spec: Ping Route Cleanup + VerifyPage Provably Fair Tool

**Date:** 2026-04-21
**Status:** Ready for implementation
**Scope:** Backend dead-code removal (sub-project 1.1) + Frontend-only PF verification tool (sub-project 1.2)

---

## Sub-project 1.1: 清除 Ping Dev Route

### 背景

`apps/server/src/modules/games/ping/ping.routes.ts`（60 行）是後端 smoke-test 路由，在 18 款遊戲清單盤點時被誤算進去。它：

- **沒有** `GameId.PING` enum
- **沒有** 前端頁面
- **沒有** Provably Fair 演算法
- 只是一個「扣款後立刻退款」的迴聲路由，供最早期開發驗證用

這是可安全刪除的 dead code。

### 目標

移除 ping 路由所有痕跡，讓 `pnpm --filter @bg/server typecheck` 保持綠燈。

### 非目標

- 不影響其他任何遊戲路由
- 不變動資料庫 schema

### 需要變更的檔案

| 檔案 | 動作 |
|------|------|
| `apps/server/src/modules/games/ping/ping.routes.ts` | 刪除整個目錄 `apps/server/src/modules/games/ping/` |
| `apps/server/src/server.ts` 第 20 行 | 刪除 `import { pingRoutes } from './modules/games/ping/ping.routes.js';` |
| `apps/server/src/server.ts` 第 100 行 | 刪除 `await server.register(pingRoutes, { prefix: '/api/games/ping' });` |

### 驗收標準

```bash
pnpm --filter @bg/server typecheck   # 0 errors
```

---

## Sub-project 1.2: VerifyPage Provably Fair 驗證工具

### 背景

`apps/web/src/pages/VerifyPage.tsx` 目前僅是 20 行占位畫面，顯示「驗證工具開發中」。
`@bg/provably-fair` 套件已匯出所有 10 款遊戲的驗證用純函式，可直接在瀏覽器端呼叫（純 JS，不依賴 Node.js crypto——底層使用 Web Crypto 相容的實作）。

### 目標

在 `/verify` 頁實作完整的 Provably Fair 獨立驗證工具：

- 使用者填入 serverSeed / clientSeed / nonce
- 選擇遊戲
- 填入該遊戲專屬的額外參數
- 純前端呼叫 `@bg/provably-fair` 對應函式，不打任何後端 API
- 顯示可讀性高的驗證結果

### 非目標

- **不做** 歷史記錄查詢（不串後端 `/api/pf` 或 `/api/games/*` 的 bet history）
- **不做** 從遊戲大廳帶預填 seed 值跳轉至 VerifyPage
- **不動** 後端任何檔案
- **不做** 驗證結果的分享或匯出功能

---

## 各遊戲驗證函式簽名（來自 `packages/provably-fair/src/`）

### 1. Dice

```ts
// dice.ts
function diceRoll(serverSeed: string, clientSeed: string, nonce: number): DiceRollResult
// DiceRollResult = { roll: number }  (0.00 ~ 99.99)

function diceDetermine(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  target: number,        // 0.01 ~ 99.99
  direction: 'under' | 'over',
): DiceDetermination
// DiceDetermination = { roll, won, winChance, multiplier }
```

**額外輸入：** `target`（數字，0.01–99.99）、`direction`（under / over 下拉）

**顯示結果：** roll 值、是否獲勝、勝率、倍率

---

### 2. Mines

```ts
// mines.ts
function minesPositions(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  mineCount: number,   // 1 ~ 24
): number[]
// 回傳雷的位置陣列（0-indexed，25格5x5）
```

**額外輸入：** `mineCount`（整數，1–24）

**顯示結果：** 25 格 5×5 網格，高亮顯示雷的位置（0-indexed 轉為 row/col）

---

### 3. Crash

```ts
// crash.ts
function crashPoint(serverSeed: string, salt: string): number
// salt 即為該局的 clientSeed（此遊戲不用 nonce）
// 回傳爆炸倍率（最小 1.00）
```

**特殊：** Crash 不使用 `nonce`；`salt` 欄位對應 `clientSeed`（UI 標示清楚）。nonce 欄位隱藏或灰化。

**額外輸入：** 無

**顯示結果：** 爆炸倍率（e.g. `3.45×`）

---

### 4. HiLo

```ts
// hilo.ts
function hiloDraw(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cardIndex: number,   // 0-indexed，第幾張牌
): HiLoDraw
// HiLoDraw = { rank: 1..13, suit: 0..3 }
```

**額外輸入：** `cardIndex`（整數，0 起，通常驗證第 0 張牌）

**顯示結果：** 點數（A/2–10/J/Q/K）+ 花色（♠♥♦♣）

---

### 5. Keno

```ts
// keno.ts
function kenoDraw(serverSeed: string, clientSeed: string, nonce: number): number[]
// 回傳從 1-40 中抽出的 10 個號碼（已排序）

function kenoEvaluate(drawn: number[], selected: number[]): { hits: number[]; misses: number[] }
```

**額外輸入：** `selected`（使用者選號，1–10 個，1–40 範圍的整數，逗號分隔輸入）

**顯示結果：** 40 格網格，顯示抽出號碼（綠色）、選中且命中（金色）、選中未命中（紅色）

---

### 6. Wheel

```ts
// wheel.ts
function wheelSpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  segments: WheelSegmentCount,  // 10 | 20 | 30 | 40 | 50
): { segmentIndex: number }

function wheelMultiplier(
  risk: WheelRisk,              // 'low' | 'medium' | 'high'
  segments: WheelSegmentCount,
  segmentIndex: number,
): number
```

**額外輸入：** `risk`（low/medium/high 下拉）、`segments`（10/20/30/40/50 下拉）

**顯示結果：** 落在的 segment index、對應倍率

---

### 7. Plinko

```ts
// plinko.ts
function plinkoPath(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,   // 8 ~ 16
): { path: ('left' | 'right')[]; bucket: number }

function plinkoMultiplier(risk: PlinkoRisk, rows: number, bucket: number): number
```

**額外輸入：** `risk`（low/medium/high 下拉）、`rows`（8–16 數字）

**顯示結果：** 落點路徑（L/R 序列）、最終 bucket index、倍率

---

### 8. Roulette

```ts
// roulette.ts
function rouletteSpin(serverSeed: string, clientSeed: string, nonce: number): { slot: number }
// slot: 0 ~ 12（Mini Roulette，13 格）
```

**額外輸入：** 無（只驗證開出的號碼）

**顯示結果：** 開出的 slot 號碼（0 = 綠色零，1–12 依紅黑表着色）

---

### 9. Hotline（Slot）

```ts
// hotline.ts
function hotlineSpin(serverSeed: string, clientSeed: string, nonce: number): number[][]
// 回傳 grid[reel][row]，每個值為符號 index（0=CHERRY, 1=BELL, 2=SEVEN, 3=BAR, 4=DIAMOND, 5=JACKPOT）

function hotlineEvaluate(grid: number[][]): { lines: HotlineWinLine[]; totalMultiplier: number }
// HotlineWinLine = { row, symbol, count, payout }
```

**額外輸入：** 無

**顯示結果：** 5×3 格 grid，每格顯示符號名稱；列出各 row 中獎行及倍率；總倍率

---

### 10. Tower

```ts
// tower.ts
function towerLayout(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  difficulty: TowerDifficulty,  // 'easy' | 'medium' | 'hard' | 'expert' | 'master'
): number[][]
// 回傳 layout[level]（9 層），每個元素為該層安全格的 col index 陣列
```

**額外輸入：** `difficulty`（easy/medium/hard/expert/master 下拉）

**顯示結果：** 9 層塔狀網格，每層按難度顯示格數，安全格標綠、陷阱格標紅

---

## UI 結構

### 整體 Layout

```
[ 頂部標題列：ShieldCheck icon + "Provably Fair 驗證工具" ]

[ Card：共用 Seed 輸入區 ]
  Server Seed    [input text, placeholder: 64 hex chars]
  Client Seed    [input text, placeholder: 32 hex chars]
  Nonce          [input number, min=0, integer, disabled when Crash selected]

[ Card：遊戲選擇 + 額外參數 ]
  遊戲           [select dropdown: 10 款]
  [條件性額外參數欄位 — 依遊戲顯示/隱藏]

[ 驗證按鈕 ]
  [Button "驗證結果"]

[ 結果區塊（驗證後出現）]
  [依遊戲顯示對應結果]

[ 錯誤提示（輸入有誤時）]
  [inline error banner]
```

### 遊戲下拉選項

```
- Dice
- Mines
- Crash
- HiLo
- Keno
- Wheel
- Plinko
- Roulette
- Hotline
- Tower
```

### 條件性額外欄位（依選中遊戲）

| 遊戲 | 額外欄位 |
|------|---------|
| Dice | `target`（number，0.01–99.99）、`direction`（select: under / over） |
| Mines | `mineCount`（number，1–24） |
| Crash | nonce 欄位 disabled + 灰化（不使用 nonce） |
| HiLo | `cardIndex`（number，≥0，預設 0） |
| Keno | `selected`（text，e.g. "1,5,12,33"，1–10 個號碼） |
| Wheel | `risk`（select: low/medium/high）、`segments`（select: 10/20/30/40/50） |
| Plinko | `risk`（select: low/medium/high）、`rows`（number，8–16） |
| Roulette | 無 |
| Hotline | 無 |
| Tower | `difficulty`（select: easy/medium/hard/expert/master） |

---

## 驗證邏輯

### 前端呼叫對應函式

```ts
// 直接 import，純前端計算
import {
  diceDetermine,
  minesPositions,
  crashPoint,
  hiloDraw,
  kenoDraw, kenoEvaluate,
  wheelSpin, wheelMultiplier,
  plinkoPath, plinkoMultiplier,
  rouletteSpin,
  hotlineSpin, hotlineEvaluate,
  towerLayout,
} from '@bg/provably-fair';

function runVerify(game: GameChoice, inputs: VerifyInputs): VerifyResult {
  switch (game) {
    case 'dice':
      return diceDetermine(serverSeed, clientSeed, nonce, target, direction);

    case 'mines':
      return { positions: minesPositions(serverSeed, clientSeed, nonce, mineCount) };

    case 'crash':
      // salt = clientSeed，不使用 nonce
      return { point: crashPoint(serverSeed, clientSeed) };

    case 'hilo':
      return hiloDraw(serverSeed, clientSeed, nonce, cardIndex);

    case 'keno': {
      const drawn = kenoDraw(serverSeed, clientSeed, nonce);
      const { hits, misses } = kenoEvaluate(drawn, parsedSelected);
      return { drawn, hits, misses };
    }

    case 'wheel': {
      const { segmentIndex } = wheelSpin(serverSeed, clientSeed, nonce, segments);
      const multiplier = wheelMultiplier(risk, segments, segmentIndex);
      return { segmentIndex, multiplier };
    }

    case 'plinko': {
      const { path, bucket } = plinkoPath(serverSeed, clientSeed, nonce, rows);
      const multiplier = plinkoMultiplier(risk, rows, bucket);
      return { path, bucket, multiplier };
    }

    case 'roulette':
      return rouletteSpin(serverSeed, clientSeed, nonce);

    case 'hotline': {
      const grid = hotlineSpin(serverSeed, clientSeed, nonce);
      return { grid, ...hotlineEvaluate(grid) };
    }

    case 'tower':
      return { layout: towerLayout(serverSeed, clientSeed, nonce, difficulty) };
  }
}
```

---

## 錯誤處理

| 錯誤情境 | 驗證邏輯 | 顯示訊息 |
|---------|---------|---------|
| serverSeed 為空 | `!serverSeed.trim()` | 「請輸入 Server Seed」 |
| clientSeed 為空 | `!clientSeed.trim()` | 「請輸入 Client Seed」 |
| nonce 非整數或負數 | `!Number.isInteger(nonce) \|\| nonce < 0` | 「Nonce 必須為非負整數」（Crash 遊戲跳過此驗證） |
| Dice: target 超出範圍 | `target < 0.01 \|\| target > 99.99` | 「Target 必須在 0.01–99.99 之間」 |
| Mines: mineCount 超出範圍 | `mineCount < 1 \|\| mineCount > 24` | 「地雷數量必須在 1–24 之間」 |
| HiLo: cardIndex 負數 | `cardIndex < 0` | 「牌索引必須 ≥ 0」 |
| Keno: 選號格式錯誤 | 無法解析 / 超出 1–40 / 多於 10 個 | 「選號格式錯誤：請輸入 1–10 個 1–40 之間的整數，以逗號分隔」 |
| Plinko: rows 超出範圍 | `rows < 8 \|\| rows > 16` | 「行數必須在 8–16 之間」 |
| PF 函式拋出例外 | try/catch | 「驗證失敗：{error.message}」 |

所有錯誤以 inline banner（紅色邊框）顯示在「驗證」按鈕上方，不用 alert/modal。

---

## 結果渲染說明

| 遊戲 | 結果渲染 |
|------|---------|
| Dice | 顯示 roll 值（大號數字）、target 線、方向標示、是否獲勝（綠/紅 badge）、倍率 |
| Mines | 5×5 網格，雷格顯示 💣，安全格顯示 ✓ |
| Crash | 大號倍率數字（e.g. `3.45×`），若為 1.00 顯示「即時爆炸」 |
| HiLo | 卡牌圖示（rank 文字 + suit 符號），如「K ♠」 |
| Keno | 40 格網格：抽中＋選中（金色）、僅抽中（綠色）、未抽中（灰色）；命中數/選號數 |
| Wheel | 分段條狀圖，高亮落點 segment，顯示倍率 |
| Plinko | 路徑文字（L/R 序列）+ bucket index + 倍率；可選顯示 multiplier table |
| Roulette | 號碼圓圈（依 RED_NUMBERS / BLACK_NUMBERS 紅黑着色，0 = 綠）|
| Hotline | 5×3 格 grid（符號名縮寫）+ 中獎行列表 + 總倍率 |
| Tower | 9 層塔狀顯示，每層按 TOWER_CONFIG[difficulty].cols 格數，安全格綠色/陷阱格紅色 |

---

## 受影響檔案清單

### Sub-project 1.1（刪除）

- `apps/server/src/modules/games/ping/ping.routes.ts` — **刪除（整個目錄）**
- `apps/server/src/server.ts` — 移除第 20 行 import + 第 100 行 register

### Sub-project 1.2（修改）

- `apps/web/src/pages/VerifyPage.tsx` — **完整重寫**（從 20 行占位 → 完整驗證工具）

### 不需要動的檔案

- `packages/provably-fair/src/*` — 只讀，不改
- `packages/provably-fair/src/index.ts` — 已匯出全部所需函式
- `apps/web/src/router.tsx` — `/verify` 路由已存在
- 任何後端檔案

---

## 補充：Crash 遊戲的特殊 seed 語義

`crashPoint(serverSeed, salt)` 中的 `salt` 是該局的 `clientSeed`（非 `clientSeed:nonce` 格式的 HMAC message）。這與其他遊戲使用 `hmacIntStream(serverSeed, clientSeed, nonce)` 不同。

UI 應在選擇 Crash 時：
1. 將「Client Seed」欄位的 label 顯示為「Client Seed (= salt)」
2. 將「Nonce」欄位 disabled 並灰化，顯示 placeholder「Crash 不使用 Nonce」
3. 確保驗證時調用 `crashPoint(serverSeed, clientSeed)`，忽略 nonce

---

## 驗收標準

1. `pnpm --filter @bg/server typecheck` 在刪除 ping 後通過
2. `/verify` 頁面可選 10 款遊戲，各遊戲顯示正確的額外輸入欄位
3. 驗證結果與 `packages/provably-fair/__tests__/*.test.ts` 中的測試向量一致
4. Crash 遊戲的 nonce 欄位被 disabled
5. 所有錯誤情境顯示清晰的 inline 錯誤訊息，不使用 `alert()`
6. 純前端執行，Network tab 中無任何因「驗證」操作觸發的 API 請求
