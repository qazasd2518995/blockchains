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
import { useTranslation } from '@/i18n/useTranslation';

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
  isActive: boolean;
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
  const [wl, setWl] = useState<WinLossRow[]>([]);
  const [wc, setWc] = useState<WinCapRow[]>([]);
  const [dc, setDc] = useState<DepositRow[]>([]);
  const [al, setAl] = useState<AgentLineRow[]>([]);
  const [logs, setLogs] = useState<ControlLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wlOpen, setWlOpen] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [dcOpen, setDcOpen] = useState(false);
  const [alOpen, setAlOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [a, b, c, d, e] = await Promise.all([
        adminApi.get<{ items: WinLossRow[] }>('/controls/win-loss'),
        adminApi.get<{ items: WinCapRow[] }>('/controls/win-cap'),
        adminApi.get<{ items: DepositRow[] }>('/controls/deposit'),
        adminApi.get<{ items: AgentLineRow[] }>('/controls/agent-line'),
        adminApi.get<{ items: ControlLogRow[] }>('/controls/logs'),
      ]);
      setWl(a.data.items);
      setWc(b.data.items);
      setDc(c.data.items);
      setAl(d.data.items);
      setLogs(e.data.items);
    } catch (e) {
      setError(extractApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleRow = async (kind: 'win-loss' | 'win-cap' | 'deposit' | 'agent-line', id: string, isActive: boolean): Promise<void> => {
    try {
      await adminApi.patch(`/controls/${kind}/${id}/toggle`, { isActive: !isActive });
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };
  const deleteRow = async (kind: 'win-loss' | 'win-cap' | 'deposit' | 'agent-line', id: string): Promise<void> => {
    if (!window.confirm('确定删除此控制规则？')) return;
    try {
      await adminApi.delete(`/controls/${kind}/${id}`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const wlCols: Column<WinLossRow>[] = [
    { key: 'mode', label: '模式', render: (r) => <span className="tag tag-acid">{formatControlMode(r.controlMode)}</span> },
    { key: 'target', label: '目标账号', render: (r) => <span className="font-mono text-[11px]">{r.targetUsername ?? '—'}</span> },
    { key: 'pct', label: '比例', align: 'right', render: (r) => <span className="data-num">{r.controlPercentage}%</span> },
    {
      key: 'mode2',
      label: '控制方向',
      render: (r) => (
        <div className="flex gap-1 text-[10px]">
          {r.winControl && <span className="tag tag-toxic">{t.controls.win}</span>}
          {r.lossControl && <span className="tag tag-ember">{t.controls.loss}</span>}
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('win-loss', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('win-loss', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const wcCols: Column<WinCapRow>[] = [
    { key: 'mem', label: '会员账号', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'cap', label: '封顶金额', align: 'right', render: (r) => <span className="data-num">{fmt(r.winCapAmount)}</span> },
    { key: 'today', label: '今日赢额', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span> },
    { key: 'rate', label: '控制胜率', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCapped ? <span className="tag tag-ember">{t.controls.capped}</span> : r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('win-cap', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('win-cap', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            删除
          </button>
        </div>
      ),
    },
  ];

  const dcCols: Column<DepositRow>[] = [
    { key: 'mem', label: '会员账号', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'dep', label: '入金金额', align: 'right', render: (r) => <span className="data-num">{fmt(r.depositAmount)}</span> },
    { key: 'target', label: '目标盈利', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.targetProfit)}</span> },
    { key: 'rate', label: '控制胜率', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isCompleted
          ? <span className="tag tag-acid">{t.controls.done}</span>
          : r.isActive
            ? <span className="tag tag-toxic">{t.controls.active}</span>
            : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('deposit', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('deposit', r.id)}
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
    {
      key: 'status',
      label: '状态',
      render: (r) =>
        r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: '操作',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('agent-line', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '启用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('agent-line', r.id)}
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
      render: (r) => <span className="data-num text-[#186073]">{r.finalResult?.payout ?? '0.00'}</span>,
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
        description="⚠ 所有控制操作都会主动调整游戏结果并完整记录到审计日志。原始结果会保留于注单数据中以备稽核。"
      />

      <ImageBanner
        image="/banners/controls-risk-host.png"
        eyebrow="风控中心"
        title="先看哪条控制规则在线，再决定今天要不要动手。"
        description="这一页专门用来盯住输赢控制、会员封顶、入金控制与代理线封顶。画面先给总览，避免你在多张表之间来回切，调整前也能先确认哪些规则仍在生效。"
        tone="ember"
        imagePosition="object-[74%_30%]"
      />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <StatCard label="输赢控制" value={wl.filter((x) => x.isActive).length.toString()} accent="ember" />
        <StatCard label="赢额封顶" value={wc.filter((x) => x.isActive).length.toString()} accent="amber" />
        <StatCard label="入金控制" value={dc.filter((x) => x.isActive).length.toString()} accent="acid" />
        <StatCard label="代理线封顶" value={al.filter((x) => x.isActive).length.toString()} accent="toxic" />
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
            title="§ 输赢控制"
            subtitle="按百分比翻转输赢"
            onAdd={() => setWlOpen(true)}
          >
            <DataTable columns={wlCols} rows={wl} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ 赢额封顶"
            subtitle="会员单日赢额封顶"
            onAdd={() => setWcOpen(true)}
          >
            <DataTable columns={wcCols} rows={wc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ 入金控制"
            subtitle="依入金目标自动控制胜率"
            onAdd={() => setDcOpen(true)}
          >
            <DataTable columns={dcCols} rows={dc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ 代理线封顶"
            subtitle="代理线单日赢额封顶"
            onAdd={() => setAlOpen(true)}
          >
            <DataTable columns={alCols} rows={al} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ 控制介入纪录"
            subtitle="最近 100 笔真实套用结果"
          >
            <DataTable columns={logCols} rows={logs} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
        </div>
      )}

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
  onAdd,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onAdd?: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <span className="label">{title}</span>
          {subtitle && <span className="ml-2 text-[10px] text-ink-500">· {subtitle}</span>}
        </div>
        {onAdd && (
          <button type="button" onClick={onAdd} className="btn-acid text-[11px]">
            + 新增
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function fmt(s: string): string {
  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(s: string): string {
  return `${(Number.parseFloat(s) * 100).toFixed(1)}%`;
}
function formatControlMode(mode: string): string {
  if (mode === 'SINGLE_MEMBER') return '单一会员';
  if (mode === 'AGENT_LINE') return '整条代理线';
  return mode;
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
