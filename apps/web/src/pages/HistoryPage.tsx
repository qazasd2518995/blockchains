import { useEffect, useMemo, useState } from 'react';
import { getGameMeta } from '@bg/shared';
import type { TransactionListResponse, TransactionType } from '@bg/shared';
import { CalendarDays, Search } from 'lucide-react';
import { api, extractApiError } from '@/lib/api';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const ICON: Record<TransactionType, { color: string; icon: string }> = {
  SIGNUP_BONUS: { color: 'text-win', icon: '✧' },
  BET_PLACE: { color: 'text-[#D4574A]', icon: '▼' },
  BET_WIN: { color: 'text-[#186073]', icon: '▲' },
  CASHOUT: { color: 'text-[#186073]', icon: '⇧' },
  ADJUSTMENT: { color: 'text-[#186073]', icon: '⟲' },
  REBATE: { color: 'text-win', icon: '↻' },
  TRANSFER_IN: { color: 'text-[#186073]', icon: '⇩' },
  TRANSFER_OUT: { color: 'text-[#D4574A]', icon: '⇧' },
};

const DETAIL_LIMIT = 300;

type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth';

type DateRange = {
  from: string;
  to: string;
};

const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'yesterday', label: '昨日' },
  { id: 'thisWeek', label: '本週' },
  { id: 'lastWeek', label: '上週' },
  { id: 'thisMonth', label: '本月' },
];

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const year = Number.parseInt(match[1] ?? '0', 10);
  const month = Number.parseInt(match[2] ?? '1', 10);
  const day = Number.parseInt(match[3] ?? '1', 10);
  return new Date(year, month - 1, day);
}

function startOfLocalDay(value: string): Date {
  const date = parseDateInput(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfLocalDay(value: string): Date {
  const date = parseDateInput(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

function getPresetRange(preset: DatePreset): DateRange {
  const now = new Date();
  const today = startOfLocalDay(toDateInputValue(now));

  if (preset === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const value = toDateInputValue(yesterday);
    return { from: value, to: value };
  }

  if (preset === 'thisWeek') {
    return { from: toDateInputValue(startOfWeek(today)), to: toDateInputValue(today) };
  }

  if (preset === 'lastWeek') {
    const from = startOfWeek(today);
    from.setDate(from.getDate() - 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 6);
    return { from: toDateInputValue(from), to: toDateInputValue(to) };
  }

  if (preset === 'thisMonth') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateInputValue(from), to: toDateInputValue(today) };
  }

  const value = toDateInputValue(today);
  return { from: value, to: value };
}

function normalizeRange(range: DateRange): DateRange {
  if (!range.from || !range.to) return range;
  if (startOfLocalDay(range.from) <= startOfLocalDay(range.to)) return range;
  return { from: range.to, to: range.from };
}

function buildDateParams(range: DateRange): { from?: string; to?: string } {
  return {
    ...(range.from ? { from: startOfLocalDay(range.from).toISOString() } : {}),
    ...(range.to ? { to: endOfLocalDay(range.to).toISOString() } : {}),
  };
}

function summarizeItems(items: TransactionListResponse['items']): TransactionListResponse['summary'] {
  const totalIn = items
    .filter((tx) => Number.parseFloat(tx.amount) > 0)
    .reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0);
  const totalOut = items
    .filter((tx) => Number.parseFloat(tx.amount) < 0)
    .reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0);

  return {
    totalIn: totalIn.toFixed(2),
    totalOut: totalOut.toFixed(2),
    net: (totalIn + totalOut).toFixed(2),
    totalCount: items.length,
  };
}

