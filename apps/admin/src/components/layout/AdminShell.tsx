import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useTranslation } from '@/i18n/useTranslation';
import { Sidebar } from './Sidebar';

export function AdminShell({ children }: { children: ReactNode }): JSX.Element {
  const { agent, refreshToken, logout } = useAdminAuthStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [time, setTime] = useState<string>(currentTime());

  useEffect(() => {
    const id = setInterval(() => setTime(currentTime()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    try {
      if (refreshToken) await adminApi.post('/auth/logout', { refreshToken });
    } catch (err) {
      console.error(extractApiError(err));
    }
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="relative min-h-screen">
      {/* Top strip */}
      <div className="sticky top-0 z-50 border-b border-ink-200 bg-ink-50/85 backdrop-blur-lg">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.25em]">
          <div className="flex items-center gap-6 text-ink-600">
            <span>
              <span className="status-dot status-dot-live" /> {t.shell.linkLive}
            </span>
            <span className="hidden md:inline">{t.shell.node}</span>
            <span className="hidden lg:inline data-num text-ink-700">{time}</span>
          </div>
          <div className="flex items-center gap-4 text-ink-600">
            <span className="hidden sm:inline">
              {t.shell.session} 0x{agent?.id.slice(-6).toUpperCase()}
            </span>
            {agent?.role === 'SUPER_ADMIN' && (
              <span className="tag tag-gold">{t.shell.super}</span>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-6 px-6 py-4">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-neon-acid bg-neon-acid/10 text-neon-acid">
              <span className="font-display text-lg">OP</span>
            </div>
            <div>
              <div className="font-display text-lg leading-none tracking-widest text-ink-900">
                AGENT<span className="text-neon-acid">.</span>OPS
              </div>
              <div className="label mt-1 text-[9px]">{t.shell.terminal}</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden border-r border-ink-200 pr-3 text-right md:block">
              <div className="label">{t.shell.operator}</div>
              <div className="mt-0.5 text-[12px] text-ink-900">
                {agent?.displayName ?? agent?.username}
              </div>
            </div>
            <div className="flex items-center gap-3 border border-neon-acid/30 bg-neon-acid/5 px-4 py-2">
              <span className="text-[9px] tracking-[0.3em] text-neon-acid/70">{t.shell.balance}</span>
              <span className="data-num text-xl font-bold text-neon-acid">
                {formatDec(agent?.balance ?? '0')}
              </span>
            </div>
            <div className="hidden border-l border-ink-200 pl-3 text-right md:block">
              <div className="label">{t.shell.level}</div>
              <div className="mt-0.5 text-[12px] text-ink-900">{agent?.level}</div>
            </div>
            <div className="hidden border-l border-ink-200 pl-3 text-right md:block">
              <div className="label">{t.shell.rebate}</div>
              <div className="mt-0.5 text-[12px] text-neon-toxic">
                {formatPct(agent?.rebatePercentage ?? '0')}
              </div>
            </div>
            <button type="button" onClick={handleLogout} className="btn-ghost text-[11px]">
              [{t.common.logoutBtn}]
            </button>
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto flex max-w-[1920px] gap-6 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
        <Sidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </main>
    </div>
  );
}

function currentTime(): string {
  const d = new Date();
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
function formatDec(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatPct(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0%';
  return `${(n * 100).toFixed(2)}%`;
}
