# UI 全站改版設計 — 華人娛樂城風（參考 3A 遊戲城）

**日期**：2026-04-21
**狀態**：設計確認，待 implementation plan
**作者**：Justin × Claude
**範圍**：`apps/web` + `packages/ui-tokens`（純前端改版，不動後端 API／資料庫／Provably Fair）

---

## 1. 背景與動機

當前 `apps/web` 的視覺採用「Monte Carlo 精品賭場」風（象牙白、綠絨、黃銅、酒紅、Bodoni Moda 襯線字、花式符號、蠟封圖章），對應的是西方 provably-fair 加密賭場（Stake / Rollbit 一類）的設計語言。

使用者實際希望的是**華人線上娛樂城**風格（參考：`https://seo99.3a5168.com/`），該類站點的特徵：
- 淺灰底 + 白卡片 + 深青強調色
- 資訊密集（跑馬燈、在線人數、贏家榜、浮動客服）
- 版面結構：公告跑馬燈 → 大 Banner 輪播 → 館別入口 → 贏家榜 → 賣點 → 合作 logo → Footer
- 中文為主、無襯線字體、商務正式、親切可信

兩者的設計語言差距極大，本次改版**全面轉向華人娛樂城風**，原 Monte Carlo 體系下架。

---

## 2. 目標

- 首頁視覺整體對齊 3A 遊戲城的調性與版面結構
- 保留專案現有 18 款遊戲（Dice / Hilo / Keno / Wheel / Mini-Roulette / Hotline / Mines / Plinko / Tower / Carnival / Rocket / Aviator / Space-Fleet / JetX / Balloon / JetX3 / Double-X / Plinko-X），但**不沿用 Monte Carlo 視覺包裝**
- 以「館別」概念重新組織遊戲入口（3 館）
- 加入華人博彩玩家習慣的功能元件：公告跑馬燈、中獎跑馬燈、今日贏家榜、在線人數、浮動客服
- **純前端改版**：不動後端 API、資料庫 schema、Provably Fair 演算法

**非目標**：
- 不做行動裝置原生 App
- 不做任何金流 UI（點數僅由代理後台派發，使用者端**沒有任何主動加值 / 提領 / 購買入口**）
- 不改 18 款遊戲本身的 Pixi 渲染與玩法
- 不改後端下注邏輯、PF 測試向量、控制系統
- 不加多語系（本次仍為繁中主力）

---

## 3. 設計系統（Design Tokens）

改寫 `packages/ui-tokens/tailwind.preset.ts`，**下架**現有的 ivory / felt / brass / wine / ink 色系與 Bodoni Moda / Italiana / IBM Plex Mono 字體。

### 3.1 配色

| Token | 值 | 用途 |
|---|---|---|
| `bg.page` | `#ECECEC` | 頁面主底色（淺灰） |
| `bg.card` | `#FFFFFF` | 卡片底色 |
| `bg.section` | `#F5F7FA` | 區段間隔底色（銀白） |
| `bg.dark` | `#1A2530` | TopBar / 中獎跑馬燈底色 |
| `text.primary` | `#0F172A` | 主要文字（深藏青） |
| `text.secondary` | `#4A5568` | 次要文字 |
| `text.muted` | `#9CA3AF` | 輔助說明文字 |
| `text.onDark` | `#FFFFFF` | 深色底上的文字 |
| `accent.primary` | `#186073` | 主題色（深青）—按鈕/連結/重點 |
| `accent.hover` | `#1E7A90` | Hover 狀態 |
| `accent.gold` | `#C9A247` | 獎金/VIP 等級/中獎跑馬燈 |
| `accent.goldLight` | `#E8D48A` | Top 3 贏家榜底色漸層 |
| `alert.announcement` | `#D4574A` | 公告跑馬燈紅字 |
| `success` | `#09B826` | 成功狀態 / 線上人數綠點 |
| `border.soft` | `#E5E7EB` | 卡片邊框 |
| `border.accent` | `#186073` | 強調邊框（CTA 卡） |

