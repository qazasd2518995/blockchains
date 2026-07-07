import { type ReactNode, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Gift,
  History,
  KeyRound,
  LayoutGrid,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { BrandMark } from '@/components/layout/BrandMark';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { AudioMenu } from '@/components/layout/AudioMenu';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { ChangePasswordModal } from '@/components/layout/ChangePasswordModal';
import { useTranslation } from '@/i18n/useTranslation';
import { useLiveBalance } from '@/hooks/useLiveBalance';

const NAV_ITEMS: {
  to: string;
  labelKey: 'lobby' | 'gameGuide' | 'history' | 'promos';
  icon: typeof Gift;
}[] = [
  { to: '/lobby', labelKey: 'lobby', icon: LayoutGrid },
  { to: '/verify', labelKey: 'gameGuide', icon: ShieldCheck },
  { to: '/history', labelKey: 'history', icon: History },
  { to: '/promos', labelKey: 'promos', icon: Gift },
];

const MOBILE_WHITE_ROUTES = new Set(['/lobby', '/verify', '/history', '/promos']);

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setBalance, logout, refreshToken } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const useMobileWhiteChrome = MOBILE_WHITE_ROUTES.has(location.pathname);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  useLiveBalance();

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        /* ignore */
      }
    }
    logout();
    setAccountMenuOpen(false);
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
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <div className="pointer-events-none fixed inset-0">
        <ResponsiveImage
          src="/backgrounds/casino-atmosphere.png"
          alt=""
          aria-hidden="true"
          preset="hero"
          sizes="100vw"
          loading="eager"
          fetchPriority="high"
          width={1717}
          height={916}
          className="h-full w-full object-cover opacity-[0.16]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(233,236,239,0.72)_0%,rgba(233,236,239,0.9)_30%,rgba(233,236,239,0.96)_100%)]" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(234,88,12,0.18),transparent_72%)]" />

      <a
        href="#main-content"
        className="sr-only absolute left-4 top-4 z-[100] rounded-md bg-white px-3 py-2 text-sm font-semibold text-[#0F172A] shadow focus:not-sr-only"
      >
        {t.common.skipToMain}
      </a>

      <header
        className={`sticky top-0 z-40 border-b border-[#162238] bg-[linear-gradient(180deg,rgba(8,15,27,0.98),rgba(15,23,42,0.96))] pt-[env(safe-area-inset-top)] text-white shadow-[0_18px_40px_rgba(2,6,23,0.34)] ${
          useMobileWhiteChrome ? 'hidden lg:block' : ''
        }`}
      >
        <div className="border-b border-white/8">
          <div className="mx-auto grid w-full max-w-[1920px] gap-2 px-3 py-2 text-[11px] text-white/80 sm:px-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center xl:px-8 2xl:px-12">
            <div className="flex items-center gap-2">
              <span className="dot-online" />
              <span>{t.common.aroundTheClock}</span>
            </div>
            <AnnouncementTicker />
            <span className="hidden whitespace-nowrap text-white/55 lg:inline">
              {t.common.invitationOnly}
            </span>
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
                    {t.common[it.labelKey]}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          {user ? (
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <div className="relative">
                {accountMenuOpen && (
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    aria-label="關閉帳號選單"
                    onClick={() => setAccountMenuOpen(false)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((value) => !value)}
                  className="relative z-50 inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full border border-[#C9A247]/40 bg-[#162338] px-3 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition hover:border-[#C9A247] hover:bg-[#1B2940] sm:px-4"
                  aria-expanded={accountMenuOpen}
                  aria-label={`${t.common.account} ${user.username}，${t.common.balance} ${formatAmount(user.balance ?? '0')}`}
                >
                  <span className="flex min-w-0 flex-col items-start leading-none">
                    <span className="max-w-[132px] truncate text-[11px] font-semibold text-white/72">
                      {t.common.account} {user.username}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      <span className="label !text-white/60">{t.common.balance}</span>
                      <span className="data-num text-[14px] font-semibold text-[#E8D48A]">
                        {formatAmount(user.balance ?? '0')}
                      </span>
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-white/60 transition ${accountMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {accountMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[172px] overflow-hidden rounded-[12px] border border-white/12 bg-[#0F172A] py-1 text-white shadow-[0_18px_42px_rgba(2,6,23,0.42)]">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setPasswordOpen(true);
                      }}
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-[13px] font-bold text-white/86 transition hover:bg-white/[0.07]"
                    >
                      <KeyRound className="h-4 w-4 text-[#E8D48A]" aria-hidden="true" />
                      修改密碼
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        void handleBalanceRefresh();
                      }}
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-[13px] font-bold text-white/76 transition hover:bg-white/[0.07]"
                    >
                      <RefreshCw className="h-4 w-4 text-white/58" aria-hidden="true" />
                      {t.common.reload}
                    </button>
                  </div>
                )}
              </div>

              <AudioMenu
                variant="dark"
                showLabel
                className="max-sm:w-9 max-sm:px-0 max-sm:[&>span]:hidden"
              />
              <LanguageSwitcher variant="dark" compact className="max-sm:w-9" />

              <button
                type="button"
                onClick={handleLogout}
                className="btn-chip border-white/12 bg-[#162338] text-white/82 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white max-sm:w-9 max-sm:px-0"
                aria-label={t.common.logout}
              >
                <LogOut className="h-4 w-4" />
                <span className="max-sm:hidden">{t.common.logout}</span>
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <AudioMenu
                variant="dark"
                showLabel
                className="max-sm:w-9 max-sm:px-0 max-sm:[&>span]:hidden"
              />
              <LanguageSwitcher variant="dark" compact className="max-sm:w-9" />
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
            useMobileWhiteChrome
              ? 'px-0 py-0 lg:px-8 lg:py-6 2xl:px-12'
              : 'px-3 py-4 sm:px-6 sm:py-6 xl:px-8 2xl:px-12'
          }`}
        >
          {children}
        </div>
      </main>

      <div className={useMobileWhiteChrome ? 'hidden lg:block' : ''}>
        <SiteFooter loggedIn={Boolean(user)} />
      </div>
    </div>
  );
}
