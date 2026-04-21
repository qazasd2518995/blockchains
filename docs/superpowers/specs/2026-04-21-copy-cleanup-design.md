# 文案清理 + Landing/Login 重寫設計

**日期**：2026-04-21
**狀態**：設計確認，待 implementation plan
**Phase**：UI 改版 Phase 2（Phase 1 完成 UI 視覺，Phase 2 清文案 + 重寫 4 個舊頁）
**範圍**：`apps/web/src/i18n/*`、`apps/web/src/pages/LandingPage.tsx`、`apps/web/src/pages/auth/LoginPage.tsx`、`apps/web/src/pages/ProfilePage.tsx`、`apps/web/src/pages/HistoryPage.tsx`、`apps/web/src/pages/NotFoundPage.tsx`、`apps/web/src/components/game/GameHeader.tsx`、`apps/web/src/components/game/BetControls.tsx`

---

## 1. 背景

Phase 1 完成 UI 視覺改版（全站華人娛樂城風 + 三館 + 跑馬燈 + 假資料），但以下頁面的 **文案與結構** 仍殘留 Monte Carlo 時代內容：

- `LandingPage`：「séance privée」「Protocole」「公平可证数学作证」+ ASCII 圖框 + `♠◆♥` 撲克符號
- `LoginPage`：「séance privée」「加密连线 · TLS 1.3」「系统协议」區塊
- `ProfilePage / HistoryPage`：少量 Monte Carlo 語彙（黃銅、絨布等隱喻）
- `dict.zh.ts`：500 行字典內有 `heroWelcomeTitle: 'The Gilded Salon'`、`heroFairEyebrow: '数学作证'` 等
- `dict.en.ts`：500 行英文（本專案只做簡中市場，不需要）

**Phase 1 只替換 class，沒碰文案**，導致視覺對、文字不對的違和感。

---

## 2. 目標

- **砍英文**：只做簡中市場，`dict.en.ts` + `LocaleToggle` + `localeStore` 全部刪除
- **保留 i18n 系統**（`useTranslation` hook + `dict.zh`），以維持 19 個消費它的元件／頁面不爆
- **重寫 LandingPage + LoginPage**：新華人娛樂城版型
- **清 ProfilePage / HistoryPage / NotFoundPage 的文案**：僅移除 Monte Carlo 殘留，不重寫整頁功能
- **清 GameHeader / BetControls 的 `♠◆♥` 裝飾**
- **全站簡中化**：`lang="zh-Hant"` → `lang="zh-CN"`
- **文案調性**：直白華人博彩風（參考 3A 遊戲城／GoFun）

**非目標**：
- 不重寫 Profile / History 的業務邏輯（只改文案）
- 不動 18 款遊戲頁（Phase 1 已處理外層 class；i18n 字串繼續透過 dict.zh 提供）
- 不做簡中↔繁中切換
- 不加英文版

---

## 3. i18n 系統調整

### 3.1 檔案刪除

| 刪除 | 原因 |
|---|---|
| `apps/web/src/i18n/dict.en.ts` | 不做英文版 |
| `apps/web/src/stores/localeStore.ts` | 沒語系切換 |
| `apps/web/src/components/layout/LocaleToggle.tsx` | 沒切換按鈕 |

### 3.2 `useTranslation.ts` 簡化

改成：

```ts
import { zh, type Dict } from './dict.zh';

export function useTranslation(): { t: Dict; locale: 'zh' } {
  return { t: zh, locale: 'zh' };
}
```

（回傳值保留物件型別，讓 19 個消費者的 `const { t } = useTranslation();` 零改動）

### 3.3 `types.ts` 保留

只要 `type Dict = typeof zh` 這一行即可。

### 3.4 `dict.zh.ts` 重寫方向

**保留 key 路徑，只改 value**，讓消費者不需要改。整理後的頂層 namespace：

- `common`：全站通用（登入、退出、確認、載入中…）
- `landing`：LandingPage 專用
- `login`：LoginPage 專用
- `profile`：ProfilePage 專用
- `history`：HistoryPage 專用
- `notFound`：NotFoundPage 專用
- `appshell`：AppShell 通用（但 Phase 1 新 AppShell 不再用 i18n，此段可 YAGNI 刪除）
- `lobby`：舊 LobbyPage 用（新 LobbyPage 不用，此段刪除）
- `games`：遊戲頁共用
- `bet`：BetControls 用
- `gameHeader`：GameHeader 用

**實作策略**：
1. 讀現有 dict.zh.ts 所有 key
2. 用到的 key 重寫 value（直白簡中）
3. 沒用到的 key（例如 `heroWelcomeTitle` / `appshell.connected`）刪除
4. 同步更新 `types.ts` 的 `Dict` 型別