### 3.2 字體

| Token | 值 | 用途 |
|---|---|---|
| `font.sans` | `Inter, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif` | 全站預設 |
| `font.num` | `"Roboto Mono", "SF Mono", ui-monospace, monospace` | 金額、倍率、賠率（等寬對齊） |
| `font.brand` | `Inter`（字重 700-800、字距 +0.05em） | Logo / H1 |

**字級**：
- H1：24-28px / 700
- H2：20px / 600
- H3：16-18px / 600
- Body：14-16px / 400
- Caption：12-13px / 400
- Numeric：遵循上下文字級，強制 `font.num`

### 3.3 Shadow / Radius

- `radius.card`：`10px`
- `radius.button`：`6px`
- `shadow.card`：`0 2px 8px rgba(15, 23, 42, 0.06)`
- `shadow.cardHover`：`0 8px 20px rgba(24, 96, 115, 0.18)`
- `shadow.dark`：`0 2px 12px rgba(0, 0, 0, 0.3)`

### 3.4 動畫（保留必要的，移除原本的 brass-shimmer / seal-breath / crystal-breath 等 Monte Carlo 裝飾動畫）

| Keyframe | 用途 |
|---|---|
| `ticker` | 跑馬燈橫向滾動（保留，現有） |
| `breath` | 在線人數綠點呼吸（0.8 → 1.0 opacity） |
| `card-lift` | 館卡 hover 升起 |
| `gold-pulse` | 中獎金字微脈動（可選） |

---

## 4. 首頁版面結構

```
┌──────────────────────────────────────────────────────────┐
│ TopBar — 黑底 #1A2530                                     │
│ [Logo] [優惠][紀錄][驗證]...[a2518995][訊息][VIP1]          │
├──────────────────────────────────────────────────────────┤
│ AnnouncementTicker — 白底 / 紅字                          │
│ 📢 最新公告 ➤ ★系統升級 ★新遊戲上架 ★防詐騙 ...           │
├──────────────────────────────────────────────────────────┤
│ WinTicker — 深底 #1A2530 / 金字 #C9A247                   │
│ 🏆 玩家 a***995 在 JetX 贏得 12,450 點 (×24.6) ...        │
├──────────────────────────────────────────────────────────┤
│ HeroBanner — 1280×407 圖片輪播 (8-10 張)                  │
│ [< ●○○○○ >]                                              │
├──────────────────────────────────────────────────────────┤
│ HallEntrances — 3 館入口卡片並排                           │
│ [Crash 飛行館]  [經典電子館]  [策略電子館]                 │
├──────────────────────────────────────────────────────────┤
│ TodayWinners — 今日贏家榜（Top 10 表格）                   │
│ ┌─排名─┬─玩家────┬─遊戲───┬─倍率─┬─贏得──┐             │
│ │  1  │ V***IP1 │ JetX   │ ×88  │ 88000 │             │
│ │ ... 前 10 名，Top 3 金色背景                           │             │
│ └────────────────────────────────────────────┘           │
├──────────────────────────────────────────────────────────┤
│ FeaturesStrip — 4 賣點橫條                                │
│ [🎯 公平可驗證] [🔐 加密保障] [⚡ 秒速派彩] [🎮 24H 客服]   │
├──────────────────────────────────────────────────────────┤
│ PartnerLogos — 授權 / 合作 logo 牆                         │
│ [Fair Play] [SSL] [Audit] [18+] [Provably Fair]          │
├──────────────────────────────────────────────────────────┤
│ Footer                                                   │
│ [新手幫助][關於我們][服務條款][聯絡我們]                    │
│ [IG][FB][LINE][Telegram]                                 │
│ Copyright © 2026 3A All Rights Reserved      v1.0.1      │
└──────────────────────────────────────────────────────────┘

右下固定浮層:
  ┌─────────────┐
  │  💬 線上客服  │
  ├─────────────┤
  │ 🟢 在線 1,247│
  └─────────────┘
```

