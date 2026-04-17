import { useState } from 'react';
import type { HotlineBetRequest, HotlineBetResult } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const SYMBOLS = ['🍒', '🔔', '7', '■', '◆', '★'];
const SYMBOL_COLORS = [
  'text-[#ff4e50]',
  'text-[#ffb547]',
  'text-[#d4ff3a]',
  'text-[#6df7ff]',
  'text-[#00ffa3]',
  'text-[#dc1f3b]',
];

export function HotlinePage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [grid, setGrid] = useState<number[][]>([
    [0, 1, 2],
    [3, 4, 5],
    [0, 1, 2],
    [3, 4, 5],
    [0, 1, 2],
  ]);
  const [result, setResult] = useState<HotlineBetResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spin = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setSpinning(true);
    setError(null);
    const shuffleTimer = setInterval(() => {
      setGrid(
        Array.from({ length: 5 }, () =>
          Array.from({ length: 3 }, () => Math.floor(Math.random() * SYMBOLS.length)),
        ),
      );
    }, 80);
    try {
      const payload: HotlineBetRequest = { amount };
      const res = await api.post<HotlineBetResult>('/games/hotline/bet', payload);
      setTimeout(() => {
        clearInterval(shuffleTimer);
        setGrid(res.data.grid);
        setResult(res.data);
        setBalance(res.data.newBalance);
        setSpinning(false);
        setBusy(false);
      }, 1200);
    } catch (err) {
      clearInterval(shuffleTimer);
      setError(extractApiError(err).message);
      setSpinning(false);
      setBusy(false);
    }
  };

  const hotRows = new Set(result?.lines.map((l) => l.row) ?? []);

  return (
    <div>
      <GameHeader
        section="§ GAME 08"
        breadcrumb="HOTLINE_08"
        title={t.games.hotline.title}
        titleSuffix={t.games.hotline.suffix}
        titleSuffixColor="ember"
        description={t.games.hotline.description}
        rtpLabel="RTP 96%"
        rtpAccent="ember"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://HOTLINE</span>
              <span className="text-ink-400">
                {spinning ? t.games.hotline.spinning : t.games.hotline.ready}
              </span>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-5 gap-2">
                {grid.map((col, reel) => (
                  <div key={reel} className="space-y-2">
                    {col.map((sym, row) => {
                      const isHot = hotRows.has(row);
                      return (
                        <div
                          key={`${reel}-${row}`}
                          className={`flex aspect-square items-center justify-center border-2 font-display text-5xl transition ${
                            isHot && !spinning
                              ? 'border-neon-acid bg-neon-acid/10 shadow-acid-glow'
                              : 'border-white/10 bg-ink-900'
                          } ${SYMBOL_COLORS[sym]}`}
                          style={{
                            transform: spinning
                              ? `translateY(${Math.sin(reel + row) * 4}px)`
                              : 'none',
                            transition: spinning ? 'none' : 'all 0.3s',
                          }}
                        >
                          {SYMBOLS[sym]}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {result && !spinning && (
            <div
              className={`border-2 p-5 ${
                result.multiplier > 0
                  ? 'border-neon-acid bg-neon-acid/5'
                  : 'border-neon-ember/60 bg-neon-ember/5'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl text-bone">
                    {result.lines.length}{' '}
                    {result.lines.length !== 1 ? t.games.hotline.lines : t.games.hotline.line}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                    {t.games.hotline.totalMult} {formatMultiplier(result.multiplier)}
                  </div>
                </div>
                <div className="big-num text-3xl text-neon-acid">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
              {result.lines.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.lines.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border border-white/10 bg-ink-950/50 px-3 py-1 text-[11px]"
                    >
                      <span className="font-mono text-ink-300">
                        {t.games.hotline.row} {l.row} · {l.count}× {SYMBOLS[l.symbol]}
                      </span>
                      <span className="data-num text-neon-acid">{l.payout}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
              ⚠ {error.toUpperCase()}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="crt-panel p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={busy}
            />

            <button
              type="button"
              onClick={spin}
              disabled={busy || balance < amount}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.hotline.spin} · {formatAmount(amount)}
            </button>
            <div className="mt-2 text-center text-[10px] tracking-[0.25em] text-ink-500">
              {t.bet.balance} {formatAmount(balance)}
            </div>
          </div>

          <div className="crt-panel p-5">
            <div className="label">{t.games.hotline.payoutTable}</div>
            <div className="mt-3 space-y-1 text-[11px]">
              {SYMBOLS.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-white/5 pb-1"
                >
                  <span className={`font-display text-xl ${SYMBOL_COLORS[i]}`}>{s}</span>
                  <span className="data-num text-ink-300">3x · 4x · 5x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
