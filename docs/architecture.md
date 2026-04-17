# 架構總覽

## 分層

```
┌──────────────────────────────────────────────────────────────┐
│                         瀏覽器 / Capacitor App               │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │ React (路由/UI)  │  │ Pixi.js (每款遊戲的 Canvas 場景) │ │
│  └────────┬─────────┘  └────────────────┬─────────────────┘ │
│           └───── Zustand / Axios ───────┘                     │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS / WebSocket
┌───────────────────────────────▼──────────────────────────────┐
│                      Fastify 4 (Node 20)                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ auth     │ │ wallet   │ │ pf       │ │ games/*          │ │
│  │ routes   │ │ routes   │ │ routes   │ │ routes + service │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘ │
│       └────── Prisma ORM + PostgreSQL tx ────────┘            │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ @bg/provably-fair (純函式，HMAC-SHA256 演算法)       │    │
│  └──────────────────────────────────────────────────────┘    │
└───────────────────────────────┬──────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────┐
│                 PostgreSQL (Render 雲端 / 本機)               │
│  User · Transaction · ServerSeed · ClientSeed · Bet          │
│  MinesRound · (未來) CrashRound · RefreshToken               │
└──────────────────────────────────────────────────────────────┘
```

## 資料流（下注一次的完整生命週期）

以 Dice 下注為例：

1. **前端**：玩家按「投注」→ Zustand store 先鎖住按鈕（防連點）→ Axios POST `/api/games/dice/bet`
2. **Axios 攔截器**：自動附上 `Authorization: Bearer <accessToken>`
3. **Fastify**：
   a. `@fastify/rate-limit` 檢查頻率
   b. `fastify.authenticate` preHandler 驗證 JWT，寫入 `req.userId`
   c. `diceRoutes` 用 Zod 驗證 body
   d. 進入 `DiceService.bet()` 開啟 Prisma interactive transaction（Serializable）
4. **Prisma transaction**：
   a. `lockUserAndCheckFunds` 讀 user + 驗餘額 + 驗金額上下限
   b. `SeedHelper.getActiveBundle` 取或建 seed、nonce +1
   c. `diceDetermine(seed, clientSeed, nonce, target, direction)` 由 `@bg/provably-fair` 算出結果
   d. 寫 `Bet` 記錄
   e. 先 `debitAndRecord`（扣下注、寫 `BET_PLACE` transaction）
   f. 若贏，`creditAndRecord`（加派彩、寫 `BET_WIN` transaction）
5. **Fastify 回傳**：`DiceBetResult` DTO（含 roll、multiplier、payout、newBalance、serverSeedHash、nonce 等）
6. **前端**：
   a. `DiceScene.playRoll` 播放 Pixi 動畫（1.5 秒）
   b. 更新 Zustand balance、最近紀錄
   c. 使用者可在 Profile 頁隨時「旋轉」seed → 揭露原文 → 手動用 `SHA-256(revealed) === storedHash` 驗證

**關鍵不變量**：
- 任何時刻 `User.balance` + 未結算的 pending 金額 = 使用者真正擁有的點數（但 pending 不會累積，因為單步驟遊戲一次完成）
- `Transaction.balanceAfter` 嚴格單調反映餘額變動
- `ServerSeed.nonce` 嚴格單調遞增，整條歷史可重放驗證

## 多步驟遊戲（Mines）的差異

Mines 每一次 `/reveal` 都是一個 DB transaction，但只有 `/start` 和結算（`/cashout` 或踩雷）才會寫 `Transaction` 表。中間的 `/reveal` 只更新 `MinesRound.revealed` 與 `currentMultiplier`，不動餘額。

這個拆分的好處：
- 踩雷瞬間結算 → 餘額不變（已在 `/start` 時扣掉）
- Cash Out → 算出 `payout = amount × currentMultiplier`，一次派獎
- 避免中途每翻一格都動餘額的效能成本 + race 風險

## Provably Fair 的信任模型

這個平台的公正性基於兩個前提：

1. **Server seed 保密**：下注時玩家只能看到 `SHA-256(seed)`，不能看到 seed 原文
2. **Server seed 承諾不變**：一旦 seed hash 公布，該 seed 對應的所有 nonce 結果都已經由演算法 deterministic 決定了——後端無法事後挑 seed

玩家的驗證能力：
- 看到當前 active seed 的 `seedHash`
- 可以隨時呼叫 `/pf/rotate` 來結束這個 seed 的使用（揭露原文）
- 揭露後，玩家可以：
  - 驗證 `SHA-256(revealed seed) === 原本公布的 hash` → 證明 seed 沒被換
  - 對過去所有 nonce 重跑 `diceDetermine(seed, clientSeed, nonce, target, direction)` → 證明結果沒被動手腳

**限制**：這個機制無法防止「後端在註冊時先算好一堆 seed，挑對玩家最不利的那個」。業界標準是在前端顯示 hash、讓玩家換 client seed（玩家控制 client seed 就能破解這招）。

## 18 款遊戲的分類

**單步驟單人**（1 API call 完成一局）：Dice、Hi-Lo（單次決策）、Keno、Color Wheel、Mini Roulette、Plinko、Hotline、Carnival

**多步驟單人**（需要 round 表追蹤中間狀態）：Mines、Tower X、Hi-Lo（連猜）

**多人即時 Crash**（全服共享一局）：Rocket、Aviator、JetX、JetX3、Space Fleet、Balloon、Double X、Plinko X

Crash 類會用 Socket.IO 開房間。Phase 10（Rocket）會建立整個 Crash 引擎，之後 7 款都是換皮。

## 目前已實作範圍

✅ **Phase 0**：monorepo + 後端核心 + 前端骨架
✅ **Phase 1**：Dice 全套（後端 + 前端 + PF + 測試）
✅ **Phase 2**：Mines 全套（後端 + 前端 + PF + 測試）

待實作：Phase 3-17（其餘 16 款遊戲）、Phase Final（Capacitor 打包）。
