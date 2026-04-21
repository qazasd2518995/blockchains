# 文案清理 + Landing/Login 重寫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 — 把 Phase 1 視覺改版後仍殘留 Monte Carlo 文案與結構的頁面（Landing / Login / Profile / History / NotFound + dict.zh + GameHeader / BetControls）全部轉成**直白華人娛樂城風的簡中**，並砍掉英文 dict / LocaleToggle / localeStore。

**Architecture:** 保留 `useTranslation` 基礎設施（19 個消費者零改動），但簡化為只讀 `dict.zh`。LandingPage 與 LoginPage 完整重寫，不套 AppShell（TopBar 內嵌）。Profile / History / NotFound / GameHeader / BetControls 做最小文案替換。新增 GuestHallEntrances 元件（3 館預覽、點擊跳 `/login?from=/hall/:id`）。

**Tech Stack:** React 18 / React Router 6 / Tailwind v3 / Zustand / react-hook-form / lucide-react / 現有 i18n hook。

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-04-21-copy-cleanup-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-04-21-ui-redesign-plan.md`（Phase 1 已完成）
- Rules: `CLAUDE.md`

---

## File Structure

### 刪除

| 檔案 | 原因 |
|---|---|
| `apps/web/src/i18n/dict.en.ts` | 不做英文版 |
| `apps/web/src/stores/localeStore.ts` | 沒語系切換 |
| `apps/web/src/components/layout/LocaleToggle.tsx` | 沒切換按鈕 |

### 重寫

| 檔案 | 職責 |
|---|---|
| `apps/web/src/i18n/useTranslation.ts` | 簡化為直接 return zh dict |
| `apps/web/src/i18n/types.ts` | 只保留 `Locale = 'zh'`、`LOCALES` 常數刪除 |
| `apps/web/src/i18n/dict.zh.ts` | 重寫 value 為直白簡中、刪除 unused namespace |
| `apps/web/src/pages/LandingPage.tsx` | 華人娛樂城未登入首頁 |
| `apps/web/src/pages/auth/LoginPage.tsx` | 簡潔居中登入卡片 |
| `apps/web/src/pages/NotFoundPage.tsx` | 簡化為 20 行占位頁 |

### 最小改動（只清文案／符號）

| 檔案 | 改動範圍 |
|---|---|
| `apps/web/src/pages/ProfilePage.tsx` | 移除 `♠◆♥` 裝飾、`crystal-overlay`、"membership" 英文殘留、法語 "registre"；保留業務邏輯 |
| `apps/web/src/pages/HistoryPage.tsx` | 同上 |
| `apps/web/src/components/game/GameHeader.tsx` | 移除 ◄/◆ 裝飾、保留 breadcrumb 結構 |
| `apps/web/src/components/game/BetControls.tsx` | 移除裝飾符號（若有） |

### 新增

| 檔案 | 職責 |
|---|---|
| `apps/web/src/components/home/GuestHallEntrances.tsx` | 未登入 3 館預覽卡片，點擊跳 `/login?from=/hall/:id` |

### 修改

| 檔案 | 改動 |
|---|---|
| `apps/web/index.html` | `lang="zh-Hant"` → `lang="zh-CN"` |

---

## Testing Strategy

- 無新增前端單元測試（沿襲 Phase 1 策略）
- 每 task 結束跑 `pnpm --filter @bg/web typecheck`
- 批次 task 後跑 `pnpm typecheck && pnpm lint && pnpm --filter @bg/web build`
- 手動驗證：`pnpm --filter @bg/web dev` 開 `/`、`/login`、`/profile`、`/history`、`/xxx`（404）看畫面

---

## 任務依賴關係

```
Task 0 (baseline)
  ↓
Task 1 (刪 dict.en)
  ↓
Task 2 (刪 LocaleToggle + localeStore)
  ↓
Task 3 (簡化 useTranslation + types)
  ↓
Task 4 (重寫 dict.zh)
  ↓
Task 5 (重寫 LoginPage)
  ↓
Task 6 (新增 GuestHallEntrances)
  ↓
Task 7 (重寫 LandingPage)
  ↓
Task 8 (重寫 NotFoundPage)
  ↓
Task 9 (清理 ProfilePage 殘留)
  ↓
Task 10 (清理 HistoryPage 殘留)
  ↓
Task 11 (清理 GameHeader + BetControls)
  ↓
Task 12 (修 index.html lang)
  ↓