### 3.5 所有消費者更新

刪除以下殘留引用：
- `AppShell.tsx`（Phase 1 已重寫、移除 i18n，✅ 已完成）
- `LocaleToggle.tsx`（本 Phase 刪除整檔）
- 任何 `import { useLocaleStore } from '@/stores/localeStore'` 全部移除（含它的消費者）

---

## 4. LandingPage 重寫

### 4.1 結構

```
┌────────────────────────────────────────────────────┐
│ TopBar（黑底 #1A2530）                              │
│ [Logo: BG娱乐城]                    [登录] [注册]   │
├────────────────────────────────────────────────────┤
│ AnnouncementTicker（重用 home/）                   │
│ WinTicker（重用 home/）                            │
├────────────────────────────────────────────────────┤
│ HeroBanner（重用 home/，自動輪播 4 slides）         │
├────────────────────────────────────────────────────┤
│ GuestHallEntrances（3 館預覽，點擊跳 /login）       │
├────────────────────────────────────────────────────┤
│ FeaturesStrip（重用 home/）                        │
├────────────────────────────────────────────────────┤
│ PartnerLogos（重用 home/）                         │
├────────────────────────────────────────────────────┤
│ JoinCTA 區塊（新增）：                              │
│ ┌──────────────────────────────────────────────┐ │
│ │  立即加入 BG 娱乐城                           │ │
│ │  仅限代理邀请开通，请联系客服取得邀请码        │ │
│ │  [联系 LINE 客服]  [联系 Telegram 客服]      │ │
│ └──────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────┤
│ Footer（重用新的 footer，但不用 AppShell 整個）     │
└────────────────────────────────────────────────────┘

右下浮動：重用 FloatingSupport
```

### 4.2 實作重點

- **不套用 AppShell**（AppShell 是給登入後用、會顯示會員餘額）；LandingPage 自己寫一個 TopBar（只有 Logo + 登入/注册 按鈕）
- 重用現有元件：`AnnouncementTicker`、`WinTicker`、`HeroBanner`、`FeaturesStrip`、`PartnerLogos`、`FloatingSupport`
- **新增一個元件 `GuestHallEntrances`**（獨立於 `HallEntrances`，點擊跳到 `/login?redirect=/hall/:id`）
- 新增一個 `JoinCTA` 區塊（元件或直接寫在 LandingPage 內部均可，scope 不大，不拆元件）
- TopBar 寫在 LandingPage 內部（不新開 GuestTopBar 元件，scope 不大）
- 文字全部從 `t.landing.*` / `t.common.*` 拉（i18n 友好）

### 4.3 3 館預覽卡片點擊行為

選 **C 實作**：點擊跳 `/login?redirect=/hall/:id`。`LoginPage` 登入成功後讀 `?redirect=` 參數決定去哪（若無則 `/lobby`）。

**`LoginPage` 現有的登入後跳轉邏輯**：需要讀 `searchParams.get('redirect')`，成功後 `navigate(redirect ?? '/lobby')`。

### 4.4 JoinCTA 連結

選 **A 實作**：直接 `<a href="https://line.me/ti/p/~@aaa1788" target="_blank">` 連 LINE，`<a href="https://t.me/aaawin1788_bot">` 連 Telegram。

---

## 5. LoginPage 重寫

### 5.1 結構

```
┌────────────────────────────────────────────┐
│ TopBar（簡化版，只有 Logo + 返回首頁）        │
├────────────────────────────────────────────┤
│                                            │
│           ┌─────────────────────┐          │
│           │                     │          │
│           │   BG 娱乐城 · 登录   │          │
│           │   ───────────────   │          │
│           │                     │          │
│           │   [ 会员账号 ]       │          │
│           │                     │          │
│           │   [ 密码 ]           │          │
│           │                     │          │
│           │   [ 登录 ]           │          │
│           │                     │          │
│           │   仅限代理邀请开通   │          │
│           │   客服：@aaa1788    │          │
│           │                     │          │
│           └─────────────────────┘          │
│                                            │
└────────────────────────────────────────────┘
```

### 5.2 實作重點

- 單一白色 card 置中（`card-base` class）
- 標題：「BG 娱乐城 · 登录」（24px/700）
- 兩個 input：账号、密码（`react-hook-form` 保留）
- 錯誤訊息顯示：紅底 `#D4574A`
- 主按鈕：`btn-teal`，深青色
- 底部說明：「仅限代理邀请开通」+「客服：@aaa1788」（小字，可點擊打開 LINE）
- 保留現有的 `useForm` / API 呼叫邏輯（`/auth/login` + `setAuth` zustand action）
- **登入後跳轉邏輯**：讀 URL `?redirect=`，有就去那裡，沒有就 `/lobby`
- 刪除：「séance privée」「加密连线 · TLS 1.3」「系统协议」區塊、ASCII 圖框、`♠◆♥` 裝飾

