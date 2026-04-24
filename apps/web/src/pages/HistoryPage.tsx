import { useEffect, useState } from 'react';
import { getGameMeta } from '@bg/shared';
import type { TransactionListResponse, TransactionType } from '@bg/shared';
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

export function HistoryPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<TransactionListResponse['items']>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<TransactionListResponse>('/wallet/transactions', { params: { limit: 100 } })
      .then((res) => setItems(res.data.items))
      .catch((err) => setError(extractApiError(err).message))
      .finally(() => setLoading(false));
  }, []);

  const totalIn = items
    .filter((t) => Number.parseFloat(t.amount) > 0)
    .reduce((s, t) => s + Number.parseFloat(t.amount), 0);
  const totalOut = items
    .filter((t) => Number.parseFloat(t.amount) < 0)
    .reduce((s, t) => s + Number.parseFloat(t.amount), 0);

  return (
    <div className="relative space-y-12">
      <section className="relative z-10 border-b border-[#E5E7EB] pb-6">
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold text-[#186073]">{t.history.ledger}</span>
        </div>
        <h1 className="mt-3 text-[32px] font-bold text-[#0F172A]">{t.history.txLog}</h1>
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
              totalIn + totalOut >= 0 ? 'num text-[#C9A247]' : 'num-wine'
            }`}
          >
            {totalIn + totalOut >= 0 ? '+' : ''}
            {formatAmount(totalIn + totalOut)}
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
              {t.history.showing} {items.length} {t.history.entries}
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
            <div className="mt-3 text-sm text-[#4A5568]">{t.history.placeFirst}</div>
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
                      {t.history.tx[tx.type as keyof typeof t.history.tx] ?? tx.type}
                    </span>
                  </div>
                  <div className="hidden truncate font-mono text-[11px] text-[#4A5568] md:block">
                    {renderReference(tx.gameId, tx.betId)}
                  </div>
                  <div
                    className={`data-num text-right text-base font-semibold ${
                      positive ? 'text-win' : 'text-[#D4574A]'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {formatAmount(tx.amount)}
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
