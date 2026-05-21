import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, WalletCards } from 'lucide-react';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/useTranslation';

interface MobileAccountMenuProps {
  className?: string;
}

export function MobileAccountMenu({ className = '' }: MobileAccountMenuProps) {
  const { user, refreshToken, logout } = useAuthStore();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    if (refreshToken) {
      try {
        await api.post('/auth/logout', { refreshToken });
      } catch {
        /* best effort */
      }
    }
    logout();
    setOpen(false);
    navigate('/');
  };

  return (
    <div className={`relative z-50 shrink-0 ${className}`}>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-transparent"
          aria-label="關閉帳號選單"
          onClick={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        className="relative z-50 flex h-full min-w-0 items-center gap-1.5 rounded-[10px] border border-[#D6B75B] bg-[#FFF8DF] px-1.5 text-left text-[#684F12] shadow-[0_3px_8px_rgba(120,79,18,0.08)] active:scale-[0.99]"
        aria-expanded={open}
        aria-label={`${t.common.account} ${user.username}，${t.common.balance} ${formatAmount(user.balance ?? '0')}`}
        onClick={() => setOpen((value) => !value)}
      >
        <WalletCards className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col justify-center leading-none">
          <span className="truncate text-[10px] font-black text-[#7C2D12]">{user.username}</span>
          <span className="data-num mt-1 truncate text-[11px] font-black text-[#9A3412]">
            {formatAmount(user.balance ?? '0')}
          </span>
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[#9A3412] transition ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[138px] overflow-hidden rounded-[12px] border border-[#FED7AA] bg-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]">
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-11 w-full items-center justify-center gap-2 px-3 text-[13px] font-black text-[#B45309] active:bg-[#FFF7ED]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t.common.logout}
          </button>
        </div>
      )}
    </div>
  );
}
