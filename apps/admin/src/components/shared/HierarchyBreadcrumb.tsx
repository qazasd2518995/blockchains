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
    <div className="panel-salon-soft mb-4 flex flex-wrap items-center gap-1 px-4 py-2.5 text-[11px]">
      {items.map((c, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            {idx > 0 && <span className="text-brass-500">◆</span>}
            <button
              type="button"
              onClick={() => !isLast && onSelect(c.id)}
              disabled={isLast}
              className={`flex items-center gap-1.5 rounded-sm px-2 py-1 font-serif tracking-[0.06em] transition ${
                isLast
                  ? 'text-brass-700'
                  : 'text-ivory-800 hover:bg-brass-50 hover:text-brass-700'
              }`}
            >
              <span className="font-mono text-[9px] opacity-70">L{c.level}</span>
              <span className="italic">{c.username}</span>
            </button>
          </span>
        );
      })}
      {terminalLabel && (
        <span className="ml-3 font-script text-[12px] text-brass-700">· {terminalLabel}</span>
      )}
    </div>
  );
}
