interface Crumb {
  id: string;
  username: string;
  level: number;
}

interface Props {
  items: Crumb[];
  onSelect: (id: string | null) => void;
  onBack?: () => void;
  /** 最末一項通常是目前 parent, 不 clickable */
  terminalLabel?: string;
}

export function HierarchyBreadcrumb({ items, onSelect, onBack, terminalLabel }: Props): JSX.Element {
  return (
    <div className="card-base mb-4 flex flex-wrap items-center gap-1 px-4 py-2.5 text-[11px]">
      {items.map((c, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            {idx > 0 && <span className="text-[#C9A247]">◆</span>}
            <button
              type="button"
              onClick={() => !isLast && onSelect(c.id)}
              disabled={isLast}
              className={`flex items-center gap-1.5 rounded-sm px-2 py-1 font-semibold tracking-[0.06em] transition ${
                isLast
                  ? 'text-[#186073]'
                  : 'text-[#0F172A] hover:bg-[#FAF2D7] hover:text-[#186073]'
              }`}
            >
              <span className="italic">{c.username}</span>
            </button>
          </span>
        );
      })}
      {terminalLabel && (
        <span className="ml-3 font-semibold text-[12px] text-[#186073]">· {terminalLabel}</span>
      )}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="ml-auto rounded-sm border border-ink-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-ink-600 transition hover:border-[#186073]/40 hover:text-[#186073]"
        >
          ← 返回上级
        </button>
      )}
    </div>
  );
}
