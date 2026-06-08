import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ScrollText } from 'lucide-react';
import type { PointTransferTypeDto } from '@bg/shared';
import { adminApi, extractApiError } from '@/lib/adminApi';
import { useAdminAuthStore } from '@/stores/adminAuthStore';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { useTranslation } from '@/i18n/useTranslation';

type TransferTypeFilter = 'ALL' | PointTransferTypeDto;

type TransferLogAction =
  | 'AGENT_TRANSFER_OUT'
  | 'AGENT_TRANSFER_IN'
  | 'AGENT_TRANSFER'
  | 'MEMBER_DEPOSIT'
  | 'MEMBER_WITHDRAW'
  | 'CS_AGENT_ADJUST'
  | 'CS_MEMBER_ADJUST'
  | 'REBATE_PAYOUT'
  | 'UNKNOWN';

interface TransferLogParty {
  type: string;
  id: string;
  username: string | null;
  displayName: string | null;
  label: string;
}

interface OperatorTransferLogEntry {
  id: string;
  type: PointTransferTypeDto;
  action: TransferLogAction;
  operatorUsername: string;
  from: TransferLogParty;
  to: TransferLogParty;
  amount: string;
  signedAmount: string;
  operatorBalanceBefore: string | null;
  operatorBalanceAfter: string | null;
  description: string | null;
  createdAt: string;
}

interface OperatorTransferLogResponse {
  items: OperatorTransferLogEntry[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;
const TYPE_FILTERS: PointTransferTypeDto[] = [
  'AGENT_TO_AGENT',
  'AGENT_TO_MEMBER',
  'MEMBER_TO_AGENT',
  'CS_AGENT_TRANSFER',
  'CS_MEMBER_TRANSFER',
  'REBATE_PAYOUT',
];

export function AgentLogsPage(): JSX.Element {
  const { t } = useTranslation();
  const { agent } = useAdminAuthStore();
  const [items, setItems] = useState<OperatorTransferLogEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TransferTypeFilter>('ALL');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshSeq, setRefreshSeq] = useState(0);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    const params = buildLogParams(typeFilter);
    void adminApi
      .get<OperatorTransferLogResponse>('/transfers/my-logs', { params })
      .then((res) => {
        if (cancel) return;
        setItems(res.data.items);
        setNextCursor(res.data.nextCursor);
      })
      .catch((err) => {
        if (!cancel) setError(extractApiError(err).message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });

    return () => {
      cancel = true;
    };
  }, [refreshSeq, typeFilter]);

