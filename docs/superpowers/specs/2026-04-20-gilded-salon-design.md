# The Gilded Salon — 全站視覺重設計 Spec

**Date**: 2026-04-20
**Author**: Claude + Justin
**Status**: Approved, in implementation

---

## 1. 設計哲學

從「CRT 終端機 + 紫螢光賽博」轉向 **「巴黎百年賭場的高級俱樂部感」**。

核心氛圍：水晶吊燈下的牌桌、黃銅圍欄、深森林絨布、象牙與酒紅、從容奢華。

白天式明亮 ≠ 柔和。明亮意指**光澤強烈**，透過大量金色、對比陰影、高光襯線字達成。

不是拉斯維加斯霓虹、不是澳門老派紅金、不是人文米色 café 感。**是 Monte Carlo × Ritz-Paris**。

---

## 2. 色板（Tokens）

### 2.1 主色

| Token | Hex | 用途 |
|---|---|---|
| `salon-ivory` | `#FBF9F4` | 主背景、大區塊底 |
| `salon-ivory-deep` | `#F6EFE0` | 卡片內底、在綠絨上的文字 |
| `salon-felt` | `#0C4632` | 深森林祖母綠（牌桌）— 遊戲卡背、重點區塊 |
| `salon-felt-dark` | `#073026` | 綠絨陰影 / hover |
| `salon-felt-light` | `#14563E` | 綠絨高光 |
| `salon-wine` | `#6B0F1A` | 深 bordeaux（酒紅）— 次要強調、VIP 封印 |
| `salon-wine-dark` | `#4A0A12` | 酒紅陰影 |
| `salon-brass` | `#C9A24C` | 黃銅（亮）— 邊線、分隔線、金字 |
| `salon-brass-light` | `#E0BF6E` | 黃銅高光 / hover |
| `salon-brass-dark` | `#8A6B2A` | 黃銅深陰 |
| `salon-ink` | `#0A0806` | 瀝青黑（文字、深陰影） |
| `salon-ash` | `#3A332B` | 次級深灰文字 |
| `salon-smoke` | `#8A7F6E` | 禁用、標籤文字 |

### 2.2 語意色

| Token | Hex | 用途 |
|---|---|---|
| `salon-win` | `#1E7A4F` | 中獎綠（較 felt 亮一階）|
| `salon-loss` | `#8B1A2A` | 輸錢紅（比 wine 亮）|
| `salon-live` | `#B8853A` | 直播狀態黃銅色 |

### 2.3 漸層

```css
--grad-felt: radial-gradient(ellipse at center, #14563E 0%, #0C4632 40%, #073026 100%);
--grad-brass: linear-gradient(135deg, #E0BF6E 0%, #C9A24C 40%, #8A6B2A 100%);
--grad-crystal: radial-gradient(ellipse at top, rgba(224,191,110,0.18) 0%, rgba(224,191,110,0) 60%);
--grad-marble: linear-gradient(135deg, #FBF9F4 0%, #F6EFE0 50%, #FBF9F4 100%);
```

---

## 3. 字體系統

全部走 Google Fonts。

| 角色 | 字體 | Weight | 範例用途 |
|---|---|---|---|
| **Display (serif)** | **Bodoni Moda** | 400 / 700 / 900 | Hero 標題、頁面 H1、遊戲名、數字大標 |
| **Body (sans)** | **Inter Tight** | 400 / 500 / 600 / 700 | UI 標籤、按鈕、段落、副標 |
| **Numerals (mono)** | **IBM Plex Mono** | 400 / 500 / 600 | 餘額、賠率、下注金額（tabular-nums）|
| **Accent (script)** | **Italiana** | 400 | 裝飾性副標、引言、「Est. 2026」風格 |

`font-feature-settings: 'tnum', 'zero'` for Plex Mono.

**替換現有映射**：
- `font-display` (Orbitron) → **Bodoni Moda**
- `font-mono` (JetBrains Mono) → **IBM Plex Mono**
- `font-hud` (Chakra Petch) → **Inter Tight** uppercase wide-tracking
- 新增 `font-script` → **Italiana**
- 新增 `font-sans` → **Inter Tight**（body default）

---

## 4. 核心視覺語言

### 4.1 雙線黃銅邊框（Brass Double Frame）

所有卡片、按鈕、輸入框都用**雙層黃銅邊**：
- 外層：1px `salon-brass-dark` 細線
- 內層留 2-3px 間隙
- 內框：1px `salon-brass` 較亮線

CSS 實作：`outline` + `border` 組合，或用 `box-shadow: 0 0 0 1px brass-dark, 0 0 0 3px ivory, 0 0 0 4px brass`。

### 4.2 綠絨紋理（Felt Texture）

深綠絨布背景 = `salon-felt` 底色 + CSS 細點紋理（radial-gradient 2px 白點，透明度 0.04，3px spacing）。

### 4.3 水晶吊燈光暈（Crystal Glow）

Landing 與遊戲頁頂部放一層：
```css
background: radial-gradient(ellipse 800px 400px at 50% 0%, rgba(224,191,110,0.25), transparent 70%);
```

