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
    <div className="relative min-h-screen overflow-hidden bg-[#E9ECEF]">
      <div className="pointer-events-none fixed inset-0">
        <img
          src="/backgrounds/admin-shell.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-[0.12]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(233,236,239,0.72)_0%,rgba(233,236,239,0.9)_34%,rgba(233,236,239,0.96)_100%)]" />
      </div>

      {/* Top strip — felt dark with brass */}
      <div className="sticky top-0 z-50 border-b border-[#186073]/55 bg-[#093040]/95 backdrop-blur-lg shadow-[0_2px_12px_-4px_rgba(10,8,6,0.35)]">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between px-6 py-2 text-[10px] uppercase tracking-[0.3em] text-[#E8D48A]">
          <div className="flex items-center gap-6">
            <span className="flex items-center">
              <span className="dot-online dot-online" /> {t.shell.linkLive}
            </span>
            <span className="hidden md:inline font-semibold normal-case tracking-normal text-[13px] text-[#DEBE66]">
              {t.shell.node}
            </span>
            <span className="hidden lg:inline data-num text-[#DEBE66]">{time}</span>
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

        <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-6 border-t border-[#186073]/30 px-6 py-4">
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[22px] font-extrabold tracking-[0.05em] text-white">
              BG
            </span>
            <div>
              <div className="text-[18px] font-bold leading-none text-white">
                代理后台
              </div>
              <div className="mt-1 text-[12px] text-[#DEBE66]">
                {t.shell.terminal}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden border-r border-[#186073]/30 pr-4 text-right md:block">
              <div className="label text-[#D0AC4D]">{t.shell.operator}</div>
              <div className="mt-0.5 font-semibold italic text-[13px] text-white">
                {agent?.displayName ?? agent?.username}
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-sm border border-[#186073] bg-[#1A2530]/70 px-4 py-2">
              <span className="font-mono text-[9px] tracking-[0.3em] text-[#DEBE66]">
                {t.shell.balance}
              </span>
              <span className="font-semibold text-xl font-bold num text-[#C9A247]">
                {formatDec(agent?.balance ?? '0')}
              </span>
            </div>
            <div className="hidden border-l border-[#186073]/30 pl-4 text-right md:block">
              <div className="label text-[#D0AC4D]">{t.shell.level}</div>
              <div className="mt-0.5 font-semibold text-[13px] italic text-white">
                {agent?.level}
              </div>
            </div>
            <div className="hidden border-l border-[#186073]/30 pl-4 text-right md:block">
              <div className="label text-[#D0AC4D]">{t.shell.rebate}</div>
              <div className="mt-0.5 font-mono text-[13px] text-[#DEBE66]">
                {formatPct(agent?.rebatePercentage ?? '0')}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-sm border border-[#186073]/60 bg-[#1A2530]/50 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-[0.16em] text-[#E8D48A] transition hover:border-[#186073] hover:bg-[#0E4555] hover:text-white"
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
