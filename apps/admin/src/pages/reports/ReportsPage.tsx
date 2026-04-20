import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { HierarchyReportResponse, HierarchyReportItem } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { HierarchyBreadcrumb } from '@/components/shared/HierarchyBreadcrumb';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

/**
 * 報表統計（18 欄混合階層下鑽）— 對齊 Bet/agent 原版
 */
export function ReportsPage(): JSX.Element {
  const navigate = useNavigate();
  const { agent: me } = useAdminAuthStore();
  const [params, setParams] = useSearchParams();
  const currentParent = params.get('parent') ?? me?.id ?? '';

  const [startDate, setStartDate] = useState(params.get('startDate') ?? '');
  const [endDate, setEndDate] = useState(params.get('endDate') ?? '');
  const [gameId, setGameId] = useState(params.get('gameId') ?? '');

  const [data, setData] = useState<HierarchyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      try {
        const q: Record<string, string> = {};
        if (currentParent) q.parentId = currentParent;
        if (startDate) q.startDate = new Date(startDate).toISOString();
        if (endDate) q.endDate = new Date(endDate + 'T23:59:59').toISOString();
        if (gameId) q.gameId = gameId;
        const res = await adminApi.get<HierarchyReportResponse>('/reports/hierarchy', { params: q });
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
  }, [currentParent, startDate, endDate, gameId]);

  const selectParent = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('parent', id);
    else next.delete('parent');
    setParams(next);
  };

  const onRowClick = (row: HierarchyReportItem) => {
    if (row.kind === 'agent') {
      selectParent(row.id);
    } else {
      navigate(`/admin/members/${row.id}/bets`);
    }
  };

  const quickPreset = (preset: 'today' | 'yesterday' | 'thisWeek' | 'thisMonth') => {
    const today = new Date();
    const toStr = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    switch (preset) {
      case 'today':
        setStartDate(toStr(today));
        setEndDate(toStr(today));
        break;
      case 'yesterday': {
        const yd = new Date(today);
        yd.setDate(yd.getDate() - 1);
        const s = toStr(yd);
        setStartDate(s);
        setEndDate(s);
        break;
      }
      case 'thisWeek': {
        const dow = today.getDay() || 7;
        const start = new Date(today);
        start.setDate(today.getDate() - dow + 1);
        setStartDate(toStr(start));
        setEndDate(toStr(today));
        break;
      }
      case 'thisMonth': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        setStartDate(toStr(start));
        setEndDate(toStr(today));
        break;
      }
    }
  };

  return (
    <div>
      <PageHeader
        section="§ OPS 05"
        breadcrumb="报表统计"
        title="报表统计"
        titleSuffix="层级下钻"
        titleSuffixColor="amber"
        description="18 栏完整聚合报表。点击代理行下钻，点击会员行查看下注记录。"
      />

      {data && (
        <HierarchyBreadcrumb
          items={data.breadcrumb}
          onSelect={selectParent}
          terminalLabel={`${data.items.length} 条目 · 占成 ${pct(data.parent.commissionRate)} · 退水 ${pct(data.parent.rebatePercentage)}`}
        />
      )}

      <div className="mb-4 crt-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="label">起始日</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="term-input" />
          </label>
          <label className="flex items-center gap-2">
            <span className="label">结束日</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="term-input" />
          </label>
          <label className="flex items-center gap-2">
            <span className="label">游戏</span>
            <input type="text" value={gameId} onChange={(e) => setGameId(e.target.value)} placeholder="dice / mines …" className="term-input max-w-[160px]" />
          </label>
          <div className="flex items-center gap-1 text-[10px]">
            <button type="button" onClick={() => quickPreset('today')} className="btn-ghost">[今日]</button>
            <button type="button" onClick={() => quickPreset('yesterday')} className="btn-ghost">[昨日]</button>
            <button type="button" onClick={() => quickPreset('thisWeek')} className="btn-ghost">[本周]</button>
            <button type="button" onClick={() => quickPreset('thisMonth')} className="btn-ghost">[本月]</button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">Loading…</div>
      ) : data?.items.length === 0 ? (
        <div className="crt-panel p-8 text-center text-ink-400">— 此层级无资料 —</div>
      ) : (
        data && <ReportTable data={data} onRowClick={onRowClick} />
      )}
    </div>
  );
}