**內容寬度**：1280px 置中；< 1280 時縮放（RWD 範圍 768-1920，最小支援 tablet 橫版）。

---

## 5. 各元件規格

### 5.1 TopBar
- 高度：64px
- 底色：`bg.dark` `#1A2530`
- 文字：`text.onDark`
- 左：Logo（保留 `logo.gif` 暫用，後續可替換為 SVG）
- 中：導覽連結 `優惠 / 遊戲紀錄 / 公平驗證`
  - `/promos` — 優惠頁（展示用，可放活動卡片占位）
  - `/history` — 遊戲紀錄（已存在頁，保留）
  - `/verify` — Provably Fair 驗證頁（新增入口）
  - **明確下架**：「充值 / 存款 / 入款 / 購買點數 / 提款 / 提領 / 轉帳 / 託售」等所有金流相關字樣與入口（本專案點數**僅由代理後台派發**，使用者端無主動加值途徑；3A 原站的金流元素一律不抄）
- 右：
  - 使用者名稱（例：`a2518995`，含 `VIP1` badge，金色 `accent.gold`）
  - 主錢包點餘額（連至 `/service/personal`）
  - 訊息 icon（連至 `/service/message`）
- Hover：連結底線 + 金色
- 未登入時：右側改為「登入 / 註冊」按鈕（深青）

### 5.2 AnnouncementTicker（公告跑馬燈）
- 高度：36px
- 底色：白 `bg.card`
- 字色：紅 `alert.announcement`
- 內容：前綴「📢 最新公告 ➤」+ 10 條假公告文字橫向滾動
- 假公告題材（**不可出現任何金流字樣**，本專案點數僅由代理後台派發）：
  - ★系統維護升級公告★
  - ★新遊戲 JetX3 震撼上架★
  - 【鄭重聲明】請認明唯一官方 LINE 帳號
  - 【防詐騙提醒】切勿輕信代操
  - ★每週倍率王活動開跑★
  - ★VIP 等級制度全面更新★
  - 【公平驗證說明】每局可自行驗證結果
  - ★客服時段調整公告★
  - **下架**：任何含「儲值 / 充值 / 存款 / 入款 / USDT / 金流 / 託售」字樣的假公告
- 資料來源：`apps/web/src/data/fakeAnnouncements.ts`（前端寫死）
- 滾動：CSS `animation: ticker 40s linear infinite`
- Hover 暫停（可選）

### 5.3 WinTicker（中獎跑馬燈）
- 高度：36px（疊在公告正下方）
- 底色：`bg.dark` `#1A2530`
- 字色：金 `accent.gold`
- 格式：`🏆 玩家 {masked} 在 {game} 贏得 {win} 點 (×{mult})`
- 資料來源：`apps/web/src/data/fakeStats.ts` → `FAKE_WIN_TICKER`（60-80 筆，涵蓋 18 款遊戲）
- **假資料驅動**：前端每 5 秒從陣列隨機插新筆到尾端，舊的滾出就拋棄；佇列維持 8-12 筆
- 滾動：50 px/sec

### 5.4 HeroBanner（主 Banner 輪播）
- 尺寸：1280×407（RWD 時等比縮放）
- 圖數：暫放 4-6 張占位（後續由營運替換），圖放在 `apps/web/public/banners/`
- 自動輪播：5 秒切換，fade + slide 過場
- 指示器：底部圓點（當前為金色 `accent.gold`）
- 左右箭頭：Hover 時顯示
- 點擊：每張 banner 可設定跳轉 URL（先全部指向 `/hall/crash` 之類）

### 5.5 HallEntrances（3 館入口）
排列：橫向 3 欄 grid，每欄 `flex: 1`，gap 24px。

