import { useEffect, useMemo, useState } from 'react';
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
  const [detailBetId, setDetailBetId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BetDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
                    <div className="min-w-0">
                      <span className="font-semibold text-[12px] font-semibold tracking-[0.1em]">
                        {hasWinLoss
                          ? t.history.settlement
                          : (t.history.tx[tx.type as keyof typeof t.history.tx] ?? tx.type)}
                      </span>
                      {tx.betId ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDetail(tx.betId!)}
                          className="mt-1 block rounded-full border border-[#186073]/20 bg-white px-2 py-1 text-[10px] font-semibold text-[#186073] md:hidden"
                        >
                          查看開獎
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="hidden truncate font-mono text-[11px] text-[#4A5568] md:block">
                    <div>{renderReference(tx.gameId, tx.betId)}</div>
                    {hasWinLoss && tx.betAmount && tx.payout ? (
                      <div className="mt-1 truncate text-[10px] tracking-normal text-[#9CA3AF]">
                        {t.history.stake} {formatAmount(tx.betAmount)} · {t.history.payout}{' '}
                        {formatAmount(tx.payout)}
                      </div>
                    ) : null}
                    {tx.betId ? (
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(tx.betId!)}
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#186073]/18 bg-[#F2FAFC] px-2 py-1 text-[10px] font-semibold text-[#186073] transition hover:border-[#186073]/45 hover:bg-white"
                      >
                        <ReceiptText className="h-3 w-3" aria-hidden="true" />
                        查看開獎
                      </button>
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
  const resultItems = detail ? resultEntries(detail.resultData) : [];

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
                        <div className="break-words font-mono text-[12px] leading-relaxed text-[#0F172A]">
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

function resultEntries(value: unknown): Array<{ key: string; label: string; value: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value === null || value === undefined
      ? []
      : [{ key: 'result', label: '結果', value: formatResultValue(value) }];
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== null && child !== undefined)
    .map(([key, child]) => ({
      key,
      label: RESULT_LABELS[key] ?? key,
      value: formatResultValue(child),
    }));
}

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

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-TW', { hour12: false });
}