  const loadMore = async (): Promise<void> => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await adminApi.get<OperatorTransferLogResponse>('/transfers/my-logs', {
        params: buildLogParams(typeFilter, nextCursor),
      });
      setItems((current) => [...current, ...res.data.items]);
      setNextCursor(res.data.nextCursor);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const stats = useMemo(() => summarizeLogs(items), [items]);
  const columns = useMemo<Column<OperatorTransferLogEntry>[]>(
    () => [
      {
        key: 'time',
        label: t.transfers.timestamp,
        width: '150px',
        render: (row) => (
          <span className="data-num text-[11px] text-ink-500">
            {formatDateTime(row.createdAt)}
          </span>
        ),
      },
      {
        key: 'operator',
        label: t.logs.operator,
        render: (row) => (
          <span className="font-mono text-[12px] font-semibold text-ink-900">
            {row.operatorUsername}
          </span>
        ),
      },
      {
        key: 'action',
        label: t.logs.action,
        render: (row) => <span className="tag tag-acid">{t.logs.actions[row.action]}</span>,
      },
      {
        key: 'party',
        label: t.logs.counterparty,
        render: (row) => (
          <div className="min-w-[170px]">
            <div className="font-semibold text-ink-900">{resolveCounterparty(row)}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-400">
              {row.from.type} → {row.to.type}
            </div>
          </div>
        ),
      },
      {
        key: 'amount',
        label: t.logs.amount,
        align: 'right',
        render: (row) => {
          const value = Number.parseFloat(row.signedAmount);
          const isIn = value > 0;
          const isOut = value < 0;
          return (
            <span
              className={`data-num text-[13px] font-semibold ${
                isIn ? 'text-win' : isOut ? 'text-[#D4574A]' : 'text-[#186073]'
              }`}
            >
              {formatSigned(row.signedAmount)}
            </span>
          );
        },
      },
      {
        key: 'balance',
        label: t.logs.balance,
        align: 'right',
        render: (row) =>
          row.operatorBalanceBefore && row.operatorBalanceAfter ? (
            <div className="data-num text-[11px] text-ink-600">
              {formatAmount(row.operatorBalanceBefore)} → {formatAmount(row.operatorBalanceAfter)}
            </div>
          ) : (
            <span className="text-[11px] text-ink-400">{t.logs.agentBalanceUnavailable}</span>
          ),
      },
      {
        key: 'desc',
        label: t.logs.descriptionLabel,
        render: (row) => (
          <span className="block max-w-[220px] truncate text-[11px] text-ink-600">
            {row.description ?? '—'}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <div>
      <PageHeader
        section={t.logs.section}
        breadcrumb={t.logs.breadcrumb}
        title={t.logs.title}
        titleSuffix={t.logs.subtitle}
        description={t.logs.description}
        rightSlot={
          <button
            type="button"
            onClick={() => setRefreshSeq((current) => current + 1)}
            className="btn-teal-outline inline-flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t.logs.refresh}
          </button>
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <LogStatCard label={t.logs.loaded} value={`${items.length}`} hint={t.logs.entries} />
        <LogStatCard label={t.logs.totalIn} value={formatAmount(stats.inAmount)} tone="win" />
        <LogStatCard label={t.logs.totalOut} value={formatAmount(stats.outAmount)} tone="loss" />
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-[8px] border border-[#186073]/15 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-ink-500 sm:w-80">
          {t.logs.filter}
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as TransferTypeFilter)}
            className="h-11 rounded-[6px] border border-[#D5DEE8] bg-white px-3 font-semibold text-ink-900 outline-none focus:border-[#186073]"
          >
            <option value="ALL">{t.logs.allTypes}</option>
            {TYPE_FILTERS.map((type) => (
              <option key={type} value={type}>
                {t.logs.typeFilters[type]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-ink-500">
          <ScrollText className="h-4 w-4 text-[#186073]" />
          {agent?.username ?? t.logs.operator}
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-[#D4574A]/40 bg-[#FDF0EE] p-3 text-[12px] text-[#D4574A]">
          ⚠ {error}
        </div>
      )}

      {loading ? (
        <div className="crt-panel p-8 text-center text-ink-500">{t.common.loading}…</div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
            empty={t.logs.noLogs}
          />
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="btn-teal-outline inline-flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loadingMore ? 'animate-spin' : ''}`} />
                {loadingMore ? t.common.loading : t.logs.loadMore}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function buildLogParams(typeFilter: TransferTypeFilter, cursor?: string): Record<string, string> {
  return {
    limit: String(PAGE_SIZE),
    ...(typeFilter !== 'ALL' ? { type: typeFilter } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

function summarizeLogs(items: OperatorTransferLogEntry[]): { inAmount: string; outAmount: string } {
  let inAmount = 0;
  let outAmount = 0;
  for (const item of items) {
    const amount = Number.parseFloat(item.signedAmount);
    if (!Number.isFinite(amount)) continue;
    if (amount > 0) inAmount += amount;
    if (amount < 0) outAmount += Math.abs(amount);
  }
  return { inAmount: inAmount.toFixed(2), outAmount: outAmount.toFixed(2) };
}

function resolveCounterparty(row: OperatorTransferLogEntry): string {
  if (row.action === 'MEMBER_DEPOSIT') return row.to.label;
  if (row.action === 'MEMBER_WITHDRAW') return row.from.label;
  if (row.action === 'AGENT_TRANSFER_OUT') return row.to.label;
  if (row.action === 'AGENT_TRANSFER_IN') return row.from.label;
  if (row.action === 'CS_AGENT_ADJUST' || row.action === 'CS_MEMBER_ADJUST') return row.to.label;
  return `${row.from.label} → ${row.to.label}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatSigned(value: string): string {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return '0.00';
  const prefix = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${prefix}${formatAmount(Math.abs(amount).toFixed(2))}`;
}

function formatAmount(value: string): string {
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LogStatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'win' | 'loss';
}): JSX.Element {
  const toneClass =
    tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-[#D4574A]' : 'text-[#186073]';
  return (
    <div className="card-base rounded-[8px] p-4">
      <div className="text-[11px] font-semibold tracking-[0.16em] text-ink-500">{label}</div>
      <div className={`mt-2 data-num text-2xl font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-[11px] text-ink-400">{hint}</div>}
    </div>
  );
}