**每張館卡規格**：
- 尺寸：約 410×280px
- 背景：白 `bg.card` + 館別專屬色漸層覆蓋 30%
- 邊框：1px `border.soft`，Hover 變 `border.accent`（深青）
- 陰影：`shadow.card` → Hover `shadow.cardHover`
- Hover 動效：`translateY(-4px)` + 邊框發光
- 內容結構（上下兩段）：
  - 上 2/3：館別主視覺插圖（SVG / 插畫，透明底）
  - 下 1/3：館名（H2 24px/700） + tagline（14px secondary） + 「N 款遊戲」（12px muted） + CTA「立即進入 →」（深青按鈕）

**三館內容表**：

| 館 ID | 名稱 | 背景色調 | 視覺 | Tagline | 遊戲 |
|---|---|---|---|---|---|
| `crash` | 🚀 Crash 飛行館 | 太空深藍 → 橘火箭 | 火箭飛行軌跡插畫 | 倍率無上限，敢飛敢收 | Rocket / Aviator / Space-Fleet / JetX / Balloon / JetX3 / Double-X / Plinko-X（8 款） |
| `classic` | 🎯 經典電子館 | 深青 `accent.primary` 低飽和 | 骰子 / 輪盤 / 骨牌 | 經典玩法，純粹手感 | Dice / Hilo / Keno / Wheel / Mini-Roulette / Hotline（6 款） |
| `strategy` | 💎 策略電子館 | 深綠 + 金 `accent.gold` 點綴 | 礦石 / 階梯 / 盤面 | 策略取勝，拆彈解謎 | Mines / Plinko / Tower / Carnival（4 款） |

點擊卡片 → `/hall/{hallId}` → 該館遊戲網格頁。

### 5.6 TodayWinners（今日贏家榜）
- 位置：館卡下方
- 標題列：「🏆 今日贏家榜」（H2 20px/600，左）+「每日 00:00 重置」（caption muted，右）
- 表格樣式：
  - 欄位：排名 / 玩家（遮蔽名）/ 遊戲 / 倍率 / 贏得
  - 表頭：深青底 `accent.primary` + 白字
  - 列高：48px
  - 奇偶列背景：白 / `bg.section`
  - 倍率、贏得欄：`font.num` 等寬數字
- Top 3 特殊樣式：
  - 第 1 名：金 `accent.gold` 背景漸層 + 🥇 icon
  - 第 2 名：銀 `#C0C0C0` 背景漸層 + 🥈
  - 第 3 名：銅 `#CD7F32` 背景漸層 + 🥉
- 資料來源：`fakeStats.ts` → `FAKE_TODAY_TOP10`（10 筆寫死）
- 每 30 秒：整體洗牌（前 3 名變動機率 10%，後 7 名變動機率 50%）

### 5.7 FeaturesStrip（4 賣點）
- 4 欄 grid 等寬，每欄：
  - 上：icon 40px（Lucide / 自繪 SVG）
  - 中：標題（16px/600）
  - 下：一句說明（13px secondary）
- 項目：
  1. 🎯 **公平可驗證** — Provably Fair 演算法，每局可獨立驗證結果
  2. 🔐 **加密保障** — 128 位加密傳輸，資料安全無虞
  3. ⚡ **秒速派彩** — 注單結算即時到點
  4. 🎮 **24H 客服** — LINE / Telegram 全天候回覆

### 5.8 PartnerLogos（合作 logo 牆）
- 5-6 個灰階 logo 橫排
- 項目（占位，後續替換）：Fair Play / SSL / Audit / 18+ / Provably Fair / Responsible Gaming
- 高度 60-80px
- Hover：轉為彩色

### 5.9 Footer
- 底色：`bg.section`
- 三欄：
  - 左：快捷連結（新手幫助 / 關於我們 / 服務條款 / 聯絡我們）
  - 中：社群 icon（IG / FB / LINE / Telegram，對應真實連結可後續設）
  - 右：Copyright + 版本號 `v1.0.1`
- 額外：「18+ 負責任博彩」聲明小字 + 「本站為技術研究用假幣平台」提醒（符合 CLAUDE.md 規則）

