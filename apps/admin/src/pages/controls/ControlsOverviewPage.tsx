import { useEffect, useState, useCallback, useMemo } from 'react';
import { getGameMeta } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageBanner } from '@/components/shared/ImageBanner';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { WinLossControlModal } from '@/components/shared/WinLossControlModal';
import { WinCapControlModal } from '@/components/shared/WinCapControlModal';
import { DepositControlModal } from '@/components/shared/DepositControlModal';
import { AgentLineControlModal } from '@/components/shared/AgentLineControlModal';
import { BurstControlModal } from '@/components/shared/BurstControlModal';
import { ManualDetectionControlModal } from '@/components/shared/ManualDetectionControlModal';
import {
  AccountSearchSelect,
  type AccountSearchOption,
} from '@/components/shared/AccountSearchSelect';
import { useTranslation } from '@/i18n/useTranslation';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

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
  bitePercentage: string | null;
  houseTakePercentage: string;
  completionBehavior: string;
  targetBand: string;
  cycleCount: number;
  lastCapitalAmount: string | null;
  lastPlatformTake: string | null;
  lastRedistributionAmount: string | null;
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
  targetBitePercentage: string | null;
  startBalanceAmount: string | null;
  targetLossAmount: string | null;
  currentLossAmount: string;
  winControl: boolean;
  lossControl: boolean;
  isActive: boolean;
  isCompleted: boolean;
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
  scope?: 'MEMBER' | 'AGENT_LINE';
  memberId?: string | null;
  memberUsername: string | null;
  targetAgentId?: string | null;
  targetAgentUsername?: string | null;
  depositAmount: string;
  targetProfit: string;
  targetBalance?: string;
  startBalance?: string;
  currentBalance?: string;
  currentProfit?: string;
  progressPercent?: string;
  controlWinRate: string;
  lifecycleSteps?: number[];
  lifecycleState?: DepositLifecycleState | null;
  lifecycleStates?: DepositLifecycleState[];
  lifecycleStateCount?: number;
  isActive: boolean;
  isCompleted: boolean;
  isTargetReached?: boolean;
  notes: string | null;
  operatorUsername: string | null;
  createdAt: string;
}

