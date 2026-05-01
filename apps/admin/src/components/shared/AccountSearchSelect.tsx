import { useEffect, useId, useRef, useState } from 'react';
import { adminApi } from '@/lib/adminApi';

export interface AccountSearchOption {
  id: string;
  username: string;
  displayName: string | null;
  kind?: 'agent' | 'member';
  level?: number;
  balance?: string;
  status?: string;
  role?: string;
  agentUsername?: string | null;
}

interface Props {
  kind: 'agent' | 'member' | 'mixed';
  label: string;
  value: AccountSearchOption | null;
  onChange: (value: AccountSearchOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeId?: string;
}

const endpointByKind = {
  agent: '/agents/search',
  member: '/members/search',
};

export function AccountSearchSelect({
  kind,
  label,
  value,
  onChange,
  placeholder = '输入账号或名称搜索',
  disabled,
  excludeId,
}: Props): JSX.Element {
  const inputId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputClearedSelectionRef = useRef(false);
  const [query, setQuery] = useState(value?.username ?? '');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AccountSearchOption[]>([]);

  useEffect(() => {
    if (value) {
      setQuery(value.username);
      return;
    }
    if (inputClearedSelectionRef.current) {
      inputClearedSelectionRef.current = false;
      return;
    }
    setQuery('');
  }, [value?.id, value?.username]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (disabled || !open) return;
    const term = query.trim();
    if (!term || (value && term === value.username)) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancel = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchAccounts(kind, term)
        .then((res) => {
          if (cancel) return;
          const nextItems = excludeId
            ? res.filter((item) => item.id !== excludeId)
            : res;
          setItems(nextItems);
        })
        .catch(() => {
          if (!cancel) setItems([]);
        })
        .finally(() => {
          if (!cancel) setLoading(false);
        });
    }, 180);

    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [disabled, excludeId, kind, open, query, value]);

  const selectItem = (item: AccountSearchOption): void => {
    onChange(item);
    setQuery(item.username);
    setItems([]);
    setOpen(false);
  };

  const helper = value ? selectedHelper(kind, value) : '输入关键字后从清单点选账号';
  const modeLabel = kind === 'agent' ? 'AGENT' : kind === 'member' ? 'MEMBER' : 'ALL';

  return (
    <div ref={boxRef} className="account-search-select relative">
      <label htmlFor={inputId} className="label mb-2 block">
        {label}
      </label>
      <div className="account-search-select__input-wrap relative">
        <input
          id={inputId}
          type="text"
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            if (value) {
              inputClearedSelectionRef.current = true;
              onChange(null);
            }
          }}
          className={`term-input font-mono ${kind === 'mixed' ? 'pr-12' : 'pr-20'}`}
          placeholder={placeholder}
          autoComplete="off"
        />
        <div className={`account-search-select__mode pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-ink-400 ${kind === 'mixed' ? 'tracking-[0.08em]' : 'tracking-[0.2em]'}`}>
          {modeLabel}
        </div>
      </div>
      <div className={`account-search-select__helper mt-1 text-[10px] ${value ? 'text-[#186073]' : 'text-ink-500'}`}>{helper}</div>

      {open && query.trim() && (!value || query.trim() !== value.username) && (
        <div className="absolute z-[5200] mt-2 max-h-72 w-full overflow-auto border border-ink-200 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.18)]">
          {loading ? (
            <div className="px-3 py-4 text-center text-[11px] text-ink-500">搜索中…</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-ink-400">没有匹配账号</div>
          ) : (
            items.map((item) => {
              const itemKind = item.kind ?? (kind === 'agent' ? 'agent' : 'member');
              return (
                <button
                  key={`${itemKind}-${item.id}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  className="block w-full border-b border-ink-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-[#F4FAFC]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[12px] font-bold text-ink-900">{item.username}</div>
                      <div className="mt-0.5 truncate text-[11px] text-ink-500">
                        全名：{item.displayName || '—'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px]">
                      {itemKind === 'agent' ? (
                        <>
                          <div className="tag tag-acid">L{item.level ?? '—'} 代理</div>
                          {item.balance && <div className="mt-1 data-num text-ink-500">{formatAmount(item.balance)}</div>}
                        </>
                      ) : (
                        <>
                          <div className="tag tag-toxic">会员</div>
                          <div className="mt-1 data-num text-[#186073]">{formatAmount(item.balance ?? '0')}</div>
                        </>
                      )}
                    </div>
                  </div>
                  {itemKind === 'member' && item.agentUsername && (
                    <div className="mt-1 text-[10px] text-ink-400">代理：{item.agentUsername}</div>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

async function searchAccounts(kind: 'agent' | 'member' | 'mixed', term: string): Promise<AccountSearchOption[]> {
  if (kind === 'mixed') {
    const [agents, members] = await Promise.all([
      adminApi.get<{ items: AccountSearchOption[] }>(endpointByKind.agent, { params: { q: term, limit: 8 } }),
      adminApi.get<{ items: AccountSearchOption[] }>(endpointByKind.member, { params: { q: term, limit: 8 } }),
    ]);
    return [
      ...agents.data.items.map((item) => ({ ...item, kind: 'agent' as const })),
      ...members.data.items.map((item) => ({ ...item, kind: 'member' as const })),
    ].slice(0, 12);
  }

  const res = await adminApi.get<{ items: AccountSearchOption[] }>(endpointByKind[kind], {
    params: { q: term, limit: 12 },
  });
  return res.data.items.map((item) => ({ ...item, kind }));
}

function selectedHelper(kind: 'agent' | 'member' | 'mixed', value: AccountSearchOption): string {
  const selectedKind = value.kind ?? kind;
  if (selectedKind === 'agent') {
    return `已选择：${value.displayName || value.username} · L${value.level ?? '—'} 代理`;
  }
  if (selectedKind === 'member') {
    return `已选择：${value.displayName || value.username} · 余额 ${formatAmount(value.balance ?? '0')}`;
  }
  return `已选择：${value.displayName || value.username}`;
}

function formatAmount(value: string): string {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
