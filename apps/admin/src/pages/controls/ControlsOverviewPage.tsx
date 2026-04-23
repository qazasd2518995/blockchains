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

export function ControlsOverviewPage(): JSX.Element {
  const { t } = useTranslation();
  const [wl, setWl] = useState<WinLossRow[]>([]);
  const [wc, setWc] = useState<WinCapRow[]>([]);
  const [dc, setDc] = useState<DepositRow[]>([]);
  const [al, setAl] = useState<AgentLineRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wlOpen, setWlOpen] = useState(false);
  const [wcOpen, setWcOpen] = useState(false);
  const [dcOpen, setDcOpen] = useState(false);
  const [alOpen, setAlOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [a, b, c, d] = await Promise.all([
        adminApi.get<{ items: WinLossRow[] }>('/controls/win-loss'),
        adminApi.get<{ items: WinCapRow[] }>('/controls/win-cap'),
        adminApi.get<{ items: DepositRow[] }>('/controls/deposit'),
        adminApi.get<{ items: AgentLineRow[] }>('/controls/agent-line'),
      ]);
      setWl(a.data.items);
      setWc(b.data.items);
      setDc(c.data.items);
      setAl(d.data.items);
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
    if (!window.confirm('確定刪除此控制規則？')) return;
    try {
      await adminApi.delete(`/controls/${kind}/${id}`);
      await reload();
    } catch (e) {
      setError(extractApiError(e).message);
    }
  };

  const wlCols: Column<WinLossRow>[] = [
    { key: 'mode', label: 'MODE', render: (r) => <span className="tag tag-acid">{r.controlMode}</span> },
    { key: 'target', label: 'TARGET', render: (r) => <span className="font-mono text-[11px]">{r.targetUsername ?? '—'}</span> },
    { key: 'pct', label: 'PCT', align: 'right', render: (r) => <span className="data-num">{r.controlPercentage}%</span> },
    {
      key: 'mode2',
      label: 'FLAGS',
      render: (r) => (
        <div className="flex gap-1 text-[10px]">
          {r.winControl && <span className="tag tag-toxic">{t.controls.win}</span>}
          {r.lossControl && <span className="tag tag-ember">{t.controls.loss}</span>}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (r) =>
        r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: 'OPS',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('win-loss', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '啟用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('win-loss', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            刪除
          </button>
        </div>
      ),
    },
  ];

  const wcCols: Column<WinCapRow>[] = [
    { key: 'mem', label: 'MEMBER', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'cap', label: 'CAP', align: 'right', render: (r) => <span className="data-num">{fmt(r.winCapAmount)}</span> },
    { key: 'today', label: 'TODAY WIN', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span> },
    { key: 'rate', label: 'CTRL RATE', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: 'STATUS',
      render: (r) =>
        r.isCapped ? <span className="tag tag-ember">{t.controls.capped}</span> : r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: 'OPS',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('win-cap', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '啟用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('win-cap', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            刪除
          </button>
        </div>
      ),
    },
  ];

  const dcCols: Column<DepositRow>[] = [
    { key: 'mem', label: 'MEMBER', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'dep', label: 'DEPOSIT', align: 'right', render: (r) => <span className="data-num">{fmt(r.depositAmount)}</span> },
    { key: 'target', label: 'TARGET', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.targetProfit)}</span> },
    { key: 'rate', label: 'CTRL RATE', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: 'STATUS',
      render: (r) =>
        r.isCompleted
          ? <span className="tag tag-acid">{t.controls.done}</span>
          : r.isActive
            ? <span className="tag tag-toxic">{t.controls.active}</span>
            : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: 'OPS',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('deposit', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '啟用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('deposit', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            刪除
          </button>
        </div>
      ),
    },
  ];

  const alCols: Column<AgentLineRow>[] = [
    { key: 'agent', label: 'AGENT', render: (r) => <span className="font-mono">{r.agentUsername}</span> },
    { key: 'cap', label: 'DAILY CAP', align: 'right', render: (r) => <span className="data-num">{fmt(r.dailyCap)}</span> },
    { key: 'today', label: 'TODAY WIN', align: 'right', render: (r) => <span className="data-num text-[#AE8B35]">{fmt(r.todayWinAmount)}</span> },
    {
      key: 'status',
      label: 'STATUS',
      render: (r) =>
        r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
    {
      key: 'ops',
      label: 'OPS',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1 text-[10px]">
          <button
            type="button"
            onClick={() => toggleRow('agent-line', r.id, r.isActive)}
            className="btn-teal-outline px-2 py-1"
          >
            {r.isActive ? '停用' : '啟用'}
          </button>
          <button
            type="button"
            onClick={() => deleteRow('agent-line', r.id)}
            className="btn-teal-outline border-[#D4574A]/40 px-2 py-1 text-[#D4574A]"
          >
            刪除
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        section="§ OPS 06"
        breadcrumb={`${t.nav.controls} / 总览`}
        title={t.nav.controls}
        titleSuffix="输赢控制"
        titleSuffixColor="ember"
        description="⚠ 所有控制操作都会主动调整游戏结果并完整记录到审计日志。原始结果会保留于注单数据中以备稽核。"
      />

      <ImageBanner
        image="/banners/controls-risk-host.png"
        eyebrow="Risk Control Desk"
        title="先看哪條控制規則在線，再決定今天要不要動手。"
        description="這一頁專門用來盯住輸贏控制、會員封頂、入金控制與代理線封頂。畫面先給總覽，避免你在多張表之間來回切，調整前也能先確認哪些規則仍在生效。"
        tone="ember"
      />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <StatCard label="WIN/LOSS" value={wl.filter((x) => x.isActive).length.toString()} accent="ember" />
        <StatCard label="WIN CAP" value={wc.filter((x) => x.isActive).length.toString()} accent="amber" />
        <StatCard label="DEPOSIT" value={dc.filter((x) => x.isActive).length.toString()} accent="acid" />
        <StatCard label="AGENT LINE" value={al.filter((x) => x.isActive).length.toString()} accent="toxic" />
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
            title="§ WIN/LOSS CONTROL"
            subtitle="按百分比翻转输赢"
            onAdd={() => setWlOpen(true)}
          >
            <DataTable columns={wlCols} rows={wl} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ WIN CAP"
            subtitle="会员单日赢额封顶"
            onAdd={() => setWcOpen(true)}
          >
            <DataTable columns={wcCols} rows={wc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ DEPOSIT CONTROL"
            subtitle="依入金目标自动控制胜率"
            onAdd={() => setDcOpen(true)}
          >
            <DataTable columns={dcCols} rows={dc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section
            title="§ AGENT LINE CAP"
            subtitle="代理线单日赢额封顶"
            onAdd={() => setAlOpen(true)}
          >
            <DataTable columns={alCols} rows={al} rowKey={(r) => r.id} empty={t.common.empty} />
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
