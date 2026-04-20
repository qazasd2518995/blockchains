import { useEffect, useState } from 'react';
import type { TransferEntry, TransferListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { useTranslation } from '@/i18n/useTranslation';

export function TransfersPage(): JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<TransferEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await adminApi.get<TransferListResponse>('/transfers');
        if (!cancel) setItems(res.data.items);
      } catch (e) {
        if (!cancel) setError(extractApiError(e).message);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const columns: Column<TransferEntry>[] = [
    {
      key: 'time',
      label: t.transfers.timestamp,
      render: (r) => (
        <span className="data-num text-[10px] text-ink-500">
          {new Date(r.createdAt).toLocaleString('en-GB')}
        </span>
      ),
    },
    { key: 'type', label: 'TYPE', render: (r) => <span className="tag tag-acid">{r.type}</span> },
    {
      key: 'from',
      label: t.transfers.from,
      render: (r) => (
        <span className="font-mono text-[10px] text-ink-700">
          {r.fromType}:{r.fromId.slice(-8)}
        </span>
      ),
    },
    {
      key: 'to',
      label: t.transfers.to,
      render: (r) => (
        <span className="font-mono text-[10px] text-ink-700">
          {r.toType}:{r.toId.slice(-8)}
        </span>
      ),
    },
    {
      key: 'amt',
      label: t.transfers.amount,
      align: 'right',
      render: (r) => <span className="data-num text-neon-acid">{fmt(r.amount)}</span>,
    },
    {
      key: 'balances',
      label: `${t.transfers.before} → ${t.transfers.after}`,
      align: 'right',
      render: (r) => (
        <div className="text-[10px] text-ink-500">
          <div>
            FROM <span className="data-num">{fmt(r.fromBeforeBalance)} → {fmt(r.fromAfterBalance)}</span>
          </div>
          <div>
            TO <span className="data-num">{fmt(r.toBeforeBalance)} → {fmt(r.toAfterBalance)}</span>
          </div>
        </div>
      ),
    },
    { key: 'desc', label: t.transfers.description, render: (r) => <span className="text-[10px] text-ink-600">{r.description ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader
        section="§ OPS 04"
        breadcrumb="TRANSFERS / LOG"
        title={t.transfers.title}
        titleSuffix={t.transfers.subtitle}
      />
      {error && (
        <div className="mb-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error.toUpperCase()}
        </div>
      )}
      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">Loading…</div>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(r) => r.id} empty={t.transfers.noTransfer} />
      )}
    </div>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