### 4.4 蠟封封印（Wax Seal）

VIP / LIVE / WIN 標籤做成圓形蠟封：
- 圓形 `salon-wine` 底、`salon-brass` 邊、`salon-ivory` 字
- 輕微陰影像真實蠟
- 大小 `36px`，`hover` 時輕微旋轉 3°

### 4.5 花色分隔符（Suit Dividers）

`♠ ♥ ♦ ♣ ◆` 裝飾性地出現在：
- Section 標題之間（取代原本的「§ 01」）
- 按鈕內的 hover 效果
- Loading spinner
- Footer 分隔

### 4.6 陰影系統

```css
--shadow-lift: 0 12px 28px -8px rgba(10,8,6,0.18), 0 4px 10px -2px rgba(201,162,76,0.12);
--shadow-deep: 0 24px 48px -12px rgba(10,8,6,0.28), 0 8px 16px -4px rgba(107,15,26,0.15);
--shadow-crystal: 0 0 40px rgba(224,191,110,0.25);
```

---

## 5. 組件規範

### 5.1 `.btn-brass`（主按鈕，取代 `.btn-acid`）

- 背景 `--grad-brass`
- 黃銅雙線框
- 字：Bodoni Moda 500、uppercase、tracking-wider、`salon-ink`
- hover：下壓 1px + 光澤掃過動畫（::before 金色亮條 800ms）
- focus：外 ring `salon-brass-light` 4px opacity 40%

### 5.2 `.btn-felt`（牌桌按鈕，次要）

- 背景 `salon-felt`
- 黃銅邊 + `salon-ivory` 字
- hover：背景 `salon-felt-light`

### 5.3 `.btn-ghost`

- 透明底、黃銅邊、`salon-ink` 字
- hover：`salon-ivory-deep` 底

### 5.4 `.panel-salon`（取代 `.crt-panel`）

- 背景 `salon-ivory` 或 `--grad-marble`
- 雙線黃銅框
- 陰影 `--shadow-lift`
- 圓角 `12px`（比原本的 16 小，襯線感）

### 5.5 `.panel-felt`（綠絨版）

- `--grad-felt` 背景 + 細點紋理
- 內文字用 `salon-ivory-deep`
- 黃銅邊（較粗 2px inner）

### 5.6 `.input-salon`

- 白象牙底、黃銅雙線邊
- Focus：外 ring `salon-brass` 4px opacity 30%
- 字：Plex Mono
- Placeholder：`salon-smoke`

### 5.7 `.seal-*`（蠟封封印 tag）

- `.seal-vip` — 酒紅底金邊
- `.seal-live` — 祖母綠底金邊
- `.seal-win` — 金底黑字
- `.seal-loss` — 酒紅底象牙字

### 5.8 `.data-num`

- Plex Mono 500 + tabular-nums
- 金額可加 `.data-num-brass`：顏色 `salon-brass-dark`

### 5.9 `.divider-suit`

```html
<div class="divider-suit"><span>♠ ◆ ♥</span></div>
```
黃銅細線 + 中央花色符號。

### 5.10 Scrollbar

- 深 `salon-ivory-deep` track
- `salon-brass` thumb、hover `salon-brass-light`

---

## 6. 動畫規範

慢、從容、有重量感。避免賽博快閃。

| Keyframe | 用途 | 時長 |
|---|---|---|
| `brass-shimmer` | 黃銅邊緩慢光澤掃過 | 8s infinite |
| `seal-breath` | 蠟封輕微脈動 | 3s ease-in-out |
| `felt-glow` | 綠絨卡 hover 時微亮 | 400ms |
| `ivory-rise` | 卡片 hover 上抬 -2px | 300ms cubic-bezier(0.4, 0, 0.2, 1) |
| `chip-flip` | 籌碼/按鈕翻轉 | 600ms |
| `staggered-reveal` | 進場階梯 fade + translateY | 延遲 0.08s × n |
| `crystal-breath` | 頂部光暈呼吸 | 6s ease-in-out |

---

## 7. 頁面規範

### 7.1 Landing（首頁未登入）

- **Top bar**：象牙底、黃銅細分隔、LIVE 綠色 dot + 左側塔尖標 "EST. 2026"（Italiana）
- **Hero**：
  - 左 60%：Bodoni 大字 "PROVABLY FAIR." / "MATH-BACKED." / italic "*trust-free.*"（黑字）
  - 副標 Inter Tight
  - CTA 雙按鈕：金色 `.btn-brass`（登入）+ ghost（註冊）
  - 右 40%：一張**綠絨面板**顯示 Live Feed（籌碼動態），金邊、最頂 Italiana 字 "Live at the Table"
- **Ticker**：改成金色線條包夾，遊戲名走 Bodoni 斜體
- **Feature 區**：4 張綠絨卡，上金箔數字 01-04、Bodoni 標題、Inter 描述
- **Stats 24h**：大理石底 + 黃銅格子，大金字數據
- **Footer**：象牙底、花色分隔

