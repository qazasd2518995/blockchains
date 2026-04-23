import { NavLink } from 'react-router-dom';
import { useTranslation } from '@/i18n/useTranslation';

const items: { to: string; key: keyof ReturnType<typeof useTranslation>['t']['nav'] }[] = [
  { to: '/admin/dashboard', key: 'dashboard' },
  { to: '/admin/accounts', key: 'accounts' },
  { to: '/admin/subaccounts', key: 'subAccounts' },
  { to: '/admin/reports', key: 'reports' },
  { to: '/admin/controls', key: 'controls' },
  { to: '/admin/announcements', key: 'announcements' },
];

export function Sidebar(): JSX.Element {
  const { t } = useTranslation();
  return (
    <aside className="panel-felt sticky top-[108px] h-[calc(100vh-140px)] w-60 shrink-0 overflow-hidden p-4">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
        <span className="font-semibold text-base text-[#DEBE66]">导航</span>
      </div>
      <nav className="mt-4 space-y-1.5">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `group flex items-center justify-between rounded-sm border px-3 py-2.5 text-[12px] transition ${
                isActive
                  ? 'border-[#186073] bg-[#0E4555]/70 text-[#E8D48A] shadow-[inset_0_0_0_1px_rgba(201,162,76,0.2)]'
                  : 'border-transparent text-white/75 hover:border-[#E5E7EB] hover:bg-[#0E4555]/40 hover:text-[#E8D48A]'
              }`
            }
          >
            <span className="font-semibold tracking-[0.08em]">{t.nav[it.key]}</span>
            <span className="text-[#D0AC4D] opacity-0 transition group-hover:opacity-90">→</span>
          </NavLink>
        ))}
      </nav>
      <div className="absolute bottom-4 left-4 right-4 border-t border-[#E5E7EB] pt-3 text-center font-semibold text-[12px] text-[#DEBE66]">
        v0.1 · BG 后台
      </div>
    </aside>
  );
}