### 5.10 浮動客服 + 在線人數
- 位置：right: 20px, bottom: 20px，`position: fixed`
- 兩塊垂直疊：
  - 上：客服按鈕 60×60 圓形，深青底 + 💬 icon + hover 轉金色
  - 下：在線人數面板 100×48 圓角卡片，白底 + 深青邊框，🟢（呼吸動畫）+「在線 1,247」
- 在線人數來源：`fakeStats.ts` → `FAKE_ONLINE_BASE = 1247`，每 30 秒 `base ± Math.random() * 100 - 50`
- 點客服按鈕：打開 modal，顯示 LINE / Telegram / Email 連結（不做真實聊天）

---

## 6. 館內頁（/hall/:hallId）

**非首頁重點，但必須一併改版**以維持視覺一致。

結構：
```
┌──────────────────────────────────┐
│ TopBar（同首頁）                   │
├──────────────────────────────────┤
│ 公告跑馬燈 + 中獎跑馬燈（同首頁）    │
├──────────────────────────────────┤
│ 館別 Hero Banner（1280×200，該館主視覺大圖）│
│ 「🚀 Crash 飛行館 — 倍率無上限」     │
├──────────────────────────────────┤
│ 左 2/3: 遊戲卡片網格              │
│ ┌──┐┌──┐┌──┐┌──┐                │
│ └──┘└──┘└──┘└──┘                │
│ ┌──┐┌──┐┌──┐┌──┐                │
│ └──┘└──┘└──┘└──┘                │
│                                  │
│ 右 1/3: 即時贏家側欄（原 À la Table，樣式改配色）│
├──────────────────────────────────┤
│ Footer                            │
└──────────────────────────────────┘
```

### 6.1 GameCard（改版）
- 保留現有動效骨架，改配色
- 尺寸：比例 3:4
- 背景：白 `bg.card`
- 邊框：`border.soft` → Hover `border.accent`
- 內容：
  - 上：遊戲封面圖（沿用 `/public/games/{id}.jpg`，缺圖以 emoji 替代）
  - 下：遊戲中文名（16px/600）+ 英文名（12px muted）
  - 右下角 badge：HOT（紅）/ NEW（金）/ VIP（深青）
- Hover：升起 4px + 封面圖 scale(1.05) + 顯示「立即遊玩」深青覆蓋按鈕

### 6.2 即時贏家側欄（LiveWins）
- 沿用現有邏輯（`apps/web/src/components/LiveWins.tsx` 類似位置）
- 樣式改：白底 + 深青標題條 + 金色倍率字
- 同樣用 `fakeStats.ts` 資料，不打 API

---

## 7. 假資料檔案

`apps/web/src/data/fakeStats.ts`（新建）：

```ts
// 嚴禁出現「充值 / 存款 / 入款 / USDT / 金流 / 託售 / 提款 / 儲值」等金流字樣
export const FAKE_ANNOUNCEMENTS: string[] = [
  '★系統維護升級公告★',
  '★新遊戲 JetX3 震撼上架★',
  '【鄭重聲明】請認明唯一官方 LINE 帳號',
  '【防詐騙提醒】切勿輕信代操',
  '★每週倍率王活動開跑★',
  '★VIP 等級制度全面更新★',
  '【公平驗證說明】每局可自行驗證結果',
  '★客服時段調整公告★',
  '★Crash 飛行館倍率無上限挑戰★',
  '【負責任博彩提醒】理性遊戲',
];

interface WinRecord {
  player: string;   // 遮蔽過的名字
  game: string;     // 遊戲中文名
  mult: number;     // 倍率
  win: number;      // 贏得點數
}

export const FAKE_WIN_TICKER: WinRecord[] = [
  { player: 'a***995', game: 'JetX',     mult: 24.6,  win: 12450 },
  // ... 60-80 筆涵蓋全部 18 款遊戲
];

export const FAKE_TODAY_TOP10: Array<WinRecord & { rank: number }> = [
  { rank: 1, player: 'V***IP1', game: 'JetX',    mult: 88.0, win: 88000 },
  // ... 10 筆
];

export const FAKE_ONLINE_BASE = 1247;

export function getDriftedOnlineCount(): number {
  return FAKE_ONLINE_BASE + Math.floor(Math.random() * 100 - 50);
}
```

