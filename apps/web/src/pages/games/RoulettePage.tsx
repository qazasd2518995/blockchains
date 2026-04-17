import { useState } from 'react';
import type { RouletteBetRequest, RouletteBetResult, RouletteLineBet } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const RED = new Set([1, 3, 5, 7, 9, 12]);
const BLACK = new Set([2, 4, 6, 8, 10, 11]);

interface Props {
  variant: 'mini-roulette' | 'carnival';
}

export function RoulettePage({ variant }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<RouletteLineBet[]>([]);
  const [result, setResult] = useState<RouletteBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addBet = (bet: Omit<RouletteLineBet, 'amount'>) => {
    setBets((prev) => {
      const existing = prev.find((b) => b.type === bet.type && b.value === bet.value);
      if (existing) {
        return prev.map((b) => (b === existing ? { ...b, amount: b.amount + chip } : b));
      }
      return [...prev, { ...bet, amount: chip }];
    });
  };

  const totalBet = bets.reduce((s, b) => s + b.amount, 0);

  const handleSpin = async () => {
    if (busy || bets.length === 0 || totalBet > balance) return;
    setBusy(true);
    setError(null);
    try {
      const payload: RouletteBetRequest = { bets };
      const endpoint =
        variant === 'mini-roulette'
          ? '/games/mini-roulette/bet'
          : '/games/carnival/bet';
      const res = await api.post<RouletteBetResult>(endpoint, payload);
      setResult(res.data);
      setBalance(res.data.newBalance);
      setBets([]);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setBets([]);

  const isMini = variant === 'mini-roulette';

  return (
    <div>
      <GameHeader
        section={isMini ? '§ GAME 06' : '§ GAME 18'}
        breadcrumb={isMini ? 'ROULETTE_06' : 'CARNIVAL_18'}
        title={isMini ? t.games.roulette.title : t.games.roulette.titleCarnival}
        titleSuffix={t.games.roulette.suffix}
        titleSuffixColor="ember"
        description={t.games.roulette.description}
        rtpLabel="RTP 96.15%"
        rtpAccent="ember"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://ROULETTE</span>
              <span className="text-ink-400">
                {t.games.roulette.total}: {formatAmount(totalBet)}
              </span>
            </div>

            <div className="mt-6 space-y-2">
              <div className="grid grid-cols-7 gap-1">
                <NumberBtn
                  n={0}
                  onClick={() => addBet({ type: 'straight', value: 0 })}
                  bets={bets}
                  variant="green"
                />
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <NumberBtn
                    key={n}
                    n={n}
                    onClick={() => addBet({ type: 'straight', value: n })}
                    bets={bets}
                    variant={RED.has(n) ? 'red' : BLACK.has(n) ? 'black' : 'black'}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1">
                <OutsideBtn
                  label={t.games.roulette.low}
                  onClick={() => addBet({ type: 'low' })}
                />
                <OutsideBtn
                  label={t.games.roulette.even}
                  onClick={() => addBet({ type: 'even' })}
                />
                <OutsideBtn
                  label={t.games.roulette.red}
                  onClick={() => addBet({ type: 'red' })}
                  color="red"
                />
                <OutsideBtn
                  label={t.games.roulette.black}
                  onClick={() => addBet({ type: 'black' })}
                  color="black"
                />
                <OutsideBtn
                  label={t.games.roulette.odd}
                  onClick={() => addBet({ type: 'odd' })}
                />
                <OutsideBtn
                  label={t.games.roulette.high}
                  onClick={() => addBet({ type: 'high' })}
                />
              </div>

              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3].map((col) => (
                  <OutsideBtn
                    key={col}
                    label={`${t.games.roulette.col} ${col} (2:1)`}
                    onClick={() => addBet({ type: 'column', value: col })}
                  />
                ))}
              </div>
            </div>
          </div>

          {result && (
            <div
              className={`border-2 p-5 ${
                Number.parseFloat(result.profit) >= 0
                  ? 'border-neon-acid bg-neon-acid/5'
                  : 'border-neon-ember/60 bg-neon-ember/5'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-5xl text-bone">
                    {t.games.roulette.slot} {result.slot}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                    {result.winningBets.length} {t.games.roulette.winningBets}
                  </div>
                </div>
                <div className="big-num text-3xl text-neon-acid">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
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
            <div className="label">{t.games.roulette.chipSize}</div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[1, 5, 10, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChip(v)}
                  className={`border py-2 font-mono text-[11px] transition ${
                    chip === v
                      ? 'border-neon-acid bg-neon-acid/10 text-neon-acid'
                      : 'border-white/10 bg-ink-950/50 text-ink-300'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-1">
              <div className="label">
                {t.games.roulette.activeBets} ({bets.length})
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto text-[11px]">
                {bets.length === 0 && (
                  <div className="py-3 text-center text-ink-600">{t.games.roulette.noBetsPlaced}</div>
                )}
                {bets.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border border-white/10 bg-ink-950/50 px-2 py-1"
                  >
                    <span className="font-mono text-ink-300">
                      {b.type.toUpperCase()}
                      {b.value !== undefined ? ` ${b.value}` : ''}
                    </span>
                    <span className="data-num text-neon-acid">{formatAmount(b.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSpin}
              disabled={busy || bets.length === 0 || totalBet > balance}
              className="btn-acid mt-4 w-full py-4"
            >
              → {t.games.roulette.spin} · {formatAmount(totalBet)}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy || bets.length === 0}
              className="btn-ghost mt-2 w-full py-2 text-[11px]"
            >
              ⨯ {t.games.roulette.clearBets}
            </button>

            <div className="mt-2 text-center text-[10px] tracking-[0.25em] text-ink-500">
              {t.bet.balance} {formatAmount(balance)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberBtn({
  n,
  onClick,
  bets,
  variant,
}: {
  n: number;
  onClick: () => void;
  bets: RouletteLineBet[];
  variant: 'red' | 'black' | 'green';
}) {
  const placed = bets.find((b) => b.type === 'straight' && b.value === n);
  const bg = { red: 'bg-[#dc1f3b]', black: 'bg-ink-800', green: 'bg-[#00ffa3]/50' }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative aspect-square border border-white/10 ${bg} font-display text-2xl text-bone transition hover:border-neon-acid`}
    >
      {n}
      {placed && (
        <span className="absolute -right-1 -top-1 rounded-full border border-ink-950 bg-neon-acid px-1.5 font-mono text-[9px] text-ink-950">
          {placed.amount}
        </span>
      )}
    </button>
  );
}

function OutsideBtn({
  label,
  onClick,
  color,
}: {
  label: string;
  onClick: () => void;
  color?: 'red' | 'black';
}) {
  const bg =
    color === 'red' ? 'bg-[#dc1f3b]/30' : color === 'black' ? 'bg-ink-800' : 'bg-ink-900/60';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border border-white/10 ${bg} py-2 font-mono text-[11px] tracking-[0.2em] text-ink-300 transition hover:border-neon-acid hover:text-neon-acid`}
    >
      {label}
    </button>
  );
}
