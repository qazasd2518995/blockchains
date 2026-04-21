import { type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Bell, History, ShieldCheck, Gift, LogOut } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { AnnouncementTicker } from '@/components/home/AnnouncementTicker';
import { WinTicker } from '@/components/home/WinTicker';
import { FloatingSupport } from '@/components/layout/FloatingSupport';

const NAV_ITEMS: { to: string; label: string; icon: typeof Gift }[] = [
  { to: '/promos',  label: '優惠',      icon: Gift },
  { to: '/history', label: '遊戲紀錄',  icon: History },
  { to: '/verify',  label: '公平驗證',  icon: ShieldCheck },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, setBalance, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

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
    <div className="flex min-h-screen flex-col bg-[#ECECEC]">
      {/* TopBar — 黑底 */}
      <header className="sticky top-0 z-40 bg-[#1A2530] text-white shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-5">
          <Link to="/lobby" className="flex items-center gap-2 text-[22px] font-extrabold tracking-[0.05em]">
            <span className="rounded-[6px] bg-gradient-to-br from-[#186073] to-[#0E4555] px-2 py-0.5 text-[20px] text-white">
              BG
            </span>
            <span className="hidden text-[18px] font-bold text-white/90 sm:inline">娛樂城</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1">
            {NAV_ITEMS.map((it) => {
              const Icon = it.icon;
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-[6px] px-3 py-1.5 text-[14px] transition ${
                      isActive
                        ? 'bg-[#186073] text-white'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </NavLink>
              );
            })}
          </nav>

          {user ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBalanceRefresh}
                className="flex items-center gap-2 rounded-[6px] border border-[#C9A247]/60 bg-black/30 px-3 py-1.5 transition hover:border-[#C9A247]"
                title="點擊更新餘額"
              >
                <span className="text-[11px] text-white/70">餘額</span>
                <span className="num text-[15px] font-semibold text-[#C9A247]">
                  {formatAmount(user.balance ?? '0')}
                </span>
              </button>
              <NavLink
                to="/profile"
                className="flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition hover:bg-white/10"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#C9A247] to-[#876A27] text-[11px] font-bold text-white">
                  {(user.displayName ?? user.username ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className="hidden text-[13px] sm:inline">
                  {user.displayName ?? user.username}
                </span>
                <span className="ml-1 rounded-[3px] bg-[#C9A247] px-1 text-[10px] font-bold text-[#1A2530]">
                  VIP1
                </span>
              </NavLink>
              <button
                type="button"
                onClick={() => navigate('/history')}
                className="rounded-[6px] p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label="訊息"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-[6px] p-2 text-white/75 transition hover:bg-white/10 hover:text-white"
                aria-label="登出"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn-teal text-[13px]">
              登入
            </Link>
          )}
        </div>
      </header>

      {/* 雙跑馬燈 */}
      <AnnouncementTicker />
      <WinTicker />

      {/* Main */}
      <main className="flex-1">
        <div className="mx-auto max-w-[1280px] px-5 py-6">{children}</div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#E5E7EB] bg-[#F5F7FA]">
        <div className="mx-auto max-w-[1280px] grid grid-cols-1 gap-6 px-5 py-8 md:grid-cols-3">
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">快捷連結</h4>
            <ul className="space-y-2 text-[13px] text-[#4A5568]">
              <li><Link to="/promos" className="hover:text-[#186073]">新手幫助</Link></li>
              <li><Link to="/promos" className="hover:text-[#186073]">關於我們</Link></li>
              <li><Link to="/promos" className="hover:text-[#186073]">服務條款</Link></li>
              <li><Link to="/promos" className="hover:text-[#186073]">聯絡我們</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="mb-3 text-[14px] font-semibold text-[#0F172A]">社群</h4>
            <div className="flex gap-3 text-[13px]">
              <a href="https://line.me/ti/p/~@aaa1788"       target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">LINE</a>
              <a href="https://t.me/aaawin1788_bot"           target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Telegram</a>
              <a href="https://www.instagram.com/aaa1788_com/" target="_blank" rel="noreferrer" className="text-[#4A5568] hover:text-[#186073]">Instagram</a>
            </div>
            <p className="mt-4 text-[11px] text-[#9CA3AF]">
              18+ 負責任博彩 · 本站為技術研究用假幣平台，不涉及真實金流
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
