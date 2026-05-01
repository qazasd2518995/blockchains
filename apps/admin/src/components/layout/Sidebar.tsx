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
    <aside className="admin-nav-panel panel-felt w-full shrink-0 overflow-hidden p-3 lg:sticky lg:top-[132px] lg:h-[calc(100vh-164px)] lg:w-60 lg:p-4">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-3">
        <span className="admin-nav-title font-semibold text-base text-[#DEBE66]">导航</span>
      </div>
      <nav className="admin-nav-links mt-3 flex gap-2 overflow-x-auto pb-1 lg:mt-4 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `group flex min-h-11 shrink-0 items-center justify-between rounded-sm border px-3 py-2.5 text-[12px] transition lg:w-full ${
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
      <div className="hidden border-t border-[#E5E7EB] pt-3 text-center font-semibold text-[12px] text-[#DEBE66] lg:absolute lg:bottom-4 lg:left-4 lg:right-4 lg:block">
        v0.1 · BG 后台
      </div>
    </aside>
  );
}
