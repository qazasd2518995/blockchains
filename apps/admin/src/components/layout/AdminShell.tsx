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
      {/* Top strip — felt dark with brass */}
      <div className="sticky top-0 z-50 border-b border-brass-500/55 bg-felt-800/95 backdrop-blur-lg shadow-[0_2px_12px_-4px_rgba(10,8,6,0.35)]">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.3em] text-brass-200">
          <div className="flex items-center gap-6">
            <span className="flex items-center">
              <span className="status-dot status-dot-live" /> {t.shell.linkLive}
            </span>
            <span className="hidden md:inline font-script normal-case tracking-normal text-[13px] text-brass-300">
              {t.shell.node}
            </span>
            <span className="hidden lg:inline data-num text-brass-300">{time}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline">
              {t.shell.session} 0x{agent?.id.slice(-6).toUpperCase()}
            </span>
            {agent?.role === 'SUPER_ADMIN' && (
              <span className="tag tag-gold">{t.shell.super}</span>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-6 border-t border-brass-500/30 px-6 py-4">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full border-2 border-brass-400 bg-felt-700 shadow-lift">
              <span className="font-serif text-xl italic text-brass-300">A</span>
              <span className="absolute -right-1 -top-1 text-brass-400 text-sm">◆</span>
            </div>
            <div>
              <div className="font-serif text-xl leading-none text-ivory-100">
                Agent<span className="italic text-brass-400">.</span>Ops
              </div>
              <div className="mt-1 font-script text-[12px] text-brass-300">
                {t.shell.terminal}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden border-r border-brass-500/30 pr-4 text-right md:block">
              <div className="label text-brass-400">{t.shell.operator}</div>
              <div className="mt-0.5 font-serif italic text-[13px] text-ivory-100">
                {agent?.displayName ?? agent?.username}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-sm border border-brass-400 bg-felt-900/70 px-4 py-2">
              <span className="font-mono text-[9px] tracking-[0.3em] text-brass-300">
                {t.shell.balance}
              </span>
              <span className="font-serif text-xl font-bold big-num-brass">
                {formatDec(agent?.balance ?? '0')}
              </span>
            </div>
            <div className="hidden border-l border-brass-500/30 pl-4 text-right md:block">
              <div className="label text-brass-400">{t.shell.level}</div>
              <div className="mt-0.5 font-serif text-[13px] italic text-ivory-100">
                {agent?.level}
              </div>
            </div>
            <div className="hidden border-l border-brass-500/30 pl-4 text-right md:block">
              <div className="label text-brass-400">{t.shell.rebate}</div>
              <div className="mt-0.5 font-mono text-[13px] text-brass-300">
                {formatPct(agent?.rebatePercentage ?? '0')}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-sm border border-brass-500/60 bg-felt-900/50 px-3 py-1.5 font-serif text-[11px] uppercase tracking-[0.16em] text-brass-200 transition hover:border-brass-400 hover:bg-felt-700 hover:text-ivory-100"
            >
              [{t.common.logoutBtn}]
            </button>
          </div>
        </div>
      </div>

      <main className="relative z-10 mx-auto flex max-w-[1920px] gap-6 px-4 py-8 sm:px-6 lg:px-8 xl:px-10">
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
