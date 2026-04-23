import { useEffect, useState, useCallback } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageBanner } from '@/components/shared/ImageBanner';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { WinLossControlModal } from '@/components/shared/WinLossControlModal';
import { WinCapControlModal } from '@/components/shared/WinCapControlModal';
import { DepositControlModal } from '@/components/shared/DepositControlModal';
import { AgentLineControlModal } from '@/components/shared/AgentLineControlModal';
import { ManualDetectionControlModal } from '@/components/shared/ManualDetectionControlModal';
import { useTranslation } from '@/i18n/useTranslation';

interface SettlementSnapshot {
  gameDay: string;
  totalBet: string;
  totalPayout: string;
  memberWinLoss: string;
  totalRebate: string;
  superiorSettlement: string;
  totalBets: number;
  totalPlayers: number;
  status: 'green' | 'red';
  statusText: string;
}

interface ManualDetectionRow {
  id: string;
  scope: 'ALL' | 'AGENT_LINE' | 'MEMBER';
  targetAgentUsername: string | null;
  targetMemberUsername: string | null;
  targetSettlement: string;
  controlPercentage: number;
  startSettlement: string | null;
  currentSettlement: string;
  completionSettlement: string | null;
  isActive: boolean;
  isCompleted: boolean;
  createdAt: string;
}

interface WinLossRow {
  id: string;
  controlMode: string;
  targetType: string | null;
  targetUsername: string | null;
  controlPercentage: string;
  winControl: boolean;
  lossControl: boolean;
  isActive: boolean;
  operatorUsername: string | null;
  createdAt: string;
}

interface WinCapRow {
  id: string;
  memberUsername: string;
  winCapAmount: string;
  todayWinAmount: string;
  controlWinRate: string;
  triggerThreshold: string;
  isActive: boolean;
  isCapped: boolean;
  createdAt: string;
}

interface DepositRow {
  id: string;
  memberUsername: string;
  depositAmount: string;
  targetProfit: string;
  controlWinRate: string;
  isActive: boolean;
  isCompleted: boolean;
  createdAt: string;
}

interface AgentLineRow {
  id: string;
  agentUsername: string;
  dailyCap: string;
  todayWinAmount: string;
  controlWinRate: string;
  triggerThreshold: string;
  isActive: boolean;
  isCapped: boolean;
  createdAt: string;
}

interface ControlLogRow {
  id: string;
  controlId: string;
  betId: string | null;
  userId: string;
  username: string;
  gameId: string;
  flipReason: string;
  originalResult: { payout?: string; multiplier?: string; won?: boolean };
  finalResult: { payout?: string; multiplier?: string; won?: boolean };
  createdAt: string;
}

