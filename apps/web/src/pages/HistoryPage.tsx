import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getGameMeta } from '@bg/shared';
import type { BetDetailResponse, TransactionListResponse, TransactionType } from '@bg/shared';
import { CalendarDays, ReceiptText, Search, X } from 'lucide-react';
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

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

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

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function formatTransactionStamp(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: '----/--/--', time: '--:--:--' };
  }

  return {
    date: `${date.getFullYear()}/${padDatePart(date.getMonth() + 1)}/${padDatePart(date.getDate())}`,
    time: `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`,
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
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detailBetId, setDetailBetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BetDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const currentCursor = pageCursors[pageIndex] ?? null;

  useEffect(() => {
    let cancelled = false;
    const params = {
      limit: pageSize,
      ...(currentCursor ? { cursor: currentCursor } : {}),
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
        setNextCursor(res.data.nextCursor);
      })
      .catch((err) => {
        if (cancelled) return;
        setItems([]);
        setReportSummary(null);
        setNextCursor(null);
        setError(extractApiError(err).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedRange.from, appliedRange.to, currentCursor, pageSize]);

  const summary = useMemo(() => reportSummary ?? summarizeItems(items), [items, reportSummary]);
  const totalIn = Number.parseFloat(summary.totalIn);
  const totalOut = Number.parseFloat(summary.totalOut);
  const net = Number.parseFloat(summary.net);
  const totalCount = summary.totalCount;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const displayStart = totalCount === 0 ? 0 : pageIndex * pageSize + 1;
  const displayEnd = Math.min(totalCount, pageIndex * pageSize + items.length);
  const appliedRangeText =
    appliedRange.from === appliedRange.to
      ? appliedRange.from
      : `${appliedRange.from} ~ ${appliedRange.to}`;

  const resetPagination = () => {
    setPageIndex(0);
    setPageCursors([null]);
    setNextCursor(null);
  };

  const handlePresetClick = (preset: DatePreset) => {
    const nextRange = getPresetRange(preset);
    setDateRange(nextRange);
    setAppliedRange(nextRange);
    setActivePreset(preset);
    resetPagination();
  };

  const handleSearch = () => {
    const nextRange = normalizeRange(dateRange);
    setDateRange(nextRange);
    setAppliedRange(nextRange);
    setActivePreset(null);
    resetPagination();
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    resetPagination();
  };

  const handleNextPage = () => {
    if (!nextCursor) return;
    setPageCursors((prev) => {
      const next = prev.slice(0, pageIndex + 1);
      next[pageIndex + 1] = nextCursor;
      return next;
    });
    setPageIndex((idx) => idx + 1);
  };

  const handlePrevPage = () => {
    setPageIndex((idx) => Math.max(0, idx - 1));
  };

  const handleOpenDetail = (betId: string) => {
    setDetailBetId(betId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    api
      .get<BetDetailResponse>(`/wallet/bets/${betId}`)
      .then((res) => {
        setDetail(res.data);
      })
      .catch((err) => {
        setDetailError(extractApiError(err).message);
      })
      .finally(() => {
        setDetailLoading(false);
      });
  };

  const handleCloseDetail = () => {
    setDetailBetId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  };

  return (
    <div className="relative space-y-5 pb-24 sm:space-y-10 sm:pb-0">
      <section className="relative z-10 border-b border-[#E5E7EB] pb-4 sm:pb-6">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-[#186073]">{t.history.ledger}</span>
        </div>
        <h1 className="mt-2 text-[30px] font-bold leading-tight text-[#0F172A] sm:mt-3 sm:text-[32px]">{t.history.txLog}</h1>
      </section>

      <section className="card-base relative z-10 p-4 sm:p-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#186073]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {t.history.dateSearch}
            </div>
            <div className="mt-1 text-[12px] text-[#4A5568]">
              {t.history.currentRange}: <span className="font-mono text-[#0F172A]">{appliedRangeText}</span>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset.id)}
                className={`h-9 rounded-full border px-1 text-[12px] font-semibold transition sm:h-auto sm:px-3 sm:py-2 ${
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

        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <label className="grid gap-1 text-[12px] font-semibold text-[#4A5568]">
            {t.history.fromDate}
            <input
              type="date"
              value={dateRange.from}
              onChange={(event) => {
                setDateRange((prev) => ({ ...prev, from: event.target.value }));
                setActivePreset(null);
              }}
              className="h-11 min-w-0 rounded-[12px] border border-[#D9E3EA] bg-white px-3 font-mono text-[14px] text-[#0F172A] outline-none transition focus:border-[#186073] focus:ring-2 focus:ring-[#186073]/15"
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
              className="h-11 min-w-0 rounded-[12px] border border-[#D9E3EA] bg-white px-3 font-mono text-[14px] text-[#0F172A] outline-none transition focus:border-[#186073] focus:ring-2 focus:ring-[#186073]/15"
            />
          </label>
          <button
            type="button"
            onClick={handleSearch}
            disabled={!dateRange.from || !dateRange.to || loading}
            className="col-span-2 inline-flex h-11 items-center justify-center gap-2 self-end rounded-[12px] bg-[#186073] px-5 text-[13px] font-semibold text-white shadow-[0_10px_22px_rgba(24,96,115,0.20)] transition hover:bg-[#124D5E] disabled:cursor-not-allowed disabled:opacity-50 lg:col-span-1"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t.history.search}
          </button>
        </div>
      </section>

      <section className="relative z-10 grid grid-cols-3 gap-2 sm:gap-4">
        <div className="card-base p-3 sm:p-5">
          <div className="label text-[#186073]">{t.history.totalIn}</div>
          <div className="mt-1 num text-[18px] num-win sm:mt-2 sm:text-4xl">+{formatAmount(totalIn)}</div>
        </div>
        <div className="card-base p-3 sm:p-5">
          <div className="label text-[#186073]">{t.history.totalOut}</div>
          <div className="mt-1 num text-[18px] num-wine sm:mt-2 sm:text-4xl">{formatAmount(totalOut)}</div>
        </div>
        <div className="card-base p-3 sm:p-5">
          <div className="label text-[#186073]">{t.history.net}</div>
          <div
            className={`mt-1 num text-[18px] sm:mt-2 sm:text-4xl ${
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
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-black text-[#186073]">
              顯示 {displayStart} - {displayEnd} / {totalCount} 筆
            </span>
            <span className="text-[12px] font-semibold text-[#718096]">
              第 {pageIndex + 1} / {pageCount} 頁
            </span>
          </div>
          <label className="flex items-center gap-2 text-[13px] font-bold text-[#4A5568]">
            每頁
            <select
              value={pageSize}
              onChange={(event) => handlePageSizeChange(Number(event.target.value))}
              className="h-10 rounded-[12px] border border-[#D9E3EA] bg-white px-3 text-[14px] font-black text-[#0F172A] outline-none transition focus:border-[#186073] focus:ring-2 focus:ring-[#186073]/15"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} 筆
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="hidden grid-cols-[132px_150px_1fr_minmax(160px,auto)_minmax(120px,auto)] items-baseline gap-4 border-b border-[#E5E7EB] bg-white/60 px-6 py-3 text-[12px] font-black tracking-[0.12em] text-[#186073] md:grid">
          <span>{t.history.time}</span>
          <span>{t.history.type}</span>
          <span>{t.history.ref}</span>
          <span className="text-right">{t.history.amount}</span>
          <span className="text-right">{t.history.balance}</span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-4 py-8 font-mono text-[12px] tracking-[0.25em] text-[#4A5568] sm:px-6">
            <span className="dot-online dot-online" />
            {t.common.loading}
            <span className="animate-blink">_</span>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="px-4 py-12 text-center sm:px-6 sm:py-16">
            <div className="text-[24px] font-bold text-[#9CA3AF] sm:text-[28px]">{t.history.noRecords}</div>
            <div className="mt-3 text-sm text-[#4A5568]">{t.history.noRecordsInRange}</div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="divide-y divide-brass-500/20">
            {items.map((tx) => {
              const meta = ICON[tx.type] ?? ICON.ADJUSTMENT;
              const amount = Number.parseFloat(tx.amount);
              const positive = amount >= 0;
              const profit = tx.profit === null ? null : Number.parseFloat(tx.profit);
              const profitValue = profit ?? 0;
              const hasWinLoss =
                profit !== null && (tx.type === 'BET_WIN' || tx.type === 'CASHOUT');
              const stamp = formatTransactionStamp(tx.createdAt);
              return (
                <div
                  key={tx.id}
                  className="grid grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 transition hover:bg-[#FAF2D7]/40 sm:grid-cols-[104px_minmax(0,1fr)_auto] md:grid-cols-[132px_150px_1fr_minmax(160px,auto)_minmax(120px,auto)] md:gap-4 md:px-6 md:py-4"
                >
                  <div className="data-num">
                    <div className="text-[14px] font-black leading-tight text-[#0F172A] sm:text-[15px]">
                      {stamp.time}
                    </div>
                    <div className="mt-1 text-[10px] font-bold leading-tight text-[#4A5568] sm:text-[11px]">
                      {stamp.date}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 ${meta.color}`}>
                    <span className="text-[20px] leading-none">{meta.icon}</span>
                    <div className="min-w-0">
                      <span className="text-[14px] font-black tracking-[0.08em]">
                        {hasWinLoss
                          ? t.history.settlement
                          : (t.history.tx[tx.type as keyof typeof t.history.tx] ?? tx.type)}
                      </span>
                      {tx.betId ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(tx.betId!)}
                          className="mt-1.5 block rounded-full border border-[#186073]/20 bg-white px-2.5 py-1 text-[11px] font-black text-[#186073] md:hidden"
                        >
                          查看開獎
                        </button>
                      ) : null}
                      <div className="mt-1 truncate text-[11px] font-semibold tracking-normal text-[#4A5568] md:hidden">
                        {renderReference(tx.gameId, tx.betId)}
                      </div>
                      {hasWinLoss && tx.betAmount && tx.payout ? (
                        <div className="mt-0.5 truncate text-[11px] font-semibold tracking-normal text-[#718096] md:hidden">
                          {t.history.stake} {formatAmount(tx.betAmount)} · {t.history.payout}{' '}
                          {formatAmount(tx.payout)}
                        </div>
                      ) : null}
                      <div className="mt-0.5 data-num text-[11px] text-[#718096] md:hidden">
                        {t.history.balance} {formatAmount(tx.balanceAfter)}
                      </div>
                    </div>
                  </div>
                  <div className="hidden truncate text-[13px] font-semibold leading-relaxed text-[#4A5568] md:block">
                    <div>{renderReference(tx.gameId, tx.betId)}</div>
                    {hasWinLoss && tx.betAmount && tx.payout ? (
                      <div className="mt-1 truncate text-[12px] tracking-normal text-[#9CA3AF]">
                        {t.history.stake} {formatAmount(tx.betAmount)} · {t.history.payout}{' '}
                        {formatAmount(tx.payout)}
                      </div>
                    ) : null}
                    {tx.betId ? (
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(tx.betId!)}
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#186073]/18 bg-[#F2FAFC] px-2.5 py-1 text-[12px] font-black text-[#186073] transition hover:border-[#186073]/45 hover:bg-white"
                      >
                        <ReceiptText className="h-3 w-3" aria-hidden="true" />
                        查看開獎
                      </button>
                    ) : null}
                  </div>
                  <div
                    className={`data-num text-right text-[16px] font-black sm:text-[17px] ${
                      positive ? 'text-win' : 'text-[#D4574A]'
                    }`}
                  >
                    <div>
                      {positive ? '+' : ''}
                      {formatAmount(tx.amount)}
                    </div>
                    {hasWinLoss ? (
                      <div
                        className={`mt-1 text-[13px] font-black ${
                          profitValue >= 0 ? 'text-win' : 'text-[#D4574A]'
                        }`}
                      >
                        {t.history.winLoss} {profitValue >= 0 ? '+' : ''}
                        {formatAmount(tx.profit!)}
                      </div>
                    ) : null}
                  </div>
                  <div className="hidden data-num text-right text-[15px] font-semibold text-[#4A5568] md:block">
                    {formatAmount(tx.balanceAfter)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && totalCount > 0 && (
          <div className="flex flex-col gap-3 border-t border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-[13px] font-bold text-[#4A5568]">
              第 <span className="data-num text-[#0F172A]">{pageIndex + 1}</span> /{' '}
              <span className="data-num text-[#0F172A]">{pageCount}</span> 頁
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={pageIndex === 0 || loading}
                className="h-10 rounded-[12px] border border-[#D9E3EA] bg-white px-4 text-[13px] font-black text-[#186073] transition hover:border-[#186073]/50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                上一頁
              </button>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={!nextCursor || loading}
                className="h-10 rounded-[12px] border border-[#186073] bg-[#186073] px-4 text-[13px] font-black text-white transition hover:bg-[#124D5E] disabled:cursor-not-allowed disabled:border-[#D9E3EA] disabled:bg-[#EEF2F5] disabled:text-[#9CA3AF]"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </section>

      {detailBetId ? (
        <BetDetailModal
          detail={detail}
          error={detailError}
          loading={detailLoading}
          onClose={handleCloseDetail}
        />
      ) : null}
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

function BetDetailModal({
  detail,
  error,
  loading,
  onClose,
}: {
  detail: BetDetailResponse | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const gameName = detail ? (getGameMeta(detail.gameId)?.nameZh ?? detail.gameId) : '';
  const resultItems = detail ? resultEntries(detail.gameId, detail.resultData) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[#07101C]/70 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
      <div className="max-h-[92svh] w-full overflow-hidden rounded-t-[24px] border border-white/30 bg-white shadow-[0_24px_80px_rgba(7,16,28,0.38)] sm:max-w-3xl sm:rounded-[24px]">
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <div className="text-[12px] font-black uppercase tracking-[0.22em] text-[#186073]">
              開獎詳情
            </div>
            <h2 className="mt-1 text-[22px] font-black text-[#0F172A]">
              {detail ? gameName : '載入中'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#D9E3EA] bg-white text-[#4A5568] transition hover:border-[#186073]/40 hover:text-[#186073]"
            aria-label="關閉"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[calc(92svh-86px)] overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex items-center gap-2 py-10 font-mono text-[12px] tracking-[0.22em] text-[#4A5568]">
              <span className="dot-online" />
              正在載入開獎結果
              <span className="animate-blink">_</span>
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-[16px] border border-[#D4574A]/30 bg-[#FDF0EE] p-4 text-[13px] font-semibold text-[#B94538]">
              {error}
            </div>
          ) : null}

          {!loading && detail ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <DetailMetric label="下注" value={formatAmount(detail.amount)} />
                <DetailMetric label="倍率" value={`${Number(detail.multiplier).toFixed(4)}x`} />
                <DetailMetric label="派彩" value={formatAmount(detail.payout)} />
                <DetailMetric
                  label="盈虧"
                  value={`${Number(detail.profit) >= 0 ? '+' : ''}${formatAmount(detail.profit)}`}
                  tone={Number(detail.profit) >= 0 ? 'win' : 'lose'}
                />
              </div>

              <div className="rounded-[18px] border border-[#D9E3EA] bg-[#F8FBFD] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-[13px] font-black text-[#0F172A]">開獎結果</div>
                  <div className="font-mono text-[10px] tracking-[0.18em] text-[#718096]">
                    BET {detail.id.slice(-8).toUpperCase()}
                  </div>
                </div>

                {resultItems.length > 0 ? (
                  <div className="grid gap-2">
                    {resultItems.map((item) => (
                      <div
                        key={item.key}
                        className="grid gap-1 rounded-[12px] border border-white bg-white/80 px-3 py-2 sm:grid-cols-[140px_1fr] sm:items-start"
                      >
                        <div className="text-[11px] font-black text-[#186073]">{item.label}</div>
                        <div className="min-w-0 break-words text-[12px] leading-relaxed text-[#0F172A]">
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[12px] bg-white px-3 py-4 text-center text-[12px] text-[#718096]">
                    這筆注單沒有額外開獎資料。
                  </div>
                )}
              </div>

              <div className="rounded-[18px] border border-[#D9E3EA] bg-white p-4">
                <div className="mb-3 text-[13px] font-black text-[#0F172A]">驗證資料</div>
                <div className="grid gap-2 text-[12px] text-[#4A5568]">
                  <DetailLine label="局號" value={detail.roundNumber ? `#${detail.roundNumber}` : detail.roundId ?? '—'} />
                  <DetailLine label="狀態" value={detail.status} />
                  <DetailLine label="下注時間" value={formatDateTime(detail.createdAt)} />
                  <DetailLine label="結算時間" value={detail.settledAt ? formatDateTime(detail.settledAt) : '—'} />
                  <DetailLine label="Server Seed Hash" value={detail.serverSeedHash ?? '—'} />
                  <DetailLine label="Client Seed" value={detail.clientSeed ?? '—'} />
                  <DetailLine label="Nonce" value={detail.nonce === null ? '—' : String(detail.nonce)} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'win' | 'lose';
}) {
  const toneClass =
    tone === 'win' ? 'text-win' : tone === 'lose' ? 'text-[#D4574A]' : 'text-[#0F172A]';
  return (
    <div className="rounded-[16px] border border-[#D9E3EA] bg-white p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#718096]">{label}</div>
      <div className={`mt-1 data-num text-[18px] font-black ${toneClass}`}>{value}</div>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[#EEF2F5] pb-2 last:border-b-0 sm:grid-cols-[150px_1fr]">
      <span className="font-black text-[#186073]">{label}</span>
      <span className="break-all font-mono text-[#0F172A]">{value}</span>
    </div>
  );
}

type DisplayCard = {
  rank: number;
  suit: number;
};

type ResultEntry = { key: string; label: string; value: ReactNode };

function resultEntries(gameId: string, value: unknown): ResultEntry[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value === null || value === undefined
      ? []
      : [{ key: 'result', label: '結果', value: formatResultNode('result', value) }];
  }

  const record = value as Record<string, unknown>;
  const friendly = friendlyResultEntries(gameId, record);
  if (friendly.length > 0) return friendly;

  return Object.entries(value as Record<string, unknown>)
    .filter(([key, child]) => !HIDDEN_RESULT_KEYS.has(key) && child !== null && child !== undefined)
    .map(([key, child]) => ({
      key,
      label: RESULT_LABELS[key] ?? key,
      value: formatResultNode(key, child),
    }));
}

const HIDDEN_RESULT_KEYS = new Set(['raw', 'rawRoll', 'rawWon', 'controlled', 'flipReason', 'controlId']);

const RESULT_LABELS: Record<string, string> = {
  roll: '擲出點數',
  target: '目標值',
  direction: '方向',
  winChance: '中獎機率',
  finalWon: '結果',
  drawn: '開獎號碼',
  selected: '選擇號碼',
  hits: '命中號碼',
  hitCount: '命中數',
  risk: '風險',
  segmentIndex: '落點段位',
  segments: '段數',
  multipliers: '倍率表',
  slot: '開獎格',
  bets: '下注內容',
  wins: '中獎項目',
  grid: '盤面',
  lines: '中獎線',
  path: '掉落路徑',
  bucket: '落點槽',
  rows: '列數',
  mineCount: '地雷數',
  minePositions: '地雷位置',
  revealed: '已翻位置',
  hitMine: '是否踩雷',
  hitCell: '踩雷格',
  cashedOut: '是否收分',
  history: '牌序',
  lastGuess: '最後選擇',
  correct: '是否正確',
  dealerHand: '莊家手牌',
  playerHands: '玩家手牌',
  playerCards: '閒家牌',
  bankerCards: '莊家牌',
  bankerHand: '莊家牌',
  dragonCard: '龍牌',
  tigerCard: '虎牌',
  totalPayout: '總派彩',
  rules: '規則',
  source: '來源',
  resultData: '牌局結果',
  roundNumber: '局號',
  crashPoint: '爆點',
  autoCashOut: '自動收分',
  cashoutAt: '收分倍率',
  payout: '派彩',
  status: '狀態',
};

function friendlyResultEntries(gameId: string, record: Record<string, unknown>): ResultEntry[] {
  if (gameId === 'dice') return diceResultEntries(record);
  if (gameId === 'wheel') return wheelResultEntries(record);
  if (gameId === 'plinko') return plinkoResultEntries(record);
  if (isHotlineLikeGame(gameId)) return hotlineResultEntries(record);
  if (gameId === 'keno') return kenoResultEntries(record);
  if (gameId === 'mines') return minesResultEntries(record);
  if (gameId === 'tower') return towerResultEntries(record);
  if (gameId === 'mini-roulette' || gameId === 'carnival') return rouletteResultEntries(record);
  return [];
}

function diceResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const roll = getNumber(record.roll);
  const target = getNumber(record.target);
  const direction = getStringScalar(record.direction);
  const finalWon = getBoolean(record.finalWon ?? record.won);
  const winChance = getNumber(record.winChance);

  return [
    {
      key: 'dice-summary',
      label: '本局結果',
      value: (
        <SummaryStack
          items={[
            direction && target !== undefined ? `投注 ${directionLabel(direction)} ${formatPlainNumber(target)} 點` : null,
            roll !== undefined ? `開出 ${formatPlainNumber(roll)} 點` : null,
            finalWon !== null ? (finalWon ? '結果：命中' : '結果：未命中') : null,
            winChance !== undefined ? `中獎機率 ${formatPlainNumber(winChance)}%` : null,
          ]}
        />
      ),
    },
  ];
}

function compactResultEntries(items: Array<ResultEntry | null>): ResultEntry[] {
  return items.filter((item): item is ResultEntry => item !== null);
}

function wheelResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const segmentIndex = getNumber(record.segmentIndex);
  const segments = getNumber(record.segments);
  const risk = getStringScalar(record.risk);
  const multipliers = getNumberArray(record.multipliers);
  const hitMultiplier = segmentIndex !== undefined ? multipliers[Math.trunc(segmentIndex)] : undefined;

  return compactResultEntries([
    {
      key: 'wheel-summary',
      label: '轉輪結果',
      value: (
        <SummaryStack
          items={[
            segments !== undefined ? `${segments} 段轉輪` : null,
            risk ? `風險：${riskLabel(risk)}` : null,
            segmentIndex !== undefined ? `指針停在第 ${Math.trunc(segmentIndex) + 1} 段` : null,
            hitMultiplier !== undefined ? `開出倍率 ${formatMultiplierValue(hitMultiplier)}` : null,
          ]}
        />
      ),
    },
    multipliers.length > 0
      ? {
          key: 'wheel-paytable',
          label: '倍率表',
          value: <MultiplierStrip multipliers={multipliers} activeIndex={segmentIndex} />,
        }
      : null,
  ]);
}

function plinkoResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const path = getStringArray(record.path);
  const bucket = getNumber(record.bucket);
  const rows = getNumber(record.rows);
  const risk = getStringScalar(record.risk);
  const multipliers = getNumberArray(record.multipliers);
  const hitMultiplier = bucket !== undefined ? multipliers[Math.trunc(bucket)] : undefined;

  return compactResultEntries([
    {
      key: 'plinko-summary',
      label: '掉落結果',
      value: (
        <SummaryStack
          items={[
            rows !== undefined ? `${rows} 列釘盤` : null,
            risk ? `風險：${riskLabel(risk)}` : null,
            bucket !== undefined ? `落在從左數第 ${Math.trunc(bucket) + 1} 格` : null,
            hitMultiplier !== undefined ? `開出倍率 ${formatMultiplierValue(hitMultiplier)}` : null,
          ]}
        />
      ),
    },
    path.length > 0
      ? {
          key: 'plinko-path',
          label: '掉落路徑',
          value: <PathStrip path={path} />,
        }
      : null,
    multipliers.length > 0
      ? {
          key: 'plinko-paytable',
          label: '倍率表',
          value: <MultiplierStrip multipliers={multipliers} activeIndex={bucket} />,
        }
      : null,
  ]);
}

function hotlineResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const grid = getHotlineGrid(record.grid);
  const lines = getHotlineLines(record.lines);
  const totalMultiplier = lines.reduce((sum, line) => sum + line.payout, 0);

  return compactResultEntries([
    grid.length > 0
      ? {
          key: 'hotline-grid',
          label: '盤面',
          value: <HotlineGridView grid={grid} />,
        }
      : null,
    {
      key: 'hotline-lines',
      label: '中獎線',
      value: <HotlineLinesView lines={lines} totalMultiplier={totalMultiplier} />,
    },
  ]);
}

function kenoResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const drawn = getNumberArray(record.drawn);
  const selected = getNumberArray(record.selected);
  const hits = getNumberArray(record.hits);
  const risk = getStringScalar(record.risk);
  return compactResultEntries([
    {
      key: 'keno-summary',
      label: '命中結果',
      value: (
        <SummaryStack
          items={[
            risk ? `風險：${riskLabel(risk)}` : null,
            `命中 ${hits.length} / ${selected.length} 個號碼`,
          ]}
        />
      ),
    },
    selected.length > 0 ? { key: 'keno-selected', label: '選擇號碼', value: <NumberChips numbers={selected} /> } : null,
    drawn.length > 0 ? { key: 'keno-drawn', label: '開獎號碼', value: <NumberChips numbers={drawn} highlight={hits} /> } : null,
    hits.length > 0 ? { key: 'keno-hits', label: '命中號碼', value: <NumberChips numbers={hits} tone="win" /> } : null,
  ]);
}

function minesResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const mineCount = getNumber(record.mineCount);
  const revealed = getNumberArray(record.revealed);
  const minePositions = getNumberArray(record.minePositions);
  const hitMine = getBoolean(record.hitMine);
  const hitCell = getNumber(record.hitCell);
  const cashedOut = getBoolean(record.cashedOut);
  return compactResultEntries([
    {
      key: 'mines-summary',
      label: '本局結果',
      value: (
        <SummaryStack
          items={[
            mineCount !== undefined ? `本局共有 ${mineCount} 顆地雷` : null,
            revealed.length > 0 ? `已翻開 ${revealed.length} 格` : null,
            hitMine === true && hitCell !== undefined ? `踩到第 ${Math.trunc(hitCell) + 1} 格地雷` : null,
            hitMine === false ? '本次翻牌安全' : null,
            cashedOut === true ? '已成功收分' : null,
          ]}
        />
      ),
    },
    revealed.length > 0 ? { key: 'mines-revealed', label: '已翻位置', value: <CellChips cells={revealed} /> } : null,
    minePositions.length > 0 ? { key: 'mines-positions', label: '地雷位置', value: <CellChips cells={minePositions} tone="danger" /> } : null,
  ]);
}

function towerResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const difficulty = getStringScalar(record.difficulty);
  const picks = getNumberArray(record.picks);
  const bustedLevel = getNumber(record.bustedLevel);
  const cashedOut = getBoolean(record.cashedOut);
  return compactResultEntries([
    {
      key: 'tower-summary',
      label: '疊塔結果',
      value: (
        <SummaryStack
          items={[
            difficulty ? `難度：${difficultyLabel(difficulty)}` : null,
            picks.length > 0 ? `已選擇 ${picks.length} 層` : null,
            bustedLevel !== undefined ? `第 ${Math.trunc(bustedLevel) + 1} 層踩到陷阱` : null,
            cashedOut === true ? '已成功收分' : null,
          ]}
        />
      ),
    },
    picks.length > 0 ? { key: 'tower-picks', label: '選擇路徑', value: <CellChips cells={picks} prefix="第" suffix="格" /> } : null,
  ]);
}

function rouletteResultEntries(record: Record<string, unknown>): ResultEntry[] {
  const slot = getNumber(record.slot);
  const wins = Array.isArray(record.wins) ? record.wins : [];
  return [
    {
      key: 'roulette-summary',
      label: '輪盤結果',
      value: (
        <SummaryStack
          items={[
            slot !== undefined ? `開出 ${Math.trunc(slot)} 號` : null,
            wins.length > 0 ? `共有 ${wins.length} 筆下注中獎` : '本局未中獎',
          ]}
        />
      ),
    },
  ];
}

function SummaryStack({ items }: { items: Array<string | null | undefined> }) {
  const visible = items.filter((item): item is string => Boolean(item));
  return (
    <div className="grid gap-2">
      {visible.map((item) => (
        <div
          key={item}
          className="rounded-[10px] border border-[#E7EEF3] bg-white px-3 py-2 text-[12px] font-bold text-[#0F172A]"
        >
          {item}
        </div>
      ))}
    </div>
  );
}

function MultiplierStrip({
  multipliers,
  activeIndex,
}: {
  multipliers: number[];
  activeIndex?: number;
}) {
  const active = activeIndex !== undefined ? Math.trunc(activeIndex) : -1;
  return (
    <div className="flex flex-wrap gap-1.5">
      {multipliers.map((multiplier, index) => (
        <span
          key={`${index}-${multiplier}`}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
            index === active
              ? 'border-[#C9A247] bg-[#FFF4C6] text-[#765709]'
              : 'border-[#D9E3EA] bg-white text-[#4A5568]'
          }`}
        >
          第 {index + 1} 段 · {formatMultiplierValue(multiplier)}
        </span>
      ))}
    </div>
  );
}

function PathStrip({ path }: { path: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {path.map((step, index) => (
        <span
          key={`${step}-${index}`}
          className="rounded-full border border-[#D9E3EA] bg-white px-2.5 py-1 text-[11px] font-bold text-[#0F172A]"
        >
          {index + 1}. {directionStepLabel(step)}
        </span>
      ))}
    </div>
  );
}

function NumberChips({
  numbers,
  highlight = [],
  tone = 'default',
}: {
  numbers: number[];
  highlight?: number[];
  tone?: 'default' | 'win';
}) {
  const highlighted = new Set(highlight.map((number) => Math.trunc(number)));
  return (
    <div className="flex flex-wrap gap-1.5">
      {numbers.map((number) => {
        const normalized = Math.trunc(number);
        const active = tone === 'win' || highlighted.has(normalized);
        return (
          <span
            key={`${normalized}-${active}`}
            className={`flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-[12px] font-black ${
              active
                ? 'border-[#17A34A]/35 bg-[#ECFDF3] text-[#12813A]'
                : 'border-[#D9E3EA] bg-white text-[#0F172A]'
            }`}
          >
            {normalized}
          </span>
        );
      })}
    </div>
  );
}

function CellChips({
  cells,
  tone = 'default',
  prefix = '第',
  suffix = '格',
}: {
  cells: number[];
  tone?: 'default' | 'danger';
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {cells.map((cell, index) => (
        <span
          key={`${cell}-${index}`}
          className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
            tone === 'danger'
              ? 'border-[#D4574A]/35 bg-[#FDF0EE] text-[#B94538]'
              : 'border-[#D9E3EA] bg-white text-[#0F172A]'
          }`}
        >
          {prefix}{Math.trunc(cell) + 1}{suffix}
        </span>
      ))}
    </div>
  );
}

