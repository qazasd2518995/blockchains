import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { AgentPublic } from '@bg/shared';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useTranslation } from '@/i18n/useTranslation';
import { Sidebar } from './Sidebar';
import { ProfileModal } from '@/components/shared/ProfileModal';
import { ChangePasswordModal } from '@/components/shared/ChangePasswordModal';

export function AdminShell({ children }: { children: ReactNode }): JSX.Element {
  const { agent, accessToken, refreshToken, setAgent, logout } = useAdminAuthStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [time, setTime] = useState<string>(currentTime());
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTime(currentTime()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    const refreshAgent = async () => {
      try {
        const res = await adminApi.get<AgentPublic>('/auth/me');
        if (active && res.data) setAgent(res.data);
      } catch (err) {
        console.error(extractApiError(err));
      }
    };
    const handleFocus = () => {
      void refreshAgent();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshAgent();
    };

    void refreshAgent();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [accessToken, setAgent]);

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      if (refreshToken) await adminApi.post('/auth/logout', { refreshToken });
    } catch (err) {
      console.error(extractApiError(err));
    }
    logout();
    navigate('/admin/login', { replace: true });
  };

  const openProfile = () => {
    setMenuOpen(false);
    setProfileOpen(true);
  };
  const openChangePassword = () => {
    setMenuOpen(false);
    setPwdOpen(true);
  };

  return (
    <div className="admin-shell relative min-h-[100svh] overflow-x-hidden bg-[#E9ECEF]">
      <div className="pointer-events-none fixed inset-0">
        <img
          src="/backgrounds/admin-shell-host.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover object-[72%_center] opacity-[0.12]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(233,236,239,0.72)_0%,rgba(233,236,239,0.9)_34%,rgba(233,236,239,0.96)_100%)]" />
      </div>

      {/* Top strip — felt dark with brass */}
      <div className="admin-top-strip sticky top-0 z-50 border-b border-[#186073]/55 bg-[#093040]/95 pt-[env(safe-area-inset-top)] shadow-[0_2px_12px_-4px_rgba(10,8,6,0.35)] backdrop-blur-lg">
        <div className="flex w-full items-center justify-between gap-3 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-[#E8D48A] sm:px-6 sm:tracking-[0.3em]">
          <div className="flex items-center gap-6">
            <span className="flex items-center">
              <span className="dot-online dot-online" /> {t.shell.linkLive}
            </span>
            <span className="hidden md:inline font-semibold normal-case tracking-normal text-[13px] text-[#DEBE66]">
              {t.shell.node}
            </span>
            <span className="hidden lg:inline data-num text-[#DEBE66]">{time}</span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-3 sm:gap-4">
            <span className="hidden sm:inline">
              {t.shell.session} 0x{agent?.id.slice(-6).toUpperCase()}
            </span>
            {agent?.role === 'SUPER_ADMIN' && (
              <span className="tag tag-gold">{t.shell.super}</span>
            )}
          </div>
        </div>

        <div className="admin-brand-row flex w-full flex-wrap items-center justify-between gap-3 border-t border-[#186073]/30 px-3 py-3 sm:px-6 sm:py-4">
          <Link to="/admin/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="admin-brand-logo rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[22px] font-extrabold tracking-[0.05em] text-white">
              BG
            </span>
            <div className="hidden sm:block">
              <div className="text-[18px] font-bold leading-none text-white">
                代理后台
              </div>
              <div className="mt-1 text-[12px] text-[#DEBE66]">
                {t.shell.terminal}
              </div>
            </div>
          </Link>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none sm:gap-3">
            <div className="hidden border-r border-[#186073]/30 pr-4 text-right md:block">
              <div className="label text-[#D0AC4D]">{t.shell.operator}</div>
              <div className="mt-0.5 font-semibold italic text-[13px] text-white">
                {agent?.displayName ?? agent?.username}
              </div>
            </div>
            <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-sm border border-[#186073] bg-[#1A2530]/70 px-3 py-2 sm:gap-3 sm:px-4">
              <span className="font-mono text-[9px] tracking-[0.3em] text-[#DEBE66]">
                {t.shell.balance}
              </span>
              <span className="num truncate text-base font-bold text-[#C9A247] sm:text-xl">
                {formatDec(agent?.balance ?? '0')}
              </span>
            </div>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-sm border border-[#186073]/60 bg-[#1A2530]/50 px-3 py-1.5 font-semibold text-[11px] uppercase tracking-[0.16em] text-[#E8D48A] transition hover:border-[#186073] hover:bg-[#0E4555] hover:text-white"
              >
                <span aria-hidden="true">👤</span>
                <span className="normal-case tracking-normal text-[12px]">
                  {agent?.username ?? '—'}
                </span>
                <span aria-hidden="true" className={`text-[10px] transition-transform ${menuOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[60] mt-2 w-48 overflow-hidden rounded-sm border border-[#186073] bg-[#0E1B24] shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)]"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openProfile}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-[#E8D48A] transition hover:bg-[#0E4555]/70 hover:text-white"
                  >
                    <span>个人资料</span>
                    <span className="text-[#D0AC4D]">→</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={openChangePassword}
                    className="flex w-full items-center justify-between border-t border-[#186073]/40 px-3 py-2 text-left text-[12px] text-[#E8D48A] transition hover:bg-[#0E4555]/70 hover:text-white"
                  >
                    <span>更改密码</span>
                    <span className="text-[#D0AC4D]">→</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void handleLogout();
                    }}
                    className="flex w-full items-center justify-between border-t border-[#186073]/40 px-3 py-2 text-left text-[12px] text-[#E8D48A] transition hover:bg-[#0E4555]/70 hover:text-white"
                  >
                    <span>{t.common.logoutBtn}</span>
                    <span className="text-[#D0AC4D]">→</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <main className="admin-layout-main relative z-10 flex w-full flex-col gap-4 px-3 py-4 sm:px-6 lg:flex-row lg:gap-6 lg:px-8 lg:py-8 xl:px-10">
        <Sidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </main>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
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