interface DepositLifecycleState {
  memberUsername: string;
  startBalance: string;
  currentBalance: string;
  currentPercent: string;
  currentStageIndex: number;
  targetPercent: number | null;
  targetBalance: string | null;
  direction: 'WIN' | 'LOSS' | 'HOLD' | 'DONE';
  progressPercent: string;
  isCompleted: boolean;
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

interface BurstRow {
  id: string;
  scope: 'ALL' | 'AGENT_LINE' | 'MEMBER';
  targetAgentUsername: string | null;
  targetMemberUsername: string | null;
  gameIds: string[];
  dailyBudget: string;
  todayBurstAmount: string;
  todayBurstCount: number;
  memberDailyCap: string;
  singlePayoutCap: string;
  singleMultiplierCap: string;
  minBurstMultiplier: string;
  smallWinMultiplier: string;
  burstRate: string;
  smallWinRate: string;
  lossRate: string;
  compensationLoss: string;
  capitalRetentionRatio: string;
  minEligibilityLoss: string;
  riskWinLimit: string;
  cooldownRounds: number;
  isActive: boolean;
  isBudgetSpent: boolean;
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
  controlSource?: string;
  controlSourceLabel?: string;
  controlActionLabel?: string;
  controlScopeLabel?: string;
  controlTargetLabel?: string | null;
  controlDetail?: string;
  controlDirectionLabel?: string;
  operatorUsername?: string | null;
  originalResult: { payout?: string; multiplier?: string; won?: boolean };
  finalResult: { payout?: string; multiplier?: string; won?: boolean };
  createdAt: string;
}

interface AutoBalanceTemplate {
  key: string;
  label: string;
  steps: number[];
}

interface AutoBalanceConfig {
  id: string;
  isEnabled: boolean;
  templateKey: string;
  templateLabel: string;
  lifecycleSteps: number[];
  secondLineAmount: string;
  templates: AutoBalanceTemplate[];
  operatorUsername: string | null;
  updatedAt: string | null;
}

type RewardScope = 'ALL' | 'AGENT_LINE' | 'MEMBER';

export function ControlsOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { agent } = useAdminAuthStore();
  const isSuperAdmin = agent?.role === 'SUPER_ADMIN';
  const [allSettlement, setAllSettlement] = useState<SettlementSnapshot | null>(null);
  const [manualActive, setManualActive] = useState<ManualDetectionRow[]>([]);
  const [wl, setWl] = useState<WinLossRow[]>([]);
  const [wc, setWc] = useState<WinCapRow[]>([]);
  const [dc, setDc] = useState<DepositRow[]>([]);
  const [al, setAl] = useState<AgentLineRow[]>([]);
  const [bc, setBc] = useState<BurstRow[]>([]);
  const [logs, setLogs] = useState<ControlLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualOpen, setManualOpen] = useState(false);
  const [wlOpen, setWlOpen] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [dcOpen, setDcOpen] = useState(false);
  const [alOpen, setAlOpen] = useState(false);
  const [bcOpen, setBcOpen] = useState(false);
  const [autoBalanceConfig, setAutoBalanceConfig] = useState<AutoBalanceConfig | null>(null);
  const [autoBalanceEnabled, setAutoBalanceEnabled] = useState(true);
  const [autoBalanceTemplateKey, setAutoBalanceTemplateKey] = useState('');
  const [autoBalanceSecondLineAmount, setAutoBalanceSecondLineAmount] = useState('50000');
  const [autoBalanceBusy, setAutoBalanceBusy] = useState(false);
  const [rewardScope, setRewardScope] = useState<RewardScope>('ALL');
  const [rewardTarget, setRewardTarget] = useState<AccountSearchOption | null>(null);
  const [rewardAmount, setRewardAmount] = useState('1000');
  const [rewardMinutes, setRewardMinutes] = useState('15');
  const [rewardBusy, setRewardBusy] = useState(false);
  const onlineRewardControls = useMemo(() => dc.filter(isOnlineRewardControl), [dc]);
  const depositControls = useMemo(() => dc.filter((row) => !isOnlineRewardControl(row)), [dc]);

  const reload = useCallback(async () => {
    try {
      if (!isSuperAdmin) {
        const [winLoss, logRes] = await Promise.all([
          adminApi.get<{ items: WinLossRow[] }>('/controls/win-loss'),
          adminApi.get<{ items: ControlLogRow[] }>('/controls/logs'),
        ]);
        setManualActive([]);
        setAllSettlement(null);
        setWl(winLoss.data.items);
        setWc([]);
        setDc([]);
        setAl([]);
        setBc([]);
        setLogs(logRes.data.items);
        setError(null);
        return;
      }

      const [
        manualStatus,
        settlement,
        winLoss,
        winCap,
        deposit,
        agentLine,
        burst,
        autoBalance,
        logRes,
      ] =
        await Promise.all([
          adminApi.get<{ items: ManualDetectionRow[] }>('/controls/manual-detection/status'),
          adminApi.get<SettlementSnapshot>('/controls/manual-detection/settlement', {
            params: { scope: 'ALL' },
          }),
          adminApi.get<{ items: WinLossRow[] }>('/controls/win-loss'),
          adminApi.get<{ items: WinCapRow[] }>('/controls/win-cap'),
          adminApi.get<{ items: DepositRow[] }>('/controls/deposit'),
          adminApi.get<{ items: AgentLineRow[] }>('/controls/agent-line'),
          adminApi.get<{ items: BurstRow[] }>('/controls/burst'),
          adminApi.get<AutoBalanceConfig>('/controls/auto-balance/config'),
          adminApi.get<{ items: ControlLogRow[] }>('/controls/logs'),
        ]);
      setManualActive(manualStatus.data.items);
      setAllSettlement(settlement.data);
      setWl(winLoss.data.items);
      setWc(winCap.data.items);
      setDc(deposit.data.items);
      setAl(agentLine.data.items);
      setBc(burst.data.items);
      setAutoBalanceConfig(autoBalance.data);
      setAutoBalanceEnabled(autoBalance.data.isEnabled);
      setAutoBalanceTemplateKey(autoBalance.data.templateKey);
      setAutoBalanceSecondLineAmount(autoBalance.data.secondLineAmount);
      setLogs(logRes.data.items);
      setError(null);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleRow = async (
    kind: 'win-loss' | 'win-cap' | 'deposit' | 'agent-line' | 'burst',
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
    kind: 'win-loss' | 'win-cap' | 'deposit' | 'agent-line' | 'burst',
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

  const deleteManual = async (id: string): Promise<void> => {
    if (!window.confirm('确定删除此手动侦测控制？')) return;
    try {
      await adminApi.delete(`/controls/manual-detection/${id}`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const saveAutoBalanceConfig = async (): Promise<void> => {
    setAutoBalanceBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await adminApi.patch<AutoBalanceConfig>('/controls/auto-balance/config', {
        isEnabled: autoBalanceEnabled,
        templateKey: autoBalanceTemplateKey,
        secondLineAmount: autoBalanceSecondLineAmount,
      });
      setAutoBalanceConfig(response.data);
      setAutoBalanceEnabled(response.data.isEnabled);
      setAutoBalanceTemplateKey(response.data.templateKey);
      setAutoBalanceSecondLineAmount(response.data.secondLineAmount);
      setNotice(`自動大盤已更新：${response.data.templateLabel}`);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setAutoBalanceBusy(false);
    }
  };

  const sendOnlineReward = async (): Promise<void> => {
    if (rewardScope !== 'ALL' && !rewardTarget) {
      setError(rewardScope === 'AGENT_LINE' ? '请先选择代理线账号' : '请先选择玩家账号');
      return;
    }
    const targetText =
      rewardScope === 'ALL'
        ? '最近活跃玩家'
        : rewardScope === 'AGENT_LINE'
          ? `代理线 ${rewardTarget?.username}`
          : `玩家 ${rewardTarget?.username}`;
    if (!window.confirm(`确定为${targetText}设置下一局必赢？`)) return;
    setRewardBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await adminApi.post<{
        memberCount: number;
        shareAmount: string;
        totalAmount: string;
        scope: RewardScope;
        targetUsername: string | null;
      }>('/controls/reward/online', {
        scope: rewardScope,
        targetAgentId: rewardScope === 'AGENT_LINE' ? rewardTarget?.id : undefined,
        targetAgentUsername: rewardScope === 'AGENT_LINE' ? rewardTarget?.username : undefined,
        targetMemberId: rewardScope === 'MEMBER' ? rewardTarget?.id : undefined,
        targetMemberUsername: rewardScope === 'MEMBER' ? rewardTarget?.username : undefined,
        totalAmount: rewardAmount,
        recentMinutes: Number.parseInt(rewardMinutes, 10),
      });
      const scopeText =
        response.data.scope === 'ALL'
          ? '全盤'
          : response.data.scope === 'AGENT_LINE'
            ? `代理線 ${response.data.targetUsername ?? ''}`
            : `玩家 ${response.data.targetUsername ?? ''}`;
      setNotice(
        `已設定${scopeText}下一局必贏 ${fmt(response.data.totalAmount)}，共 ${response.data.memberCount} 位，基礎目標淨贏 ${fmt(response.data.shareAmount)}`,
      );
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setRewardBusy(false);
    }
  };

  const manualCols: Column<ManualDetectionRow>[] = [
    {
      key: 'scope',
      label: '范围',
      render: (r) => <span className="tag tag-acid">{formatManualScope(r.scope)}</span>,
    },
    {
      key: 'target',
      label: '目标',
      render: (r) => <span className="font-mono">{formatManualTarget(r)}</span>,
    },
    {
      key: 'current',
      label: '目前玩家交收',
      align: 'right',
      render: (r) => (
        <span
          className={`data-num ${playerSettlementNumber(r.currentSettlement) > 0 ? 'text-[#2BAA6A]' : 'text-[#D4574A]'}`}
        >
          {playerSettlementSigned(r.currentSettlement)}
        </span>
      ),
    },
    {
      key: 'targetSettlement',
      label: '目标玩家交收',
      align: 'right',
      render: (r) => (
        <span className="data-num text-[#AE8B35]">
          {playerSettlementSigned(r.targetSettlement)}
        </span>
      ),
    },
    {
      key: 'direction',
      label: '控制方向',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className={manualDirectionClass(r)}>{manualDirectionText(r)}</span>
          {r.bitePercentage && (
            <span className="font-mono text-[10px] text-[#A44722]">
              咬 {Number.parseFloat(r.bitePercentage).toFixed(0)}% · 第 {r.cycleCount + 1} 輪
            </span>
          )}
          {isHoldTargetManual(r) && (
            <span className="font-mono text-[10px] text-[#186073]">鎖定 ±{fmt(r.targetBand)}</span>
          )}
        </div>
      ),
    },
    {
      key: 'rate',
      label: '介入率',
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
          <button
            type="button"
            onClick={() => void deactivateManual(r.id)}
            className="btn-teal-outline px-2 py-1"
          >
            停用
          </button>
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
    {
      key: 'mode',
      label: '模式',
      render: (r) => <span className="tag tag-acid">{formatControlMode(r.controlMode)}</span>,
    },
    {
      key: 'target',
      label: '目标账号',
      render: (r) => <span className="font-mono text-[11px]">{r.targetUsername ?? '—'}</span>,
    },
    {
      key: 'pct',
      label: '介入率',
      align: 'right',
      render: (r) => <span className="data-num">{r.controlPercentage}%</span>,
    },
    {
      key: 'direction',
      label: '控制方向',
      render: (r) => (
        <div className="flex flex-col gap-1 text-[10px]">
          <div className="flex gap-1">
            {r.winControl && <span className="tag tag-toxic">放會員 / 上級付</span>}
            {r.lossControl && <span className="tag tag-ember">咬會員 / 上級收</span>}
          </div>
          {r.lossControl && r.targetLossAmount && (
            <span className="font-mono text-[#A44722]">
              咬 {Number.parseFloat(r.targetBitePercentage ?? '0').toFixed(0)}% ·{' '}
              {fmt(r.currentLossAmount)} / {fmt(r.targetLossAmount)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCompleted ? (
          <span className="tag tag-acid">已完成</span>
        ) : r.isActive ? (
          <span className="tag tag-toxic">启用中</span>
        ) : (
          <span className="tag tag-ember">停用</span>
        ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => void toggleRow('win-loss', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
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
    {
      key: 'target',
      label: '控制目标',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="tag tag-acid">{r.scope === 'AGENT_LINE' ? '代理线' : '会员'}</span>
          <span className="font-mono text-[11px]">
            {r.scope === 'AGENT_LINE' ? (r.targetAgentUsername ?? '—') : (r.memberUsername ?? '—')}
          </span>
        </div>
      ),
    },
    {
      key: 'path',
      label: '本金路径',
      render: (r) => (
        <span className="font-mono text-[11px]">
          {r.lifecycleSteps && r.lifecycleSteps.length > 0
            ? r.lifecycleSteps.map((step) => `${step}%`).join(' » ')
            : `旧版 +${fmt(r.targetProfit)}`}
        </span>
      ),
    },
    {
      key: 'principal',
      label: '本金 / 目前',
      render: (r) => {
        const state = r.lifecycleState;
        if (state) {
          return (
            <div className="flex flex-col gap-1">
              <span className="data-num text-[12px]">{fmt(state.startBalance)}</span>
              <span className="font-mono text-[10px] text-[#186073]">
                {fmt(state.currentBalance)} · {Number.parseFloat(state.currentPercent).toFixed(0)}%
              </span>
            </div>
          );
        }
        if (r.scope === 'AGENT_LINE') {
          return (
            <span className="font-mono text-[11px] text-ink-500">
              {r.lifecycleStateCount ?? 0} 位已进入
            </span>
          );
        }
        return <span className="data-num">{fmt(r.startBalance)}</span>;
      },
    },
    {
      key: 'progress',
      label: '目前阶段',
      render: (r) => {
        const state = r.lifecycleState;
        const progress = state
          ? Number.parseFloat(state.progressPercent)
          : depositProgressPercent(r);
        return (
          <div className="min-w-[150px]">
            <div className="flex items-baseline justify-between gap-2">
              {state ? (
                <span className={depositLifecycleDirectionClass(state)}>
                  {depositLifecycleDirectionText(state)}
                </span>
              ) : (
                <span className="data-num text-[12px] text-[#186073]">
                  {signed(r.currentProfit ?? '0')}
                </span>
              )}
              <span className="font-mono text-[10px] text-ink-500">
                {Number.isFinite(progress) ? progress.toFixed(0) : '0'}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-[#2BAA6A]"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink-400">
              {state ? (
                <>
                  <span>第 {state.currentStageIndex + 1} 阶</span>
                  <span>
                    目标 {state.targetPercent ?? '—'}% · {fmt(state.targetBalance)}
                  </span>
                </>
              ) : (
                <>
                  <span>余额 {fmt(r.currentBalance)}</span>
                  <span>目标 {fmt(r.targetBalance)}</span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'rate',
      label: '介入率',
      align: 'right',
      render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span>,
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCompleted ? (
          <span className="tag tag-acid">已完成</span>
        ) : r.isActive ? (
          <span className="tag tag-toxic">启用中</span>
        ) : (
          <span className="tag tag-ember">停用</span>
        ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => void toggleRow('deposit', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
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

  const onlineRewardCols: Column<DepositRow>[] = [
    {
      key: 'time',
      label: '設定時間',
      render: (r) => <span className="font-mono text-[11px]">{formatTime(r.createdAt)}</span>,
    },
    {
      key: 'member',
      label: '被控制會員',
      render: (r) => <span className="font-mono">{r.memberUsername}</span>,
    },
    {
      key: 'target',
      label: '目標淨贏',
      align: 'right',
      render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.targetProfit)}</span>,
    },
    {
      key: 'scope',
      label: '來源範圍',
      render: (r) => <span className="font-mono text-[11px]">{formatOnlineRewardScope(r)}</span>,
    },
    {
      key: 'operator',
      label: '操作人',
      render: (r) => <span className="font-mono text-[11px]">{r.operatorUsername ?? '—'}</span>,
    },
    {
      key: 'status',
      label: '狀態',
      render: (r) =>
        r.isCompleted ? (
          <span className="tag tag-acid">已套用完成</span>
        ) : r.isActive ? (
          <span className="tag tag-toxic">等待下一局</span>
        ) : (
          <span className="tag tag-ember">停用</span>
        ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => void toggleRow('deposit', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
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
    {
      key: 'member',
      label: '会员账号',
      render: (r) => <span className="font-mono">{r.memberUsername}</span>,
    },
    {
      key: 'cap',
      label: '封顶金额',
      align: 'right',
      render: (r) => <span className="data-num">{fmt(r.winCapAmount)}</span>,
    },
    {
      key: 'today',
      label: '今日赢额',
      align: 'right',
      render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span>,
    },
    {
      key: 'trigger',
      label: '触发比例',
      align: 'right',
      render: (r) => <span className="data-num">{pct(r.triggerThreshold)}</span>,
    },
    {
      key: 'rate',
      label: '控制胜率',
      align: 'right',
      render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span>,
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCapped ? (
          <span className="tag tag-ember">已封顶</span>
        ) : r.isActive ? (
          <span className="tag tag-toxic">启用中</span>
        ) : (
          <span className="tag tag-ember">停用</span>
        ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => void toggleRow('win-cap', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
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
    {
      key: 'agent',
      label: '代理账号',
      render: (r) => <span className="font-mono">{r.agentUsername}</span>,
    },
    {
      key: 'cap',
      label: '单日封顶',
      align: 'right',
      render: (r) => <span className="data-num">{fmt(r.dailyCap)}</span>,
    },
    {
      key: 'today',
      label: '今日赢额',
      align: 'right',
      render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span>,
    },
    {
      key: 'trigger',
      label: '触发比例',
      align: 'right',
      render: (r) => <span className="data-num">{pct(r.triggerThreshold)}</span>,
    },
    {
      key: 'rate',
      label: '控制胜率',
      align: 'right',
      render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span>,
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCapped ? (
          <span className="tag tag-ember">已封顶</span>
        ) : r.isActive ? (
          <span className="tag tag-toxic">启用中</span>
        ) : (
          <span className="tag tag-ember">停用</span>
        ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => void toggleRow('agent-line', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
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

  const bcCols: Column<BurstRow>[] = [
    {
      key: 'scope',
      label: '范围',
      render: (r) => <span className="tag tag-acid">{formatManualScope(r.scope)}</span>,
    },
    {
      key: 'target',
      label: '目标',
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px]">{formatBurstTarget(r)}</span>
          {r.gameIds.length > 0 && (
            <span className="font-mono text-[10px] text-[#186073]">{r.gameIds.join(', ')}</span>
          )}
        </div>
      ),
    },
    {
      key: 'budget',
      label: '每日池',
      align: 'right',
      render: (r) => <span className="data-num">{fmt(r.dailyBudget)}</span>,
    },
    {
      key: 'used',
      label: '已用',
      align: 'right',
      render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayBurstAmount)}</span>,
    },
    {
      key: 'range',
      label: '单次净赢',
      align: 'right',
      render: (r) => (
        <span className="data-num">
          {fmt(r.minBurstMultiplier)}-{fmt(r.singlePayoutCap)}
        </span>
      ),
    },
    {
      key: 'memberCap',
      label: '会员上限',
      align: 'right',
      render: (r) => <span className="data-num">{fmt(r.memberDailyCap)}</span>,
    },
    {
      key: 'eligibility',
      label: '进池门槛',
      render: (r) => <span className="font-mono text-[11px]">{formatBurstEligibility(r)}</span>,
    },
    {
      key: 'rates',
      label: '机率',
      render: (r) => <span className="font-mono text-[11px]">爆 {pct(r.burstRate)}</span>,
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isBudgetSpent ? (
          <span className="tag tag-ember">池已用完</span>
        ) : r.isActive ? (
          <span className="tag tag-toxic">启用中</span>
        ) : (
          <span className="tag tag-ember">停用</span>
        ),
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => void toggleRow('burst', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => void deleteRow('burst', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const logCols: Column<ControlLogRow>[] = [
    {
      key: 'time',
      label: '时间',
      render: (r) => <span className="font-mono text-[11px]">{formatTime(r.createdAt)}</span>,
    },
    {
      key: 'member',
      label: '会员',
      render: (r) => <span className="font-mono">{r.username}</span>,
    },
    {
      key: 'game',
      label: '游戏',
      render: (r) => {
        const game = getGameMeta(r.gameId);
        return (
          <span className="tag tag-acid flex-col items-start gap-0 leading-tight">
            <span>{game?.nameZh ?? r.gameId}</span>
            {game && <span className="font-mono text-[9px] opacity-60">{r.gameId}</span>}
          </span>
        );
      },
    },
    {
      key: 'reason',
      label: '控制来源 / 动作',
      render: renderControlLogReason,
    },
    {
      key: 'before',
      label: '原派彩',
      align: 'right',
      render: (r) => <span className="data-num">{r.originalResult?.payout ?? '0.00'}</span>,
    },
    {
      key: 'after',
      label: '最终派彩',
      align: 'right',
      render: (r) => (
        <span className="data-num text-[#186073]">{r.finalResult?.payout ?? '0.00'}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ 风控 06"
        breadcrumb={`${t.nav.controls} / 总览`}
        title={t.nav.controls}
        titleSuffix="输赢控制"
        titleSuffixColor="ember"
        description={
          isSuperAdmin
            ? '控制优先级、手动侦测、封顶、简单爆分池与真实介入纪录都集中在这一页。后端会依同一套顺序套用到实际结算。'
            : '可查询自己代理线内的游戏账号或下级代理线，并建立对应的输赢控制。'
        }
      />

      <ImageBanner
        image="/banners/controls-risk-host.png"
        eyebrow="风控中心"
        title="先看哪条控制在线，再决定今天要把交收拉到哪里。"
        description={
          isSuperAdmin
            ? '手动侦测画面统一用玩家视角：绿字代表玩家赢，红字代表玩家输。'
            : '代理账号只能看到和管理自己建立的下线控制规则。'
        }
        tone="ember"
        imagePosition="object-[74%_30%]"
      />

      <div className="mb-4 rounded-[6px] border border-[#AE8B35]/35 bg-[#FFF8E1] px-4 py-3 text-[12px] text-[#5C4B1F]">
        {isSuperAdmin ? (
          <>
            <div className="font-semibold text-[#7A5F15]">控制优先级</div>
            <div className="mt-1">
              爆分控制 &gt; 全账号 10,000 赢分上限（入金/爆分执行中例外） &gt; 输赢控制
              &gt; 封顶控制 &gt; 入金控制 &gt; 手动侦测 &gt; 自動大盤
            </div>
            <div className="mt-1 text-[#7A5F15]/80">
              输控制会自动按 3-4 输后补 1 次小赢，不会每局直线压输。
            </div>
            <div className="mt-1 text-[#7A5F15]/80">
              手动侦测目标以玩家交收显示：目标填正数代表让玩家赢到该数字；目标填负数代表让玩家输到该数字。
            </div>
          </>
        ) : (
          <>
            <div className="font-semibold text-[#7A5F15]">代理控制范围</div>
            <div className="mt-1">
              可搜索自己代理线内的会员游戏账号，或选择自己及下级代理作为整条代理线目标。未命中介入率时自然开奖。
            </div>
          </>
        )}
      </div>

      {isSuperAdmin ? (
        <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            label="全盘玩家交收"
            value={playerSettlementSigned(allSettlement?.superiorSettlement)}
            hint={
              allSettlement
                ? `${playerSettlementStatusText(allSettlement.superiorSettlement)} · ${allSettlement.gameDay}`
                : '—'
            }
            accent={
              playerSettlementNumber(allSettlement?.superiorSettlement) > 0 ? 'toxic' : 'ember'
            }
          />
          <StatCard
            label="手动侦测在线"
            value={manualActive.length.toString()}
            hint="会员 / 代理线 / 全盘"
            accent="ice"
          />
          <StatCard
            label="输赢控制在线"
            value={wl.filter((x) => x.isActive).length.toString()}
            hint="优先于封顶与入金"
            accent="ember"
          />
          <StatCard
            label="会员封顶在线"
            value={wc.filter((x) => x.isActive).length.toString()}
            hint="单会员日赢额"
            accent="amber"
          />
          <StatCard
            label="代理线封顶在线"
            value={al.filter((x) => x.isActive).length.toString()}
            hint="整条线日赢额"
            accent="toxic"
          />
          <StatCard
            label="爆分控制在线"
            value={bc.filter((x) => x.isActive).length.toString()}
            hint="机率 / 净赢范围"
            accent="ice"
          />
        </div>
      ) : (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <StatCard
            label="我的控制在线"
            value={wl.filter((x) => x.isActive).length.toString()}
            hint="会员 / 代理线"
            accent="ember"
          />
          <StatCard
            label="介入纪录"
            value={logs.length.toString()}
            hint="最近 100 笔"
            accent="ice"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 border border-[#2BAA6A]/35 bg-[#EDFFF5] p-3 text-[12px] text-[#1F7A4D]">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <div className="space-y-6">
          {isSuperAdmin && autoBalanceConfig && (
            <Section title="§ 自動大盤" subtitle="會員餘額變動後依本金%路徑重新起跑">
              <div className="card-base grid gap-4 p-4 lg:grid-cols-[0.85fr_1.15fr_1fr_auto] lg:items-end">
                <label className="flex items-center gap-3 rounded-[6px] border border-[#186073]/20 bg-[#EFF8FB] px-3 py-3">
                  <input
                    type="checkbox"
                    checked={autoBalanceEnabled}
                    onChange={(e) => setAutoBalanceEnabled(e.target.checked)}
                    className="h-4 w-4 accent-[#186073]"
                  />
                  <span>
                    <span className="block text-[12px] font-semibold text-[#173247]">啟用自動大盤</span>
                    <span className="mt-1 block text-[10px] text-ink-500">
                      停用後新週期不會自動套用本金路徑
                    </span>
                  </span>
                </label>

                <label className="block">
                  <div className="label mb-2">自動模組路徑</div>
                  <select
                    value={autoBalanceTemplateKey}
                    onChange={(e) => setAutoBalanceTemplateKey(e.target.value)}
                    className="term-input"
                  >
                    {autoBalanceConfig.templates.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.label} · {template.steps.join('/')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <div className="label mb-2">第二防線金額</div>
                  <input
                    type="text"
                    value={autoBalanceSecondLineAmount}
                    onChange={(e) => setAutoBalanceSecondLineAmount(e.target.value)}
                    className="term-input font-mono"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void saveAutoBalanceConfig()}
                  disabled={autoBalanceBusy || !autoBalanceTemplateKey}
                  className="btn-acid whitespace-nowrap text-[11px]"
                >
                  → 保存設定
                </button>

                <div className="lg:col-span-4 rounded-[6px] border border-[#AE8B35]/25 bg-[#FFF8E1] px-4 py-3 text-[11px] text-[#5C4B1F]">
                  <div className="font-semibold text-[#7A5F15]">
                    目前：{autoBalanceConfig.templateLabel} ·{' '}
                    {autoBalanceConfig.isEnabled ? '啟用中' : '已停用'}
                  </div>
                  <div className="mt-1 font-mono">
                    路徑 {autoBalanceConfig.lifecycleSteps.map((step) => `${step}%`).join(' » ')}
                  </div>
                  <div className="mt-1 text-[#7A5F15]/80">
                    抽點、入點、爆分、手動入金週期完成後，會以改變後餘額作為新本金重新跑路徑；第二防線達標會凍結會員下注。
                    {autoBalanceConfig.operatorUsername
                      ? ` 上次操作：${autoBalanceConfig.operatorUsername}`
                      : ''}
                  </div>
                </div>
              </div>
            </Section>
          )}

          {isSuperAdmin && (
            <Section
              title="§ 手动侦测"
              subtitle="会员控制 > 代理线控制 > 全盘控制"
              actions={
                <button
                  type="button"
                  onClick={() => setManualOpen(true)}
                  className="btn-acid text-[11px]"
                >
                  + 新增
                </button>
              }
            >
              <div className="mb-4 grid gap-4 md:grid-cols-4">
                <MetricCard label="总投注" value={fmt(allSettlement?.totalBet)} />
                <MetricCard label="总派彩" value={fmt(allSettlement?.totalPayout)} />
                <MetricCard
                  label="会员输赢"
                  value={signed(allSettlement?.memberWinLoss)}
                  accent={Number(allSettlement?.memberWinLoss ?? 0) > 0 ? 'toxic' : 'ember'}
                />
                <MetricCard
                  label="返水影响"
                  value={signed(allSettlement?.totalRebate)}
                  accent="amber"
                />
              </div>
              <DataTable
                columns={manualCols}
                rows={manualActive}
                rowKey={(r) => r.id}
                empty="当前没有启用中的手动侦测控制"
              />
            </Section>
          )}

          <Section
            title="§ 输赢控制"
            subtitle="查询游戏账号或整条代理线后按百分比翻转输赢"
            actions={
              <button
                type="button"
                onClick={() => setWlOpen(true)}
                className="btn-acid text-[11px]"
              >
                + 新增
              </button>
            }
          >
            <DataTable columns={wlCols} rows={wl} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>

          {isSuperAdmin && (
            <>
              <Section
                title="§ 入金控制"
                subtitle="按本金百分比建立会员或代理线生命周期"
                actions={
                  <button
                    type="button"
                    onClick={() => setDcOpen(true)}
                    className="btn-acid text-[11px]"
                  >
                    + 新增
                  </button>
                }
              >
                <DataTable
                  columns={dcCols}
                  rows={depositControls}
                  rowKey={(r) => r.id}
                  empty={t.common.empty}
                />
              </Section>

              <Section
                title="§ 会员封顶"
                subtitle="会员单日赢额封顶"
                actions={
                  <button
                    type="button"
                    onClick={() => setWcOpen(true)}
                    className="btn-acid text-[11px]"
                  >
                    + 新增
                  </button>
                }
              >
                <DataTable columns={wcCols} rows={wc} rowKey={(r) => r.id} empty={t.common.empty} />
              </Section>

              <Section
                title="§ 代理线封顶"
                subtitle="代理线单日赢额封顶"
                actions={
                  <button
                    type="button"
                    onClick={() => setAlOpen(true)}
                    className="btn-acid text-[11px]"
                  >
                    + 新增
                  </button>
                }
              >
                <DataTable columns={alCols} rows={al} rowKey={(r) => r.id} empty={t.common.empty} />
              </Section>

              <Section
                title="§ 爆分控制"
                subtitle="指定玩家账号与爆分金额"
                actions={
                  <button
                    type="button"
                    onClick={() => setBcOpen(true)}
                    className="btn-acid text-[11px]"
                  >
                    + 新增
                  </button>
                }
              >
                <div className="mb-3 grid gap-3 md:grid-cols-4">
                  <MetricCard
                    label="在线规则"
                    value={bc.filter((x) => x.isActive).length.toString()}
                  />
                  <MetricCard
                    label="今日爆分池"
                    value={fmt(sumRows(bc, 'dailyBudget'))}
                    accent="amber"
                  />
                  <MetricCard
                    label="今日已用"
                    value={fmt(sumRows(bc, 'todayBurstAmount'))}
                    accent="toxic"
                  />
                  <MetricCard
                    label="爆分次数"
                    value={bc.reduce((sum, row) => sum + row.todayBurstCount, 0).toString()}
                    accent="ice"
                  />
                </div>
                <div className="mb-3 rounded-[6px] border border-[#186073]/20 bg-[#EFF8FB] px-4 py-3 text-[12px] text-[#32505C]">
                  <div className="font-semibold text-[#186073]">运行说明</div>
                  <div className="mt-1">
                    爆分只接受后台指定单一玩家与指定金额。全盘、代理线与系统自动爆分已停用；未指定的自然高倍结果会被限制在单局净赢
                    30,000 内。
                  </div>
                </div>
                <DataTable columns={bcCols} rows={bc} rowKey={(r) => r.id} empty={t.common.empty} />
              </Section>

              <Section title="§ 在線均分必贏" subtitle="最近活躍玩家平均設定下一局目標淨贏">
                <div className="card-base grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-[0.9fr_1.35fr_1fr_1fr_auto] lg:items-end">
                  <label className="block">
                    <div className="label mb-2">控制範圍</div>
                    <select
                      value={rewardScope}
                      onChange={(e) => {
                        setRewardScope(e.target.value as RewardScope);
                        setRewardTarget(null);
                      }}
                      className="term-input"
                    >
                      <option value="ALL">全盤活躍玩家</option>
                      <option value="AGENT_LINE">指定代理線</option>
                      <option value="MEMBER">指定玩家</option>
                    </select>
                  </label>
                  {rewardScope === 'ALL' ? (
                    <label className="block">
                      <div className="label mb-2">目標帳號</div>
                      <input
                        type="text"
                        value="全盤最近活躍玩家"
                        readOnly
                        className="term-input text-ink-500"
                      />
                    </label>
                  ) : (
                    <AccountSearchSelect
                      key={rewardScope}
                      kind={rewardScope === 'AGENT_LINE' ? 'agent' : 'member'}
                      label={rewardScope === 'AGENT_LINE' ? '代理線帳號' : '玩家帳號'}
                      value={rewardTarget}
                      onChange={setRewardTarget}
                      placeholder={
                        rewardScope === 'AGENT_LINE' ? '輸入代理帳號或全名' : '輸入玩家帳號或全名'
                      }
                    />
                  )}
                  <label className="block">
                    <div className="label mb-2">目標總淨贏</div>
                    <input
                      type="text"
                      value={rewardAmount}
                      onChange={(e) => setRewardAmount(e.target.value)}
                      className="term-input font-mono"
                    />
                  </label>
                  <label className="block">
                    <div className="label mb-2">活躍時間窗（分鐘）</div>
                    <input
                      type="text"
                      value={rewardMinutes}
                      onChange={(e) => setRewardMinutes(e.target.value)}
                      className="term-input font-mono"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void sendOnlineReward()}
                    disabled={rewardBusy || (rewardScope !== 'ALL' && !rewardTarget)}
                    className="btn-acid whitespace-nowrap text-[11px]"
                  >
                    → 設定必贏
                  </button>
                </div>
                <div className="mt-3">
                  <DataTable
                    columns={onlineRewardCols}
                    rows={onlineRewardControls}
                    rowKey={(r) => r.id}
                    empty="目前沒有待執行的在線均分必贏"
                  />
                </div>
              </Section>
            </>
          )}

          <Section title="§ 控制介入纪录" subtitle="最近 100 笔真实套用结果">
            <DataTable columns={logCols} rows={logs} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
        </div>
      )}

      <ManualDetectionControlModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onDone={() => void reload()}
      />
      <WinLossControlModal
        open={wlOpen}
        onClose={() => setWlOpen(false)}
        onDone={() => void reload()}
      />
      <WinCapControlModal
        open={wcOpen}
        onClose={() => setWcOpen(false)}
        onDone={() => void reload()}
      />
      <DepositControlModal
        open={dcOpen}
        onClose={() => setDcOpen(false)}
        onDone={() => void reload()}
      />
      <AgentLineControlModal
        open={alOpen}
        onClose={() => setAlOpen(false)}
        onDone={() => void reload()}
      />
      <BurstControlModal
        open={bcOpen}
        onClose={() => setBcOpen(false)}
        onDone={() => void reload()}
      />
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
      <div className="mb-2 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-baseline">
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

function depositProgressPercent(row: DepositRow): number {
  const fromServer = Number.parseFloat(row.progressPercent ?? '');
  if (Number.isFinite(fromServer)) return Math.max(0, Math.min(100, fromServer));

  const currentProfit = Number.parseFloat(row.currentProfit ?? '0');
  const targetProfit = Number.parseFloat(row.targetProfit ?? '0');
  if (!Number.isFinite(currentProfit) || !Number.isFinite(targetProfit) || targetProfit <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (currentProfit / targetProfit) * 100));
}

function depositLifecycleDirectionText(state: DepositLifecycleState): string {
  if (state.isCompleted || state.direction === 'DONE') return '已完成';
  if (state.direction === 'WIN') return `控贏到 ${state.targetPercent ?? '—'}%`;
  if (state.direction === 'LOSS') return `控輸到 ${state.targetPercent ?? '—'}%`;
  return `維持 ${state.targetPercent ?? '—'}%`;
}

function depositLifecycleDirectionClass(state: DepositLifecycleState): string {
  if (state.isCompleted || state.direction === 'DONE') return 'tag tag-acid';
  if (state.direction === 'WIN') return 'tag tag-toxic';
  if (state.direction === 'LOSS') return 'tag tag-ember';
  return 'tag tag-acid';
}

function signed(value?: string | null): string {
  const n = Number.parseFloat(value ?? '0');
  if (Number.isNaN(n)) return '0.00';
  const formatted = fmt(String(Math.abs(n)));
  return `${n > 0 ? '+' : n < 0 ? '-' : ''}${formatted}`;
}

function playerSettlementNumber(superiorSettlement?: string | null): number {
  const n = Number.parseFloat(superiorSettlement ?? '0');
  if (!Number.isFinite(n)) return 0;
  return -n;
}

function playerSettlementSigned(superiorSettlement?: string | null): string {
  return signed(String(playerSettlementNumber(superiorSettlement)));
}

function playerSettlementStatusText(superiorSettlement?: string | null): string {
  const playerSettlement = playerSettlementNumber(superiorSettlement);
  if (playerSettlement > 0) return '绿色(玩家盈利)';
  if (playerSettlement < 0) return '红色(玩家亏损)';
  return '持平';
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
  if (row.scope === 'ALL') return '全盘玩家交收';
  if (row.scope === 'AGENT_LINE') return row.targetAgentUsername ?? '—';
  return row.targetMemberUsername ?? '—';
}

function formatBurstTarget(row: BurstRow): string {
  if (row.scope === 'ALL') return '全盘';
  if (row.scope === 'AGENT_LINE') return row.targetAgentUsername ?? '—';
  return row.targetMemberUsername ?? '—';
}

function formatBurstEligibility(row: BurstRow): string {
  const retention = Number.parseFloat(row.capitalRetentionRatio ?? '0');
  const minLoss = Number.parseFloat(row.minEligibilityLoss ?? '0');
  if (
    (!Number.isFinite(retention) || retention <= 0) &&
    (!Number.isFinite(minLoss) || minLoss <= 0)
  ) {
    return '不限制';
  }
  const parts: string[] = [];
  if (Number.isFinite(retention) && retention > 0)
    parts.push(`剩 ${pct(row.capitalRetentionRatio)}`);
  if (Number.isFinite(minLoss) && minLoss > 0) parts.push(`亏 ${fmt(row.minEligibilityLoss)}`);
  return parts.join(' / ');
}

function isOnlineRewardControl(row: DepositRow): boolean {
  return row.notes?.includes('auto_revive:online_reward') ?? false;
}

function formatOnlineRewardScope(row: DepositRow): string {
  const notes = row.notes ?? '';
  const scope = notes.match(/(?:^|:)scope=([^:]+)/)?.[1];
  const target = notes.match(/(?:^|:)target=([^:]+)/)?.[1];
  if (scope === 'ALL') return '全盤活躍玩家';
  if (scope === 'AGENT_LINE') return target ? `代理線 ${target}` : '指定代理線';
  if (scope === 'MEMBER') return target ? `玩家 ${target}` : '指定玩家';
  return '在線均分';
}

function sumRows(rows: BurstRow[], key: 'dailyBudget' | 'todayBurstAmount'): string {
  return rows.reduce((sum, row) => sum + Number.parseFloat(row[key] ?? '0'), 0).toFixed(2);
}

function manualStatusText(row: ManualDetectionRow): string {
  if (row.isActive && isHoldTargetManual(row)) {
    return isManualWithinTargetBand(row) ? '锁定区间' : '锁定拉回';
  }
  if (row.isActive && row.isCompleted && row.scope === 'MEMBER') return '达标维持中';
  if (row.isCompleted) return '已达标';
  if (row.isActive) return '进行中';
  return '停用';
}

function manualStatusClass(row: ManualDetectionRow): string {
  if (row.isActive && isHoldTargetManual(row)) {
    return isManualWithinTargetBand(row) ? 'tag tag-acid' : 'tag tag-toxic';
  }
  if (row.isActive && row.isCompleted && row.scope === 'MEMBER') return 'tag tag-acid';
  if (row.isCompleted) return 'tag tag-acid';
  if (row.isActive) return 'tag tag-toxic';
  return 'tag tag-ember';
}

function manualDirectionText(row: ManualDetectionRow): string {
  const current = playerSettlementNumber(row.currentSettlement);
  const target = playerSettlementNumber(row.targetSettlement);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return '—';
  if (target > current) return '放会员 / 玩家赢';
  if (target < current) return '压会员 / 玩家输';
  return '维持';
}

function manualDirectionClass(row: ManualDetectionRow): string {
  const current = playerSettlementNumber(row.currentSettlement);
  const target = playerSettlementNumber(row.targetSettlement);
  if (!Number.isFinite(current) || !Number.isFinite(target) || target === current)
    return 'tag tag-acid';
  return target > current ? 'tag tag-toxic' : 'tag tag-ember';
}

function isHoldTargetManual(row: ManualDetectionRow): boolean {
  return row.completionBehavior === 'hold_target';
}

function isManualWithinTargetBand(row: ManualDetectionRow): boolean {
  const current = Number.parseFloat(row.currentSettlement);
  const target = Number.parseFloat(row.targetSettlement);
  const band = Number.parseFloat(row.targetBand);
  if (!Number.isFinite(current) || !Number.isFinite(target)) return false;
  if (current === target) return true;
  return Number.isFinite(band) && band > 0 && Math.abs(current - target) <= band;
}

function renderControlLogReason(row: ControlLogRow): JSX.Element {
  const sourceLabel = row.controlSourceLabel ?? formatReason(row.flipReason);
  const actionLabel = row.controlActionLabel ?? formatReason(row.flipReason);
  const scopeParts = [row.controlScopeLabel, row.controlTargetLabel].filter(Boolean);
  const scopeText = scopeParts.length > 0 ? scopeParts.join(' · ') : '歷史規則';
  const operatorText = row.operatorUsername ? `操作人 ${row.operatorUsername}` : null;

  return (
    <div className="min-w-[260px] max-w-[420px]">
      <div className="flex flex-wrap gap-1">
        <span className={controlLogSourceClass(row.controlSource)}>{sourceLabel}</span>
        <span className={controlLogActionClass(row)}>{actionLabel}</span>
      </div>
      <div className="mt-1 text-[10px] leading-4 text-ink-500">
        {scopeText}
        {operatorText ? ` · ${operatorText}` : ''}
      </div>
      <div className="mt-1 text-[10px] leading-4 text-[#32505C]">
        {row.controlDetail ?? '這筆紀錄已套用控制。'}
      </div>
      <div className="mt-1 font-mono text-[10px] leading-4 text-[#186073]">
        {row.controlDirectionLabel ?? formatLogDirection(row)}
      </div>
    </div>
  );
}

function controlLogSourceClass(source?: string): string {
  if (source === 'online_reward_next_win') return 'tag tag-toxic';
  if (source === 'burst_control') return 'tag tag-ember';
  if (source === 'manual_detection' || source === 'deposit_control') return 'tag tag-acid';
  if (
    source === 'member_win_cap' ||
    source === 'agent_line_cap' ||
    source === 'global_member_daily_win_cap'
  )
    return 'tag tag-ember';
  return 'tag tag-acid';
}

function controlLogActionClass(row: ControlLogRow): string {
  const label = row.controlActionLabel ?? '';
  if (
    row.finalResult?.won === false ||
    label.includes('輸') ||
    label.includes('输') ||
    label.includes('壓') ||
    label.includes('压') ||
    label.includes('咬')
  ) {
    return 'tag tag-ember';
  }
  if (
    row.finalResult?.won === true ||
    label.includes('贏') ||
    label.includes('赢') ||
    label.includes('放') ||
    label.includes('補') ||
    label.includes('补')
  ) {
    return 'tag tag-toxic';
  }
  return 'tag tag-acid';
}

function formatLogDirection(row: ControlLogRow): string {
  const from =
    row.originalResult?.won === true
      ? '原本贏'
      : row.originalResult?.won === false
        ? '原本輸'
        : '原結果';
  const to =
    row.finalResult?.won === true
      ? '控制後贏'
      : row.finalResult?.won === false
        ? '控制後輸'
        : '控制後結果';
  return `${from} → ${to}`;
}

function formatReason(reason: string): string {
  const map: Record<string, string> = {
    deposit_control: '入金控制',
    online_reward_next_win: '在线均分必赢',
    win_cap: '会员封顶',
    win_cap_rate: '会员封顶比例',
    agent_line_cap: '代理线封顶',
    agent_line_cap_rate: '代理线封顶比例',
    win_control: '放水',
    loss_control: '杀分',
    loss_control_release: '杀分补赢',
    manual_detection: '手动侦测',
    burst_win: '爆分',
    burst_small_win: '小赢补偿',
    burst_loss: '娱乐压输',
    burst_risk_cap: '高倍压低',
    burst_risk_guard: '风险防守',
    burst_budget_guard: '爆分池防守',
    global_accidental_burst_cap: '意外爆分上限',
    global_member_daily_win_cap: '全局赢分上限',
    auto_balance_bite: '自動大盤控輸',
    auto_balance_revive: '自動大盤控贏',
    auto_balance_drain: '自動大盤控輸',
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
