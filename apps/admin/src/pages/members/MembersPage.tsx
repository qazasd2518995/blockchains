import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MemberPublic, MemberListResponse } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { CreateMemberModal } from '@/components/shared/CreateMemberModal';
import { TransferModal } from '@/components/shared/TransferModal';
import { AdjustBalanceModal } from '@/components/shared/AdjustBalanceModal';
import { useTranslation } from '@/i18n/useTranslation';

export function MembersPage(): JSX.Element {
  const { t } = useTranslation();
  const [items, setItems] = useState<MemberPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'FROZEN'>('');
  const [openCreate, setOpenCreate] = useState(false);
  const [transferFor, setTransferFor] = useState<MemberPublic | null>(null);
  const [adjustFor, setAdjustFor] = useState<MemberPublic | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (keyword) params.keyword = keyword;
        if (status) params.status = status;
        const res = await adminApi.get<MemberListResponse>('/members', { params });
        if (!cancel) setItems(res.data.items);
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
  }, [keyword, status, reloadKey]);

  const handleFreeze = async (m: MemberPublic) => {
    const nextStatus = m.status === 'FROZEN' ? 'ACTIVE' : 'FROZEN';
    if (nextStatus === 'FROZEN' && !confirm(t.members.confirmFreeze)) return;
    try {
      await adminApi.patch(`/members/${m.id}/status`, { status: nextStatus });
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const columns: Column<MemberPublic>[] = [
    {
      key: 'username',
      label: t.members.username,
      render: (m) => (
        <div>
          <div className="font-mono text-ink-900">{m.username}</div>
          {m.displayName && <div className="text-[10px] text-ink-500">{m.displayName}</div>}
        </div>
      ),
    },
    {
      key: 'agent',
      label: t.members.agent,
      render: (m) => <span className="font-mono text-ink-700">{m.agentUsername ?? '—'}</span>,
    },
    {
      key: 'balance',
      label: t.members.balance,
      align: 'right',
      render: (m) => <span className="data-num text-brass-700">{fmt(m.balance)}</span>,
    },
    {
      key: 'status',
      label: t.members.status,
      render: (m) =>
        m.status === 'FROZEN' ? (
          <span className="tag tag-ember">{t.agent.status.FROZEN}</span>
        ) : (
          <span className="tag tag-toxic">
            <span className="status-dot status-dot-live" />
            {t.agent.status.ACTIVE}
          </span>
        ),
    },
    {
      key: 'created',
      label: 'CREATED',
      render: (m) => (
        <span className="font-mono text-[10px] text-ink-500">
          {new Date(m.createdAt).toLocaleDateString('en-GB')}
        </span>
      ),
    },
    {
      key: 'actions',
      label: t.common.actions,
      align: 'right',
      render: (m) => (
        <div className="flex items-center justify-end gap-1 text-[10px]">
          <Link to={`/admin/members/${m.id}/bets`} className="btn-ghost">
            [下注]
          </Link>
          <button type="button" onClick={() => setTransferFor(m)} className="btn-ghost">
            [转帐]
          </button>
          <button type="button" onClick={() => setAdjustFor(m)} className="btn-ghost">
            [调整]
          </button>
          <button
            type="button"
            onClick={() => handleFreeze(m)}
            className={`btn-ghost ${m.status === 'FROZEN' ? 'text-win' : 'text-wine-500'}`}
          >
            [{m.status === 'FROZEN' ? '解冻' : '冻结'}]
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ OPS 03"
        breadcrumb={t.members.title}
        title={t.members.title}
        titleSuffix={t.members.subtitle}
        titleSuffixColor="toxic"
        rightSlot={
          <button type="button" onClick={() => setOpenCreate(true)} className="btn-acid">
            + {t.members.create}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={t.members.search}
          className="term-input max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="term-input max-w-[160px]"
        >
          <option value="">{t.common.all}</option>
          <option value="ACTIVE">{t.agent.status.ACTIVE}</option>
          <option value="FROZEN">{t.agent.status.FROZEN}</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 border border-wine-400/55 bg-wine-50 p-3 text-[12px] text-wine-500">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <DataTable columns={columns} rows={items} rowKey={(m) => m.id} empty={t.members.emptyList} />
      )}

      <CreateMemberModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={() => setReloadKey((k) => k + 1)}
      />
      {transferFor && (
        <TransferModal
          open
          onClose={() => setTransferFor(null)}
          member={transferFor}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
      {adjustFor && (
        <AdjustBalanceModal
          open
          onClose={() => setAdjustFor(null)}
          member={adjustFor}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
