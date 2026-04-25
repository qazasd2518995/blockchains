import { type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Gift, History, LayoutGrid, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { BrandMark } from '@/components/layout/BrandMark';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SoundToggle } from '@/components/layout/SoundToggle';
import { useTranslation } from '@/i18n/useTranslation';

const NAV_ITEMS: { to: string; label: string; icon: typeof Gift }[] = [
  { to: '/lobby', label: '大廳', icon: LayoutGrid },
  { to: '/verify', label: '遊戲說明', icon: ShieldCheck },
  { to: '/history', label: '遊戲記錄', icon: History },
  { to: '/promos', label: '優惠活動', icon: Gift },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setBalance, logout, refreshToken } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobileLobby = location.pathname === '/lobby';

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
    <div className="relative flex min-h-[100svh] flex-col overflow-x-hidden bg-[#E9ECEF]">
      <div className="pointer-events-none fixed inset-0">
        <img
          src="/backgrounds/casino-atmosphere.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-[0.16]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(233,236,239,0.72)_0%,rgba(233,236,239,0.9)_30%,rgba(233,236,239,0.96)_100%)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(24,96,115,0.18),transparent_72%)]" />

      <a
        href="#main-content"
        className="sr-only absolute left-4 top-4 z-[100] rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#0F172A] shadow focus:not-sr-only"
      >
        跳到主要內容
      </a>

      <header
        className={`sticky top-0 z-40 border-b border-[#162238] bg-[linear-gradient(180deg,rgba(8,15,27,0.98),rgba(15,23,42,0.96))] pt-[env(safe-area-inset-top)] text-white shadow-[0_18px_40px_rgba(2,6,23,0.34)] ${
          isMobileLobby ? 'hidden lg:block' : ''
        }`}
      >
        <div className="border-b border-white/8">
          <div className="mx-auto grid w-full max-w-[1920px] gap-2 px-3 py-2 text-[11px] text-white/80 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center xl:px-8 2xl:px-12">
            <div className="flex items-center gap-2">
              <span className="dot-online" />
              <span>24 小時不打烊 · 即時派彩</span>
            </div>
            <AnnouncementTicker />
            <span className="hidden whitespace-nowrap text-white/55 lg:inline">會員制平台 · 邀請開通</span>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-x-6 lg:gap-y-0 xl:px-8 2xl:px-12">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <BrandMark to="/lobby" tone="dark" subtitle="Premium Gaming · Instant Settlement" />
            {!user ? (
              <Link to="/login" className="btn-teal text-[13px] lg:hidden">
                {t.common.login}
              </Link>
            ) : null}
          </div>

          <nav className="min-w-0 lg:flex lg:justify-center">
            <div className="grid w-full grid-cols-4 gap-1 pb-1 lg:flex lg:min-w-max lg:items-center lg:gap-2 lg:pb-0">
              {NAV_ITEMS.map((it) => {
                const Icon = it.icon;
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    className={({ isActive }) =>
                      `inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 py-2 text-[12px] font-semibold transition sm:gap-2 sm:px-4 sm:text-[13px] ${
                        isActive
                          ? 'border-[#E8D48A]/50 bg-[#1A2538] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
                          : 'border-white/12 bg-[#162338] text-white/85 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {it.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {user ? (
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <button
                type="button"
                onClick={handleBalanceRefresh}
                className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-[#C9A247]/40 bg-[#162338] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition hover:border-[#C9A247] hover:bg-[#1B2940] sm:px-4"
                title="重新載入餘額"
                aria-label="重新載入餘額"
              >
                <span className="label !text-white/60">{t.common.balance}</span>
                <span className="data-num text-[14px] font-semibold text-[#E8D48A]">
                  {formatAmount(user.balance ?? '0')}
                </span>
                <RefreshCw className="h-3.5 w-3.5 text-white/60" />
              </button>

              <SoundToggle variant="dark" />

              <button
                type="button"
                onClick={handleLogout}
                className="btn-chip border-white/12 bg-[#162338] text-white/82 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white"
                aria-label="登出"
              >
                <LogOut className="h-4 w-4" />
                登出
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <SoundToggle variant="dark" />
              <Link to="/login" className="btn-teal hidden text-[13px] lg:inline-flex">
                {t.common.login}
              </Link>
            </div>
          )}
        </div>
      </header>

      <main id="main-content" className="relative z-10 flex-1">
        <div
          className={`mx-auto w-full max-w-[1920px] ${
            isMobileLobby ? 'px-0 py-0 lg:px-8 lg:py-6 2xl:px-12' : 'px-3 py-4 sm:px-6 sm:py-6 xl:px-8 2xl:px-12'
          }`}
        >
          {children}
        </div>
      </main>

      <div className={isMobileLobby ? 'hidden lg:block' : ''}>
        <SiteFooter loggedIn />
      </div>
    </div>
  );
}
