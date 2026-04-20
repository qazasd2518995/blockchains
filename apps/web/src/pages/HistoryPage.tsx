import { useEffect, useState } from 'react';
import type { TransactionListResponse, TransactionType } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const ICON: Record<TransactionType, { color: string; icon: string }> = {
  SIGNUP_BONUS: { color: 'text-win', icon: '✧' },
  BET_PLACE: { color: 'text-wine-500', icon: '▼' },
  BET_WIN: { color: 'text-brass-700', icon: '▲' },
  CASHOUT: { color: 'text-brass-700', icon: '⇧' },
  ADJUSTMENT: { color: 'text-felt-500', icon: '⟲' },
  REBATE: { color: 'text-win', icon: '↻' },
  TRANSFER_IN: { color: 'text-brass-700', icon: '⇩' },
  TRANSFER_OUT: { color: 'text-wine-500', icon: '⇧' },
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
      <div className="crystal-overlay" />

      <section className="relative z-10 border-b border-brass-500/40 pb-6">
        <div className="flex items-center gap-3">
          <span className="font-script text-lg text-brass-700">{t.history.ledger}</span>
          <span className="text-brass-500">◆</span>
          <span className="label label-brass">registre</span>
        </div>
        <h1 className="mt-3 font-serif text-6xl leading-[0.95] text-ivory-950">
          <span className="italic text-brass-700">{t.history.txLog}</span>
        </h1>
      </section>

      <section className="relative z-10 grid gap-4 md:grid-cols-3">
        <div className="panel-salon p-5">
          <div className="label label-brass">{t.history.totalIn}</div>
          <div className="mt-2 big-num text-4xl big-num-win">+{formatAmount(totalIn)}</div>
        </div>
        <div className="panel-salon p-5">
          <div className="label label-brass">{t.history.totalOut}</div>
          <div className="mt-2 big-num text-4xl big-num-wine">{formatAmount(totalOut)}</div>
        </div>
        <div className="panel-salon p-5">
          <div className="label label-brass">{t.history.net}</div>
          <div
            className={`mt-2 big-num text-4xl ${
              totalIn + totalOut >= 0 ? 'big-num-brass' : 'big-num-wine'
            }`}
          >
            {totalIn + totalOut >= 0 ? '+' : ''}
            {formatAmount(totalIn + totalOut)}
          </div>
        </div>
      </section>

      {error && (
        <div className="relative z-10 border border-wine-400/50 bg-wine-50 p-4 text-[12px] text-wine-600">
          <span className="font-serif font-bold italic">{t.common.error}:</span> {error}
        </div>
      )}

      <section className="panel-salon relative z-10 overflow-hidden">
        <div className="flex items-center justify-between border-b border-brass-500/40 px-6 py-3">
          <div className="flex items-baseline gap-2">
            <span className="font-script text-base text-brass-700">Entries</span>
            <span className="text-brass-500 text-xs">◆</span>
            <span className="label label-brass">
              {t.history.showing} {items.length} {t.history.entries}
            </span>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-6 py-8 font-mono text-[12px] tracking-[0.25em] text-ivory-700">
            <span className="status-dot status-dot-live" />
            {t.common.loading}
            <span className="animate-blink">_</span>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="px-6 py-16 text-center">
            <div className="font-serif text-5xl italic text-ivory-400">{t.history.noRecords}</div>
            <div className="mt-3 font-script text-base text-ivory-700">{t.history.placeFirst}</div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="divide-y divide-brass-500/20">
            <div className="hidden grid-cols-[120px_140px_1fr_auto_auto] items-baseline gap-4 bg-ivory-100/50 px-6 py-3 font-mono text-[9px] tracking-[0.3em] text-brass-700 md:grid">
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
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-3 transition hover:bg-brass-50/40 md:grid-cols-[120px_140px_1fr_auto_auto]"
                >
                  <div className="font-mono data-num text-[11px]">
                    <div className="text-ivory-950">{time}</div>
                    <div className="text-[9px] tracking-[0.2em] text-ivory-600">
                      {date.toUpperCase()}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 ${meta.color}`}>
                    <span className="text-lg">{meta.icon}</span>
                    <span className="font-serif text-[12px] font-semibold tracking-[0.1em]">
                      {t.history.tx[tx.type as keyof typeof t.history.tx] ?? tx.type}
                    </span>
                  </div>
                  <div className="hidden truncate font-mono text-[11px] text-ivory-600 md:block">
                    {tx.betId ? `BET · ${tx.betId.slice(-6).toUpperCase()}` : '—'}
                  </div>
                  <div
                    className={`data-num text-right text-base font-semibold ${
                      positive ? 'text-win' : 'text-wine-500'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {formatAmount(tx.amount)}
                  </div>
                  <div className="data-num text-right text-[11px] text-ivory-600">
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
