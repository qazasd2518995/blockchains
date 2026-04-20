import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { LocaleToggle } from './LocaleToggle';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setBalance, logout, refreshToken } = useAuthStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [time, setTime] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(d.toLocaleTimeString('en-US', { hour12: false }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
    <div className="relative min-h-screen">
      {/* Top bar — slim, mainly for user / balance */}
      <div className="sticky top-0 z-50 border-b border-brass-500/40 bg-ivory-100/90 backdrop-blur-lg shadow-[0_1px_0_0_rgba(201,162,76,0.18),0_4px_20px_-8px_rgba(10,8,6,0.08)]">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="rounded border border-brass-500/50 bg-ivory-100 px-2.5 py-1.5 text-brass-700 lg:hidden"
              onClick={() => setMobileNav((v) => !v)}
              aria-label="menu"
            >
              <span className="text-lg leading-none">≡</span>
            </button>
            <Link to="/lobby" className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-brass-500 bg-gradient-to-br from-ivory-100 to-ivory-200 shadow-lift">
                <span className="font-serif text-lg italic text-brass-700">B</span>
                <span className="absolute -right-1 -top-1 text-brass-600 text-sm">♦</span>
              </div>
              <div className="hidden sm:block">
                <div className="font-serif text-xl leading-none text-ivory-950">
                  Blockchain<span className="italic text-brass-700">.</span>Game
                </div>
                <div className="mt-1 font-script text-[12px] text-ivory-600">
                  The Gilded Salon
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-4 text-[10px] uppercase tracking-[0.3em] text-ivory-700 md:flex">
              <span className="flex items-center">
                <span className="status-dot status-dot-live" />
                {t.appshell.connected}
              </span>
              <span className="font-mono data-num text-brass-700">{time}</span>
            </div>
            <LocaleToggle />
            <button
              type="button"
              onClick={handleBalanceRefresh}
              className="group flex items-center gap-3 rounded-sm border border-brass-500 bg-gradient-to-b from-ivory-50 to-ivory-200 px-4 py-2 transition hover:from-brass-50 hover:to-brass-100"
              title={t.appshell.refreshBalance}
            >
              <span className="font-mono text-[9px] tracking-[0.3em] text-brass-700">
                {t.common.credits}
              </span>
              <span className="font-serif text-xl font-bold big-num-brass">
                {formatAmount(user?.balance ?? '0')}
              </span>
            </button>
            <div className="hidden items-center gap-3 border-l border-brass-500/50 pl-4 md:flex">
              <div className="text-right">
                <div className="label label-brass">{t.common.operator}</div>
                <div className="mt-0.5 font-serif text-[13px] italic text-ivory-950">
                  {user?.displayName ?? user?.email?.split('@')[0]}
                </div>
              </div>
              <button type="button" onClick={handleLogout} className="btn-ghost text-[11px]">
                [{t.common.exit}]
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="relative mx-auto flex max-w-[1920px] gap-0">
        <CasinoSidebar open={mobileNav} onClose={() => setMobileNav(false)} />
        <main className="relative z-10 min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <footer className="relative z-10 mt-16 border-t border-brass-500/40 bg-ivory-100/80 py-8">
        <div className="mx-auto max-w-[1920px] px-6">
          <div className="divider-suit mb-4">
            <span>♠ ◆ ♥ ◆ ♦ ◆ ♣</span>
          </div>
          <div className="flex flex-col items-center gap-2 text-center md:flex-row md:justify-between md:text-left">
            <span className="font-script text-lg text-brass-700">{t.appshell.fairPlay}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ivory-600">
              {t.appshell.noReal}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CasinoSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const items: { to: string; label: string; icon: string; accent?: boolean }[] = [
    { to: '/lobby', label: t.lobby.allGames, icon: '◆' },
    { to: '/lobby?cat=single-step', label: t.lobby.classic, icon: '♠' },
    { to: '/lobby?cat=multi-step', label: t.lobby.strategy, icon: '♣' },
    { to: '/lobby?cat=realtime-crash', label: t.lobby.crash, icon: '♥' },
  ];
  const featured: { to: string; label: string; icon: string }[] = [
    { to: '/lobby?tab=popular', label: t.lobby.popular, icon: '🔥' },
    { to: '/lobby?tab=new', label: t.lobby.newGames, icon: '✨' },
    { to: '/lobby?tab=favorites', label: t.lobby.favorites, icon: '★' },
  ];
  const account: { to: string; label: string; icon: string }[] = [
    { to: '/history', label: t.common.history, icon: '§' },
    { to: '/profile', label: t.common.profile, icon: '◈' },
  ];
  return (
    <>
      {/* mobile overlay */}
      {open && (
        <button
          type="button"
          aria-label="close nav"
          className="fixed inset-0 z-40 bg-felt-900/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed bottom-0 left-0 top-[73px] z-50 w-64 shrink-0 overflow-y-auto border-r border-brass-500/40 bg-gradient-to-b from-felt-700 via-felt-800 to-felt-900 transition-transform lg:sticky lg:top-[73px] lg:z-10 lg:h-[calc(100vh-73px)] lg:translate-x-0 lg:bg-gradient-to-b lg:from-felt-700 lg:via-felt-800 lg:to-felt-900 ${
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4">
          <SideSection title={t.lobby.terminal}>
            {items.map((it) => (
              <SideLink key={it.to} to={it.to} onNavigate={onClose} icon={it.icon} label={it.label} />
            ))}
          </SideSection>

          <SideSection title="Featured">
            {featured.map((it) => (
              <SideLink key={it.to} to={it.to} onNavigate={onClose} icon={it.icon} label={it.label} />
            ))}
          </SideSection>

          <SideSection title="Account">
            {account.map((it) => (
              <SideLink key={it.to} to={it.to} onNavigate={onClose} icon={it.icon} label={it.label} />
            ))}
          </SideSection>

          <div className="mt-6 border-t border-brass-500/25 pt-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-script text-[14px] text-brass-300">{t.lobby.promotions}</span>
              <span className="text-brass-500 text-xs">◆</span>
            </div>
            <div className="relative overflow-hidden rounded-sm border border-brass-500/60 bg-gradient-to-br from-wine-500 via-wine-600 to-wine-700 p-4 shadow-lift">
              <div className="label text-brass-300">VIP · SALON</div>
              <div className="mt-2 font-serif text-lg italic text-ivory-100">Weekly Drop</div>
              <div className="mt-1 font-mono text-[11px] text-brass-200/80">
                Coming soon
              </div>
              <span className="absolute -right-2 -top-2 text-4xl text-brass-400/30 font-serif">
                ♦
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function SideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between px-2">
        <span className="font-script text-[13px] text-brass-300">{title}</span>
        <span className="text-brass-500/60 text-[10px]">◆</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SideLink({
  to,
  label,
  icon,
  onNavigate,
}: {
  to: string;
  label: string;
  icon: string;
  onNavigate: () => void;
}) {
  const pathOnly = to.split('?')[0] ?? to;
  return (
    <NavLink
      to={to}
      end={to === '/lobby'}
      onClick={onNavigate}
      className={({ isActive }) => {
        const searchMatches =
          typeof window !== 'undefined' &&
          to.includes('?') &&
          window.location.pathname === pathOnly &&
          to.includes(window.location.search);
        const active = isActive || searchMatches;
        return `group flex items-center justify-between rounded-sm border px-3 py-2.5 text-[13px] transition ${
          active
            ? 'border-brass-400 bg-felt-900/70 text-brass-200 shadow-[inset_0_0_0_1px_rgba(201,162,76,0.25)]'
            : 'border-transparent text-ivory-100/75 hover:border-brass-500/40 hover:bg-felt-900/40 hover:text-brass-200'
        }`;
      }}
    >
      <span className="flex items-center gap-3">
        <span className="font-serif text-base text-brass-400 opacity-80">{icon}</span>
        <span className="font-serif tracking-[0.06em]">{label}</span>
      </span>
      <span className="text-brass-400 opacity-0 transition group-hover:opacity-90">→</span>
    </NavLink>
  );
}