function HotlineGridView({ grid }: { grid: number[][] }) {
  const rows = Math.max(0, ...grid.map((reel) => reel.length));
  const rowIndexes = Array.from({ length: rows }, (_, index) => index);
  return (
    <div className="grid gap-2">
      {rowIndexes.map((rowIndex) => (
        <div key={rowIndex} className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-[10px] font-black text-[#718096]">
            {slotRowLabel(rowIndex)}
          </span>
          {grid.map((reel, reelIndex) => (
            <SlotSymbolChip
              key={`${rowIndex}-${reelIndex}-${reel[rowIndex]}`}
              symbol={reel[rowIndex] ?? 0}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function HotlineLinesView({
  lines,
  totalMultiplier,
}: {
  lines: HotlineWinLineView[];
  totalMultiplier: number;
}) {
  if (lines.length === 0) {
    return (
      <div className="rounded-[12px] border border-[#E7EEF3] bg-white px-3 py-3 text-[12px] font-bold text-[#4A5568]">
        本局沒有形成中獎線。
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="rounded-[12px] border border-[#C9A247]/25 bg-[#FFF8DF] px-3 py-2 text-[12px] font-black text-[#765709]">
        共 {lines.length} 條中獎線，合計 {formatMultiplierValue(totalMultiplier)}
      </div>
      {lines.map((line, index) => (
        <div
          key={`${line.lineId}-${line.startReel}-${line.symbol}-${index}`}
          className="rounded-[12px] border border-[#E7EEF3] bg-white px-3 py-2"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[12px] font-black text-[#0F172A]">
              {paylineLabel(line.lineId)} · {line.direction === 'rtl' ? '由右至左' : '由左至右'}
            </span>
            <span className="rounded-full bg-[#ECFDF3] px-2.5 py-1 text-[11px] font-black text-[#12813A]">
              {formatMultiplierValue(line.payout)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#4A5568]">
            <SlotSymbolChip symbol={line.symbol} />
            <span className="font-bold">連續 {line.count} 個相同符號中獎</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SlotSymbolChip({ symbol }: { symbol: number }) {
  const meta = slotSymbolMeta(symbol);
  return (
    <span
      className="inline-flex min-w-[72px] items-center justify-center rounded-[10px] border px-2.5 py-1 text-[11px] font-black"
      style={{
        borderColor: `${meta.color}55`,
        backgroundColor: `${meta.color}16`,
        color: meta.color,
      }}
    >
      {meta.label}
    </span>
  );
}

type HotlineWinLineView = {
  lineId: string;
  path: number[];
  startReel: number;
  direction: string;
  row: number;
  symbol: number;
  count: number;
  payout: number;
};

function getHotlineGrid(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const grid = value
    .map((reel) => (Array.isArray(reel) ? reel.map((cell) => getNumber(cell)).filter((cell): cell is number => cell !== undefined) : []))
    .filter((reel) => reel.length > 0);
  return grid.length === value.length ? grid : [];
}

function getHotlineLines(value: unknown): HotlineWinLineView[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      return {
        lineId: getStringScalar(record.lineId) ?? 'line',
        path: getNumberArray(record.path),
        startReel: Math.trunc(getNumber(record.startReel) ?? 0),
        direction: getStringScalar(record.direction) ?? 'ltr',
        row: Math.trunc(getNumber(record.row) ?? 0),
        symbol: Math.trunc(getNumber(record.symbol) ?? 0),
        count: Math.trunc(getNumber(record.count) ?? 0),
        payout: getNumber(record.payout) ?? 0,
      };
    })
    .filter((line): line is HotlineWinLineView => Boolean(line));
}

function isHotlineLikeGame(gameId: string): boolean {
  return new Set([
    'hotline',
    'fruit-slot',
    'fortune-slot',
    'ocean-slot',
    'temple-slot',
    'candy-slot',
    'sakura-slot',
  ]).has(gameId);
}

function formatResultNode(key: string, value: unknown): ReactNode {
  const baccarat = getBaccaratCards(value);
  if (baccarat) return <BaccaratCardsView data={baccarat} />;

  const blackjackHands = getBlackjackHands(value);
  if (key === 'playerHands' && blackjackHands.length > 0) {
    return <BlackjackHandsView hands={blackjackHands} />;
  }

  const cards = getCardArray(value);
  if (cards.length > 0) {
    return <CardStrip cards={cards} />;
  }

  const card = normalizeCard(value);
  if (card) {
    return <CardStrip cards={[card]} />;
  }

  return formatResultValue(value);
}

function CardStrip({ cards }: { cards: DisplayCard[] }) {
  return (
    <div className="flex flex-wrap gap-2 py-1">
      {cards.map((card, index) => (
        <PlayingCardSvg key={`${card.rank}-${card.suit}-${index}`} card={card} />
      ))}
    </div>
  );
}

function PlayingCardSvg({ card }: { card: DisplayCard }) {
  const path = getCardAssetPath(card);
  return (
    <img
      src={path}
      alt={cardLabel(card)}
      className="h-[86px] w-[58px] rounded-[6px] object-contain shadow-[0_8px_18px_rgba(15,23,42,0.22)] sm:h-[104px] sm:w-[70px]"
      draggable={false}
      loading="lazy"
    />
  );
}

function BlackjackHandsView({
  hands,
}: {
  hands: Array<{
    id: string;
    cards: DisplayCard[];
    score?: string;
    outcome?: string;
    payout?: string;
    bet?: string;
  }>;
}) {
  return (
    <div className="grid gap-3">
      {hands.map((hand, index) => (
        <div
          key={hand.id || `hand-${index}`}
          className="rounded-[14px] border border-[#D9E3EA] bg-white px-3 py-3"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-black text-[#186073]">手牌 {index + 1}</div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[#4A5568]">
              {hand.score ? <span>點數 {hand.score}</span> : null}
              {hand.outcome ? <span>{hand.outcome}</span> : null}
              {hand.bet ? <span>下注 {formatAmount(hand.bet)}</span> : null}
              {hand.payout ? <span>派彩 {formatAmount(hand.payout)}</span> : null}
            </div>
          </div>
          <CardStrip cards={hand.cards} />
        </div>
      ))}
    </div>
  );
}

function BaccaratCardsView({
  data,
}: {
  data: {
    playerCards?: DisplayCard[];
    bankerCards?: DisplayCard[];
    dragonCard?: DisplayCard;
    tigerCard?: DisplayCard;
    playerPoints?: string | number;
    bankerPoints?: string | number;
    winner?: string;
    result?: string;
  };
}) {
  return (
    <div className="grid gap-3">
      {data.playerCards && data.playerCards.length > 0 ? (
        <CardGroup
          title="閒家"
          subtitle={data.playerPoints !== undefined ? `${data.playerPoints} 點` : undefined}
          cards={data.playerCards}
        />
      ) : null}
      {data.bankerCards && data.bankerCards.length > 0 ? (
        <CardGroup
          title="莊家"
          subtitle={data.bankerPoints !== undefined ? `${data.bankerPoints} 點` : undefined}
          cards={data.bankerCards}
        />
      ) : null}
      {data.dragonCard ? <CardGroup title="龍" cards={[data.dragonCard]} /> : null}
      {data.tigerCard ? <CardGroup title="虎" cards={[data.tigerCard]} /> : null}
      {data.winner || data.result ? (
        <div className="rounded-[12px] border border-[#C9A247]/25 bg-[#FFF8DF] px-3 py-2 text-[12px] font-black text-[#765709]">
          結果 {data.winner ?? data.result}
        </div>
      ) : null}
    </div>
  );
}

function CardGroup({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle?: string;
  cards: DisplayCard[];
}) {
  return (
    <div className="rounded-[14px] border border-[#D9E3EA] bg-white px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-[11px] font-black text-[#186073]">{title}</div>
        {subtitle ? <div className="font-mono text-[10px] text-[#4A5568]">{subtitle}</div> : null}
      </div>
      <CardStrip cards={cards} />
    </div>
  );
}

function getBaccaratCards(value: unknown): {
  playerCards?: DisplayCard[];
  bankerCards?: DisplayCard[];
  dragonCard?: DisplayCard;
  tigerCard?: DisplayCard;
  playerPoints?: string | number;
  bankerPoints?: string | number;
  winner?: string;
  result?: string;
} | null {
  const record = asRecord(value);
  if (!record) return null;

  const playerCards = getCardArray(
    record.playerCards ?? record.playerHand ?? record.player ?? record.idleCards,
  );
  const bankerCards = getCardArray(
    record.bankerCards ?? record.bankerHand ?? record.banker ?? record.dealerCards,
  );
  const dragonCard = normalizeCard(record.dragonCard ?? record.dragon);
  const tigerCard = normalizeCard(record.tigerCard ?? record.tiger);

  if (
    playerCards.length === 0 &&
    bankerCards.length === 0 &&
    !dragonCard &&
    !tigerCard
  ) {
    return null;
  }

  return {
    playerCards: playerCards.length > 0 ? playerCards : undefined,
    bankerCards: bankerCards.length > 0 ? bankerCards : undefined,
    dragonCard: dragonCard ?? undefined,
    tigerCard: tigerCard ?? undefined,
    playerPoints: getScalar(record.playerPoints ?? record.playerScore ?? record.playerPoint),
    bankerPoints: getScalar(record.bankerPoints ?? record.bankerScore ?? record.bankerPoint),
    winner: getStringScalar(record.winner ?? record.outcome),
    result: getStringScalar(record.result),
  };
}

function getBlackjackHands(value: unknown): Array<{
  id: string;
  cards: DisplayCard[];
  score?: string;
  outcome?: string;
  payout?: string;
  bet?: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;
      const cards = getCardArray(record.cards);
      if (cards.length === 0) return null;
      const score = asRecord(record.score);
      const total = getScalar(score?.total);
      const soft = score?.soft === true ? ' SOFT' : '';
      return {
        id: getStringScalar(record.id) ?? `hand-${index}`,
        cards,
        score: total !== undefined ? `${total}${soft}` : undefined,
        outcome: getStringScalar(record.outcome ?? record.status),
        payout: getStringScalar(record.payout),
        bet: getStringScalar(record.bet),
      };
    })
    .filter((hand): hand is NonNullable<typeof hand> => Boolean(hand));
}

function getCardArray(value: unknown): DisplayCard[] {
  if (!Array.isArray(value)) return [];
  const cards = value.map((item) => normalizeCard(item)).filter((card): card is DisplayCard => Boolean(card));
  return cards.length === value.length ? cards : [];
}

function normalizeCard(value: unknown): DisplayCard | null {
  const record = asRecord(value);
  if (!record) return null;

  const rank = normalizeRank(record.rank ?? record.value ?? record.cardRank);
  const suit = normalizeSuit(record.suit ?? record.cardSuit);
  if (rank === null || suit === null) return null;
  return { rank, suit };
}

function normalizeRank(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 13) {
    return value;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'a' || normalized === 'ace') return 1;
  if (normalized === 'j' || normalized === 'jack') return 11;
  if (normalized === 'q' || normalized === 'queen') return 12;
  if (normalized === 'k' || normalized === 'king') return 13;
  const numeric = Number.parseInt(normalized, 10);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 13 ? numeric : null;
}

function normalizeSuit(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3) {
    return value;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, number> = {
    spade: 0,
    spades: 0,
    s: 0,
    '♠': 0,
    heart: 1,
    hearts: 1,
    h: 1,
    '♥': 1,
    diamond: 2,
    diamonds: 2,
    d: 2,
    '♦': 2,
    club: 3,
    clubs: 3,
    c: 3,
    '♣': 3,
  };
  return aliases[normalized] ?? null;
}

const CARD_FILE_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;
const CARD_FILE_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

function getCardAssetPath(card: DisplayCard): string {
  const rank = CARD_FILE_RANKS[card.rank - 1] ?? 'ace';
  const suit = CARD_FILE_SUITS[card.suit] ?? 'spades';
  return `/cards/${rank}_of_${suit}.svg`;
}

function cardLabel(card: DisplayCard): string {
  const rank = CARD_FILE_RANKS[card.rank - 1] ?? String(card.rank);
  const suit = CARD_FILE_SUITS[card.suit] ?? String(card.suit);
  return `${rank} of ${suit}`;
}

function formatResultValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.map((item) => formatResultValue(item)).join(', ');
    }
    return safeJson(value);
  }
  if (value && typeof value === 'object') return safeJson(value);
  return String(value ?? '—');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getScalar(value: unknown): string | number | undefined {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}

function getStringScalar(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }
  return undefined;
}

function getBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'win', 'won'].includes(normalized)) return true;
    if (['false', 'no', 'lose', 'lost'].includes(normalized)) return false;
  }
  return null;
}

function getNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => getNumber(item)).filter((item): item is number => item !== undefined);
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => getStringScalar(item)).filter((item): item is string => Boolean(item));
}

function formatPlainNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function formatMultiplierValue(value: number): string {
  return `${formatPlainNumber(value)}x`;
}

function directionLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'over') return '大於';
  if (normalized === 'under') return '小於';
  return value;
}

function directionStepLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'left') return '左';
  if (normalized === 'right') return '右';
  return value;
}

function riskLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'low') return '低';
  if (normalized === 'medium') return '中';
  if (normalized === 'high') return '高';
  return value;
}

function difficultyLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'easy') return '簡單';
  if (normalized === 'medium') return '中等';
  if (normalized === 'hard') return '困難';
  if (normalized === 'expert') return '專家';
  if (normalized === 'master') return '大師';
  return value;
}

function slotRowLabel(index: number): string {
  if (index === 0) return '上排';
  if (index === 1) return '中排';
  if (index === 2) return '下排';
  return `第 ${index + 1} 排`;
}

function paylineLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    top: '上排線',
    middle: '中排線',
    bottom: '下排線',
    'v-down': 'V 型下折線',
    'v-up': 'V 型上折線',
    'diag-down': '左上到右下斜線',
    'diag-up': '左下到右上斜線',
  };
  return labels[normalized] ?? value;
}

function slotSymbolMeta(symbol: number): { label: string; color: string } {
  const symbols = [
    { label: '櫻桃', color: '#D43C63' },
    { label: '金鈴', color: '#D98E26' },
    { label: '七號', color: '#C9A24C' },
    { label: 'BAR', color: '#2B8CA8' },
    { label: '寶石', color: '#1E8E67' },
    { label: '頭獎', color: '#B52A45' },
  ];
  return symbols[Math.trunc(symbol)] ?? { label: `符號 ${symbol}`, color: '#186073' };
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-TW', { hour12: false });
}
