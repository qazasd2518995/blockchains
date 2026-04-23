# Blockchain Game — 加密博彩遊戲平台

## 概要

參考 GoFun8 的 26 款加密博彩遊戲所打造的 Web + App 混合平台，聚焦在**不需骨骼動畫的 18 款遊戲**。全部由 Claude Code 自動生成程式碼與素材。

### 技術棧

- **Monorepo**：pnpm workspace + Turborepo
- **前端**：Vite + React 18 + TypeScript + Pixi.js v8 + GSAP + Matter.js + Tailwind CSS + shadcn/ui
- **後端**：Node.js 20 + Fastify 4 + Prisma 5 + PostgreSQL + Socket.IO
- **共用**：TypeScript packages（shared / provably-fair / game-engine）
- **打包**：Capacitor 6（iOS / Android）

### 18 款遊戲

| 類型 | 遊戲 |
|---|---|
| 單步驟單人 | Dice、Hi-Lo、Keno、Color Wheel、Mini Roulette、Plinko、Hotline |
| 多步驟單人 | Mines、Tower X |
| Crash 多人即時 | Rocket、Aviator、JetX、JetX3、Space Fleet、Balloon、Double X、Plinko X |

（猴子過馬路、Goal、Cricket X、Football X 需骨骼動畫，暫緩。）

---

## 快速開始

### 先決條件

- Node.js 20（用 `nvm use` 套用）
- pnpm 9
- PostgreSQL 連線字串（本地 or Render 雲端）

### 初次安裝

```bash
# 1. 安裝相依
pnpm install

# 2. 設定環境變數
cp apps/server/.env.example apps/server/.env
# 編輯 apps/server/.env 填入 DATABASE_URL、JWT_SECRET

# 3. 資料庫 migration
pnpm --filter @bg/server prisma migrate dev

# 4. 同時啟動前後端
pnpm dev
```

- 前端：http://localhost:5173
- 後端：http://localhost:3000

### 常用指令

```bash
pnpm dev                              # 同時啟動所有服務
pnpm --filter @bg/web dev             # 只啟動前端
pnpm --filter @bg/server dev          # 只啟動後端
pnpm test                             # 全專案測試
pnpm --filter @bg/provably-fair test  # 只跑 PF 演算法測試
pnpm lint                             # Lint
pnpm typecheck                        # TypeScript 檢查
pnpm --filter @bg/server prisma studio  # 瀏覽資料庫
```

---

## 目錄結構

```
blockchain-game/
├── apps/
│   ├── web/          # Vite + React 前端
│   └── server/       # Fastify 後端
├── packages/
│   ├── shared/           # 共用型別、DTO、GameId
│   ├── provably-fair/    # PF 演算法 + 測試向量
│   ├── game-engine/      # Pixi.js 抽象基類
│   ├── tsconfig/         # tsconfig bases
│   └── eslint-config/    # 共用 ESLint 規則
└── docs/
```

---

## 開發規則（CLAUDE.md 必讀）

詳見 [CLAUDE.md](./CLAUDE.md)。三條鐵律：

1. **所有錢的計算用 `Decimal(20, 2)`**，永遠不用 Number / Float
2. **所有下注用 `prisma.$transaction({ isolationLevel: 'Serializable' })`**
3. **所有結果 100% 由後端判定**，前端送來的任何金額 / 倍率都不可信