function ReportTable({
  data,
  onRowClick,
}: {
  data: HierarchyReportResponse;
  onRowClick: (r: HierarchyReportItem) => void;
}): JSX.Element {
  return (
    <div className="crt-panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1800px] text-[11px]">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-100/60 text-[9px] uppercase tracking-[0.2em] text-ink-600">
              <th colSpan={4} className="border-r border-ink-200 py-2 text-center">基础信息</th>
              <th colSpan={3} className="border-r border-ink-200 py-2 text-center">注单</th>
              <th colSpan={3} className="border-r border-ink-200 py-2 text-center text-neon-ember">会员输赢</th>
              <th colSpan={6} className="border-r border-ink-200 py-2 text-center text-neon-acid">本级占成</th>
              <th colSpan={2} className="py-2 text-center text-neon-amber">最终交收</th>
            </tr>
            <tr className="border-b border-ink-200 bg-ink-100/40 text-[9px] uppercase tracking-[0.15em] text-ink-500">
              <Th>级别</Th>
              <Th>用户名</Th>
              <Th>备注</Th>
              <Th className="border-r border-ink-200" right>余额</Th>

              <Th right>笔数</Th>
              <Th right>下注金额</Th>
              <Th className="border-r border-ink-200" right>有效金额</Th>

              <Th right>输赢</Th>
              <Th right>退水</Th>
              <Th className="border-r border-ink-200" right>盈亏结果</Th>

              <Th right>应收下线</Th>
              <Th right>占成%</Th>
              <Th right>占成金额</Th>
              <Th right>占成结果</Th>
              <Th right>赚水</Th>
              <Th className="border-r border-ink-200" right>盈亏结果</Th>

              <Th right>上交货量</Th>
              <Th right>上级交收</Th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((row) => (
              <Row key={`${row.kind}-${row.id}`} row={row} onClick={() => onRowClick(row)} />
            ))}
            {/* 合計列 */}
            <tr className="bg-ink-100/60 font-bold">
              <td colSpan={4} className="border-r border-ink-200 px-3 py-3 text-[11px] tracking-[0.2em] text-ink-700">
                § 合计
              </td>
              <td className="px-3 py-3 text-right data-num">{data.totals.betCount.toLocaleString()}</td>
              <td className="px-3 py-3 text-right data-num">{fmt(data.totals.betAmount)}</td>
              <td className="border-r border-ink-200 px-3 py-3 text-right data-num">{fmt(data.totals.validAmount)}</td>
              <WlTd v={data.totals.memberWinLoss} />
              <td className="px-3 py-3 text-right data-num text-neon-toxic">{fmt(data.totals.totalRebateAmount)}</td>
              <WlTd v={data.totals.memberProfitLossResult} borderRight />
              <td className="px-3 py-3 text-right data-num">{fmt(data.totals.receivableFromDownline)}</td>
              <td className="px-3 py-3 text-right data-num text-ink-500">—</td>
              <WlTd v={data.totals.commissionAmount} />
              <WlTd v={data.totals.commissionAmount} />
              <td className="px-3 py-3 text-right data-num text-neon-toxic">{fmt(data.totals.earnedRebateAmount)}</td>
              <WlTd v={data.totals.profitLossResult} borderRight />
              <td className="px-3 py-3 text-right data-num">{fmt(data.totals.volumeRemitted)}</td>
              <WlTd v={data.totals.uplineSettlement} bold />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ row, onClick }: { row: HierarchyReportItem; onClick: () => void }): JSX.Element {
  const isAgent = row.kind === 'agent';
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-ink-100 transition hover:bg-neon-acid/5"
    >
      <td className="px-3 py-2.5">
        {isAgent ? (
          <span className="tag tag-acid">代理 L{row.level}</span>
        ) : (
          <span className="tag tag-toxic">会员</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-ink-900">
        {isAgent ? row.username : row.email}
        {row.displayName && <div className="mt-0.5 text-[9px] text-ink-500">{row.displayName}</div>}
      </td>
      <td className="px-3 py-2.5 text-[10px] text-ink-500">{row.notes ?? '—'}</td>
      <td className="border-r border-ink-200 px-3 py-2.5 text-right data-num text-neon-acid">
        {fmt(row.balance)}
      </td>

      <td className="px-3 py-2.5 text-right data-num">{row.betCount.toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right data-num">{fmt(row.betAmount)}</td>
      <td className="border-r border-ink-200 px-3 py-2.5 text-right data-num">{fmt(row.validAmount)}</td>

      <WlTd v={row.memberWinLoss} />
      <td className="px-3 py-2.5 text-right data-num text-neon-toxic">{fmt(row.totalRebateAmount)}</td>
      <WlTd v={row.memberProfitLossResult} borderRight />

      <td className="px-3 py-2.5 text-right data-num">{fmt(row.receivableFromDownline)}</td>
      <td className="px-3 py-2.5 text-right data-num text-neon-acid">{pct(row.commissionPercentage)}</td>
      <WlTd v={row.commissionAmount} />
      <WlTd v={row.commissionResult} />
      <td className="px-3 py-2.5 text-right data-num text-neon-toxic">{fmt(row.earnedRebateAmount)}</td>
      <WlTd v={row.profitLossResult} borderRight />

      <td className="px-3 py-2.5 text-right data-num">{fmt(row.volumeRemitted)}</td>
      <WlTd v={row.uplineSettlement} bold />
    </tr>
  );
}

function Th({
  children,
  right,
  className = '',
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-normal ${right ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </th>
  );
}

function WlTd({
  v,
  borderRight,
  bold,
}: {
  v: string;
  borderRight?: boolean;
  bold?: boolean;
}): JSX.Element {
  const n = Number.parseFloat(v);
  const color = n > 0 ? 'text-neon-toxic' : n < 0 ? 'text-neon-ember' : 'text-ink-600';
  const weight = bold ? 'font-bold' : '';
  return (
    <td className={`px-3 py-2.5 text-right data-num ${color} ${weight} ${borderRight ? 'border-r border-ink-200' : ''}`}>
      {n > 0 ? '+' : ''}
      {fmt(v)}
    </td>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(s: string): string {
  return `${(Number.parseFloat(s) * 100).toFixed(2)}%`;
}