---

## 8. 受影響檔案（Implementation Plan 階段會細拆）

**改寫**：
- `packages/ui-tokens/tailwind.preset.ts` — 色票 + 字體 + 動畫 token 全面重做
- `apps/web/src/styles/global.css` — 全站 base style
- `apps/web/src/components/layout/AppShell.tsx` — 整個 Shell（TopBar / Footer / 浮動層）重寫
- `apps/web/src/pages/LobbyPage.tsx` — 首頁大改，從 Hero+Grid 改成多區塊結構
- `apps/web/src/components/GameCard.tsx` — 配色與動效調整

**新增**：
- `apps/web/src/data/fakeStats.ts`
- `apps/web/src/data/fakeAnnouncements.ts`
- `apps/web/src/components/home/AnnouncementTicker.tsx`
- `apps/web/src/components/home/WinTicker.tsx`
- `apps/web/src/components/home/HeroBanner.tsx`
- `apps/web/src/components/home/HallEntrances.tsx`（+ 3 張館卡子組件）
- `apps/web/src/components/home/TodayWinners.tsx`
- `apps/web/src/components/home/FeaturesStrip.tsx`
- `apps/web/src/components/home/PartnerLogos.tsx`
- `apps/web/src/components/layout/FloatingSupport.tsx`
- `apps/web/src/components/layout/OnlineCount.tsx`
- `apps/web/src/pages/HallPage.tsx`（館內頁）
- `apps/web/src/router.tsx` 加 `/hall/:hallId` 路由
- `apps/web/public/banners/*.jpg` 占位圖（placeholder 即可）
- `apps/web/public/halls/*.png` 3 館主視覺占位

**保留不動**：
- `apps/server/**`（後端 API 完全不碰）
- `packages/provably-fair/**`（PF 演算法、測試向量）
- `prisma/schema.prisma`
- 18 款遊戲本體 Pixi 實作（`apps/web/src/games/**`）
- `packages/shared/**`

---

## 9. 風險與取捨

1. **假數據的合法性**：本專案是假幣技術研究平台，中獎跑馬燈 / 贏家榜本來就不指向真實金流，風險低。README / 註冊頁需維持「技術研究用途、非真實博彩」聲明。
2. **色彩對比與 a11y**：淺灰底 `#ECECEC` + 深藏青字 `#0F172A` 對比足夠；金色按鈕底上的白字需測試（可能需要 shadow 提高可讀性）。
3. **舊 Monte Carlo 資產棄用**：蠟封、花式符號、seal-breath 動畫等資產直接刪除（不做 feature flag 切換）。若未來要留後路可放 `legacy/` 資料夾，但**此次不做**。
4. **RWD 範圍**：設計以 1280px desktop 為主，768-1920 響應式，手機 < 768 暫不深度優化（館卡堆疊即可）。
5. **Banner 圖片來源**：先放 placeholder（純色塊 + 文字），不 scrape 其他站資產避免版權問題。
6. **館別視覺插圖**：若無法短時間做出高質感插圖，首版用 CSS gradient + 大 emoji + 館名文字組成 hero；插畫可後續迭代替換。

---

## 10. 交付項目

- 設計 spec（本檔）
- 後續 implementation plan（由 writing-plans 產出）
- 改版後前端可在 `pnpm dev` 下啟動，首頁外觀整體對齊華人娛樂城風
- 三館入口點擊可正確導向 `/hall/:hallId`
- 假數據驅動的跑馬燈、贏家榜、在線人數平滑循環
- `pnpm lint && pnpm typecheck && pnpm test` 全綠

---

## 11. 後續步驟

1. 使用者 review 本 spec
2. approve 後呼叫 `writing-plans` skill 產出 `docs/superpowers/plans/2026-04-21-ui-redesign-plan.md`
3. 依 plan 逐步實作並交付
