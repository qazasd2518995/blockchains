# UI Redesign Implementation Plan — 華人娛樂城風

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `apps/web` 前端視覺從 Monte Carlo 精品賭場風全面改造成華人娛樂城風（參考 3A 遊戲城），保留 18 款遊戲功能，加入跑馬燈 / 三館入口 / 今日贏家榜 / 浮動客服 等元件，所有動態資料用寫死的 fake data。

**Architecture:** 純前端改造。改寫 `packages/ui-tokens/tailwind.preset.ts` 的 design tokens（配色／字體／動畫）；重寫 `AppShell` 成 TopBar + 雙跑馬燈 + 浮動客服 layout；重寫 `LobbyPage` 成多區塊首頁；新增 `HallPage` 作為館內頁；所有跑馬燈 / 贏家榜 / 在線人數由前端 `fakeStats.ts` 驅動。後端 API、資料庫、PF、18 款遊戲本身完全不動。

**Tech Stack:** React 18 + React Router 6 + Tailwind 4 + 自建組件 + Zustand + i18n（現有 `dict.zh.ts`）+ lucide-react icons。

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-04-21-ui-redesign-design.md`
- Rules: `CLAUDE.md`（錢用 Decimal / 不做金流 UI / 繁中為主）

---

## File Structure

### 會改寫的現有檔

| 路徑 | 當前職責 | 改寫後職責 |
|---|---|---|
| `packages/ui-tokens/tailwind.preset.ts` | Monte Carlo 色票 / 字體 / 動畫 | 華人娛樂城 tokens（淺灰底 + 深青 + 金色） |
| `apps/web/src/styles/global.css` | Gilded Salon base style | 新 base style，移除花式符號 |
| `apps/web/src/components/layout/AppShell.tsx` | 綠絨側邊欄 + 象牙 TopBar | 黑底 TopBar + 2 條跑馬燈 + Footer + 浮動客服 |
| `apps/web/src/pages/LobbyPage.tsx` | Hero + Filter + Grid + LiveWins 側欄 | 新 Hero Banner + 3 館入口 + 今日贏家榜 + 4 賣點 + 合作 logo |
| `apps/web/src/router.tsx` | 現有路由 | 加 `/hall/:hallId`、`/verify` 占位路由 |
| `apps/web/src/i18n/dict.zh.ts` | 現有繁/簡中字串 | 加入新元件的繁中字串 |
| `apps/web/src/i18n/dict.en.ts` | 英文字串 | 同步加入對應英文字串 |
| `apps/web/src/i18n/types.ts` | 字典型別 | 對應加新欄位 |

### 會新增的檔

| 路徑 | 職責 |
|---|---|
| `apps/web/src/data/fakeStats.ts` | 假贏家紀錄 / 在線人數 drift |
| `apps/web/src/data/fakeAnnouncements.ts` | 假公告列表 |
| `apps/web/src/data/halls.ts` | 3 館的 metadata（名稱 / tagline / 遊戲 id 列表 / 主色） |
| `apps/web/src/components/home/AnnouncementTicker.tsx` | 白底紅字公告跑馬燈 |
| `apps/web/src/components/home/WinTicker.tsx` | 黑底金字中獎跑馬燈 |
| `apps/web/src/components/home/HeroBanner.tsx` | 1280×407 大圖輪播 |
| `apps/web/src/components/home/HallEntrances.tsx` | 3 館入口卡片 |
| `apps/web/src/components/home/TodayWinners.tsx` | 今日贏家榜 Top 10 表格 |
| `apps/web/src/components/home/FeaturesStrip.tsx` | 4 賣點橫條 |
| `apps/web/src/components/home/PartnerLogos.tsx` | 合作 logo 牆 |
| `apps/web/src/components/layout/FloatingSupport.tsx` | 右下浮動客服按鈕 + 在線人數 |
| `apps/web/src/components/game/GameCardNew.tsx` | 新版遊戲卡片（與現有 GameHeader 同目錄） |
| `apps/web/src/pages/HallPage.tsx` | 館內頁（遊戲網格 + 即時贏家側欄） |
| `apps/web/src/pages/VerifyPage.tsx` | Provably Fair 驗證頁占位 |
| `apps/web/src/pages/PromosPage.tsx` | 優惠頁占位 |

### 會被刪除的資產（最後一併清掉，不做 feature flag）

- 象牙 / 綠絨 / 黃銅 / 酒紅相關 CSS class（`panel-salon-soft`、`btn-brass`、`big-num-brass`、`divider-suit`、`label-brass` 等）
- 花式符號（♠◆♥♣、蠟封、script 字體）
- `brass-shimmer` / `seal-breath` / `crystal-breath` 動畫

---

## Testing Strategy

本專案前端目前**沒有前端單元測試**（`package.json` 寫死 `test: "echo (web has no tests yet)"`）。測試策略：

1. **型別驗證**：每個 Task 結束跑 `pnpm --filter @bg/web typecheck`，必過
2. **Lint**：`pnpm lint` 必過
3. **手動驗證**：每個視覺 Task 結束跑 `pnpm --filter @bg/web dev`，在 `localhost:5173` 看該 task 的元件是否呈現正確
4. **既有單元測試**：`pnpm test` 只跑後端與 PF 包的測試，必過（我們不動後端，應自動維持綠）

不新增前端單元測試（Pixi / React 測試成本 > 收益，且此次是純視覺改版）。

---

## 任務分解

**任務依賴關係**：
```
Task 0 (build worktree)
  ↓
Task 1 (design tokens)
  ↓
Task 2 (fake data) — 不依賴 Task 1，可並行
  ↓
Task 3 (global.css)
  ↓
Task 4 (AnnouncementTicker) → Task 5 (WinTicker) → Task 6 (FloatingSupport)
  ↓
Task 7 (HeroBanner)
  ↓
Task 8 (halls.ts 資料) → Task 9 (HallEntrances)
  ↓
Task 10 (TodayWinners) → Task 11 (FeaturesStrip) → Task 12 (PartnerLogos)
  ↓
Task 13 (AppShell 重寫)
  ↓
Task 14 (LobbyPage 重寫)
  ↓
Task 15 (GameCardNew)
  ↓
Task 16 (HallPage)
  ↓
Task 17 (VerifyPage / PromosPage 占位)
  ↓
Task 18 (router 加新路由)
  ↓
Task 19 (清理舊 CSS class 與遺留符號)
  ↓
Task 20 (最終 smoke test + commit)
```

---

### Task 0: 準備工作樹 + 基準檢查

**Files:** 無檔案修改

- [ ] **Step 1:** 確認在 `main` branch，git 乾淨

```bash
git status
git branch --show-current
```

Expected: `working tree clean`；branch `main`。

- [ ] **Step 2:** 跑當前 baseline 檢查

```bash
pnpm --filter @bg/web typecheck
pnpm --filter @bg/ui-tokens build
pnpm test --filter=!@bg/web
```

Expected: 全綠。若有失敗先記錄（但不修復；本 plan 不處理既有 bug）。

- [ ] **Step 3:** 檢查 `apps/web/public/banners/` 是否存在，不存在就建

```bash
mkdir -p apps/web/public/banners apps/web/public/halls
```

- [ ] **Step 4:** 建一個 checkpoint commit（空操作）

```bash
git commit --allow-empty -m "chore(ui-redesign): begin UI redesign to Chinese casino style"
```

---

### Task 1: 改寫 Tailwind preset — 華人娛樂城 tokens

**Files:**
- Modify: `packages/ui-tokens/tailwind.preset.ts`（完整覆寫）

- [ ] **Step 1:** 完整覆寫 `packages/ui-tokens/tailwind.preset.ts` 為：

```ts
import type { Config } from 'tailwindcss';

/**
 * 華人娛樂城風 Tailwind preset
 * 配色：淺灰底 + 白卡片 + 深青強調 + 金色獎金
 * 字體：Inter + Noto Sans TC + 等寬數字
 */
