import { NavLink } from 'react-router-dom';
import { useTranslation } from '@/i18n/useTranslation';

const SUITS = ['♠', '♦', '♥', '♣', '◆', '❖'] as const;

const items: { to: string; key: keyof ReturnType<typeof useTranslation>['t']['nav'] }[] = [
  { to: '/admin/dashboard', key: 'dashboard' },
  { to: '/admin/accounts', key: 'accounts' },
  { to: '/admin/transfers', key: 'transfers' },
  { to: '/admin/reports', key: 'reports' },
  { to: '/admin/controls', key: 'controls' },
  { to: '/admin/audit', key: 'audit' },
];

export function Sidebar(): JSX.Element {
  const { t } = useTranslation();
  return (
    <aside className="panel-felt sticky top-[108px] h-[calc(100vh-140px)] w-60 shrink-0 overflow-hidden p-4">
      <div className="flex items-center justify-between border-b border-brass-500/40 pb-3">
        <span className="font-script text-base text-brass-300">Navigation</span>
        <span className="text-brass-500">◆</span>
      </div>
      <nav className="mt-4 space-y-1.5">
        {items.map((it, idx) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `group flex items-center justify-between rounded-sm border px-3 py-2.5 text-[12px] transition ${
                isActive
                  ? 'border-brass-400 bg-felt-700/70 text-brass-200 shadow-[inset_0_0_0_1px_rgba(201,162,76,0.2)]'
                  : 'border-transparent text-ivory-100/75 hover:border-brass-500/40 hover:bg-felt-700/40 hover:text-brass-200'
              }`
            }
          >
            <span className="flex items-center gap-2.5">
              <span className="font-serif text-sm text-brass-400 opacity-80">
                {SUITS[idx % SUITS.length]}
              </span>
              <span className="font-serif tracking-[0.08em]">{t.nav[it.key]}</span>
            </span>
            <span className="text-brass-400 opacity-0 transition group-hover:opacity-90">→</span>
          </NavLink>
        ))}
      </nav>
      <div className="absolute bottom-4 left-4 right-4 border-t border-brass-500/25 pt-3 text-center font-script text-[12px] text-brass-300">
        v0.1 · Agent.Ops
      </div>
    </aside>
  );
}