### 7.2 Lobby（大廳）

- Hero Header：Bodoni 大字 "The Gaming Floor."、副 Italiana "pick your table."
- Stats 列：4 張金邊象牙卡（餘額、遊戲數、平均 RTP、狀態）
- 分類 Section：
  - 不用「§ 01」這種終端符，改「♠ I」「♥ II」「♦ III」花色羅馬數字
  - 分類名：Bodoni italic 大字
- **GameCard（核心）**：
  - 深綠絨底 + 細點紋理
  - 頂部：金箔小字顯示遊戲類別
  - 中央：遊戲名 Bodoni 大字 + emoji/SVG 花色圖示
  - 底部：Inter Tight RTP %、類型
  - 右上角：蠟封（VIP 高倍 / LIVE / NEW）
  - Hover：邊框黃銅發光、抬起 -2px、綠絨微亮
  - 高度統一 260px、rounded-lg（8px）

### 7.3 AppShell（已登入殼）

- Top bar：象牙白、金分隔線、`BG.` Logo 改 Bodoni 斜體加花色 ♦
- 右側顯示餘額（金色 Plex Mono 大字）、用戶名 Italiana、登出按鈕 ghost
- Sidebar（如有）綠絨底 + 金字

### 7.4 遊戲頁面通用

- GameHeader：象牙底、黃銅分隔、Bodoni 遊戲名、麵包屑 Inter
- Pixi Canvas 容器：綠絨背景 + 金邊框
- BetControls 側欄：白象牙卡、金邊、Plex Mono 數字
- 所有按鈕改為 `.btn-brass` 主色

### 7.5 Pixi 場景配色（同步調整）

- **背景**：`salon-felt` #0C4632 + 細白點紋理
- **UI（倍率、文字）**：`salon-brass` #C9A24C
- **贏錢高光**：`salon-win` #1E7A4F
- **輸錢**：`salon-loss` #8B1A2A
- **次要元素**：`salon-ivory-deep` #F6EFE0

各遊戲特定：
- **Dice**：象牙色骰子 + 金色點數
- **Roulette**：深綠絨盤 + 金邊 + 酒紅黑相間格子
- **Mines**：綠絨格 + 金寶石 + 酒紅炸彈
- **Crash**：綠絨深空 + 金色飛機 + 酒紅爆炸
- **Plinko**：綠底 + 金釘 + 酒紅/金交錯的倍率槽
- **Hotline（老虎機）**：黃銅機身 + 綠絨面板

### 7.6 Profile / History

- 象牙底板 + 金邊區塊
- 數據表格用 Plex Mono、金色邊框、酒紅標頭
- 花色分隔各 section

### 7.7 Login / Register

- 全頁綠絨背景 + 頂部水晶光暈
- 中央象牙卡 + 金邊
- 表單 Inter Tight + Plex Mono 輸入

---

## 8. Admin 後台

**全部一起改**，主色反轉：

- 主背景改**深綠絨**（後台感）+ 象牙卡片
- 頂 bar：深 felt 深色 + 金字
- Sidebar：felt-dark 底 + 金字 nav
- Table：象牙卡片 + 金邊 + 酒紅 hover 行
- 所有管理按鈕用 `.btn-brass`
- 蠟封用於狀態（啟用綠 / 凍結酒紅 / 刪除黑）
- Logo `AGENT.OPS` 改 Bodoni 斜體 + 花色符號

---

## 9. 實作步驟

1. **Tokens 層**：改寫 `packages/ui-tokens/tailwind.preset.ts`（顏色、字體、陰影、動畫、漸層）
2. **全局樣式**：改寫 `apps/web/src/styles/global.css`（所有 @layer components）
3. **index.html**：換 Google Fonts link（Bodoni Moda / Inter Tight / IBM Plex Mono / Italiana）
4. **Web 主頁**：Landing → Lobby → AppShell → Login
5. **Web 遊戲頁**：GameHeader、BetControls 改 class；Pixi scene 配色 token 替換
6. **Web 其他**：Profile、History、NotFound、ErrorBoundary
7. **Admin**：AdminShell → 所有 admin pages
8. **驗證**：pnpm typecheck + build

---

## 10. 範圍外（本次不做）

- 真實遊戲插圖（目前用 emoji / SVG 花色，之後再換真圖）
- 新增頁面（僅重新設計既有頁面）
- 後端 API 改動
- 個人化主題切換

---

## 11. 驗收標準

- [ ] 全站無 CRT scanline / 紫 neon 遺留
- [ ] 字體載入 Bodoni Moda + Inter Tight + IBM Plex Mono + Italiana
- [ ] 主色只剩 ivory/felt/brass/wine/ink 五系
- [ ] 每個頁面至少有一個黃銅雙線邊框元素
- [ ] 所有按鈕為 `.btn-brass` / `.btn-felt` / `.btn-ghost`
- [ ] Pixi 遊戲場景底色為綠絨、UI 為金
- [ ] Admin 統一為深綠絨 + 象牙卡片
- [ ] `pnpm typecheck && pnpm build` 全過