Task 13 (最終 smoke test + commit)
```

---

### Task 0: Baseline + 分支檢查

- [ ] **Step 1:** 確認在 main，工作樹乾淨

```bash
git status
git branch --show-current
```

Expected: `working tree clean`；branch `main`。

- [ ] **Step 2:** Baseline 檢查

```bash
pnpm typecheck
pnpm --filter @bg/web build
```

Expected: 全綠。

- [ ] **Step 3:** 空 commit 標記 Phase 2 開始

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(ui-redesign): begin Phase 2 copy cleanup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: 刪除英文 dict

**Files:**
- Delete: `apps/web/src/i18n/dict.en.ts`

- [ ] **Step 1:** 確認 dict.en 只被 useTranslation.ts 引用

```bash
grep -rn "dict\.en\|from.*dict.en" apps/web/src 2>&1
```

Expected: 只有 `useTranslation.ts` 那 1 行。

- [ ] **Step 2:** 刪檔

```bash
rm apps/web/src/i18n/dict.en.ts
```

- [ ] **Step 3:** 此時 `useTranslation.ts` 會爆（import 消失）。**先不修**，Task 3 會重寫。先確認 typecheck 爆的位置可預期：

```bash
pnpm --filter @bg/web typecheck 2>&1 | head -20
```

Expected: 錯誤只在 `useTranslation.ts` 的 `import { en } from './dict.en'` 那行。

- [ ] **Step 4:** Commit（允許 WIP 狀態，連同下 2 個 Task 修完 i18n 會重新綠）

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(i18n): remove English dict (Chinese-only market)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 刪 LocaleToggle + localeStore

**Files:**
- Delete: `apps/web/src/components/layout/LocaleToggle.tsx`
- Delete: `apps/web/src/stores/localeStore.ts`

- [ ] **Step 1:** 確認 LocaleToggle 的消費者

```bash
grep -rn "LocaleToggle" apps/web/src 2>&1
```

應該剩餘：`LoginPage.tsx` 仍 import 它（Phase 1 沒動 Login）。AppShell / LobbyPage 在 Phase 1 已拿掉。

- [ ] **Step 2:** 從 `LoginPage.tsx` 拿掉 LocaleToggle 的 import 與 usage（整頁將在 Task 5 重寫，但這步先讓 typecheck 綠）

```bash
# 先不做 LoginPage 內容修改；這個 task 只處理刪除兩檔
```

改成策略：先檢查 `localeStore` 消費者，再決定順序。

```bash
grep -rn "localeStore\|useLocaleStore" apps/web/src 2>&1
```

應該是：`LocaleToggle.tsx`（馬上刪）、`useTranslation.ts`（Task 3 會重寫）。無其他。

- [ ] **Step 3:** 刪兩檔

```bash
rm apps/web/src/components/layout/LocaleToggle.tsx
rm apps/web/src/stores/localeStore.ts
```

- [ ] **Step 4:** 現在 `LoginPage.tsx` 仍 import `LocaleToggle`，`useTranslation.ts` 仍 import `useLocaleStore`，都會爆。Task 3 與 Task 5 會各自解決。先 commit：

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(i18n): remove LocaleToggle + localeStore

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 簡化 useTranslation + types

**Files:**
- Modify: `apps/web/src/i18n/useTranslation.ts`
- Modify: `apps/web/src/i18n/types.ts`

- [ ] **Step 1:** 完整覆寫 `apps/web/src/i18n/useTranslation.ts`：

```ts
import { zh, type Dict } from './dict.zh';

export function useTranslation(): { t: Dict; locale: 'zh' } {
  return { t: zh, locale: 'zh' };
}
```

- [ ] **Step 2:** 完整覆寫 `apps/web/src/i18n/types.ts`：

```ts
export type Locale = 'zh';
```

- [ ] **Step 3:** Typecheck（預期仍會爆，因為 LoginPage 還 import LocaleToggle）

```bash
pnpm --filter @bg/web typecheck 2>&1 | head -10
```

Expected: 錯誤剩 `LoginPage.tsx` 的 `import { LocaleToggle }`。

- [ ] **Step 4:** Commit

```bash
git add apps/web/src/i18n/useTranslation.ts apps/web/src/i18n/types.ts
git commit -m "$(cat <<'EOF'
refactor(i18n): simplify useTranslation to single-locale (zh)

Drop locale store dependency. Returns constant zh dict.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 重寫 dict.zh.ts — 直白華人娛樂城風簡中

**Files:**
- Modify: `apps/web/src/i18n/dict.zh.ts`（完整覆寫）

**重要**：保留消費者會用到的 key（避免 19 檔被迫改動）。實際上需要**讀取現有 dict 的所有 key 路徑**，只換 value。

- [ ] **Step 1:** 讀現有 dict.zh 所有 top-level namespace 與子 key

```bash
grep -E "^  [a-z]+: \{" apps/web/src/i18n/dict.zh.ts
```

應有：`common / landing / auth / lobby / appshell / profile / history / bet / err / games`。

- [ ] **Step 2:** 盤點**仍在使用**的 key

```bash
grep -rohE "t\.[a-z]+(\.[a-zA-Z_]+){1,3}" apps/web/src 2>&1 | sort -u > /tmp/used-keys.txt
wc -l /tmp/used-keys.txt
```

