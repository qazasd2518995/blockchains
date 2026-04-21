import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { MemberPublic, MemberBetListResponse, MemberBetEntry } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { useTranslation } from '@/i18n/useTranslation';

export function MemberBetRecordsPage(): JSX.Element {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const [member, setMember] = useState<MemberPublic | null>(null);
  const [items, setItems] = useState<MemberBetEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const [mRes, bRes] = await Promise.all([
          adminApi.get<MemberPublic>(`/members/${id}`),
          adminApi.get<MemberBetListResponse>(`/members/${id}/bets`, {
            params: gameFilter ? { gameId: gameFilter } : {},
          }),
        ]);
        if (!cancel) {
          setMember(mRes.data);
          setItems(bRes.data.items);
        }
      } catch (e) {
        if (!cancel) setError(extractApiError(e).message);
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [id, gameFilter]);

  const columns: Column<MemberBetEntry>[] = [
    {
      key: 'time',
      label: t.bets.time,
      render: (r) => (
        <span className="data-num text-[10px] text-ink-500">
          {new Date(r.createdAt).toLocaleString('en-GB')}
        </span>
      ),
    },
    { key: 'game', label: t.bets.game, render: (r) => <span className="font-mono text-ink-900">{r.gameId}</span> },
    { key: 'amt', label: t.bets.amount, align: 'right', render: (r) => <span className="data-num">{fmt(r.amount)}</span> },
    { key: 'mult', label: t.bets.multiplier, align: 'right', render: (r) => <span className="data-num">{r.multiplier}x</span> },
    { key: 'payout', label: t.bets.payout, align: 'right', render: (r) => <span className="data-num">{fmt(r.payout)}</span> },
    {
      key: 'profit',
      label: t.bets.profit,
      align: 'right',
      render: (r) => {
        const n = Number.parseFloat(r.profit);
        return (
          <span className={`data-num ${n >= 0 ? 'text-win' : 'text-[#D4574A]'}`}>
            {n >= 0 ? '+' : ''}
            {fmt(r.profit)}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ OPS 03"
        breadcrumb={`${t.members.title} / ${member?.username ?? id} / ${t.members.bets}`}
        title={t.members.bets}
        titleSuffix={member?.username ?? ''}
        titleSuffixColor="acid"
        rightSlot={
          <Link to="/admin/accounts" className="btn-teal-outline text-[11px]">
            [← {t.common.back}]
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          placeholder="按游戏 ID 过滤（例如 dice）"
          className="term-input max-w-xs"
        />
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">Loading…</div>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(r) => r.id} empty={t.bets.empty} />
      )}
    </div>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