export const tokensPreset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 頁面 / 卡片
        page: '#ECECEC',
        card: '#FFFFFF',
        section: '#F5F7FA',
        dark: '#1A2530',
        // 文字
        ink: {
          primary: '#0F172A',
          secondary: '#4A5568',
          muted: '#9CA3AF',
          onDark: '#FFFFFF',
        },
        // 主題色（深青）
        teal: {
          50: '#E6F1F4',
          100: '#C0DCE3',
          200: '#7BB3C2',
          300: '#408A9D',
          400: '#266F85',
          500: '#186073',   // primary accent
          600: '#135566',
          700: '#0E4555',
          800: '#093040',
          900: '#051E2B',
        },
        // 金色（VIP / 獎金）
        gold: {
          50: '#FAF2D7',
          100: '#F3E5AE',
          200: '#E8D48A',   // 贏家榜 Top3 淡金
          300: '#DEBE66',
          400: '#D0AC4D',
          500: '#C9A247',   // 獎金 / 中獎跑馬燈字色
          600: '#AE8B35',
          700: '#876A27',
          800: '#5A471A',
          900: '#2F260D',
        },
        // 公告紅
        alert: '#D4574A',
        // 成功 / 線上
        success: '#09B826',
        // 排名銀銅
        silver: '#C0C0C0',
        bronze: '#CD7F32',
        // 邊框
        border: {
          soft: '#E5E7EB',
          accent: '#186073',
        },
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans TC"', '"PingFang TC"', '"Microsoft JhengHei"', 'system-ui', 'sans-serif'],
        num: ['"Roboto Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
        brand: ['Inter', '"Noto Sans TC"', 'sans-serif'],
      },
      letterSpacing: {
        brand: '0.05em',
      },
      borderRadius: {
        card: '10px',
        btn: '6px',
      },
      boxShadow: {
        card: '0 2px 8px rgba(15, 23, 42, 0.06)',
        cardHover: '0 8px 20px rgba(24, 96, 115, 0.18)',
        'dark': '0 2px 12px rgba(0, 0, 0, 0.3)',
        'teal-ring': '0 0 0 3px rgba(24, 96, 115, 0.25)',
      },
      keyframes: {
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        breath: {
          '0%, 100%': { opacity: '0.8' },
          '50%': { opacity: '1' },
        },
        'card-lift': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-4px)' },
        },
      },
      animation: {
        ticker: 'ticker 50s linear infinite',
        'ticker-slow': 'ticker 80s linear infinite',
        breath: 'breath 1.6s ease-in-out infinite',
      },
    },
  },
};

export default tokensPreset;
```

- [ ] **Step 2:** Build 確認 preset 能編譯

```bash
pnpm --filter @bg/ui-tokens build
```

Expected: 成功；檢視 `packages/ui-tokens/dist/tailwind.preset.js` 確認 tokens 含 `teal` / `gold` / `page`。

- [ ] **Step 3:** 此時 `apps/web` 的 class 會壞（因為用了舊 token 如 `bg-ivory-100`、`text-brass-700` 等等）。**先不修**，Task 3 重寫 global.css 與 Task 13-14 重寫 Shell/Lobby 時會一起改。跑 typecheck 確認 TypeScript 本身沒壞（class 字串壞不會被 TS 抓到）：

```bash
pnpm --filter @bg/web typecheck
```

Expected: 綠。

- [ ] **Step 4:** Commit

```bash
git add packages/ui-tokens/tailwind.preset.ts
git commit -m "feat(ui-tokens): rewrite tokens for Chinese casino theme

- Light gray page + white cards + deep teal (#186073) accent + gold (#C9A247)
- Inter + Noto Sans TC; Roboto Mono for numbers
- Ticker / breath / card-lift keyframes; remove Monte Carlo animations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 建立假資料

**Files:**
- Create: `apps/web/src/data/fakeAnnouncements.ts`
- Create: `apps/web/src/data/fakeStats.ts`

- [ ] **Step 1:** 建 `apps/web/src/data/fakeAnnouncements.ts`

```ts
// 公告跑馬燈假資料
// 嚴禁出現「充值 / 存款 / 入款 / USDT / 金流 / 託售 / 提款 / 儲值」等金流字樣
// 本專案點數僅由代理後台派發，使用者端無加值途徑
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
```

- [ ] **Step 2:** 建 `apps/web/src/data/fakeStats.ts`

```ts
export interface WinRecord {
  player: string;   // 遮蔽後的顯示名，例：'a***995'
  game: string;     // 遊戲中文名
  gameId: string;   // 對應 GameId
  mult: number;     // 倍率
  win: number;      // 贏得點數
}

export interface RankedWinRecord extends WinRecord {
  rank: number;
}

// 全部 18 款遊戲都要出現過
export const FAKE_WIN_TICKER: WinRecord[] = [
  { player: 'a***995', game: '飆速X',      gameId: 'jetx',         mult: 24.6,  win: 12450  },
  { player: 'b***123', game: '飛行員',      gameId: 'aviator',      mult: 88.0,  win: 88000  },
  { player: 'c***456', game: '踩地雷',      gameId: 'mines',        mult: 45.5,  win: 45200  },
  { player: 'd***789', game: '彈珠台',      gameId: 'plinko',       mult: 32.0,  win: 12800  },
  { player: 'e***012', game: '骰子',        gameId: 'dice',         mult: 9.9,   win: 4950   },
  { player: 'f***234', game: '火箭',        gameId: 'rocket',       mult: 16.07, win: 80350  },
  { player: 'g***567', game: '熱線',        gameId: 'hotline',      mult: 1000,  win: 500000 },
  { player: 'h***890', game: '疊塔',        gameId: 'tower',        mult: 5.4,   win: 16200  },
  { player: 'i***111', game: '猜大小',      gameId: 'hilo',         mult: 3.2,   win: 6400   },
  { player: 'j***222', game: '基諾',        gameId: 'keno',         mult: 2.1,   win: 2100   },
  { player: 'k***333', game: '彩色轉輪',    gameId: 'wheel',        mult: 4.8,   win: 7200   },
  { player: 'l***444', game: '迷你輪盤',    gameId: 'mini-roulette', mult: 11.5, win: 34500  },
  { player: 'm***555', game: '太空艦隊',    gameId: 'space-fleet',  mult: 8.7,   win: 26100  },
  { player: 'n***666', game: '氣球',        gameId: 'balloon',      mult: 14.2,  win: 28400  },
  { player: 'o***777', game: '飆速X3',      gameId: 'jetx3',        mult: 52.0,  win: 156000 },
  { player: 'p***888', game: '雙倍X',       gameId: 'double-x',     mult: 7.3,   win: 14600  },
  { player: 'q***999', game: '掉珠挑戰X',   gameId: 'plinko-x',     mult: 19.9,  win: 39800  },
  { player: 'r***000', game: '狂歡節',      gameId: 'carnival',     mult: 6.6,   win: 13200  },
  // 再來一輪加變化，讓總數 > 18
  { player: 's***112', game: '飛行員',      gameId: 'aviator',      mult: 12.3,  win: 18450  },
  { player: 't***334', game: '飆速X',       gameId: 'jetx',         mult: 44.0,  win: 88000  },
  { player: 'u***556', game: '踩地雷',      gameId: 'mines',        mult: 18.8,  win: 56400  },
  { player: 'v***778', game: '彈珠台',      gameId: 'plinko',       mult: 9.1,   win: 18200  },
  { player: 'w***990', game: '骰子',        gameId: 'dice',         mult: 5.5,   win: 11000  },
  { player: 'x***113', game: '熱線',        gameId: 'hotline',      mult: 250,   win: 125000 },
  { player: 'y***224', game: '火箭',        gameId: 'rocket',       mult: 3.8,   win: 7600   },
  { player: 'z***335', game: '疊塔',        gameId: 'tower',        mult: 2.7,   win: 5400   },
];

export const FAKE_TODAY_TOP10: RankedWinRecord[] = [
  { rank: 1,  player: 'V***IP1',  game: '飆速X',      gameId: 'jetx',      mult: 88.0, win: 880000 },
  { rank: 2,  player: 'a***995',  game: '踩地雷',     gameId: 'mines',     mult: 45.5, win: 452000 },
  { rank: 3,  player: 'b***123',  game: '飛行員',     gameId: 'aviator',   mult: 32.0, win: 128000 },
  { rank: 4,  player: 'c***456',  game: '熱線',       gameId: 'hotline',   mult: 500,  win: 100000 },
  { rank: 5,  player: 'd***789',  game: '彈珠台',     gameId: 'plinko',    mult: 18.5, win: 74000  },
  { rank: 6,  player: 'e***012',  game: '火箭',       gameId: 'rocket',    mult: 22.0, win: 66000  },
  { rank: 7,  player: 'f***234',  game: '飆速X3',     gameId: 'jetx3',     mult: 12.0, win: 48000  },
  { rank: 8,  player: 'g***567',  game: '氣球',       gameId: 'balloon',   mult: 9.5,  win: 28500  },
  { rank: 9,  player: 'h***890',  game: '迷你輪盤',   gameId: 'mini-roulette', mult: 11.0, win: 22000 },
  { rank: 10, player: 'i***111',  game: '疊塔',       gameId: 'tower',     mult: 5.0,  win: 15000  },
];

export const FAKE_ONLINE_BASE = 1247;

export function getDriftedOnlineCount(): number {
  return FAKE_ONLINE_BASE + Math.floor(Math.random() * 100 - 50);
}

// 洗牌工具：前 3 名變動機率 10%、後 7 名變動機率 50%
export function reshuffleTop10(current: RankedWinRecord[]): RankedWinRecord[] {
  const next = current.map((r) => ({ ...r }));
  for (let i = 0; i < next.length; i++) {
    const target = next[i];
    if (!target) continue;
    const shouldShuffle = i < 3 ? Math.random() < 0.1 : Math.random() < 0.5;
    if (!shouldShuffle) continue;
    // 小幅度抖動 win / mult
    target.win = Math.max(1000, Math.floor(target.win * (0.9 + Math.random() * 0.25)));
    target.mult = Math.max(1.5, Number((target.mult * (0.9 + Math.random() * 0.25)).toFixed(2)));
  }
  // 按 win 重新排序
  next.sort((a, b) => b.win - a.win);
  return next.map((r, idx) => ({ ...r, rank: idx + 1 }));
}
```

- [ ] **Step 3:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

Expected: 綠。

- [ ] **Step 4:** Commit

```bash
git add apps/web/src/data/fakeAnnouncements.ts apps/web/src/data/fakeStats.ts
git commit -m "feat(web): add fake data for tickers, winners and online count

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 重寫 global.css

**Files:**
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1:** 讀當前檔確認內容

```bash
wc -l apps/web/src/styles/global.css
```

- [ ] **Step 2:** 完整覆寫 `apps/web/src/styles/global.css`

```css
@import 'tailwindcss';

@theme {
  --color-page: #ECECEC;
  --color-card: #FFFFFF;
  --color-section: #F5F7FA;
  --color-dark: #1A2530;
  --color-ink-primary: #0F172A;
  --color-ink-secondary: #4A5568;
  --color-teal-500: #186073;
  --color-gold-500: #C9A247;
  --color-alert: #D4574A;
  --color-success: #09B826;
  --color-border-soft: #E5E7EB;
}

/* Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+TC:wght@400;500;700&family=Roboto+Mono:wght@400;500;600&display=swap');

html, body {
  background: #ECECEC;
  color: #0F172A;
  font-family: Inter, 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* Numeric class — 等寬對齊金額與倍率 */
.num {
  font-family: 'Roboto Mono', 'SF Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

/* 跑馬燈基底 */
.ticker-track {
  display: inline-flex;
  white-space: nowrap;
  animation: ticker 50s linear infinite;
}
.ticker-track:hover {
  animation-play-state: paused;
}

/* 按鈕 */
.btn-teal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  background: #186073;
  color: #FFFFFF;
  border-radius: 6px;
  font-weight: 600;
  transition: background 0.2s ease;
}
.btn-teal:hover {
  background: #1E7A90;
}

.btn-teal-outline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border: 1px solid #186073;
  color: #186073;
  border-radius: 6px;
  font-weight: 600;
  transition: all 0.2s ease;
}
.btn-teal-outline:hover {
  background: #186073;
  color: #FFFFFF;
}

