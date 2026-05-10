import { Link, NavLink } from 'react-router-dom';
import { Gift, History, LayoutGrid, ShieldCheck, WalletCards } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatAmount } from '@/lib/utils';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useTranslation } from '@/i18n/useTranslation';

type MobilePageKey = 'lobby' | 'verify' | 'history' | 'promos';

const MOBILE_NAV_ITEMS: Array<{
  key: MobilePageKey;
  to: string;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { key: 'lobby', to: '/lobby', label: '大廳', icon: LayoutGrid },
  { key: 'verify', to: '/verify', label: '說明', icon: ShieldCheck },
  { key: 'history', to: '/history', label: '紀錄', icon: History },
  { key: 'promos', to: '/promos', label: '優惠', icon: Gift },
];

export function MobilePageHeader({
  title,
  subtitle,
  active,
}: {
  title: string;
  subtitle: string;
  active: MobilePageKey;
}) {
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();

  return (
    <section className="sticky top-0 z-30 border-b border-[#C9D9E2] bg-white pt-[env(safe-area-inset-top)] shadow-[0_4px_14px_rgba(15,23,42,0.08)] lg:hidden">
      <div className="flex h-[56px] items-center gap-2 px-2.5">
        <Link
          to="/lobby"
          className="flex min-h-11 shrink-0 items-center gap-1.5"
          aria-label={t.common.lobby}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#E9F8F8] text-[17px] font-black text-[#0992A8]">
            BG
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-black leading-tight text-[#12333E]">{title}</h1>
          <p className="mt-0.5 truncate text-[10px] font-black uppercase tracking-[0.2em] text-[#7A8B97]">
            {subtitle}
          </p>
        </div>

        {user ? (
          <div
            className="flex h-11 w-[118px] min-w-0 items-center gap-1 rounded-[10px] border border-[#D6B75B] bg-[#FFF8DF] px-1.5 text-[#684F12]"
            aria-label={`${t.common.account} ${user.username}，${t.common.balance} ${formatAmount(user.balance ?? '0')}`}
          >
            <WalletCards className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[10px] font-black leading-none text-[#5F4A14]">
              {user.username}
            </span>
            <span className="data-num max-w-[54px] shrink-0 truncate text-[11px] font-black">
              {formatAmount(user.balance ?? '0')}
            </span>
          </div>
        ) : (
          <Link
            to={`/login?from=${encodeURIComponent(`/${active === 'lobby' ? 'lobby' : active}`)}&reason=${active}`}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-[10px] border border-[#D6B75B] bg-[#FFF1B4] px-3 text-[12px] font-black text-[#765709]"
          >
            {t.common.login}
          </Link>
        )}
        <LanguageSwitcher variant="light" compact className="h-11 w-11 rounded-[10px]" />
      </div>

      <nav className="grid grid-cols-4 gap-1.5 px-2 pb-2">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                `inline-flex h-11 items-center justify-center gap-1 rounded-[10px] border text-[12px] font-black shadow-[0_4px_10px_rgba(15,23,42,0.06)] active:scale-[0.99] ${
                  isActive || active === item.key
                    ? 'border-[#0F76A3] bg-[#1576A2] text-white'
                    : 'border-[#D8E7EE] bg-[#F7FCFE] text-[#17657D]'
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.key === 'lobby'
                ? t.common.lobby
                : item.key === 'verify'
                  ? t.common.gameGuide
                  : item.key === 'history'
                    ? t.common.history
                    : t.common.promos}
            </NavLink>
          );
        })}
      </nav>
    </section>
  );
}