**策略**：我們不逐個比對，直接採「保留所有頂層 namespace，但清空 unused；仍在用的 key 重寫 value」。Phase 1 新元件（AppShell / LobbyPage / HallPage / 等）不用 i18n，所以 `appshell` 和 `lobby` namespace 整個可 YAGNI 清空。

- [ ] **Step 3:** 完整覆寫 `apps/web/src/i18n/dict.zh.ts`：

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
    commit: '确认',
    close: '关闭',
    save: '保存',
    delete: '删除',
    edit: '编辑',
    loading: '加载中',
    credits: '点数',
    balance: '余额',
    operator: '会员',
    live: '在线',
    error: '错误',
    copy: '复制',
    username: '账号',
    callsign: '昵称',
  },
  landing: {
    brandName: 'BG娱乐城',
    brandTagline: '电子游戏殿堂',
    heroLine: '全新改版 · 电子游戏殿堂',
    heroDesc: '18 款精选游戏 · 公平可验证 · 即时派彩',
    featureLabel: '平台优势',
    feat: {
      f: ['公平可验证', '加密保障', '秒速派彩', '24H 客服'],
    },
    liveFeed: '即时战报',
    section: {
      main: '电子游戏精选',
      deploy: '立即加入',
    },
    deployment: '立即加入',
    ctaExisting: '已是会员？直接登录',
    systemOnline: '系统在线',
    netStats: '平台数据',
    netStatBets: '当日注单',
    netStatPayouts: '当日派彩',
    netStatWagered: '今日投注量',
    netStatEdge: '平均 RTP',
    noReal: '本站为技术研究用假币平台，不涉及真实金流',
    crypto: '',
    footer: 'Copyright © 2026 BG Gaming. All Rights Reserved.',
    accessManaged: '仅限代理邀请开通 · 请联系客服',
    guestHallsTitle: '三大游戏馆',
    guestHallsNeedLogin: '登录后即可进入',
    joinTitle: '立即加入 BG 娱乐城',
    joinDesc: '仅限代理邀请开通，请联系客服取得邀请码',
    joinLine: '联系 LINE 客服',
    joinTelegram: '联系 Telegram 客服',
  },
  auth: {
    returnHome: '返回首页',
    secureChannel: 'SSL 加密保障',
    authenticate: '登录',
    authenticating: '登录中',
    identifyYourself: '会员登录',
    loginDesc: '输入会员账号与密码即可进入大厅',
    usernameLabel: '会员账号',
    usernamePlaceholder: '请输入账号',
    password: '密码',
    passwordPlaceholder: '请输入密码',
    pressEnter: '按 Enter 提交',
    invalidUsername: '账号格式不符',
    pwdRequired: '密码不可为空',
    systemProtocol: '',
    provablyFairProtocol: '',
    trustButVerify: '',
    proverb: '',
  },
  profile: {
    your: '我的',
    dossier: '账号',
    dossierHeader: '会员中心',
    sessionId: '会员编号',
    cryptoSeeds: '公平验证 Seed',
    seedsDesc: '每局皆可用 Server Seed + Client Seed + Nonce 验证结果',
    provably: 'Provably Fair',
    fair: '公平可验证',
    category: '游戏类别',
    serverHash: 'Server Seed Hash',
    clientSeed: 'Client Seed',
    clientSeedOverride: '修改 Client Seed',
    clientSeedOverrideHint: '4-32 字元',
    clientSeedPlaceholder: '输入新 Client Seed',
    nonce: 'Nonce',
    revealed: 'Seed 已揭晓',
    revealedSeed: 'Server Seed',
    originalHash: '原始 Hash',
    newHash: '新 Hash',
    rotate: '旋转 Seed',
    seedUnmasked: 'Server Seed 揭晓（可用于验证）',
  },
  history: {
    ledger: '账目',
    txLog: '交易明细',
    noRecords: '暂无记录',
    placeFirst: '开始游戏',
    showing: '显示',
    entries: '笔',
    ref: '参考',
    time: '时间',
    type: '类型',
    amount: '金额',
    balance: '余额',
    totalIn: '总收入',
    totalOut: '总支出',
    net: '净额',
    tx: {
      SIGNUP_BONUS: '注册奖励',
      BET_PLACE: '下注',
      BET_WIN: '中奖',
      CASHOUT: '领奖',
      ADJUSTMENT: '调整',
      REBATE: '返水',
      TRANSFER_IN: '转入',
      TRANSFER_OUT: '转出',
    },
  },
  notFound: {
    title: '页面不存在',
    desc: '您访问的页面可能已被移除或暂时无法访问',
    back: '返回首页',
  },
  bet: {
    stake: '下注金额',
    max: '最大',
    amount: '金额',
    placeBet: '下注',
    cashOut: '领奖',
  },
  err: {
    network: '连线错误，请稍后再试',
    server: '服务异常，请联系客服',
    auth: '账号或密码错误',
  },
  games: {
    dice: '骰子',
    mines: '扫雷',
    hilo: '猜大小',
    keno: '基诺',
    wheel: '彩色转轮',
    miniRoulette: '迷你轮盘',
    plinko: '弹珠台',
    hotline: '热线',
    tower: '叠塔',
    rocket: '火箭',
    aviator: '飞行员',
    spaceFleet: '太空舰队',
    jetx: '飙速X',
    balloon: '气球',
    jetx3: '飙速X3',
    doubleX: '双倍X',
    plinkoX: '掉珠挑战X',
    carnival: '狂欢节',
  },
};