---

## 6. ProfilePage / HistoryPage 文案清理

**策略**：不重寫 layout，只做「最小文案替換」。

### 6.1 清理規則

- `♠ ◆ ♥ ♣` 等裝飾符號：移除（render 輸出層面直接拿掉）
- Monte Carlo 語彙：
  - 「黃銅」「絨布」「象牙」「蠟封」等隱喻 → 直接刪除
  - 「Salon / Séance / Gilded」英文殘留 → 改成對應簡中
- `font-serif` / `font-script` class 若 Phase 1 沒清乾淨再補一次
- 保留所有業務邏輯（API 呼叫、資料展示、表格結構等）

### 6.2 dict.zh 對應 section 改寫

`profile` / `history` 兩個 namespace 的 value 逐條重寫為直白簡中。

---

## 7. NotFoundPage 重寫

20 行小檔，直接整檔重寫：

```tsx
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#ECECEC] px-5">
      <div className="text-[120px] font-bold text-[#186073]/30">404</div>
      <h1 className="mb-2 text-[24px] font-bold text-[#0F172A]">{t.notFound.title}</h1>
      <p className="mb-6 text-[14px] text-[#4A5568]">{t.notFound.desc}</p>
      <Link to="/" className="btn-teal inline-flex items-center gap-2">
        <Home className="h-4 w-4" />
        {t.notFound.back}
      </Link>
    </div>
  );
}
```

---

## 8. GameHeader / BetControls 清理

### 8.1 GameHeader

`apps/web/src/components/game/GameHeader.tsx` 裡如有 `♠◆♥♣` 裝飾、`font-serif` 殘留、或 Monte Carlo 文字（例如 "Salon" / "Table"），一併清理。結構保留。

### 8.2 BetControls

同樣規則。清除裝飾符號、確認 class 已是 Phase 1 替換後版本。

---

## 9. dict.zh.ts 完整改寫範例（摘要）

```ts
export const zh = {
  common: {
    lobby: '游戏大厅',
    history: '游戏记录',
    profile: '个人中心',
    login: '登录',
    logout: '退出',
    register: '注册',
    exit: '退出',
    back: '返回',
    home: '首页',
    confirm: '确认',
    cancel: '取消',
    submit: '提交',
    close: '关闭',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    loading: '加载中',
    credits: '点数',
    balance: '余额',
    operator: '会员',
    live: '在线',
  },
  landing: {
    brandName: 'BG娱乐城',
    brandTagline: '电子游戏殿堂',
    loginBtn: '登录',
    registerBtn: '注册',
    joinTitle: '立即加入 BG 娱乐城',
    joinDesc: '仅限代理邀请开通，请联系客服取得邀请码',
    joinLine: '联系 LINE 客服',
    joinTelegram: '联系 Telegram 客服',
    guestHallsTitle: '电子游戏精选',
    guestHallsNeedLogin: '登录后即可进入',
  },
  login: {
    pageTitle: 'BG 娱乐城 · 登录',
    usernameLabel: '会员账号',
    usernamePlaceholder: '请输入账号',
    passwordLabel: '密码',
    passwordPlaceholder: '请输入密码',
    submit: '登录',
    submitting: '登录中',
    invited: '仅限代理邀请开通',
    contactSupport: '客服 LINE: @aaa1788',
    backToHome: '返回首页',
    errors: {
      required: '账号与密码不可为空',
      invalid: '账号或密码错误',
      network: '连线错误，请稍后再试',
    },
  },
  profile: {
    title: '个人中心',
    accountInfo: '账号信息',
    username: '账号',
    displayName: '昵称',
    role: '身份',
    balance: '点数余额',
    createdAt: '注册时间',
    role_player: '玩家',
    role_admin: '管理员',
    recentActivity: '近期活动',
    logoutConfirm: '确认退出登录',
  },
  history: {
    title: '游戏记录',
    empty: '暂无记录',
    game: '游戏',
    time: '时间',
    bet: '下注',
    payout: '派彩',
    result: '结果',
    resultWin: '赢',
    resultLose: '输',
    filter: {
      all: '全部',
      today: '今日',
      week: '本周',
      month: '本月',
    },
  },
  notFound: {
    title: '页面不存在',
    desc: '您访问的页面可能已被移除或暂时无法访问',
    back: '返回首页',
  },
  games: {
    // 18 款遊戲的名稱字串，直接簡中
    dice: '骰子', mines: '扫雷', hilo: '猜大小', keno: '基诺',
    wheel: '彩色转轮', miniRoulette: '迷你轮盘', plinko: '弹珠台',
    hotline: '热线', tower: '叠塔', rocket: '火箭', aviator: '飞行员',
    spaceFleet: '太空舰队', jetx: '飙速X', balloon: '气球',
    jetx3: '飙速X3', doubleX: '双倍X', plinkoX: '掉珠挑战X', carnival: '狂欢节',
  },
  bet: {
    amount: '下注金额',
    min: '最小',
    max: '最大',
    half: '½',
    double: '×2',
    placeBet: '下注',
    cashOut: '领奖',
    autoBet: '自动下注',
    betting: '下注中',
    waiting: '等待中',
    result: '结果',
    win: '赢得',
    lose: '未中',
  },
  gameHeader: {
    back: '返回大厅',
    rtp: 'RTP',
    provablyFair: '公平验证',
  },
};

export type Dict = typeof zh;
```

