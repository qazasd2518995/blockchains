import { NavLink } from 'react-router-dom';
import { useTranslation } from '@/i18n/useTranslation';

const items: { code: string; to: string; key: keyof ReturnType<typeof useTranslation>['t']['nav'] }[] = [
  { code: '01', to: '/admin/dashboard', key: 'dashboard' },
  { code: '02', to: '/admin/accounts', key: 'accounts' },
  { code: '03', to: '/admin/transfers', key: 'transfers' },
  { code: '04', to: '/admin/reports', key: 'reports' },
  { code: '05', to: '/admin/controls', key: 'controls' },
  { code: '06', to: '/admin/audit', key: 'audit' },
];

export function Sidebar(): JSX.Element {
  const { t } = useTranslation();
  return (
    <aside className="crt-panel sticky top-[96px] h-[calc(100vh-120px)] w-56 shrink-0 overflow-hidden p-3">
      <div className="border-b border-ink-200 pb-3 text-[9px] tracking-[0.3em] text-ink-500">
        § {t.shell.navigation}
      </div>
      <nav className="mt-3 space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              `group flex items-center justify-between border px-3 py-2 text-[11px] transition ${
                isActive
                  ? 'border-neon-acid bg-neon-acid/10 text-neon-acid shadow-acid-glow'
                  : 'border-transparent text-ink-700 hover:border-ink-200 hover:bg-ink-100/50 hover:text-ink-900'
              }`
            }
          >
            <span className="flex items-center gap-2">
              <span className="font-mono text-[9px] opacity-60">{it.code}</span>
              <span className="tracking-[0.2em] uppercase font-semibold">{t.nav[it.key]}</span>
            </span>
            <span className="opacity-0 transition group-hover:opacity-60">→</span>
          </NavLink>
        ))}
      </nav>
      <div className="absolute bottom-3 left-3 right-3 border-t border-ink-200 pt-3 text-[9px] tracking-[0.3em] text-ink-500">
        v0.1 · AGENT.OPS
      </div>
    </aside>
  );
}
