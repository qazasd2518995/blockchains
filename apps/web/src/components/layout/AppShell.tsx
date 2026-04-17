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

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString('en-US', { hour12: false }) +
          ' / NONCE ' +
          Math.floor(Date.now() / 1000).toString(16).toUpperCase().slice(-6),
      );
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
        // ignore
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
      <div className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.25em]">
          <div className="flex items-center gap-6 text-ink-400">
            <span>
              <span className="status-dot status-dot-live" />
              {t.appshell.connected}
            </span>
            <span className="hidden md:inline">NODE 03 / OREGON-US</span>
            <span className="hidden lg:inline data-num text-ink-300">{time}</span>
          </div>
          <div className="flex items-center gap-4 text-ink-400">
            <span className="hidden sm:inline">
              {t.appshell.session} 0x{user?.id.slice(-6).toUpperCase()}
            </span>
            <span className="hidden md:inline">RTP 96–99%</span>
          </div>
        </div>

        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-6 py-4">
          <Link to="/lobby" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-neon-acid bg-neon-acid/10 text-neon-acid">
              <span className="font-display text-lg">BG</span>
            </div>
            <div>
              <div className="font-display text-lg leading-none tracking-widest text-bone">
                BLOCKCHAIN<span className="text-neon-acid">.</span>GAME
              </div>
              <div className="label mt-1 text-[9px]">TERMINAL v0.1</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavItem to="/lobby" label={t.common.lobby} code="01" />
            <NavItem to="/history" label={t.common.history} code="02" />
            <NavItem to="/profile" label={t.common.profile} code="03" />
          </nav>

          <div className="flex items-center gap-3">
            <LocaleToggle />
            <button
              type="button"
              onClick={handleBalanceRefresh}
              className="flex items-center gap-3 border border-neon-acid/30 bg-neon-acid/5 px-4 py-2 transition hover:border-neon-acid hover:bg-neon-acid/10"
              title={t.appshell.refreshBalance}
            >
              <span className="text-[9px] tracking-[0.3em] text-neon-acid/70">
                {t.common.credits}
              </span>
              <span className="data-num text-xl font-bold text-neon-acid">
                {formatAmount(user?.balance ?? '0')}
              </span>
            </button>
            <div className="hidden border-l border-white/10 pl-3 text-right md:block">
              <div className="label">{t.common.operator}</div>
              <div className="mt-0.5 text-[12px] text-bone">
                {user?.displayName ?? user?.email?.split('@')[0]}
              </div>
            </div>
            <button type="button" onClick={handleLogout} className="btn-ghost text-[11px]">
              [{t.common.exit}]
            </button>
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto max-w-[1600px] px-6 py-8">{children}</main>

      <footer className="relative z-10 mt-16 border-t border-white/5 bg-ink-950/50 py-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 text-[10px] uppercase tracking-[0.3em] text-ink-500">
          <span>{t.appshell.fairPlay}</span>
          <span>{t.appshell.noReal}</span>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ to, label, code }: { to: string; label: string; code: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group relative flex items-center gap-2 px-4 py-2 transition ${
          isActive ? 'text-neon-acid' : 'text-ink-300 hover:text-bone'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="text-[9px] text-ink-500">{code}</span>
          <span className="text-[12px] font-semibold tracking-[0.25em]">{label}</span>
          {isActive && (
            <span className="absolute -bottom-px left-2 right-2 h-px bg-neon-acid shadow-acid-glow" />
          )}
        </>
      )}
    </NavLink>
  );
}