**刪除的 key**（Phase 1 已不再被消費）：
- `common.connected`
- `appshell.*`（整個 namespace）
- `lobby.*`（整個 namespace）
- 所有 `hero*` key
- 所有 `filter*` / `sort*` key（舊 LobbyPage 用的）

---

## 10. 受影響檔案清單

**刪除**：
- `apps/web/src/i18n/dict.en.ts`
- `apps/web/src/stores/localeStore.ts`
- `apps/web/src/components/layout/LocaleToggle.tsx`

**重寫**：
- `apps/web/src/i18n/dict.zh.ts`
- `apps/web/src/i18n/useTranslation.ts`
- `apps/web/src/i18n/types.ts`（如有）
- `apps/web/src/pages/LandingPage.tsx`
- `apps/web/src/pages/auth/LoginPage.tsx`
- `apps/web/src/pages/NotFoundPage.tsx`

**最小改動（只清文案／符號）**：
- `apps/web/src/pages/ProfilePage.tsx`
- `apps/web/src/pages/HistoryPage.tsx`
- `apps/web/src/components/game/GameHeader.tsx`
- `apps/web/src/components/game/BetControls.tsx`

**新增**：
- `apps/web/src/components/home/GuestHallEntrances.tsx`（3 館預覽，點擊跳 login）

**不動**（確認）：
- `apps/web/src/pages/games/*.tsx`（18 款）— Phase 1 已清 class，本 Phase 不改
- `apps/web/src/components/layout/AppShell.tsx` — Phase 1 已移除 i18n
- 新 Lobby / Hall / Verify / Promos 四頁 — 不用 i18n，不受影響

---

## 11. 風險與取捨

1. **刪除 LocaleToggle + localeStore 的遞延影響**：AppShell Phase 1 已刪了 `LocaleToggle` import（✅ 已確認），但若還有其他頁面 import 它會爆。Implementation plan 會先 grep 全站 import 確認。
2. **dict.zh 的 key 結構變動**：刪除 `appshell / lobby / hero*` 等 namespace 會導致**舊 LobbyPage / AppShell 若還殘留**會 TS 爆，但這兩檔已在 Phase 1 重寫、不再消費這些 key ✅。其他 19 檔消費的 key 都在 `common / games / bet / gameHeader` 等會保留的 namespace。
3. **redirect 參數的 XSS 風險**：`/login?redirect=/hall/crash` 這個參數若被惡意注入 `javascript:alert(1)` 類似 URL，可能變成 open redirect。Implementation plan 會加 `redirect.startsWith('/')` 且排除 `//` 的驗證。
4. **Profile / History 的深度**：Phase 2 只清文案，若之後要重新設計 layout（例如加入 VIP 等級、返水統計），那是 Phase 3 的事。

---

## 12. 交付項目

- 刪除 3 檔（dict.en / localeStore / LocaleToggle）
- 重寫 6 檔（dict.zh / useTranslation / types / LandingPage / LoginPage / NotFoundPage）
- 清理 4 檔（Profile / History / GameHeader / BetControls）
- 新增 1 元件（GuestHallEntrances）
- 修改 1 檔（index.html lang → zh-CN）
- `pnpm lint && pnpm typecheck && pnpm test && pnpm --filter @bg/web build` 全綠
- 所有畫面無簡繁混用、無 Monte Carlo 字眼、無 ♠◆♥ 裝飾
- Landing 點三館任何一個 → 跳 `/login?redirect=/hall/:id`，登入後回到該館

---

## 13. 後續步驟

1. 使用者 review 本 spec
2. approve 後呼叫 `writing-plans` skill 產出 implementation plan
3. 依 plan 使用 subagent-driven-development 實作