/* 卡片 */
.card-base {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

/* 分區標題 */
.section-title {
  font-size: 20px;
  font-weight: 600;
  color: #0F172A;
}

/* 線上綠點 */
.dot-online {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #09B826;
  animation: breath 1.6s ease-in-out infinite;
}

@keyframes ticker {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes breath {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
```

- [ ] **Step 3:** 啟 dev server 初步視覺確認（這一步只看「頁面沒白屏、背景變灰」）

```bash
pnpm --filter @bg/web dev
```

Expected: `localhost:5173` 可載入（雖然 Shell 還在用舊 class，頁面會變醜但不該白屏）。手動按 Ctrl+C 結束 dev。

- [ ] **Step 4:** Commit

```bash
git add apps/web/src/styles/global.css
git commit -m "feat(web): rewrite global.css with Chinese casino base styles

- Light gray body, Inter + Noto Sans TC fonts
- New .btn-teal / .card-base / .dot-online utility classes
- Keep ticker keyframe; remove Monte Carlo ones

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: AnnouncementTicker 元件

**Files:**
- Create: `apps/web/src/components/home/AnnouncementTicker.tsx`

- [ ] **Step 1:** 建檔 `apps/web/src/components/home/AnnouncementTicker.tsx`

```tsx
import { Megaphone } from 'lucide-react';
import { FAKE_ANNOUNCEMENTS } from '@/data/fakeAnnouncements';

export function AnnouncementTicker() {
  // 重複兩倍以讓 translateX -50% 無縫循環
  const doubled = [...FAKE_ANNOUNCEMENTS, ...FAKE_ANNOUNCEMENTS];
  return (
    <div className="flex h-9 items-center overflow-hidden border-b border-[#E5E7EB] bg-white">
      <div className="flex shrink-0 items-center gap-1 border-r border-[#E5E7EB] bg-[#F5F7FA] px-3 text-[13px] font-semibold text-[#D4574A]">
        <Megaphone className="h-4 w-4" />
        <span>最新公告</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track">
          {doubled.map((msg, i) => (
            <span
              key={i}
              className="mx-6 text-[13px] text-[#D4574A] whitespace-nowrap"
            >
              {msg}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

Expected: 綠。

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/components/home/AnnouncementTicker.tsx
git commit -m "feat(web): add AnnouncementTicker component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: WinTicker 元件

**Files:**
- Create: `apps/web/src/components/home/WinTicker.tsx`

- [ ] **Step 1:** 建檔 `apps/web/src/components/home/WinTicker.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { FAKE_WIN_TICKER, type WinRecord } from '@/data/fakeStats';

function pickRandom(): WinRecord {
  const rec = FAKE_WIN_TICKER[Math.floor(Math.random() * FAKE_WIN_TICKER.length)];
  return rec as WinRecord;
}

export function WinTicker() {
  // 初始給 12 筆，每 5 秒從尾端推入新筆並丟棄前一筆
  const [queue, setQueue] = useState<WinRecord[]>(() => {
    return Array.from({ length: 12 }, () => pickRandom());
  });

  useEffect(() => {
    const id = setInterval(() => {
      setQueue((prev) => {
        const next = [...prev];
        next.shift();
        next.push(pickRandom());
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const doubled = [...queue, ...queue];

  return (
    <div className="flex h-9 items-center overflow-hidden bg-[#1A2530]">
      <div className="flex shrink-0 items-center gap-1 border-r border-white/10 px-3 text-[13px] font-semibold text-[#C9A247]">
        <Trophy className="h-4 w-4" />
        <span>即時戰報</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="ticker-track">
          {doubled.map((rec, i) => (
            <span key={i} className="mx-6 whitespace-nowrap text-[13px] text-[#C9A247]">
              玩家 <span className="font-semibold">{rec.player}</span>
              <span className="mx-1 text-white/60">在</span>
              <span className="font-semibold">{rec.game}</span>
              <span className="mx-1 text-white/60">贏得</span>
              <span className="num font-semibold">{rec.win.toLocaleString()}</span>
              <span className="ml-1 text-white/60">點</span>
              <span className="num ml-2 text-white/80">(×{rec.mult.toFixed(2)})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/components/home/WinTicker.tsx
git commit -m "feat(web): add WinTicker component with rotating fake winners

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: FloatingSupport 元件（浮動客服 + 在線人數）

**Files:**
- Create: `apps/web/src/components/layout/FloatingSupport.tsx`

- [ ] **Step 1:** 建檔 `apps/web/src/components/layout/FloatingSupport.tsx`

```tsx
import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { getDriftedOnlineCount } from '@/data/fakeStats';

export function FloatingSupport() {
  const [online, setOnline] = useState<number>(() => getDriftedOnlineCount());
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setOnline(getDriftedOnlineCount()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#186073] text-white shadow-[0_8px_20px_rgba(24,96,115,0.35)] transition hover:bg-[#1E7A90]"
          aria-label="客服"
        >
          <MessageCircle className="h-7 w-7" />
        </button>
        <div className="flex h-10 items-center gap-2 rounded-full border border-[#E5E7EB] bg-white px-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
          <span className="dot-online" />
          <span className="text-[12px] text-[#4A5568]">
            在線 <span className="num font-semibold text-[#0F172A]">{online.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setModalOpen(false)}>
          <div
            className="relative w-[420px] max-w-[92vw] rounded-[10px] bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="absolute right-3 top-3 text-[#4A5568] hover:text-[#0F172A]"
              aria-label="關閉"
            >
              <X className="h-5 w-5" />
            </button>
            <h3 className="mb-4 text-[18px] font-semibold text-[#0F172A]">聯絡客服</h3>
            <div className="space-y-3">
              <a
                href="https://line.me/ti/p/~@aaa1788"
                target="_blank"
                rel="noreferrer"
                className="block rounded-[6px] border border-[#E5E7EB] p-3 hover:border-[#186073] hover:bg-[#F5F7FA]"
              >
                <div className="text-[14px] font-semibold text-[#0F172A]">LINE 官方</div>
                <div className="text-[12px] text-[#4A5568]">@aaa1788</div>
              </a>
              <a
                href="https://t.me/aaawin1788_bot"
                target="_blank"
                rel="noreferrer"
                className="block rounded-[6px] border border-[#E5E7EB] p-3 hover:border-[#186073] hover:bg-[#F5F7FA]"
              >
                <div className="text-[14px] font-semibold text-[#0F172A]">Telegram</div>
                <div className="text-[12px] text-[#4A5568]">aaawin1788_bot</div>
              </a>
              <div className="rounded-[6px] border border-dashed border-[#E5E7EB] p-3 text-[12px] text-[#9CA3AF]">
                回覆時間：24 小時
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/components/layout/FloatingSupport.tsx
git commit -m "feat(web): add FloatingSupport with online counter and contact modal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: HeroBanner 元件

**Files:**
- Create: `apps/web/src/components/home/HeroBanner.tsx`
- Create: `apps/web/public/banners/README.txt`

- [ ] **Step 1:** 建 placeholder 檔案（因為還沒真實圖，放文字提醒）

```bash
cat > apps/web/public/banners/README.txt <<'EOF'
Hero Banner 位放置處。本次改版前暫用 CSS gradient + 文字占位。
之後營運提供 1280×407 JPG/PNG 後放這裡，檔名 banner1.jpg ~ banner6.jpg。
HeroBanner.tsx 會 fallback 顯示漸層色。
EOF
```

- [ ] **Step 2:** 建 `apps/web/src/components/home/HeroBanner.tsx`

```tsx
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  gradient: string;
  emoji: string;
}

const SLIDES: Slide[] = [
  {
    id: 'welcome',
    title: '全新改版 · 電子遊戲殿堂',
    subtitle: '18 款精選遊戲 · 公平可驗證 · 即時派彩',
    gradient: 'linear-gradient(135deg, #051E2B 0%, #186073 60%, #C9A247 100%)',
    emoji: '🎯',
  },
  {
    id: 'crash',
    title: 'Crash 飛行館 · 倍率無上限',
    subtitle: 'JetX / Aviator / Rocket · 敢飛敢收',
    gradient: 'linear-gradient(135deg, #1A2530 0%, #135566 50%, #D4574A 100%)',
    emoji: '🚀',
  },
  {
    id: 'fair',
    title: 'Provably Fair · 每局可驗',
    subtitle: 'HMAC-SHA256 演算法 · 結果不可竄改',
    gradient: 'linear-gradient(135deg, #093040 0%, #186073 55%, #E8D48A 100%)',
    emoji: '🔐',
  },
  {
    id: 'strategy',
    title: '策略電子館 · 拆彈解謎',
    subtitle: 'Mines / Plinko / Tower · 策略取勝',
    gradient: 'linear-gradient(135deg, #0E4555 0%, #266F85 50%, #09B826 100%)',
    emoji: '💎',
  },
];

export function HeroBanner() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, []);

  const slide = SLIDES[idx];
  if (!slide) return null;

  const prev = () => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);
  const next = () => setIdx((i) => (i + 1) % SLIDES.length);

  return (
    <section className="relative w-full overflow-hidden rounded-[10px] shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <div
        className="relative flex h-[320px] items-center px-12 transition-all duration-500 md:h-[407px] md:px-20"
        style={{ background: slide.gradient }}
      >
        <div className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[240px] opacity-25 md:text-[320px]">
          {slide.emoji}
        </div>
        <div className="relative z-10 max-w-[640px]">
          <h1 className="text-[28px] font-bold leading-tight text-white md:text-[42px]">
            {slide.title}
          </h1>
          <p className="mt-4 text-[14px] text-white/85 md:text-[18px]">
            {slide.subtitle}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/25 p-2 text-white opacity-0 transition hover:bg-black/45 group-hover:opacity-100"
        aria-label="上一張"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/25 p-2 text-white opacity-0 transition hover:bg-black/45 group-hover:opacity-100"
        aria-label="下一張"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIdx(i)}
            aria-label={`slide ${i + 1}`}
            className={`h-2 rounded-full transition-all ${
              i === idx ? 'w-8 bg-[#C9A247]' : 'w-2 bg-white/40 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 4:** Commit

```bash
git add apps/web/src/components/home/HeroBanner.tsx apps/web/public/banners/README.txt
git commit -m "feat(web): add HeroBanner with 4 gradient slides

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Halls metadata

**Files:**
- Create: `apps/web/src/data/halls.ts`

- [ ] **Step 1:** 建 `apps/web/src/data/halls.ts`

```ts
import type { GameIdType } from '@bg/shared';
import { GameId } from '@bg/shared';

export type HallId = 'crash' | 'classic' | 'strategy';

export interface HallMeta {
  id: HallId;
  nameZh: string;
  emoji: string;
  tagline: string;
  gradient: string;
  gameIds: GameIdType[];
}

export const HALLS: Record<HallId, HallMeta> = {
  crash: {
    id: 'crash',
    nameZh: 'Crash 飛行館',
    emoji: '🚀',
    tagline: '倍率無上限，敢飛敢收',
    gradient: 'linear-gradient(135deg, #051E2B 0%, #186073 50%, #D4574A 100%)',
    gameIds: [
      GameId.ROCKET,
      GameId.AVIATOR,
      GameId.SPACE_FLEET,
      GameId.JETX,
      GameId.BALLOON,
      GameId.JETX3,
      GameId.DOUBLE_X,
      GameId.PLINKO_X,
    ],
  },
  classic: {
    id: 'classic',
    nameZh: '經典電子館',
    emoji: '🎯',
    tagline: '經典玩法，純粹手感',
    gradient: 'linear-gradient(135deg, #186073 0%, #266F85 50%, #408A9D 100%)',
    gameIds: [
      GameId.DICE,
      GameId.HILO,
      GameId.KENO,
      GameId.WHEEL,
      GameId.MINI_ROULETTE,
      GameId.HOTLINE,
    ],
  },
  strategy: {
    id: 'strategy',
    nameZh: '策略電子館',
    emoji: '💎',
    tagline: '策略取勝，拆彈解謎',
    gradient: 'linear-gradient(135deg, #0E4555 0%, #266F85 50%, #C9A247 100%)',
    gameIds: [GameId.MINES, GameId.PLINKO, GameId.TOWER, GameId.CARNIVAL],
  },
};

export const HALL_LIST: HallMeta[] = [HALLS.crash, HALLS.classic, HALLS.strategy];

export function getHallByGameId(gameId: string): HallMeta | undefined {
  return HALL_LIST.find((h) => h.gameIds.includes(gameId as GameIdType));
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

Expected: 綠。

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/data/halls.ts
git commit -m "feat(web): add 3 halls metadata (Crash / Classic / Strategy)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: HallEntrances 元件

**Files:**
- Create: `apps/web/src/components/home/HallEntrances.tsx`

- [ ] **Step 1:** 建 `apps/web/src/components/home/HallEntrances.tsx`

```tsx
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { HALL_LIST, type HallMeta } from '@/data/halls';

function HallCard({ hall }: { hall: HallMeta }) {
  return (
    <Link
      to={`/hall/${hall.id}`}
      className="group relative flex h-[280px] flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073] hover:shadow-[0_8px_20px_rgba(24,96,115,0.18)]"
    >
      <div
        className="relative flex flex-1 items-center justify-center"
        style={{ background: hall.gradient }}
      >
        <span className="text-[140px] leading-none opacity-95 transition-transform duration-300 group-hover:scale-110">
          {hall.emoji}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[22px] font-bold text-[#0F172A]">{hall.nameZh}</h3>
          <span className="text-[12px] text-[#9CA3AF]">{hall.gameIds.length} 款遊戲</span>
        </div>
        <p className="text-[13px] text-[#4A5568]">{hall.tagline}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#186073] transition group-hover:gap-2">
            立即進入 <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function HallEntrances() {
  return (
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {HALL_LIST.map((hall) => (
        <HallCard key={hall.id} hall={hall} />
      ))}
    </section>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/components/home/HallEntrances.tsx
git commit -m "feat(web): add HallEntrances cards linking to /hall/:id

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: TodayWinners 元件

**Files:**
- Create: `apps/web/src/components/home/TodayWinners.tsx`

- [ ] **Step 1:** 建 `apps/web/src/components/home/TodayWinners.tsx`

```tsx
import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { FAKE_TODAY_TOP10, reshuffleTop10, type RankedWinRecord } from '@/data/fakeStats';

function rankStyle(rank: number): string {
  if (rank === 1) return 'bg-gradient-to-r from-[#E8D48A] to-[#C9A247] text-[#5A471A]';
  if (rank === 2) return 'bg-gradient-to-r from-[#D1D5DB] to-[#C0C0C0] text-[#374151]';
  if (rank === 3) return 'bg-gradient-to-r from-[#E8B881] to-[#CD7F32] text-[#3E2300]';
  return '';
}

function rankIcon(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

export function TodayWinners() {
  const [rows, setRows] = useState<RankedWinRecord[]>(FAKE_TODAY_TOP10);

  useEffect(() => {
    const id = setInterval(() => {
      setRows((prev) => reshuffleTop10(prev));
    }, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
      <header className="flex items-baseline justify-between border-b border-[#E5E7EB] px-5 py-4">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold text-[#0F172A]">
          <Trophy className="h-5 w-5 text-[#C9A247]" />
          今日贏家榜
        </h2>
        <span className="text-[12px] text-[#9CA3AF]">每日 00:00 重置</span>
      </header>
      <table className="w-full">
        <thead>
          <tr className="bg-[#186073] text-[13px] text-white">
            <th className="w-16 py-3 text-center font-medium">排名</th>
            <th className="py-3 text-left font-medium">玩家</th>
            <th className="py-3 text-left font-medium">遊戲</th>
            <th className="w-24 py-3 text-right font-medium">倍率</th>
            <th className="w-32 py-3 pr-5 text-right font-medium">贏得點數</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={`${row.rank}-${row.player}`}
              className={`border-b border-[#E5E7EB] last:border-0 ${
                row.rank <= 3 ? rankStyle(row.rank) : idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F7FA]'
              }`}
            >
              <td className="py-3 text-center text-[18px] font-bold">
                {rankIcon(row.rank)}
              </td>
              <td className="py-3 text-[14px] font-medium">{row.player}</td>
              <td className="py-3 text-[14px]">{row.game}</td>
              <td className="py-3 text-right text-[14px] num font-semibold">
                ×{row.mult.toFixed(2)}
              </td>
              <td className="py-3 pr-5 text-right text-[14px] num font-bold">
                {row.win.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/components/home/TodayWinners.tsx
git commit -m "feat(web): add TodayWinners Top10 table with reshuffle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: FeaturesStrip 元件

**Files:**
- Create: `apps/web/src/components/home/FeaturesStrip.tsx`

- [ ] **Step 1:** 建 `apps/web/src/components/home/FeaturesStrip.tsx`

```tsx
import { ShieldCheck, Lock, Zap, Headphones } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { icon: ShieldCheck, title: '公平可驗證', desc: 'Provably Fair 演算法，每局可獨立驗證結果' },
  { icon: Lock,        title: '加密保障',   desc: '128 位加密傳輸，資料安全無虞' },
  { icon: Zap,         title: '秒速派彩',   desc: '注單結算即時到點，絕不延遲' },
  { icon: Headphones,  title: '24H 客服',   desc: 'LINE / Telegram 全天候回覆' },
];

export function FeaturesStrip() {
  return (
    <section className="grid grid-cols-2 gap-4 rounded-[10px] border border-[#E5E7EB] bg-white p-6 shadow-[0_2px_8px_rgba(15,23,42,0.06)] md:grid-cols-4">
      {FEATURES.map((f) => {
        const Icon = f.icon;
        return (
          <div key={f.title} className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F1F4] text-[#186073]">
              <Icon className="h-6 w-6" />
            </div>
            <div className="text-[15px] font-semibold text-[#0F172A]">{f.title}</div>
            <div className="mt-1 text-[12px] leading-relaxed text-[#4A5568]">{f.desc}</div>
          </div>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 2:** Typecheck & Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/components/home/FeaturesStrip.tsx
git commit -m "feat(web): add FeaturesStrip with 4 selling points

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: PartnerLogos 元件

**Files:**
- Create: `apps/web/src/components/home/PartnerLogos.tsx`

- [ ] **Step 1:** 建檔。（無真實 logo 圖檔，用文字 badge 占位，可後續替換 SVG）

```tsx
interface Badge {
  id: string;
  label: string;
  sub: string;
}

const BADGES: Badge[] = [
  { id: 'fair',   label: 'Fair Play',       sub: '公平認證' },
  { id: 'ssl',    label: 'SSL 256-bit',     sub: '加密傳輸' },
  { id: 'audit',  label: 'Auditable',       sub: '可審計' },
  { id: '18',     label: '18+',             sub: '年齡限制' },
  { id: 'pf',     label: 'Provably Fair',   sub: 'HMAC-SHA256' },
  { id: 'resp',   label: 'Responsible',     sub: '負責任博彩' },
];

export function PartnerLogos() {
  return (
    <section className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-[10px] border border-[#E5E7EB] bg-[#F5F7FA] px-6 py-6">
      {BADGES.map((b) => (
        <div
          key={b.id}
          className="flex min-w-[120px] flex-col items-center text-center opacity-70 transition hover:opacity-100"
        >
          <div className="text-[15px] font-semibold text-[#186073]">{b.label}</div>
          <div className="mt-0.5 text-[11px] text-[#9CA3AF]">{b.sub}</div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2:** Typecheck & Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/components/home/PartnerLogos.tsx
git commit -m "feat(web): add PartnerLogos badge strip

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: 重寫 AppShell — TopBar + 雙跑馬燈 + Footer + 浮動

**Files:**
- Modify: `apps/web/src/components/layout/AppShell.tsx`（完整覆寫）

- [ ] **Step 1:** 完整覆寫 `apps/web/src/components/layout/AppShell.tsx`

```tsx
import { type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, History, ShieldCheck, Gift, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { WinTicker } from '@/components/home/WinTicker';
import { FloatingSupport } from '@/components/layout/FloatingSupport';

const NAV_ITEMS: { to: string; label: string; icon: typeof Gift }[] = [
  { to: '/promos',  label: '優惠',      icon: Gift },
  { to: '/history', label: '遊戲紀錄',  icon: History },
  { to: '/verify',  label: '公平驗證',  icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setBalance, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        /* ignore */
      }
    }
    logout();
    navigate('/');
  };

  const handleBalanceRefresh = async () => {
    try {
      const res = await api.get<{ balance: string }>('/wallet/balance');
      setBalance(res.data.balance);
    } catch (err) {
      console.error(extractApiError(err));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      {/* TopBar — 黑底 */}
      <header className="sticky top-0 z-40 bg-[#1A2530] text-white shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5">
          <Link to="/lobby" className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[18px] font-bold text-white/90 sm:inline">娛樂城</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1">
            {NAV_ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[14px] transition ${
                      isActive
                        ? 'bg-[#186073] text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </NavLink>
              );
            })}
          </nav>

          {user ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBalanceRefresh}
                className="flex items-center gap-2 rounded-[6px] border border-[#C9A247]/60 bg-black/30 px-3 py-1.5 transition hover:border-[#C9A247]"
                title="點擊更新餘額"
              >
                <span className="text-[11px] text-white/70">餘額</span>
                <span className="num text-[15px] font-semibold text-[#C9A247]">
                  {formatAmount(user.balance ?? '0')}
                </span>
              </button>
              <NavLink
                to="/profile"
                className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition hover:bg-white/10"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A247] to-[#876A27] text-[11px] font-bold text-white">
                  {(user.displayName ?? user.username ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-[13px] sm:inline">
                  {user.displayName ?? user.username}
                </span>
                <span className="ml-1 rounded-[3px] bg-[#C9A247] px-1 text-[10px] font-bold text-[#1A2530]">
                  VIP1
                </span>
              </NavLink>
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="rounded-[6px] p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label="訊息"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-[6px] p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label="登出"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-teal text-[13px]">
              登入
            </Link>
          )}
        </div>
      </header>

      {/* 雙跑馬燈 */}
      <AnnouncementTicker />
      <WinTicker />

      {/* Main */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] px-5 py-6">{children}</div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#E5E7EB] bg-[#F5F7FA]">
        <div className="mx-auto max-w-[1280px] grid grid-cols-1 gap-6 px-5 py-8 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">快捷連結</h4>
            <ul className="space-y-2 text-[13px] text-[#4A5568]">
              <li><Link to="/promos" className="hover:text-[#186073]">新手幫助</Link></li>
              <li><Link to="/promos" className="hover:text-[#186073]">關於我們</Link></li>
              <li><Link to="/promos" className="hover:text-[#186073]">服務條款</Link></li>
              <li><Link to="/promos" className="hover:text-[#186073]">聯絡我們</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">社群</h4>
            <div className="flex gap-3 text-[13px]">
              <a href="https://line.me/ti/p/~@aaa1788"       target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">LINE</a>
              <a href="https://t.me/aaawin1788_bot"           target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Telegram</a>
              <a href="https://www.instagram.com/aaa1788_com/" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Instagram</a>
            </div>
            <p className="mt-4 text-[11px] text-[#9CA3AF]">
              18+ 負責任博彩 · 本站為技術研究用假幣平台，不涉及真實金流
            </p>
          </div>
          <div className="text-right">
            <div className="text-[12px] text-[#9CA3AF]">
              Copyright © 2026 BG Gaming. All Rights Reserved.
            </div>
            <div className="mt-1 text-[11px] text-[#9CA3AF]">v1.0.1</div>
          </div>
        </div>
      </footer>

      <FloatingSupport />
    </div>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

Expected: 綠。若出現 `useAuthStore` user 缺欄位錯誤，檢查 `stores/authStore` 的 User 型別有哪些欄位（應該有 `balance`、`displayName`、`username`）。如該型別缺 `displayName`，改用 `user.username`。

- [ ] **Step 3:** 啟 dev 確認基本結構

```bash
pnpm --filter @bg/web dev
```

打開 `localhost:5173`，確認：
- TopBar 黑底出現
- 兩條跑馬燈橫排滾動
- 右下浮動客服按鈕與在線人數顯示

手動 Ctrl+C 停 dev。

- [ ] **Step 4:** Commit

```bash
git add apps/web/src/components/layout/AppShell.tsx
git commit -m "feat(web): rewrite AppShell with dark TopBar + dual tickers + floating support

Remove Monte Carlo sidebar / symbols. Nav: Promos / History / Verify only
(no cashier entries). Balance badge + avatar VIP1 chip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: 重寫 LobbyPage — 新首頁多區塊組合

**Files:**
- Modify: `apps/web/src/pages/LobbyPage.tsx`（完整覆寫）

- [ ] **Step 1:** 完整覆寫 `apps/web/src/pages/LobbyPage.tsx`

```tsx
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HallEntrances } from '@/components/home/HallEntrances';
import { TodayWinners } from '@/components/home/TodayWinners';
import { FeaturesStrip } from '@/components/home/FeaturesStrip';
import { PartnerLogos } from '@/components/home/PartnerLogos';

export function LobbyPage() {
  // warm server
  useEffect(() => {
    void api.get('/health').catch(() => undefined);
  }, []);

  return (
    <div className="space-y-8">
      <HeroBanner />
      <HallEntrances />
      <TodayWinners />
      <FeaturesStrip />
      <PartnerLogos />
    </div>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 3:** Dev 確認

```bash
pnpm --filter @bg/web dev
```

到 `/lobby` 看：
- HeroBanner 滑動
- 3 館卡片並排
- 今日贏家榜 Top 10
- 4 賣點
- 合作 logo

Ctrl+C 結束。

- [ ] **Step 4:** Commit

```bash
git add apps/web/src/pages/LobbyPage.tsx
git commit -m "feat(web): rewrite LobbyPage as Chinese casino multi-section home

Hero + 3 halls + today's winners + features + partners.
Remove grid/filter/livewins sidebar (moved to HallPage).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: GameCardNew 元件

**Files:**
- Create: `apps/web/src/components/game/GameCardNew.tsx`（與現有 `components/game/GameHeader.tsx` 同目錄）

- [ ] **Step 1:** 建 `apps/web/src/components/game/GameCardNew.tsx`

```tsx
import { Link } from 'react-router-dom';
import type { GameMetadata } from '@bg/shared';

// 與 LobbyPage 現有的資料一致
const HAS_COVER = new Set<string>([
  'dice', 'mines', 'hilo', 'keno', 'wheel', 'mini-roulette',
  'plinko', 'hotline', 'rocket', 'aviator', 'space-fleet',
  'balloon', 'jetx3', 'double-x', 'plinko-x',
]);

const GLYPHS: Record<string, string> = {
  dice: '🎲', mines: '💎', hilo: '🂱', keno: '🎱',
  wheel: '🎡', 'mini-roulette': '🎰', plinko: '💠', hotline: '📞',
  tower: '🏯', rocket: '🚀', aviator: '✈️', 'space-fleet': '🛸',
  jetx: '💨', balloon: '🎈', jetx3: '⚡', 'double-x': '✨',
  'plinko-x': '🌠', carnival: '🎪',
};

const NEW_GAMES = new Set(['carnival', 'plinko-x', 'jetx3', 'double-x']);

// 繁中名稱覆寫（game registry 中有些是簡中）
const NAME_ZH_TW: Record<string, string> = {
  dice: '骰子',
  mines: '踩地雷',
  hilo: '猜大小',
  keno: '基諾',
  wheel: '彩色轉輪',
  'mini-roulette': '迷你輪盤',
  plinko: '彈珠台',
  hotline: '熱線',
  tower: '疊塔',
  rocket: '火箭',
  aviator: '飛行員',
  'space-fleet': '太空艦隊',
  jetx: '飆速X',
  balloon: '氣球',
  jetx3: '飆速X3',
  'double-x': '雙倍X',
  'plinko-x': '掉珠挑戰X',
  carnival: '狂歡節',
};

function displayName(meta: GameMetadata): string {
  return NAME_ZH_TW[meta.id] ?? meta.nameZh;
}

function gamePath(id: string): string {
  return `/games/${id}`;
}

export function GameCardNew({ game }: { game: GameMetadata }) {
  const cover = HAS_COVER.has(game.id) ? `/games/${game.id}.jpg` : null;
  const glyph = GLYPHS[game.id] ?? '♠';
  const isNew = NEW_GAMES.has(game.id);

  return (
    <Link
      to={gamePath(game.id)}
      className="group relative flex flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073] hover:shadow-[0_8px_20px_rgba(24,96,115,0.18)]"
    >
      {/* Badge */}
      {isNew && (
        <span className="absolute right-2 top-2 z-10 rounded-[4px] bg-[#C9A247] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
          NEW
        </span>
      )}

      {/* 封面 */}
      <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-[#186073] to-[#0E4555]">
        {cover ? (
          <img
            src={cover}
            alt={displayName(game)}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[72px]">
            {glyph}
          </div>
        )}
        {/* Hover 覆蓋 */}
        <div className="absolute inset-0 flex items-center justify-center bg-[#186073]/80 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="rounded-[6px] border-2 border-white bg-transparent px-4 py-1.5 text-[13px] font-semibold text-white">
            立即遊玩
          </span>
        </div>
      </div>

      {/* 資訊 */}
      <div className="flex flex-col gap-1 p-3">
        <div className="text-[14px] font-semibold text-[#0F172A]">
          {displayName(game)}
        </div>
        <div className="text-[11px] text-[#9CA3AF]">{game.name}</div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2:** Typecheck & Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/components/game/GameCardNew.tsx
git commit -m "feat(web): add GameCardNew with teal theme and zh-TW names

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: HallPage 館內頁

**Files:**
- Create: `apps/web/src/pages/HallPage.tsx`

- [ ] **Step 1:** 建 `apps/web/src/pages/HallPage.tsx`

```tsx
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GAMES_REGISTRY, type GameIdType } from '@bg/shared';
import { HALLS, type HallId } from '@/data/halls';
import { FAKE_WIN_TICKER } from '@/data/fakeStats';
import { GameCardNew } from '@/components/game/GameCardNew';

export function HallPage() {
  const { hallId } = useParams<{ hallId: string }>();
  const hall = hallId && hallId in HALLS ? HALLS[hallId as HallId] : undefined;

  if (!hall) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-[24px] font-bold text-[#0F172A]">館別不存在</h1>
        <Link to="/lobby" className="mt-4 inline-block text-[#186073]">
          ← 回首頁
        </Link>
      </div>
    );
  }

  const games = hall.gameIds
    .map((id: GameIdType) => GAMES_REGISTRY[id])
    .filter((g): g is NonNullable<typeof g> => Boolean(g));

  const liveWins = FAKE_WIN_TICKER.filter((w) => hall.gameIds.includes(w.gameId as GameIdType)).slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link to="/lobby" className="inline-flex items-center gap-1 text-[13px] text-[#186073] hover:underline">
        <ArrowLeft className="h-4 w-4" /> 回首頁
      </Link>

      {/* Hero */}
      <section
        className="relative overflow-hidden rounded-[10px] px-8 py-12 text-white"
        style={{ background: hall.gradient }}
      >
        <div className="relative z-10 max-w-[640px]">
          <div className="text-[72px] leading-none">{hall.emoji}</div>
          <h1 className="mt-3 text-[32px] font-bold md:text-[40px]">{hall.nameZh}</h1>
          <p className="mt-2 text-[15px] text-white/85">{hall.tagline}</p>
          <p className="mt-1 text-[12px] text-white/60">共 {games.length} 款遊戲</p>
        </div>
      </section>

      {/* Body: 遊戲網格 + 即時贏家側欄 */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_280px]">
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {games.map((g) => (
              <GameCardNew key={g.id} game={g} />
            ))}
          </div>
        </section>

        <aside className="space-y-3">
          <h3 className="flex items-center gap-2 text-[16px] font-semibold text-[#0F172A]">
            <span className="dot-online" />
            即時戰報
          </h3>
          <div className="rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
            {liveWins.map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-3 py-2 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium text-[#0F172A]">
                    {w.player}
                  </div>
                  <div className="truncate text-[11px] text-[#9CA3AF]">{w.game}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-[13px] font-semibold text-[#C9A247]">
                    +{w.win.toLocaleString()}
                  </div>
                  <div className="num text-[10px] text-[#4A5568]">×{w.mult.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck
```

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/pages/HallPage.tsx
git commit -m "feat(web): add HallPage with hero + game grid + live wins sidebar

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: VerifyPage + PromosPage 占位頁

**Files:**
- Create: `apps/web/src/pages/VerifyPage.tsx`
- Create: `apps/web/src/pages/PromosPage.tsx`

- [ ] **Step 1:** 建 `apps/web/src/pages/VerifyPage.tsx`

```tsx
import { ShieldCheck } from 'lucide-react';

export function VerifyPage() {
  return (
    <div className="mx-auto max-w-[720px] py-10">
      <div className="rounded-[10px] border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="mb-4 flex items-center gap-3">
          <ShieldCheck className="h-8 w-8 text-[#186073]" />
          <h1 className="text-[24px] font-bold text-[#0F172A]">Provably Fair 驗證</h1>
        </div>
        <p className="text-[14px] leading-relaxed text-[#4A5568]">
          本平台所有遊戲結果均由 HMAC-SHA256 演算法生成，每局皆可獨立驗證。
          Server Seed 會在揭露後公開，玩家可使用 Server Seed + Client Seed + Nonce 重現結果。
        </p>
        <div className="mt-6 rounded-[6px] bg-[#F5F7FA] p-4 text-[13px] text-[#4A5568]">
          <div className="font-semibold text-[#0F172A]">驗證工具開發中</div>
          <div className="mt-1 text-[12px] text-[#9CA3AF]">
            可到「遊戲紀錄」查看歷史 seed，或使用第三方 HMAC 驗證器自行比對
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** 建 `apps/web/src/pages/PromosPage.tsx`

```tsx
import { Gift } from 'lucide-react';

const PROMOS = [
  { id: 'week',    title: '每週倍率王',     desc: '週一至週日累積倍率排名，前 10 名分享獎金池', badge: '熱門' },
  { id: 'vip',     title: 'VIP 等級制度',   desc: '依遊戲量自動升等，享專屬返水與活動',        badge: '制度' },
  { id: 'jackpot', title: 'Crash 彩池',    desc: 'JetX3 全館累積，任意局觸發 100× 即爆池',     badge: '彩池' },
  { id: 'friend',  title: '邀請好友',      desc: '好友遊戲量回饋，介紹越多回饋越高',           badge: '推廣' },
];

export function PromosPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Gift className="h-8 w-8 text-[#186073]" />
        <h1 className="text-[28px] font-bold text-[#0F172A]">活動優惠</h1>
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PROMOS.map((p) => (
          <div
            key={p.id}
            className="rounded-[10px] border border-[#E5E7EB] bg-white p-5 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition hover:border-[#186073]"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-[4px] bg-[#C9A247] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                {p.badge}
              </span>
            </div>
            <h3 className="text-[18px] font-bold text-[#0F172A]">{p.title}</h3>
            <p className="mt-1 text-[13px] text-[#4A5568]">{p.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-[12px] text-[#9CA3AF]">
        * 本頁面為設計占位，正式活動規則以實際公告為準
      </p>
    </div>
  );
}
```

- [ ] **Step 3:** Typecheck & Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/pages/VerifyPage.tsx apps/web/src/pages/PromosPage.tsx
git commit -m "feat(web): add VerifyPage and PromosPage placeholders

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: 路由註冊新頁面

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1:** 讀當前 router.tsx

檔案在 `apps/web/src/router.tsx`。

- [ ] **Step 2:** 在 import 區加：

```tsx
import { HallPage } from '@/pages/HallPage';
import { VerifyPage } from '@/pages/VerifyPage';
import { PromosPage } from '@/pages/PromosPage';
```

- [ ] **Step 3:** 在 AuthGuard 內的 `children` 陣列最前面（`'/lobby'` 之後），加入：

```tsx
{ path: '/hall/:hallId', element: <HallPage /> },
{ path: '/verify', element: <VerifyPage /> },
{ path: '/promos', element: <PromosPage /> },
```

- [ ] **Step 4:** Typecheck & dev smoke

```bash
pnpm --filter @bg/web typecheck
pnpm --filter @bg/web dev
```

打開：
- `/lobby` → 新首頁
- `/hall/crash` → Crash 飛行館（8 款）
- `/hall/classic` → 經典館（6 款）
- `/hall/strategy` → 策略館（4 款）
- `/verify` → 驗證占位
- `/promos` → 優惠占位

Ctrl+C 結束 dev。

- [ ] **Step 5:** Commit

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web): register /hall/:hallId, /verify, /promos routes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: 清理遺留 CSS / i18n key

**Files:**
- Modify: `apps/web/src/styles/global.css`（若仍有舊 class 殘留）
- Review: 其他頁面仍在用舊 class（`panel-salon-soft`、`btn-brass` 等）的地方

- [ ] **Step 1:** 找出仍使用舊 class 的檔案

```bash
grep -rn "panel-salon\|btn-brass\|big-num-brass\|divider-suit\|font-script\|bg-ivory\|bg-felt\|text-brass\|border-brass" apps/web/src/ 2>/dev/null | head -50
```

依 hit 清單逐檔處理。**策略**：
- 遊戲頁（`DicePage.tsx` 等 18 個）：**這次不動**，保留它們自有視覺。改用 `bg-white` / `bg-[#F5F7FA]` 的容器包一層即可（確認跟 AppShell 的 max-width 一致）
- `ProfilePage` / `HistoryPage` / `LandingPage` / `LoginPage`：用 `replace` 把壞 class 換成新 token（例如 `bg-ivory-100` → `bg-white`, `text-brass-700` → `text-[#186073]`, `btn-brass` → `btn-teal`）
- 若有使用 `t.lobby.xxx` 這類 i18n key 但元件已刪除，無害（翻譯對象消失）；i18n 字典暫時留著，不拿掉

- [ ] **Step 2:** 針對 **ProfilePage / HistoryPage / LandingPage / LoginPage** 進行最小改動 — 只做「讓頁面不醜不爆」的 class 替換，**不重寫整頁**。對每個檔案：

```bash
# 範例（每個檔案手動評估 class 清單，下面只列通用替換）
# panel-salon-soft → card-base
# btn-brass → btn-teal
# font-script → font-semibold
# font-serif → （移除，用預設 sans）
# bg-ivory-100 → bg-white
# bg-ivory-50 → bg-[#F5F7FA]
# text-brass-700 → text-[#186073]
# text-ivory-600 → text-[#4A5568]
# text-ivory-950 → text-[#0F172A]
# border-brass-500/50 → border-[#E5E7EB]
# big-num-brass → num text-[#C9A247]
```

這個 Step 須**逐檔人工判讀**，每改一檔 commit 一次。

- [ ] **Step 3:** 改 `apps/web/src/pages/LandingPage.tsx`

讀檔後把 class 用上述規則替換，Lobby 的入口按鈕改成 `btn-teal`，整體底色設 `bg-[#ECECEC]`（或讓 `body` 背景生效）。

Typecheck & commit：

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/pages/LandingPage.tsx
git commit -m "refactor(web): update LandingPage to Chinese casino theme classes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4:** 同樣處理 `LoginPage.tsx`, `ProfilePage.tsx`, `HistoryPage.tsx`，每檔 commit 一次。

- [ ] **Step 5:** 18 款遊戲頁的 layout 不動，但它們使用 AppShell，應該自動繼承新 TopBar。檢查一款遊戲頁（例：`DicePage`）在 dev 能打開：

```bash
pnpm --filter @bg/web dev
```

到 `/games/dice` 看有沒有白屏或大塊空白（如遊戲區本身視覺不協調，是下一階段改遊戲包裝的工作，本次只確保「不壞」）。

- [ ] **Step 6:** 若 dev 運行都 OK，commit 一個總結：

```bash
git commit --allow-empty -m "chore(ui-redesign): complete legacy class cleanup checkpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: 最終 smoke test + 收尾

**Files:** 無檔案修改

- [ ] **Step 1:** 全量 typecheck / lint / test

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Expected: 全綠（前端無單元測試、只測後端）。

- [ ] **Step 2:** 全量 build

```bash
pnpm --filter @bg/ui-tokens build
pnpm --filter @bg/web build
```

Expected: 無錯誤；產出 `apps/web/dist`。

- [ ] **Step 3:** 手動 smoke test 全頁面

```bash
pnpm --filter @bg/web dev
```

逐一打開並檢查無白屏 / 主視覺正確：

| 路由 | 檢查點 |
|---|---|
| `/` | LandingPage 新配色 |
| `/login` | LoginPage 新配色 |
| `/lobby` | Hero 輪播、3 館、今日贏家榜、4 賣點、合作 logo、TopBar、雙跑馬燈、浮動客服 |
| `/hall/crash` | Crash 館 hero + 8 款遊戲卡 + 即時戰報側欄 |
| `/hall/classic` | 經典館 6 款 |
| `/hall/strategy` | 策略館 4 款 |
| `/games/dice` | TopBar + 跑馬燈 + 遊戲區正常（內部視覺保留） |
| `/games/jetx` | 同上 |
| `/profile` | 基本可讀 |
| `/history` | 基本可讀 |
| `/verify` | 占位頁顯示 |
| `/promos` | 4 張活動卡 |

Ctrl+C 結束 dev。

- [ ] **Step 4:** Ship commit

```bash
git log --oneline -25
```

確認 commit 歷史乾淨。

- [ ] **Step 5:** 最終 empty-commit 標記改版結束

```bash
git commit --allow-empty -m "chore(ui-redesign): ship Chinese casino UI redesign

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## 完工驗收 checklist

- [ ] 全站淺灰底 + 深青強調 + 金色獎金，Monte Carlo 配色完全消失
- [ ] TopBar 黑底，含 Logo / 優惠 / 紀錄 / 驗證 / 餘額 / 頭像 VIP1 / 登出
- [ ] 無「充值 / 存款 / 入款 / 提款 / 提領 / 購買點數 / 轉帳 / 託售 / USDT / 金流」字樣
- [ ] TopBar 下方兩條跑馬燈（白底紅字公告 + 黑底金字中獎）
- [ ] 首頁：Hero 輪播 4 張 → 3 館入口 → 今日贏家榜 Top10（Top3 金銀銅）→ 4 賣點 → 合作 logo
- [ ] 右下浮動客服按鈕（點開顯示 LINE / Telegram）+ 在線人數（綠點呼吸）
- [ ] 假公告不含金流字樣
- [ ] 3 個館頁面（`/hall/crash` / `/hall/classic` / `/hall/strategy`）正常顯示，遊戲卡點擊能進遊戲
- [ ] Footer：快捷連結 / 社群 / Copyright / v1.0.1 / 「18+ 假幣平台」聲明
- [ ] `pnpm lint && pnpm typecheck && pnpm test` 全綠
- [ ] `pnpm --filter @bg/web build` 成功