export function HistoryPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<TransactionListResponse['items']>([]);
  const [reportSummary, setReportSummary] = useState<TransactionListResponse['summary'] | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('today'));
  const [appliedRange, setAppliedRange] = useState<DateRange>(() => getPresetRange('today'));
  const [activePreset, setActivePreset] = useState<DatePreset | null>('today');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = {
      limit: DETAIL_LIMIT,
      ...buildDateParams(appliedRange),
    };

    setLoading(true);
    setError(null);
    api
      .get<TransactionListResponse>('/wallet/transactions', { params })
      .then((res) => {
        if (cancelled) return;
        setItems(res.data.items);
        setReportSummary(res.data.summary ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setReportSummary(null);
        setError(extractApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedRange.from, appliedRange.to]);

  const summary = useMemo(() => reportSummary ?? summarizeItems(items), [items, reportSummary]);
  const totalIn = Number.parseFloat(summary.totalIn);
  const totalOut = Number.parseFloat(summary.totalOut);
  const net = Number.parseFloat(summary.net);
  const appliedRangeText =
    appliedRange.from === appliedRange.to
      ? appliedRange.from
      : `${appliedRange.from} ~ ${appliedRange.to}`;

  const handlePresetClick = (preset: DatePreset) => {
    const nextRange = getPresetRange(preset);
    setDateRange(nextRange);
    setAppliedRange(nextRange);
    setActivePreset(preset);
  };

  const handleSearch = () => {
    const nextRange = normalizeRange(dateRange);
    setDateRange(nextRange);
    setAppliedRange(nextRange);
    setActivePreset(null);
  };

  return (
    <div className="relative space-y-12">
      <section className="relative z-10 border-b border-[#E5E7EB] pb-6">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-[#186073]">{t.history.ledger}</span>
        </div>
        <h1 className="mt-3 text-[32px] font-bold text-[#0F172A]">{t.history.txLog}</h1>
      </section>

      <section className="card-base relative z-10 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#186073]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {t.history.dateSearch}
            </div>
            <div className="mt-1 text-[12px] text-[#4A5568]">
              {t.history.currentRange}: <span className="font-mono text-[#0F172A]">{appliedRangeText}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset.id)}
                className={`rounded-full border px-3 py-2 text-[12px] font-semibold transition ${
                  activePreset === preset.id
                    ? 'border-[#186073] bg-[#186073] text-white shadow-[0_8px_18px_rgba(24,96,115,0.20)]'
                    : 'border-[#D9E3EA] bg-white text-[#186073] hover:border-[#186073]/60 hover:bg-[#F2FAFC]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-[12px] font-semibold text-[#4A5568]">
            {t.history.fromDate}
            <input
              type="date"
              value={dateRange.from}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, from: event.target.value }));
                setActivePreset(null);
              }}
              className="h-11 rounded-[12px] border border-[#D9E3EA] bg-white px-3 font-mono text-[14px] text-[#0F172A] outline-none transition focus:border-[#186073] focus:ring-2 focus:ring-[#186073]/15"
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-[#4A5568]">
            {t.history.toDate}
            <input
              type="date"
              value={dateRange.to}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, to: event.target.value }));
                setActivePreset(null);
              }}
              className="h-11 rounded-[12px] border border-[#D9E3EA] bg-white px-3 font-mono text-[14px] text-[#0F172A] outline-none transition focus:border-[#186073] focus:ring-2 focus:ring-[#186073]/15"
            />
          </label>
          <button
            type="button"
            onClick={handleSearch}
            disabled={!dateRange.from || !dateRange.to || loading}
            className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-[12px] bg-[#186073] px-5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(24,96,115,0.20)] transition hover:bg-[#124D5E] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t.history.search}
          </button>
        </div>
      </section>

      <section className="relative z-10 grid gap-4 md:grid-cols-3">
        <div className="card-base p-5">
          <div className="label text-[#186073]">{t.history.totalIn}</div>
          <div className="mt-2 num text-4xl num-win">+{formatAmount(totalIn)}</div>
        </div>
        <div className="card-base p-5">
          <div className="label text-[#186073]">{t.history.totalOut}</div>
          <div className="mt-2 num text-4xl num-wine">{formatAmount(totalOut)}</div>
        </div>
        <div className="card-base p-5">
          <div className="label text-[#186073]">{t.history.net}</div>
          <div
            className={`mt-2 num text-4xl ${
              net >= 0 ? 'num text-[#C9A247]' : 'num-wine'
            }`}
          >
            {net >= 0 ? '+' : ''}
            {formatAmount(net)}
          </div>
        </div>
      </section>

      {error && (
        <div className="relative z-10 border border-[#D4574A]/40 bg-[#FDF0EE] p-4 text-[12px] text-[#B94538]">
          <span className="font-semibold font-bold italic">{t.common.error}:</span> {error}
        </div>
      )}

      <section className="card-base relative z-10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold text-[#186073]">
              {t.history.showing} {items.length} / {summary.totalCount} {t.history.entries}
            </span>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-6 py-8 font-mono text-[12px] tracking-[0.25em] text-[#4A5568]">
            <span className="dot-online dot-online" />
            {t.common.loading}
            <span className="animate-blink">_</span>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="px-6 py-16 text-center">
            <div className="text-[28px] font-bold text-[#9CA3AF]">{t.history.noRecords}</div>
            <div className="mt-3 text-sm text-[#4A5568]">{t.history.noRecordsInRange}</div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="divide-y divide-brass-500/20">
            <div className="hidden grid-cols-[120px_140px_1fr_auto_auto] items-baseline gap-4 bg-white/50 px-6 py-3 font-mono text-[9px] tracking-[0.3em] text-[#186073] md:grid">
              <span>{t.history.time}</span>
              <span>{t.history.type}</span>
              <span>{t.history.ref}</span>
              <span className="text-right">{t.history.amount}</span>
              <span className="text-right">{t.history.balance}</span>
            </div>
            {items.map((tx) => {
              const meta = ICON[tx.type] ?? ICON.ADJUSTMENT;
              const amount = Number.parseFloat(tx.amount);
              const positive = amount >= 0;
              const profit = tx.profit === null ? null : Number.parseFloat(tx.profit);
              const profitValue = profit ?? 0;
              const hasWinLoss =
                profit !== null && (tx.type === 'BET_WIN' || tx.type === 'CASHOUT');
              const d = new Date(tx.createdAt);
              const time = d.toLocaleTimeString('en-US', { hour12: false });
              const date = d.toLocaleDateString('en-US', {
                month: 'short',
                day: '2-digit',
              });
              return (
                <div
                  key={tx.id}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3 transition hover:bg-[#FAF2D7]/40 md:grid-cols-[120px_140px_1fr_auto_auto]"
                >
                  <div className="font-mono data-num text-[11px]">
                    <div className="text-[#0F172A]">{time}</div>
                    <div className="text-[9px] tracking-[0.2em] text-[#4A5568]">
                      {date.toUpperCase()}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 ${meta.color}`}>
                    <span className="text-lg">{meta.icon}</span>
                    <span className="font-semibold text-[12px] font-semibold tracking-[0.1em]">
                      {hasWinLoss
                        ? t.history.settlement
                        : (t.history.tx[tx.type as keyof typeof t.history.tx] ?? tx.type)}
                    </span>
                  </div>
                  <div className="hidden truncate font-mono text-[11px] text-[#4A5568] md:block">
                    <div>{renderReference(tx.gameId, tx.betId)}</div>
                    {hasWinLoss && tx.betAmount && tx.payout ? (
                      <div className="mt-1 truncate text-[10px] tracking-normal text-[#9CA3AF]">
                        {t.history.stake} {formatAmount(tx.betAmount)} · {t.history.payout}{' '}
                        {formatAmount(tx.payout)}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className={`data-num text-right text-base font-semibold ${
                      positive ? 'text-win' : 'text-[#D4574A]'
                    }`}
                  >
                    <div>
                      {positive ? '+' : ''}
                      {formatAmount(tx.amount)}
                    </div>
                    {hasWinLoss ? (
                      <div
                        className={`mt-1 text-[11px] ${
                          profitValue >= 0 ? 'text-win' : 'text-[#D4574A]'
                        }`}
                      >
                        {t.history.winLoss} {profitValue >= 0 ? '+' : ''}
                        {formatAmount(tx.profit!)}
                      </div>
                    ) : null}
                  </div>
                  <div className="data-num text-right text-[11px] text-[#4A5568]">
                    {formatAmount(tx.balanceAfter)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function renderReference(gameId: string | null, betId: string | null): string {
  const gameName = gameId ? (getGameMeta(gameId)?.nameZh ?? gameId) : null;
  const betRef = betId ? `BET · ${betId.slice(-6).toUpperCase()}` : null;
  if (gameName && betRef) return `${gameName} · ${betRef}`;
  if (gameName) return gameName;
  if (betRef) return betRef;
  return '—';
}
