interface Crumb {
  id: string;
  username: string;
  level: number;
}

interface Props {
  items: Crumb[];
  onSelect: (id: string | null) => void;
  /** 最末一項通常是目前 parent, 不 clickable */
  terminalLabel?: string;
}

export function HierarchyBreadcrumb({ items, onSelect, terminalLabel }: Props): JSX.Element {
  return (
    <div className="crt-panel mb-3 flex flex-wrap items-center gap-1 px-3 py-2 text-[11px]">
      {items.map((c, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            {idx > 0 && <span className="text-ink-400">/</span>}
            <button
              type="button"
              onClick={() => !isLast && onSelect(c.id)}
              disabled={isLast}
              className={`flex items-center gap-1 px-2 py-1 font-mono tracking-[0.15em] transition ${
                isLast
                  ? 'text-neon-acid'
                  : 'text-ink-700 hover:text-neon-acid hover:bg-neon-acid/5'
              }`}
            >
              <span className="text-[9px] opacity-60">LVL{c.level}</span>
              <span className="uppercase">{c.username}</span>
            </button>
          </span>
        );
      })}
      {terminalLabel && (
        <span className="ml-2 text-[10px] text-ink-400">· {terminalLabel}</span>
      )}
    </div>
  );
}
