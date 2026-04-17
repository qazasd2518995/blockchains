import { useEffect, useState } from 'react';
import type { TransactionListResponse, TransactionType } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const ICON: Record<TransactionType, { color: string; icon: string }> = {
  SIGNUP_BONUS: { color: 'text-neon-toxic', icon: '✧' },
  BET_PLACE: { color: 'text-neon-ember', icon: '▼' },
  BET_WIN: { color: 'text-neon-acid', icon: '▲' },
  CASHOUT: { color: 'text-neon-acid', icon: '⇧' },
  ADJUSTMENT: { color: 'text-neon-ice', icon: '⟲' },
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
    <div className="space-y-10">
      <section className="border-b border-white/10 pb-6">
        <div className="label">§ {t.history.ledger}</div>
        <h1 className="mt-2 font-serif text-6xl font-black italic">
          <span className="text-neon-acid not-italic">{t.history.txLog}</span>
        </h1>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="crt-panel p-5">
          <div className="label">{t.history.totalIn}</div>
          <div className="mt-1 big-num text-4xl text-neon-toxic">+{formatAmount(totalIn)}</div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.history.totalOut}</div>
          <div className="mt-1 big-num text-4xl text-neon-ember">{formatAmount(totalOut)}</div>
        </div>
        <div className="crt-panel p-5">
          <div className="label">{t.history.net}</div>
          <div
            className={`mt-1 big-num text-4xl ${
              totalIn + totalOut >= 0 ? 'text-neon-acid' : 'text-neon-ember'
            }`}
          >
            {totalIn + totalOut >= 0 ? '+' : ''}
            {formatAmount(totalIn + totalOut)}
          </div>
        </div>
      </section>

      {error && (
        <div className="border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
          {t.common.error.toUpperCase()}: {error.toUpperCase()}
        </div>
      )}

      <section className="crt-panel overflow-hidden">
        <div className="border-b border-white/10 px-5 py-3 text-[10px] tracking-[0.25em] text-ink-500">
          {t.history.showing} {items.length} {t.history.entries}
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-5 py-8 text-[12px] tracking-[0.25em] text-ink-400">
            <span className="status-dot status-dot-live" />
            {t.common.loading.toUpperCase()}
            <span className="animate-blink">_</span>
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="px-5 py-12 text-center">
            <div className="font-display text-4xl text-ink-700">{t.history.noRecords}</div>
            <div className="mt-2 text-[11px] tracking-[0.3em] text-ink-500">
              {t.history.placeFirst}
            </div>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="divide-y divide-white/5">
            <div className="hidden grid-cols-[120px_120px_1fr_auto_auto] items-baseline gap-4 px-5 py-2 text-[9px] tracking-[0.3em] text-ink-500 md:grid">
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
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-3 transition hover:bg-white/5 md:grid-cols-[120px_120px_1fr_auto_auto]"
                >
                  <div className="data-num text-[11px]">
                    <div className="text-bone">{time}</div>
                    <div className="text-[9px] tracking-[0.2em] text-ink-500">
                      {date.toUpperCase()}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 ${meta.color}`}>
                    <span className="text-lg">{meta.icon}</span>
                    <span className="text-[11px] font-semibold tracking-[0.2em]">
                      {t.history.tx[tx.type as keyof typeof t.history.tx] ?? tx.type}
                    </span>
                  </div>
                  <div className="hidden truncate font-mono text-[11px] text-ink-400 md:block">
                    {tx.betId ? `BET_${tx.betId.slice(-6).toUpperCase()}` : '—'}
                  </div>
                  <div
                    className={`data-num text-right text-base font-semibold ${
                      positive ? 'text-neon-acid' : 'text-neon-ember'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {formatAmount(tx.amount)}
                  </div>
                  <div className="data-num text-right text-[11px] text-ink-400">
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
