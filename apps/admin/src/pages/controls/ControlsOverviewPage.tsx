import { useEffect, useState } from 'react';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatCard } from '@/components/shared/StatCard';
import { DataTable, type Column } from '@/components/shared/DataTable';
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

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [a, b, c, d] = await Promise.all([
          adminApi.get<{ items: WinLossRow[] }>('/controls/win-loss'),
          adminApi.get<{ items: WinCapRow[] }>('/controls/win-cap'),
          adminApi.get<{ items: DepositRow[] }>('/controls/deposit'),
          adminApi.get<{ items: AgentLineRow[] }>('/controls/agent-line'),
        ]);
        if (!cancel) {
          setWl(a.data.items);
          setWc(b.data.items);
          setDc(c.data.items);
          setAl(d.data.items);
        }
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
  ];

  const wcCols: Column<WinCapRow>[] = [
    { key: 'mem', label: 'MEMBER', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'cap', label: 'CAP', align: 'right', render: (r) => <span className="data-num">{fmt(r.winCapAmount)}</span> },
    { key: 'today', label: 'TODAY WIN', align: 'right', render: (r) => <span className="data-num text-neon-amber">{fmt(r.todayWinAmount)}</span> },
    { key: 'rate', label: 'CTRL RATE', align: 'right', render: (r) => <span className="data-num">{pct(r.controlWinRate)}</span> },
    {
      key: 'status',
      label: 'STATUS',
      render: (r) =>
        r.isCapped ? <span className="tag tag-ember">{t.controls.capped}</span> : r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
    },
  ];

  const dcCols: Column<DepositRow>[] = [
    { key: 'mem', label: 'MEMBER', render: (r) => <span className="font-mono">{r.memberUsername}</span> },
    { key: 'dep', label: 'DEPOSIT', align: 'right', render: (r) => <span className="data-num">{fmt(r.depositAmount)}</span> },
    { key: 'target', label: 'TARGET', align: 'right', render: (r) => <span className="data-num text-neon-amber">{fmt(r.targetProfit)}</span> },
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
  ];

  const alCols: Column<AgentLineRow>[] = [
    { key: 'agent', label: 'AGENT', render: (r) => <span className="font-mono">{r.agentUsername}</span> },
    { key: 'cap', label: 'DAILY CAP', align: 'right', render: (r) => <span className="data-num">{fmt(r.dailyCap)}</span> },
    { key: 'today', label: 'TODAY WIN', align: 'right', render: (r) => <span className="data-num text-neon-amber">{fmt(r.todayWinAmount)}</span> },
    {
      key: 'status',
      label: 'STATUS',
      render: (r) =>
        r.isActive ? <span className="tag tag-toxic">{t.controls.active}</span> : <span className="tag tag-ember">{t.controls.off}</span>,
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
        description="⚠ 所有控制都会主动翻转游戏结果并记录审计。Provably-Fair HMAC 原始结果仍会保留于 Bet.resultData。"
      />

      <div className="mb-4 grid gap-4 md:grid-cols-4">
        <StatCard label="WIN/LOSS" value={wl.filter((x) => x.isActive).length.toString()} accent="ember" />
        <StatCard label="WIN CAP" value={wc.filter((x) => x.isActive).length.toString()} accent="amber" />
        <StatCard label="DEPOSIT" value={dc.filter((x) => x.isActive).length.toString()} accent="acid" />
        <StatCard label="AGENT LINE" value={al.filter((x) => x.isActive).length.toString()} accent="toxic" />
      </div>

      {error && (
        <div className="mb-4 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <div className="space-y-6">
          <Section title="§ WIN/LOSS CONTROL" subtitle="按百分比翻转输赢">
            <DataTable columns={wlCols} rows={wl} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section title="§ WIN CAP" subtitle="会员单日赢额封顶">
            <DataTable columns={wcCols} rows={wc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section title="§ DEPOSIT CONTROL" subtitle="依入金目标自动控制胜率">
            <DataTable columns={dcCols} rows={dc} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
          <Section title="§ AGENT LINE CAP" subtitle="代理线单日赢额封顶">
            <DataTable columns={alCols} rows={al} rowKey={(r) => r.id} empty={t.common.empty} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div>
          <span className="label">{title}</span>
          {subtitle && <span className="ml-2 text-[10px] text-ink-500">· {subtitle}</span>}
        </div>
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
