# 快速啟動指引

## ⚠️ 第一步：旋轉資料庫密碼（最重要）

**你在對話中貼出了 Render PostgreSQL 真實連線字串，密碼已洩漏。**

1. 登入 [Render Dashboard](https://dashboard.render.com)
2. 選擇你的 PostgreSQL 實例
3. Settings → **Regenerate Password**
4. 複製新的 External Database URL 供下一步使用

---

## 第二步：環境變數

```bash
cp apps/server/.env.example apps/server/.env
```

編輯 `apps/server/.env`，填入：

```env
# 新的連線字串（剛從 Render 重新產生的）
DATABASE_URL="postgresql://blockchains_user:<新密碼>@dpg-d7gj6uhj2pic73bd4ul0-a.oregon-postgres.render.com/blockchains"

# JWT secret（執行下面指令產生）
JWT_SECRET="貼上產生出來的 64 字元 hex"
```

**產生 JWT_SECRET：**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 第三步：安裝相依

```bash
# 如果沒有 pnpm
npm install -g pnpm

# 安裝所有套件
pnpm install
```

---

## 第四步：初始化資料庫

```bash
# 產生 Prisma client
pnpm --filter @bg/server prisma generate

# 跑第一次 migration（會建立所有資料表）
pnpm --filter @bg/server prisma migrate dev --name init
```

---

## 第五步：跑 Provably Fair 測試（驗證核心演算法）

```bash
pnpm --filter @bg/provably-fair test
```

應該看到所有測試 ✓ 綠色通過。**這是平台信任的根基，必須 100% 通過才能繼續。**

---

## 第六步：啟動開發伺服器

```bash
# 在專案根目錄
pnpm dev
```

這會同時啟動：
- 後端：`http://localhost:3000`
- 前端：`http://localhost:5173`

---

## 第七步：驗證 E2E 流程

### 1. 註冊登入

1. 開瀏覽器 → http://localhost:5173
2. 點「免費註冊」
3. 輸入 Email + 密碼（8 字元以上、含字母與數字）
4. 勾選同意條款 → 註冊
5. 自動登入，應該導向 `/lobby` 大廳

### 2. 查餘額

- 大廳右上角應顯示 `💰 1,000.00`
- 前往「個人」頁面可看到完整資料

### 3. Dice 測試

1. 點大廳「🎲 骰子」卡片
2. 下注金額設 10、門檻值設 50、方向 UNDER
3. 點「投注」
4. 觀察骰子旋轉 → 結果顯示
5. 餘額即時更新

### 4. Mines 測試

1. 點大廳「💣 踩地雷」卡片
2. 下注金額 10、地雷數 5
3. 點「開始遊戲」
4. 點 5×5 網格中任一格
5. 翻到鑽石 → 倍率上升、可繼續或領獎
6. 翻到地雷 → 爆炸動畫、當局結束

### 5. Provably Fair 驗證

1. 前往「個人」頁面
2. 看到「dice」、「mines」兩組 Seed Hash
3. 點某一組的「旋轉 / 揭露」
4. 舊 Server Seed 被揭露
5. 用 Node REPL 驗證：
   ```bash
   node -e "console.log(require('crypto').createHash('sha256').update('<揭露的 seed>').digest('hex'))"
   ```
6. 應該等於原本顯示的 Hash

### 6. 檢查資料庫

```bash
pnpm --filter @bg/server prisma studio
```

瀏覽器會開啟 `http://localhost:5555`：
- `User` 表：至少 1 筆（你的帳號）
- `Transaction` 表：每下注一次就 2 筆（BET_PLACE + BET_WIN/CASHOUT）
- `ServerSeed` 表：每個 gameCategory 都有一筆 isActive
- `Bet` 表：每下注一次一筆
- `MinesRound`：每開始 Mines 遊戲一筆

---

## 常用指令速查

```bash
pnpm dev                                      # 同時啟動全部
pnpm --filter @bg/web dev                     # 只跑前端
pnpm --filter @bg/server dev                  # 只跑後端
pnpm --filter @bg/server prisma studio        # 瀏覽資料庫
pnpm --filter @bg/server db:seed              # 建 admin 帳號
pnpm --filter @bg/provably-fair test          # 跑 PF 測試
pnpm typecheck                                # 全專案 TS 檢查
```

---

## 疑難排解

### Prisma migration 失敗：`P1001: Can't reach database server`

檢查 `DATABASE_URL` 是否正確，Render 外部連線字串要記得以 `?sslmode=require` 結尾（若 Render 要求的話）。

### Fastify 啟動失敗：`Invalid environment configuration`

檢查 `.env` 是否有完整的 `JWT_SECRET`（至少 32 字元）。產生指令見第二步。

### 前端 API 呼叫 500

檢查後端 log。常見是 Prisma schema 尚未 migrate，或 PostgreSQL 密碼錯誤。

### `Error: Cannot find module '@bg/shared'`

執行 `pnpm install` 確保 workspace symlink 建立成功。

### Pixi canvas 顯示空白

重新整理頁面。Pixi v8 對某些舊 GPU 不相容時會 fallback，但功能還是可以正常跑。

---

## 下一步

Phase 0 + Dice + Mines 通過驗證後，下面是剩下 16 款遊戲的實作順序：

| Phase | 遊戲 |
|---|---|
| 3 | Hi-Lo（猜大小） |
| 4 | Keno（基諾） |
| 5 | Color Wheel（彩色轉輪） |
| 6 | Mini Roulette + Carnival |
| 7 | Plinko（彈珠台，需 Matter.js） |
| 8 | Hotline（老虎機） |
| 9 | Tower X |
| 10-17 | 8 款 Crash 類（Rocket、Aviator、JetX、JetX3、Space Fleet、Balloon、Double X、Plinko X） |
| Final | Capacitor 打包 iOS/Android |

當前進度完成後告訴我要繼續 Phase 3，我會接著做。
