import { type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Gift, History, LayoutGrid, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { WinTicker } from '@/components/home/WinTicker';
import { FloatingSupport } from '@/components/layout/FloatingSupport';
import { BrandMark } from '@/components/layout/BrandMark';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { useTranslation } from '@/i18n/useTranslation';

const NAV_ITEMS: { to: string; label: string; icon: typeof Gift }[] = [
  { to: '/lobby', label: '大廳', icon: LayoutGrid },
  { to: '/verify', label: '公平驗證', icon: ShieldCheck },
  { to: '/history', label: '遊戲記錄', icon: History },
  { to: '/promos', label: '優惠活動', icon: Gift },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setBalance, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

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
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#ECECEC]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(24,96,115,0.18),transparent_72%)]" />

      <a
        href="#main-content"
        className="sr-only absolute left-4 top-4 z-[100] rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#0F172A] shadow focus:not-sr-only"
      >
        跳到主要內容
      </a>

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0F172A]/92 text-white backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.28)]">
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-[11px] text-white/70 sm:px-5 lg:px-6">
            <div className="flex items-center gap-2">
              <span className="dot-online" />
              <span>演示點數平台 · 結果可驗證</span>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://line.me/ti/p/~@aaa1788" target="_blank" rel="noreferrer" className="transition hover:text-white" translate="no">
                LINE
              </a>
              <a href="https://t.me/aaawin1788_bot" target="_blank" rel="noreferrer" className="transition hover:text-white" translate="no">
                Telegram
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1360px] flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6 lg:px-6">
          <div className="flex items-center justify-between gap-4">
            <BrandMark to="/lobby" tone="dark" subtitle="Provably Fair · Instant Settlement" />
            {!user ? (
              <Link to="/login" className="btn-teal text-[13px] lg:hidden">
                {t.common.login}
              </Link>
            ) : null}
          </div>

          <nav className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2 pb-1">
              {NAV_ITEMS.map((it) => {
                const Icon = it.icon;
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition ${
                        isActive
                          ? 'border-[#C9A247]/35 bg-white/12 text-white'
                          : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {it.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {user ? (
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <button
                type="button"
                onClick={handleBalanceRefresh}
                className="inline-flex items-center gap-2 rounded-full border border-[#C9A247]/35 bg-black/20 px-4 py-2 transition hover:border-[#C9A247] hover:bg-black/30"
                title="重新載入餘額"
                aria-label="重新載入餘額"
              >
                <span className="label !text-white/50">{t.common.balance}</span>
                <span className="data-num text-[14px] font-semibold text-[#E8D48A]">
                  {formatAmount(user.balance ?? '0')}
                </span>
                <RefreshCw className="h-3.5 w-3.5 text-white/50" />
              </button>

              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `inline-flex items-center gap-3 rounded-full border px-2.5 py-1.5 transition ${
                    isActive
                      ? 'border-white/20 bg-white/12 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/20 hover:bg-white/[0.06]'
                  }`
                }
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A247] to-[#876A27] text-[11px] font-bold text-white">
                  {(user.displayName ?? user.username ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">
                    {user.displayName ?? user.username}
                  </span>
                  <span className="block text-[10px] text-white/[0.55]">
                    {t.common.profile}
                  </span>
                </span>
              </NavLink>

              <button
                type="button"
                onClick={handleLogout}
                className="btn-chip border-white/10 bg-white/[0.04] text-white/80 hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                aria-label="登出"
              >
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-teal hidden text-[13px] lg:inline-flex">
              {t.common.login}
            </Link>
          )}
        </div>
      </header>

      <AnnouncementTicker />
      <WinTicker />

      <main id="main-content" className="relative z-10 flex-1">
        <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-5 lg:px-6">{children}</div>
      </main>

      <SiteFooter loggedIn />
      <FloatingSupport />
    </div>
  );
}