export type Dict = typeof zh;
```

- [ ] **Step 4:** Typecheck

```bash
pnpm --filter @bg/web typecheck 2>&1 | head -40
```

可能爆：舊消費者引用了被我們刪掉的 key（例如 `t.auth.trustButVerify`）。**預期** LoginPage 會爆（這個 Task 5 重寫），其他頁面若爆需當場補鍵。

**補救方針**：若看到 `Property 'xxx' does not exist on type` 的錯，且不是 LoginPage/LandingPage/NotFoundPage（這 3 個會被整頁重寫）：在 dict.zh 對應 namespace 補上該 key + 合理的簡中 value。

- [ ] **Step 5:** Commit（即使 LoginPage 還爆也先 commit）

```bash
git add apps/web/src/i18n/dict.zh.ts
git commit -m "$(cat <<'EOF'
refactor(i18n): rewrite dict.zh in direct Chinese casino tone

- Drop Monte Carlo residue (The Gilded Salon / séance / Protocole)
- Drop unused namespaces (appshell, lobby) — new Phase 1 components
  hard-code Chinese and don't consume i18n
- Add notFound namespace; expand landing namespace for guest home

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 重寫 LoginPage

**Files:**
- Modify: `apps/web/src/pages/auth/LoginPage.tsx`（完整覆寫）

- [ ] **Step 1:** 完整覆寫 `apps/web/src/pages/auth/LoginPage.tsx`：

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AuthResponse } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/useTranslation';

const schema = z.object({
  username: z
    .string()
    .min(3, { message: 'INVALID_USERNAME' })
    .max(40, { message: 'INVALID_USERNAME' })
    .regex(/^[a-zA-Z0-9._-]+$/, { message: 'INVALID_USERNAME' }),
  password: z.string().min(1, { message: 'PASSWORD_REQUIRED' }),
});

type FormInput = z.infer<typeof schema>;

