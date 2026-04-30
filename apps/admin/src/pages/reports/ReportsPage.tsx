import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { HierarchyReportResponse, HierarchyReportItem } from '@bg/shared';
import { GAMES_REGISTRY, GameId } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { getCurrentGameDay, shiftGameDay, startOfGameWeek } from '@/lib/gameDay';
import { PageHeader } from '@/components/shared/PageHeader';
import { HierarchyBreadcrumb } from '@/components/shared/HierarchyBreadcrumb';
import { MemberBetRecordsModal } from '@/components/shared/MemberBetRecordsModal';
import { AccountSearchSelect, type AccountSearchOption } from '@/components/shared/AccountSearchSelect';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

/**
 * 報表統計（18 欄混合階層下鑽）— 對齊 Bet/agent 原版
 */
export function ReportsPage(): JSX.Element {
  const { agent: me } = useAdminAuthStore();
  const [params, setParams] = useSearchParams();
  const currentParent = params.get('parent') ?? (me?.role === 'SUPER_ADMIN' ? '' : me?.id ?? '');

  const [startDate, setStartDate] = useState(params.get('startDate') ?? '');
  const [endDate, setEndDate] = useState(params.get('endDate') ?? '');
  const [gameId, setGameId] = useState(params.get('gameId') ?? '');
  const [username, setUsername] = useState(params.get('username') ?? '');
  const [selectedAccount, setSelectedAccount] = useState<AccountSearchOption | null>(() => {
    const initialUsername = params.get('username');
    return initialUsername ? { id: initialUsername, username: initialUsername, displayName: null } : null;
  });
  const [settlementStatus, setSettlementStatus] = useState(params.get('settlementStatus') ?? '');

  const [data, setData] = useState<HierarchyReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [betModalFor, setBetModalFor] = useState<{ id: string; username: string } | null>(null);
  const reportParams = useMemo(() => {
    const q: Record<string, string> = {};
    if (currentParent) q.parentId = currentParent;
    if (startDate) q.startDate = startDate;
    if (endDate) q.endDate = endDate;
    if (gameId) q.gameId = gameId;
    if (username.trim()) q.username = username.trim();
    if (settlementStatus) q.settlementStatus = settlementStatus;
    return q;
  }, [currentParent, endDate, gameId, settlementStatus, startDate, username]);
  const detailFilters = useMemo(
    () => ({ startDate, endDate, gameId, settlementStatus }),
    [endDate, gameId, settlementStatus, startDate],
  );

  useEffect(() => {
    let cancel = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const res = await adminApi.get<HierarchyReportResponse>('/reports/hierarchy', { params: reportParams });
        if (!cancel) setData(res.data);
      } catch (e) {
        if (!cancel) {
          setData(null);
          setError(extractApiError(e).message);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    };
    void load();
    return () => {
      cancel = true;
    };
  }, [reportParams]);

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
      setBetModalFor({ id: row.id, username: row.username });
    }
  };

  const quickPreset = (preset: 'today' | 'yesterday' | 'lastWeek' | 'thisWeek' | 'thisMonth') => {
    const today = getCurrentGameDay();
    switch (preset) {
      case 'today':
        setStartDate(today);
        setEndDate(today);
        break;
      case 'yesterday': {
        const previousGameDay = shiftGameDay(today, -1);
        setStartDate(previousGameDay);
        setEndDate(previousGameDay);
        break;
      }
      case 'lastWeek': {
        const thisWeekStart = startOfGameWeek(today);
        setStartDate(shiftGameDay(thisWeekStart, -7));
        setEndDate(shiftGameDay(thisWeekStart, -1));
        break;
      }
      case 'thisWeek': {
        setStartDate(startOfGameWeek(today));
        setEndDate(today);
        break;
      }
      case 'thisMonth': {
        setStartDate(`${today.slice(0, 7)}-01`);
        setEndDate(today);
        break;
      }
    }
  };

  return (
    <div>
      <PageHeader
        section="§ 后台 05"
        breadcrumb="报表统计"
        title="报表统计"
        titleSuffix="层级下钻"
        titleSuffixColor="amber"
        description="18 栏完整聚合报表。点击代理行下钻，点击会员行开启注单明细。"
      />

      {data && (
        <HierarchyBreadcrumb
          items={data.breadcrumb}
          onSelect={selectParent}
        />
      )}

      <div className="mb-4 crt-panel p-4">
        <div className="admin-mobile-stack flex flex-wrap items-center gap-3">
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
            <select value={gameId} onChange={(e) => setGameId(e.target.value)} className="term-input max-w-[180px]">
              <option value="">全部</option>
              {Object.values(GameId).map((id) => (
                <option key={id} value={id}>
                  {GAMES_REGISTRY[id]?.nameZh ?? id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="label">状态</span>
            <select
              value={settlementStatus}
              onChange={(e) => setSettlementStatus(e.target.value)}
              className="term-input max-w-[120px]"
            >
              <option value="">全部</option>
              <option value="settled">已结算</option>
              <option value="unsettled">未结算</option>
            </select>
          </label>
          <div className="w-full max-w-[260px]">
            <AccountSearchSelect
              kind="mixed"
              label="账号"
              value={selectedAccount}
              onChange={(next) => {
                setSelectedAccount(next);
                setUsername(next?.username ?? '');
              }}
              placeholder="输入代理或会员账号/全名"
            />
          </div>
          {username && (
            <button
              type="button"
              onClick={() => {
                setSelectedAccount(null);
                setUsername('');
              }}
              className="btn-teal-outline text-[10px]"
            >
              [清除账号]
            </button>
          )}
          <div className="grid grid-cols-2 gap-1 text-[10px] sm:flex sm:items-center">
            <button type="button" onClick={() => quickPreset('today')} className="btn-teal-outline">[今日]</button>
            <button type="button" onClick={() => quickPreset('yesterday')} className="btn-teal-outline">[昨日]</button>
            <button type="button" onClick={() => quickPreset('lastWeek')} className="btn-teal-outline">[上周]</button>
            <button type="button" onClick={() => quickPreset('thisWeek')} className="btn-teal-outline">[本周]</button>
            <button type="button" onClick={() => quickPreset('thisMonth')} className="btn-teal-outline">[本月]</button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error.toUpperCase()}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">载入中…</div>
      ) : data?.items.length === 0 ? (
        <div className="crt-panel p-8 text-center text-ink-400">— 没有有效下注资料 —</div>
      ) : (
        data && <ReportTable data={data} onRowClick={onRowClick} />
      )}

      {betModalFor && (
        <MemberBetRecordsModal
          open
          onClose={() => setBetModalFor(null)}
          member={betModalFor}
          filters={detailFilters}
        />
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
      <div className="admin-table-scroll overflow-x-auto">
        <table className="w-full min-w-[1800px] text-[11px]">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-100/60 text-[9px] uppercase tracking-[0.2em] text-ink-600">
              <th colSpan={4} className="border-r border-ink-200 py-2 text-center">基础信息</th>
              <th colSpan={3} className="border-r border-ink-200 py-2 text-center">注单</th>
              <th colSpan={3} className="border-r border-ink-200 py-2 text-center text-[#D4574A]">会员输赢</th>
              <th colSpan={6} className="border-r border-ink-200 py-2 text-center text-[#186073]">本级占成</th>
              <th colSpan={2} className="py-2 text-center text-[#AE8B35]">最终交收</th>
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
              <td className="px-3 py-3 text-right data-num text-win">{fmt(data.totals.totalRebateAmount)}</td>
              <WlTd v={data.totals.memberProfitLossResult} borderRight />
              <td className="px-3 py-3 text-right data-num">{fmt(data.totals.receivableFromDownline)}</td>
              <td className="px-3 py-3 text-right data-num text-ink-500">—</td>
              <WlTd v={data.totals.commissionAmount} />
              <WlTd v={data.totals.commissionResult} />
              <td className="px-3 py-3 text-right data-num text-win">{fmt(data.totals.earnedRebateAmount)}</td>
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
      className="cursor-pointer border-b border-ink-100 transition hover:bg-[#FAF2D7]/60"
    >
      <td className="px-3 py-2.5">
        {isAgent ? (
          <span className="tag tag-acid">代理</span>
        ) : (
          <span className="tag tag-toxic">会员</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-ink-900">
        {row.username}
        {row.displayName && <div className="mt-0.5 text-[9px] text-ink-500">{row.displayName}</div>}
      </td>
      <td className="px-3 py-2.5 text-[10px] text-ink-500">{row.notes ?? '—'}</td>
      <td className="border-r border-ink-200 px-3 py-2.5 text-right data-num text-[#186073]">
        {fmt(row.balance)}
      </td>

      <td className="px-3 py-2.5 text-right data-num">{row.betCount.toLocaleString()}</td>
      <td className="px-3 py-2.5 text-right data-num">{fmt(row.betAmount)}</td>
      <td className="border-r border-ink-200 px-3 py-2.5 text-right data-num">{fmt(row.validAmount)}</td>

      <WlTd v={row.memberWinLoss} />
      <td className="px-3 py-2.5 text-right data-num text-win">{fmt(row.totalRebateAmount)}</td>
      <WlTd v={row.memberProfitLossResult} borderRight />

      <td className="px-3 py-2.5 text-right data-num">{fmt(row.receivableFromDownline)}</td>
      <td className="px-3 py-2.5 text-right data-num text-[#186073]">0.00%</td>
      <WlTd v={row.commissionAmount} />
      <WlTd v={row.commissionResult} />
      <td className="px-3 py-2.5 text-right data-num text-win">{fmt(row.earnedRebateAmount)}</td>
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
  const color = n > 0 ? 'text-win' : n < 0 ? 'text-[#D4574A]' : 'text-ink-600';
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