export function ControlsOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const [allSettlement, setAllSettlement] = useState<SettlementSnapshot | null>(null);
  const [manualActive, setManualActive] = useState<ManualDetectionRow[]>([]);
  const [manualHistory, setManualHistory] = useState<ManualDetectionRow[]>([]);
  const [wl, setWl] = useState<WinLossRow[]>([]);
  const [wc, setWc] = useState<WinCapRow[]>([]);
  const [dc, setDc] = useState<DepositRow[]>([]);
  const [al, setAl] = useState<AgentLineRow[]>([]);
  const [logs, setLogs] = useState<ControlLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [wlOpen, setWlOpen] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [dcOpen, setDcOpen] = useState(false);
  const [alOpen, setAlOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [manualStatus, manualHistoryRes, settlement, winLoss, winCap, deposit, agentLine, logRes] =
        await Promise.all([
          adminApi.get<{ items: ManualDetectionRow[] }>('/controls/manual-detection/status'),
          adminApi.get<{ items: ManualDetectionRow[] }>('/controls/manual-detection/history'),
          adminApi.get<SettlementSnapshot>('/controls/manual-detection/settlement', { params: { scope: 'ALL' } }),
          adminApi.get<{ items: WinLossRow[] }>('/controls/win-loss'),
          adminApi.get<{ items: WinCapRow[] }>('/controls/win-cap'),
          adminApi.get<{ items: DepositRow[] }>('/controls/deposit'),
          adminApi.get<{ items: AgentLineRow[] }>('/controls/agent-line'),
          adminApi.get<{ items: ControlLogRow[] }>('/controls/logs'),
        ]);
      setManualActive(manualStatus.data.items);
      setManualHistory(manualHistoryRes.data.items);
      setAllSettlement(settlement.data);
      setWl(winLoss.data.items);
      setWc(winCap.data.items);
      setDc(deposit.data.items);
      setAl(agentLine.data.items);
      setLogs(logRes.data.items);
      setError(null);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleRow = async (
    kind: 'win-loss' | 'win-cap' | 'deposit' | 'agent-line',
    id: string,
    isActive: boolean,
  ): Promise<void> => {
    try {
      await adminApi.patch(`/controls/${kind}/${id}/toggle`, { isActive: !isActive });
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const deleteRow = async (
    kind: 'win-loss' | 'win-cap' | 'deposit' | 'agent-line',
    id: string,
  ): Promise<void> => {
    if (!window.confirm('确定删除此控制规则？')) return;
    try {
      await adminApi.delete(`/controls/${kind}/${id}`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const deactivateManual = async (id: string): Promise<void> => {
    try {
      await adminApi.post('/controls/manual-detection/deactivate', { id });
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const reactivateManual = async (id: string): Promise<void> => {
    try {
      await adminApi.post(`/controls/manual-detection/${id}/reactivate`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const deleteManual = async (id: string): Promise<void> => {
    if (!window.confirm('确定删除此手动侦测控制？')) return;
    try {
      await adminApi.delete(`/controls/manual-detection/${id}`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const manualCols: Column<ManualDetectionRow>[] = [
    { key: 'scope', label: '范围', render: (r) => <span className="tag tag-acid">{formatManualScope(r.scope)}</span> },
    { key: 'target', label: '目标', render: (r) => <span className="font-mono">{formatManualTarget(r)}</span> },
    {
      key: 'current',
      label: '当前交收',
      align: 'right',
      render: (r) => <span className={`data-num ${Number(r.currentSettlement) > 0 ? 'text-[#2BAA6A]' : 'text-[#D4574A]'}`}>{signed(r.currentSettlement)}</span>,
    },
    {
      key: 'targetSettlement',
      label: '目标交收',
      align: 'right',
      render: (r) => <span className="data-num text-[#AE8B35]">{signed(r.targetSettlement)}</span>,
    },
    {
      key: 'rate',
      label: '控制率',
      align: 'right',
      render: (r) => <span className="data-num">{r.controlPercentage}%</span>,
    },
    {
      key: 'status',
      label: '状态',
      render: (r) => <span className={manualStatusClass(r)}>{manualStatusText(r)}</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          {r.isActive ? (
            <button type="button" onClick={() => void deactivateManual(r.id)} className="btn-teal-outline px-2 py-1">
              停用
            </button>
          ) : (
            <button type="button" onClick={() => void reactivateManual(r.id)} className="btn-teal-outline px-2 py-1">
              重启
            </button>
          )}
          <button
            type="button"
            onClick={() => void deleteManual(r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const manualHistoryCols: Column<ManualDetectionRow>[] = [
    { key: 'time', label: '建立时间', render: (r) => <span className="font-mono text-[11px]">{formatTime(r.createdAt)}</span> },
    { key: 'scope', label: '范围', render: (r) => <span className="tag tag-acid">{formatManualScope(r.scope)}</span> },
    { key: 'target', label: '目标', render: (r) => <span className="font-mono">{formatManualTarget(r)}</span> },
    {
      key: 'start',
      label: '起始交收',
      align: 'right',
      render: (r) => <span className="data-num">{signed(r.startSettlement)}</span>,
    },
    {
      key: 'targetSettlement',
      label: '目标交收',
      align: 'right',
      render: (r) => <span className="data-num text-[#AE8B35]">{signed(r.targetSettlement)}</span>,
    },
    {
      key: 'status',
      label: '状态',
      render: (r) => <span className={manualStatusClass(r)}>{manualStatusText(r)}</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          {!r.isActive && (
            <button type="button" onClick={() => void reactivateManual(r.id)} className="btn-teal-outline px-2 py-1">
              重启
            </button>
          )}
          <button
            type="button"
            onClick={() => void deleteManual(r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const wlCols: Column<WinLossRow>[] = [
    { key: 'mode', label: '模式', render: (r) => <span className="tag tag-acid">{formatControlMode(r.controlMode)}</span> },
    { key: 'target', label: '目标账号', render: (r) => <span className="font-mono text-[11px]">{r.targetUsername ?? '—'}</span> },
    { key: 'pct', label: '比例', align: 'right', render: (r) => <span className="data-num">{r.controlPercentage}%</span> },
    {
      key: 'direction',
      label: '控制方向',
      render: (r) => (
        <div className="flex gap-1 text-[10px]">
          {r.winControl && <span className="tag tag-toxic">放水</span>}
          {r.lossControl && <span className="tag tag-ember">杀分</span>}
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isActive ? <span className="tag tag-toxic">启用中</span> : <span className="tag tag-ember">停用</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button type="button" onClick={() => void toggleRow('win-loss', r.id, r.isActive)} className="btn-teal-outline px-2 py-1">
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => void deleteRow('win-loss', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const dcCols: Column<DepositRow>[] = [
    { key: 'member', label: '会员账号', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'deposit', label: '入金金额', align: 'right', render: (r) => <span className="data-num">{fmt(r.depositAmount)}</span> },
    { key: 'target', label: '目标盈利', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.targetProfit)}</span> },
    { key: 'rate', label: '控制胜率', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCompleted ? <span className="tag tag-acid">已完成</span> : r.isActive ? <span className="tag tag-toxic">启用中</span> : <span className="tag tag-ember">停用</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button type="button" onClick={() => void toggleRow('deposit', r.id, r.isActive)} className="btn-teal-outline px-2 py-1">
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => void deleteRow('deposit', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const wcCols: Column<WinCapRow>[] = [
    { key: 'member', label: '会员账号', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'cap', label: '封顶金额', align: 'right', render: (r) => <span className="data-num">{fmt(r.winCapAmount)}</span> },
    { key: 'today', label: '今日赢额', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span> },
    { key: 'trigger', label: '触发比例', align: 'right', render: (r) => <span className="data-num">{pct(r.triggerThreshold)}</span> },
    { key: 'rate', label: '控制胜率', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCapped ? <span className="tag tag-ember">已封顶</span> : r.isActive ? <span className="tag tag-toxic">启用中</span> : <span className="tag tag-ember">停用</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button type="button" onClick={() => void toggleRow('win-cap', r.id, r.isActive)} className="btn-teal-outline px-2 py-1">
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => void deleteRow('win-cap', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const alCols: Column<AgentLineRow>[] = [
    { key: 'agent', label: '代理账号', render: (r) => <span className="font-mono">{r.agentUsername}</span> },
    { key: 'cap', label: '单日封顶', align: 'right', render: (r) => <span className="data-num">{fmt(r.dailyCap)}</span> },
    { key: 'today', label: '今日赢额', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span> },
    { key: 'trigger', label: '触发比例', align: 'right', render: (r) => <span className="data-num">{pct(r.triggerThreshold)}</span> },
    { key: 'rate', label: '控制胜率', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCapped ? <span className="tag tag-ember">已封顶</span> : r.isActive ? <span className="tag tag-toxic">启用中</span> : <span className="tag tag-ember">停用</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button type="button" onClick={() => void toggleRow('agent-line', r.id, r.isActive)} className="btn-teal-outline px-2 py-1">
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => void deleteRow('agent-line', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const logCols: Column<ControlLogRow>[] = [
    { key: 'time', label: '时间', render: (r) => <span className="font-mono text-[11px]">{formatTime(r.createdAt)}</span> },
    { key: 'member', label: '会员', render: (r) => <span className="font-mono">{r.username}</span> },
    { key: 'game', label: '游戏', render: (r) => <span className="tag tag-acid">{r.gameId}</span> },
    { key: 'reason', label: '原因', render: (r) => <span className="tag tag-ember">{formatReason(r.flipReason)}</span> },
    { key: 'before', label: '原派彩', align: 'right', render: (r) => <span className="data-num">{r.originalResult?.payout ?? '0.00'}</span> },
    { key: 'after', label: '最终派彩', align: 'right', render: (r) => <span className="data-num text-[#186073]">{r.finalResult?.payout ?? '0.00'}</span> },
  ];

  return (
    <div>
      <PageHeader
        section="§ 风控 06"
        breadcrumb={`${t.nav.controls} / 总览`}
        title={t.nav.controls}
        titleSuffix="输赢控制"
        titleSuffixColor="ember"
        description="控制优先级、手动侦测、封顶与真实介入纪录都集中在这一页。后端会依同一套顺序套用到实际结算。"
      />

      <ImageBanner
        image="/banners/controls-risk-host.png"
        eyebrow="风控中心"
        title="先看哪条控制在线，再决定今天要把交收拉到哪里。"
        description="手动侦测、输赢控制、会员封顶、代理线封顶与入金控制已统一到同一套实际结算逻辑。这里看到的状态，就是游戏正在执行的状态。"
        tone="ember"
        imagePosition="object-[74%_30%]"
      />

      <div className="mb-4 rounded-[6px] border border-[#AE8B35]/35 bg-[#FFF8E1] px-4 py-3 text-[12px] text-[#5C4B1F]">
        <div className="font-semibold text-[#7A5F15]">控制优先级</div>
        <div className="mt-1">会员赢控制 &gt; 代理线赢控制 &gt; 会员输控制 &gt; 代理线输控制 &gt; 封顶控制 &gt; 入金控制 &gt; 手动侦测</div>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="全盘交收"
          value={signed(allSettlement?.superiorSettlement)}
          hint={allSettlement ? `${allSettlement.statusText} · ${allSettlement.gameDay}` : '—'}
          accent={allSettlement?.status === 'green' ? 'toxic' : 'ember'}
        />
        <StatCard label="手动侦测在线" value={manualActive.length.toString()} hint="会员 / 代理线 / 全盘" accent="ice" />
        <StatCard label="输赢控制在线" value={wl.filter((x) => x.isActive).length.toString()} hint="优先于封顶与入金" accent="ember" />
        <StatCard label="会员封顶在线" value={wc.filter((x) => x.isActive).length.toString()} hint="单会员日赢额" accent="amber" />
        <StatCard label="代理线封顶在线" value={al.filter((x) => x.isActive).length.toString()} hint="整条线日赢额" accent="toxic" />
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <div className="space-y-6">
          <Section
            title="§ 手动侦测"
            subtitle="会员控制 > 代理线控制 > 全盘控制"
            actions={(
              <button type="button" onClick={() => setManualOpen(true)} className="btn-acid text-[11px]">
                + 新增
              </button>
            )}
          >
            <div className="mb-4 grid gap-4 md:grid-cols-4">
              <MetricCard label="总投注" value={fmt(allSettlement?.totalBet)} />
              <MetricCard label="总派彩" value={fmt(allSettlement?.totalPayout)} />
              <MetricCard label="会员输赢" value={signed(allSettlement?.memberWinLoss)} accent={Number(allSettlement?.memberWinLoss ?? 0) > 0 ? 'toxic' : 'ember'} />
              <MetricCard label="返水影响" value={signed(allSettlement?.totalRebate)} accent="amber" />
            </div>
            <DataTable columns={manualCols} rows={manualActive} rowKey={(r) => r.id} empty="当前没有启用中的手动侦测控制" />
          </Section>

          <Section title="§ 手动侦测历史" subtitle="最近 50 笔控制记录">
            <DataTable columns={manualHistoryCols} rows={manualHistory} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>

          <Section
            title="§ 输赢控制"
            subtitle="按百分比翻转输赢"
            actions={(
              <button type="button" onClick={() => setWlOpen(true)} className="btn-acid text-[11px]">
                + 新增
              </button>
            )}
          >
            <DataTable columns={wlCols} rows={wl} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>

          <Section
            title="§ 入金控制"
            subtitle="依入金目标自动控制胜率"
            actions={(
              <button type="button" onClick={() => setDcOpen(true)} className="btn-acid text-[11px]">
                + 新增
              </button>
            )}
          >
            <DataTable columns={dcCols} rows={dc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>

          <Section
            title="§ 会员封顶"
            subtitle="会员单日赢额封顶"
            actions={(
              <button type="button" onClick={() => setWcOpen(true)} className="btn-acid text-[11px]">
                + 新增
              </button>
            )}
          >
            <DataTable columns={wcCols} rows={wc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>

          <Section
            title="§ 代理线封顶"
            subtitle="代理线单日赢额封顶"
            actions={(
              <button type="button" onClick={() => setAlOpen(true)} className="btn-acid text-[11px]">
                + 新增
              </button>
            )}
          >
            <DataTable columns={alCols} rows={al} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>

          <Section title="§ 控制介入纪录" subtitle="最近 100 笔真实套用结果">
            <DataTable columns={logCols} rows={logs} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
        </div>
      )}

      <ManualDetectionControlModal open={manualOpen} onClose={() => setManualOpen(false)} onDone={() => void reload()} />
      <WinLossControlModal open={wlOpen} onClose={() => setWlOpen(false)} onDone={() => void reload()} />
      <WinCapControlModal open={wcOpen} onClose={() => setWcOpen(false)} onDone={() => void reload()} />
      <DepositControlModal open={dcOpen} onClose={() => setDcOpen(false)} onDone={() => void reload()} />
      <AgentLineControlModal open={alOpen} onClose={() => setAlOpen(false)} onDone={() => void reload()} />
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div>
          <span className="label">{title}</span>
          {subtitle && <span className="ml-2 text-[10px] text-ink-500">· {subtitle}</span>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = 'ice',
}: {
  label: string;
  value: string;
  accent?: 'ice' | 'ember' | 'toxic' | 'amber';
}) {
  const accentClass =
    accent === 'ember'
      ? 'text-[#D4574A]'
      : accent === 'toxic'
        ? 'text-[#2BAA6A]'
        : accent === 'amber'
          ? 'text-[#AE8B35]'
          : 'text-[#186073]';
  return (
    <div className="card-base p-4">
      <div className="label text-[#186073]">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accentClass}`}>{value}</div>
    </div>
  );
}

function fmt(value?: string | null): string {
  const n = Number.parseFloat(value ?? '0');
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(s: string): string {
  return `${(Number.parseFloat(s) * 100).toFixed(1)}%`;
}

function signed(value?: string | null): string {
  const n = Number.parseFloat(value ?? '0');
  if (Number.isNaN(n)) return '0.00';
  const formatted = fmt(String(Math.abs(n)));
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatted}`;
}

function formatControlMode(mode: string): string {
  if (mode === 'SINGLE_MEMBER') return '单一会员';
  if (mode === 'AGENT_LINE') return '整条代理线';
  if (mode === 'NORMAL') return '全局控制';
  if (mode === 'AUTO_DETECT') return '自动侦测';
  return mode;
}

function formatManualScope(scope: ManualDetectionRow['scope']): string {
  if (scope === 'ALL') return '全盘';
  if (scope === 'AGENT_LINE') return '代理线';
  return '会员';
}

function formatManualTarget(row: ManualDetectionRow): string {
  if (row.scope === 'ALL') return '全盘交收';
  if (row.scope === 'AGENT_LINE') return row.targetAgentUsername ?? '—';
  return row.targetMemberUsername ?? '—';
}

function manualStatusText(row: ManualDetectionRow): string {
  if (row.isActive && row.isCompleted && row.scope === 'MEMBER') return '达标维持中';
  if (row.isCompleted) return '已达标';
  if (row.isActive) return '进行中';
  return '停用';
}

function manualStatusClass(row: ManualDetectionRow): string {
  if (row.isActive && row.isCompleted && row.scope === 'MEMBER') return 'tag tag-acid';
  if (row.isCompleted) return 'tag tag-acid';
  if (row.isActive) return 'tag tag-toxic';
  return 'tag tag-ember';
}

function formatReason(reason: string): string {
  const map: Record<string, string> = {
    deposit_control: '入金控制',
    win_cap: '会员封顶',
    win_cap_rate: '会员封顶比例',
    agent_line_cap: '代理线封顶',
    agent_line_cap_rate: '代理线封顶比例',
    win_control: '放水',
    loss_control: '杀分',
    manual_detection: '手动侦测',
  };
  return map[reason] ?? reason;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