function safeRedirectPath(raw: string | null): string {
  if (!raw) return '/lobby';
  // 防 open redirect：只允許 internal path，禁止 "//" 或 http(s):
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/lobby';
  if (/^\/+https?:/i.test(raw)) return '/lobby';
  return raw;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(schema) });

  const errMap = (k?: string): string | undefined => {
    if (k === 'INVALID_USERNAME') return t.auth.invalidUsername;
    if (k === 'PASSWORD_REQUIRED') return t.auth.pwdRequired;
    return k;
  };

  const onSubmit = async (data: FormInput) => {
    setServerError(null);
    try {
      const res = await api.post<AuthResponse>('/auth/login', data);
      setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
      const target = safeRedirectPath(params.get('from'));
      navigate(target);
    } catch (err) {
      setServerError(extractApiError(err).message);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      {/* 簡易 TopBar */}
      <header className="h-16 bg-[#1A2530] text-white">
        <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-5">
          <Link
            to="/"
            className="flex items-center gap-2 text-[13px] text-white/75 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.auth.returnHome}
          </Link>
          <div className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[16px] font-bold text-white/90 sm:inline">娱乐城</span>
          </div>
        </div>
      </header>

      {/* 居中登入卡片 */}
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[420px] rounded-[10px] border border-[#E5E7EB] bg-white p-8 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
          <div className="mb-6 text-center">
            <h1 className="text-[24px] font-bold text-[#0F172A]">{t.auth.identifyYourself}</h1>
            <p className="mt-2 text-[13px] text-[#4A5568]">{t.auth.loginDesc}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label={t.auth.usernameLabel} error={errMap(errors.username?.message)}>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder={t.auth.usernamePlaceholder}
                className="w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                {...register('username')}
              />
            </Field>

            <Field label={t.auth.password} error={errMap(errors.password?.message)}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder={t.auth.passwordPlaceholder}
                className="w-full rounded-[6px] border border-[#E5E7EB] px-3 py-2.5 text-[14px] text-[#0F172A] transition focus:border-[#186073] focus:outline-none focus:ring-2 focus:ring-[#186073]/25"
                {...register('password')}
              />
            </Field>

            {serverError && (
              <div className="rounded-[6px] border border-[#D4574A]/40 bg-[#FDF0EE] px-3 py-2.5 text-[12px] text-[#B94538]">
                ⚠ {serverError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-[6px] bg-[#186073] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#1E7A90] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? t.auth.authenticating : t.auth.authenticate}
            </button>
          </form>

          <div className="mt-6 border-t border-[#E5E7EB] pt-5 text-center">
            <p className="text-[12px] text-[#4A5568]">{t.landing.accessManaged}</p>
            <a
              href="https://line.me/ti/p/~@aaa1788"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[13px] font-semibold text-[#186073] hover:underline"
            >
              客服 LINE: @aaa1788
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-[#0F172A]">{label}</span>
        {error && <span className="text-[11px] text-[#D4574A]">⚠ {error}</span>}
      </div>
      {children}
    </label>
  );
}
```

- [ ] **Step 2:** Typecheck

```bash
pnpm --filter @bg/web typecheck 2>&1 | head -20
```

Expected: 綠。

- [ ] **Step 3:** Commit

```bash
git add apps/web/src/pages/auth/LoginPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): rewrite LoginPage as centered card with safe redirect

- Drop Monte Carlo séance/Protocole/ASCII-box panel
- Single centered card, teal CTA, LINE support link
- Validate ?from= param against open redirect (only internal paths)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 新增 GuestHallEntrances 元件

**Files:**
- Create: `apps/web/src/components/home/GuestHallEntrances.tsx`

- [ ] **Step 1:** 建新檔 `apps/web/src/components/home/GuestHallEntrances.tsx`：

```tsx
import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { HALL_LIST, type HallMeta } from '@/data/halls';

function GuestHallCard({ hall }: { hall: HallMeta }) {
  return (
    <Link
      to={`/login?from=${encodeURIComponent(`/hall/${hall.id}`)}`}
      className="group relative flex h-[280px] flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-[#186073] hover:shadow-[0_8px_20px_rgba(24,96,115,0.18)]"
    >
      <div
        className="relative flex flex-1 items-center justify-center"
        style={{ background: hall.gradient }}
      >
        <span className="text-[140px] leading-none opacity-95 transition-transform duration-300 group-hover:scale-110">
          {hall.emoji}
        </span>
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="flex flex-col items-center gap-1 text-white">
            <Lock className="h-6 w-6" />
            <span className="text-[13px] font-semibold">登录后进入</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 p-5">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[22px] font-bold text-[#0F172A]">{hall.nameZh}</h3>
          <span className="text-[12px] text-[#9CA3AF]">{hall.gameIds.length} 款游戏</span>
        </div>
        <p className="text-[13px] text-[#4A5568]">{hall.tagline}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#186073] transition group-hover:gap-2">
            登录进入 <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function GuestHallEntrances() {
  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-semibold text-[#0F172A]">三大游戏馆</h2>
        <span className="text-[12px] text-[#9CA3AF]">登录后即可进入</span>
      </header>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {HALL_LIST.map((hall) => (
          <GuestHallCard key={hall.id} hall={hall} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2:** Typecheck + Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/components/home/GuestHallEntrances.tsx
git commit -m "$(cat <<'EOF'
feat(web): add GuestHallEntrances — login-gated hall previews

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 重寫 LandingPage

**Files:**
- Modify: `apps/web/src/pages/LandingPage.tsx`（完整覆寫）

- [ ] **Step 1:** 完整覆寫 `apps/web/src/pages/LandingPage.tsx`：

```tsx
import { Link, Navigate } from 'react-router-dom';
import { LogIn, UserPlus, MessageCircle, Send } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { WinTicker } from '@/components/home/WinTicker';
import { HeroBanner } from '@/components/home/HeroBanner';
import { GuestHallEntrances } from '@/components/home/GuestHallEntrances';
import { FeaturesStrip } from '@/components/home/FeaturesStrip';
import { PartnerLogos } from '@/components/home/PartnerLogos';
import { FloatingSupport } from '@/components/layout/FloatingSupport';

export function LandingPage() {
  const { accessToken } = useAuthStore();
  if (accessToken) return <Navigate to="/lobby" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      {/* 未登入 TopBar */}
      <header className="sticky top-0 z-40 bg-[#1A2530] text-white shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[18px] font-bold text-white/90 sm:inline">娱乐城</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[14px] text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              <LogIn className="h-4 w-4" />
              登录
            </Link>
            <a
              href="https://line.me/ti/p/~@aaa1788"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-[6px] bg-[#C9A247] px-3 py-1.5 text-[14px] font-semibold text-[#1A2530] transition hover:bg-[#AE8B35]"
            >
              <UserPlus className="h-4 w-4" />
              注册
            </a>
          </div>
        </div>
      </header>

      {/* 雙跑馬燈 */}
      <AnnouncementTicker />
      <WinTicker />

      {/* 內容 */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] space-y-8 px-5 py-6">
          <HeroBanner />
          <GuestHallEntrances />
          <FeaturesStrip />
          <PartnerLogos />

          {/* Join CTA */}
          <section className="rounded-[10px] border border-[#186073]/30 bg-gradient-to-br from-[#186073] to-[#0E4555] p-8 text-white shadow-[0_8px_20px_rgba(24,96,115,0.25)]">
            <div className="mx-auto max-w-[720px] text-center">
              <h2 className="text-[26px] font-bold">立即加入 BG 娱乐城</h2>
              <p className="mt-2 text-[14px] text-white/85">
                仅限代理邀请开通，请联系客服取得邀请码
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a
                  href="https://line.me/ti/p/~@aaa1788"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[6px] bg-[#C9A247] px-5 py-2.5 text-[14px] font-semibold text-[#1A2530] transition hover:bg-[#AE8B35]"
                >
                  <MessageCircle className="h-4 w-4" />
                  联系 LINE 客服
                </a>
                <a
                  href="https://t.me/aaawin1788_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-[6px] border border-white/40 bg-white/10 px-5 py-2.5 text-[14px] font-semibold text-white transition hover:bg-white/20"
                >
                  <Send className="h-4 w-4" />
                  联系 Telegram 客服
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#E5E7EB] bg-[#F5F7FA]">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-5 py-8 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">快捷连结</h4>
            <ul className="space-y-2 text-[13px] text-[#4A5568]">
              <li><Link to="/login" className="hover:text-[#186073]">会员登录</Link></li>
              <li><a href="https://line.me/ti/p/~@aaa1788" target="_blank" rel="noreferrer" className="hover:text-[#186073]">联络客服</a></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">社群</h4>
            <div className="flex gap-3 text-[13px]">
              <a href="https://line.me/ti/p/~@aaa1788" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">LINE</a>
              <a href="https://t.me/aaawin1788_bot" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Telegram</a>
              <a href="https://www.instagram.com/aaa1788_com/" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Instagram</a>
            </div>
            <p className="mt-4 text-[11px] text-[#9CA3AF]">
              18+ 负责任博彩 · 本站为技术研究用假币平台，不涉及真实金流
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

- [ ] **Step 2:** Typecheck + Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/pages/LandingPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): rewrite LandingPage as guest-facing Chinese casino home

- Dark TopBar with 登录 / 注册 buttons (no balance / avatar)
- Reuse AnnouncementTicker, WinTicker, HeroBanner, FeaturesStrip,
  PartnerLogos, FloatingSupport
- New GuestHallEntrances (login-gated previews)
- Join CTA block with LINE / Telegram support links
- Redirects to /lobby when already authenticated

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 重寫 NotFoundPage

**Files:**
- Modify: `apps/web/src/pages/NotFoundPage.tsx`（完整覆寫）

- [ ] **Step 1:** 完整覆寫 `apps/web/src/pages/NotFoundPage.tsx`：

```tsx
import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#ECECEC] px-5">
      <div className="text-[120px] font-bold leading-none text-[#186073]/30">404</div>
      <h1 className="mb-2 mt-4 text-[24px] font-bold text-[#0F172A]">{t.notFound.title}</h1>
      <p className="mb-6 text-[14px] text-[#4A5568]">{t.notFound.desc}</p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-[6px] bg-[#186073] px-4 py-2 text-[14px] font-semibold text-white transition hover:bg-[#1E7A90]"
      >
        <Home className="h-4 w-4" />
        {t.notFound.back}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2:** Typecheck + Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/pages/NotFoundPage.tsx
git commit -m "$(cat <<'EOF'
feat(web): simplify NotFoundPage to minimal centered layout

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 清理 ProfilePage 殘留

**Files:**
- Modify: `apps/web/src/pages/ProfilePage.tsx`

**策略**：**不整頁重寫**（因為有大量 seed/PF 業務邏輯），只處理文案與符號殘留。

- [ ] **Step 1:** 讀現有 ProfilePage

```bash
wc -l apps/web/src/pages/ProfilePage.tsx
```

- [ ] **Step 2:** 對 `apps/web/src/pages/ProfilePage.tsx` 做以下 Edit：

**Edit 1** — 移除 `crystal-overlay` div（Monte Carlo 殘留背景）：
- 找：`      <div className="crystal-overlay" />`
- 改成：（刪除整行）

**Edit 2** — 標題區塊移除裝飾符號與 `membership` 英文殘留：
- 找：
  ```tsx
          <span className="font-semibold text-lg text-[#186073]">{t.profile.dossierHeader}</span>
          <span className="text-[#C9A247]">◆</span>
          <span className="label text-[#186073]">membership</span>
  ```
- 改成：
  ```tsx
          <span className="text-[14px] font-semibold text-[#186073]">{t.profile.dossierHeader}</span>
  ```

**Edit 3** — H1 從「dossier」改用更直白的：
- 找：
  ```tsx
        <h1 className="mt-3 font-semibold text-6xl leading-[0.95] text-[#0F172A]">
          <span>{t.profile.your} </span>
          <span className="italic text-[#186073]">{t.profile.dossier}</span>
        </h1>
  ```
- 改成：
  ```tsx
        <h1 className="mt-3 text-[32px] font-bold text-[#0F172A]">
          {t.profile.your}{t.profile.dossier}
        </h1>
  ```

- [ ] **Step 3:** Grep 檔內看還有沒有 `◆`、`♠`、`♥`、`♣`、`crystal-overlay`、英文/法語/中英混排殘留，逐個移除。

```bash
grep -nE "◆|♠|♥|♣|crystal-overlay|label text-|italic text-|font-semibold text-6xl|font-semibold text-lg" apps/web/src/pages/ProfilePage.tsx
```

逐個位置手改。保留業務邏輯（`loadSeeds` / `handleRotate` / `handleUpdateClientSeed` / `copy`）一字不動。

- [ ] **Step 4:** Typecheck + Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/pages/ProfilePage.tsx
git commit -m "$(cat <<'EOF'
refactor(web): clean Monte Carlo residue from ProfilePage

Remove ♠◆♥ symbols, crystal-overlay bg, membership/dossier English
residue. Business logic (PF seed rotate / client seed update) untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 清理 HistoryPage 殘留

**Files:**
- Modify: `apps/web/src/pages/HistoryPage.tsx`

- [ ] **Step 1:** 對 `apps/web/src/pages/HistoryPage.tsx` 做以下 Edit：

**Edit 1** — 移除 `crystal-overlay`：
- 找：`      <div className="crystal-overlay" />`
- 改成：（刪除整行）

**Edit 2** — 標題區塊：
- 找：
  ```tsx
          <span className="font-semibold text-lg text-[#186073]">{t.history.ledger}</span>
          <span className="text-[#C9A247]">◆</span>
          <span className="label text-[#186073]">registre</span>
  ```
- 改成：
  ```tsx
          <span className="text-[14px] font-semibold text-[#186073]">{t.history.ledger}</span>
  ```

**Edit 3** — H1：
- 找：
  ```tsx
        <h1 className="mt-3 font-semibold text-6xl leading-[0.95] text-[#0F172A]">
          <span className="italic text-[#186073]">{t.history.txLog}</span>
        </h1>
  ```
- 改成：
  ```tsx
        <h1 className="mt-3 text-[32px] font-bold text-[#0F172A]">{t.history.txLog}</h1>
  ```

- [ ] **Step 2:** Grep 剩餘殘留

```bash
grep -nE "◆|♠|♥|♣|crystal-overlay|registre|label text-|italic text-|font-semibold text-6xl" apps/web/src/pages/HistoryPage.tsx
```

逐個移除。

- [ ] **Step 3:** Typecheck + Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/pages/HistoryPage.tsx
git commit -m "$(cat <<'EOF'
refactor(web): clean Monte Carlo residue from HistoryPage

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 清理 GameHeader + BetControls

**Files:**
- Modify: `apps/web/src/components/game/GameHeader.tsx`
- Modify: `apps/web/src/components/game/BetControls.tsx`

- [ ] **Step 1:** 讀兩檔

```bash
wc -l apps/web/src/components/game/GameHeader.tsx apps/web/src/components/game/BetControls.tsx
```

- [ ] **Step 2:** 對 `apps/web/src/components/game/GameHeader.tsx`：

**Edit 1** — breadcrumb 中的 `◄` 符號改成 lucide `ArrowLeft`，`◆` 分隔符改 `/`：

Import 區加：
```tsx
import { ArrowLeft } from 'lucide-react';
```

找：
```tsx
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-[#4A5568]">
          <Link to="/lobby" className="transition hover:text-[#186073]">
            ◄ {t.common.lobby}
          </Link>
          <span className="text-[#C9A247]">◆</span>
          <span className="text-[#186073]">{breadcrumb}</span>
        </div>
```

改成：
```tsx
        <div className="flex items-center gap-2 text-[12px] text-[#4A5568]">
          <Link to="/lobby" className="inline-flex items-center gap-1 transition hover:text-[#186073]">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t.common.lobby}
          </Link>
          <span className="text-[#9CA3AF]">/</span>
          <span className="text-[#186073]">{breadcrumb}</span>
        </div>
```

**Edit 2** — 移除 `locale === 'en' ? '.' : ''` 邏輯（locale 只有 zh 了）：

找：
```tsx
  const { t, locale } = useTranslation();
```
改：
```tsx
  const { t } = useTranslation();
```

找：
```tsx
  const separator = locale === 'en' ? '.' : '';
```
改成：（刪除整行）

找：
```tsx
            {title}
            {hasSuffix ? separator : ''}
```
改成：
```tsx
            {title}
```

**Edit 3** — `font-semibold text-sm text-[#AE8B35]`（section label）、`font-semibold text-3xl leading-tight md:text-4xl`（H1）不改，只確認沒有其他殘留裝飾。

- [ ] **Step 3:** 對 `apps/web/src/components/game/BetControls.tsx` 做類似處理：

先 grep 檔內殘留：

```bash
grep -nE "◆|♠|♥|♣|crystal-overlay|label-brass|font-serif|font-script|séance|Protocole" apps/web/src/components/game/BetControls.tsx
```

逐個位置處理。若無 hit 則此步跳過。

- [ ] **Step 4:** Typecheck + Commit

```bash
pnpm --filter @bg/web typecheck
git add apps/web/src/components/game/GameHeader.tsx apps/web/src/components/game/BetControls.tsx
git commit -m "$(cat <<'EOF'
refactor(web): clean Monte Carlo residue from GameHeader + BetControls

Replace ◄/◆ symbols with lucide icons and slash separator.
Drop locale-based separator (single-locale now).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: index.html lang 改 zh-CN

**Files:**
- Modify: `apps/web/index.html`

- [ ] **Step 1:** 讀現有內容

```bash
cat apps/web/index.html
```

- [ ] **Step 2:** 用 Edit 把 `lang="zh-Hant"` 改成 `lang="zh-CN"`：

找：`<html lang="zh-Hant">`
改：`<html lang="zh-CN">`

- [ ] **Step 3:** Commit

```bash
git add apps/web/index.html
git commit -m "$(cat <<'EOF'
chore(web): set html lang to zh-CN (simplified Chinese only)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: 最終 smoke test + 收尾

**Files:** 無檔案修改

- [ ] **Step 1:** 全量 typecheck / lint / test / build

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter @bg/web build
pnpm --filter @bg/admin build
```

Expected: 全綠。

- [ ] **Step 2:** 確認沒有殘留 i18n key 被引用但 dict 裡沒有（搜 `Property '[a-zA-Z_]+' does not exist`，若 Step 1 typecheck 綠就不用）

- [ ] **Step 3:** 殘留 Monte Carlo 殘留 grep 確認

```bash
grep -rnE "séance|Protocole|Gilded|Salon|dossier|membership|registre" apps/web/src apps/admin/src 2>/dev/null | head -20
```

Expected: 若有 hit，應該只在 `dict.zh.ts` 的 value 是中文（例如 `dossier: '账号'`），不應出現英文/法語。如有殘留英文在其他檔，補 commit 修掉。

另搜撲克符號：

```bash
grep -rnE "♠|♦|♥|♣" apps/web/src apps/admin/src 2>/dev/null | head -20
```

Expected: 0 hits 或只剩 data/fakeStats 中的字元（贏家 ID 帶星號的 masked 名，應無撲克符號）。如有殘留，補修掉。

- [ ] **Step 4:** 手動 smoke test

```bash
pnpm --filter @bg/web dev
```

開瀏覽器逐一檢查：

| 路由 | 檢查點 |
|---|---|
| `/` | LandingPage：黑底 TopBar / 登录+注册 / 跑馬燈 / Hero / 三館卡（點一個跳 login 帶 `?from=`）/ 4 賣點 / Partners / Join CTA / Footer / 浮動客服 |
| `/login` | 居中白卡片 / 無 Monte Carlo / 輸入錯誤能顯示 / 返回首页連結 |
| `/hall/crash`（未登入） | 會被 AuthGuard redirect 到 `/login?from=/hall/crash` |
| `/profile`（登入後） | 標題簡中、無 ◆ 符號、seed 功能仍可用 |
| `/history`（登入後） | 標題簡中、無 ◆ 符號、交易列表顯示 |
| `/games/dice`（登入後） | GameHeader breadcrumb 用 ArrowLeft icon |
| `/foo-bar` | NotFoundPage：大 404 字、返回首页按鈕 |

Ctrl+C 結束 dev。

- [ ] **Step 5:** Ship commit

```bash
git log --oneline -30 | head -30
git commit --allow-empty -m "$(cat <<'EOF'
chore(ui-redesign): ship Phase 2 copy cleanup

All 13 tasks complete. Chinese-only (simplified), Landing/Login/NotFound
rewritten, Profile/History/GameHeader/BetControls cleaned. Monte Carlo
text residue removed. No French, no ♠◆♥, no Gilded Salon wording.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完工驗收 checklist

- [ ] `dict.en.ts` / `LocaleToggle.tsx` / `localeStore.ts` 三檔已刪
- [ ] `useTranslation` 簡化為 single-locale (zh)，19 個消費者零改動
- [ ] `dict.zh.ts` value 為直白簡中，無「The Gilded Salon」「séance」「Protocole」「registre」「membership」
- [ ] LandingPage 為華人娛樂城未登入首頁，Hero + 三館預覽 + 4 賣點 + Partner logos + Join CTA + Footer + 浮動客服
- [ ] 三館預覽點擊跳 `/login?from=/hall/:id`，登入成功後回到該館
- [ ] LoginPage 為居中白卡片，`?from=` 有 open redirect 防護（只允許 internal path）
- [ ] NotFoundPage 為 20 行簡潔占位
- [ ] ProfilePage / HistoryPage / GameHeader / BetControls 無 ♠ ◆ ♥ ♣ 與 Monte Carlo 裝飾
- [ ] `index.html` `lang="zh-CN"`
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @bg/web build && pnpm --filter @bg/admin build` 全綠
