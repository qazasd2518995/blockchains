import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AgentAnalysisResponse, AgentAnalysisRow } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { useTranslation } from '@/i18n/useTranslation';

export function AgentAnalysisPage(): JSX.Element {
  const { t } = useTranslation();
  const [data, setData] = useState<AgentAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rootAgentId, setRootAgentId] = useState('');

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const params: Record<string, string> = {};
        if (startDate) params.startDate = new Date(startDate).toISOString();
        if (endDate) params.endDate = new Date(endDate + 'T23:59:59').toISOString();
        if (rootAgentId) params.rootAgentId = rootAgentId;
        const res = await adminApi.get<AgentAnalysisResponse>('/reports/agent-analysis', { params });
        if (!cancel) setData(res.data);
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
  }, [startDate, endDate, rootAgentId]);

  const columns: Column<AgentAnalysisRow>[] = [
    { key: 'username', label: 'USERNAME', render: (r) => <span className="font-mono text-ink-900">{r.username}</span> },
    { key: 'level', label: 'LVL', align: 'center', render: (r) => <span className="tag tag-acid">L{r.level}</span> },
    { key: 'rebate', label: 'REBATE', align: 'right', render: (r) => <span className="data-num text-neon-toxic">{pct(r.rebatePercentage)}</span> },
    { key: 'members', label: 'MEM', align: 'right', render: (r) => <span className="data-num">{r.memberCount}</span> },
    { key: 'bets', label: 'BETS', align: 'right', render: (r) => <span className="data-num">{r.betCount}</span> },
    { key: 'volume', label: 'VOLUME', align: 'right', render: (r) => <span className="data-num">{fmt(r.betAmount)}</span> },
    {
      key: 'winloss',
      label: 'MEM W/L',
      align: 'right',
      render: (r) => {
        const n = Number.parseFloat(r.memberWinLoss);
        return (
          <span className={`data-num ${n >= 0 ? 'text-neon-toxic' : 'text-neon-ember'}`}>
            {n >= 0 ? '+' : ''}{fmt(r.memberWinLoss)}
          </span>
        );
      },
    },
    {
      key: 'rebateAmt',
      label: 'REBATE EARN',
      align: 'right',
      render: (r) => (
        <div className="data-num text-[11px]">
          <div className="text-neon-amber">{fmt(r.earnedRebateAmount)}</div>
          <div className="text-[9px] text-ink-500">@ {pct(r.earnedRebatePercentage)}</div>
        </div>
      ),
    },
    {
      key: 'settlement',
      label: 'UPLINE SETTLE',
      align: 'right',
      render: (r) => {
        const n = Number.parseFloat(r.uplineSettlement);
        return (
          <span className={`data-num font-bold ${n >= 0 ? 'text-neon-toxic' : 'text-neon-ember'}`}>
            {n >= 0 ? '+' : ''}{fmt(r.uplineSettlement)}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ OPS 05"
        breadcrumb="报表 / 代理分析"
        title="代理分析"
        titleSuffix="代理结算"
        titleSuffixColor="amber"
        rightSlot={
          <Link to="/admin/reports" className="btn-ghost text-[11px]">
            [← 返回报表]
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="label">{t.reports.from}</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="term-input" />
        </label>
        <label className="flex items-center gap-2">
          <span className="label">{t.reports.to}</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="term-input" />
        </label>
        <label className="flex items-center gap-2">
          <span className="label">{t.reports.rootAgentId}</span>
          <input type="text" value={rootAgentId} onChange={(e) => setRootAgentId(e.target.value)} placeholder="默认为自己" className="term-input max-w-[240px]" />
        </label>
      </div>

      {error && (
        <div className="mb-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : data ? (
        <>
          <div className="mb-4 crt-panel p-4">
            <div className="label mb-2">ROOT SUMMARY · {data.root.username}</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat k="MEMBERS" v={data.root.memberCount.toString()} />
              <Stat k="BETS" v={data.root.betCount.toLocaleString()} />
              <Stat k="VOLUME" v={fmt(data.root.betAmount)} accent="acid" />
              <Stat
                k="ROOT SETTLE"
                v={`${Number.parseFloat(data.root.uplineSettlement) >= 0 ? '+' : ''}${fmt(data.root.uplineSettlement)}`}
                accent={Number.parseFloat(data.root.uplineSettlement) >= 0 ? 'toxic' : 'ember'}
              />
            </div>
          </div>

          <div className="mb-2 label">{t.reports.children}</div>
          <DataTable columns={columns} rows={data.children} rowKey={(r) => r.agentId} empty="暂无下级代理" />
        </>
      ) : null}
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: 'acid' | 'toxic' | 'ember' }) {
  const color = accent === 'toxic' ? 'text-neon-toxic' : accent === 'ember' ? 'text-neon-ember' : accent === 'acid' ? 'text-neon-acid' : 'text-ink-900';
  return (
    <div className="border border-ink-200 bg-ink-100/30 p-3">
      <div className="label">{k}</div>
      <div className={`mt-1 big-num text-2xl ${color}`}>{v}</div>
    </div>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(s: string): string {
  const n = Number.parseFloat(s);
  return `${(n * 100).toFixed(2)}%`;
}
