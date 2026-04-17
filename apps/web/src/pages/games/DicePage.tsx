import { useEffect, useRef, useState } from 'react';
import type { DiceBetRequest, DiceBetResult } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { DiceScene } from '@/games/dice/DiceScene';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { GameHeader } from '@/components/game/GameHeader';

const MIN_TARGET = 1.01;
const MAX_TARGET = 98.99;

export function DicePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DiceScene | null>(null);
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');

  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<'under' | 'over'>('under');
  const [lastResult, setLastResult] = useState<DiceBetResult | null>(null);
  const [history, setHistory] = useState<DiceBetResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const winChance = direction === 'under' ? target : 100 - target;
  const multiplier = winChance > 0 ? 99 / winChance : 0;
  const potentialPayout = amount * multiplier;

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new DiceScene();
    sceneRef.current = scene;
    const width = canvasRef.current.clientWidth;
    const height = canvasRef.current.clientHeight;
    void scene.init(canvasRef.current, width, height).then(() => {
      scene.setTargetLabel(target, direction);
    });
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    sceneRef.current?.setTargetLabel(target, direction);
  }, [target, direction]);

  const handleBet = async () => {
    if (rolling) return;
    if (amount <= 0 || amount > balance) {
      setError(t.bet.insufficientBalance);
      return;
    }
    setError(null);
    setRolling(true);
    try {
      const payload: DiceBetRequest = { amount, target, direction };
      const res = await api.post<DiceBetResult>('/games/dice/bet', payload);
      const result = res.data;
      await sceneRef.current?.playRoll(result.roll, result.won);
      setLastResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 16));
      setBalance(result.newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setRolling(false);
    }
  };

  return (
    <div>
      <GameHeader
        section="§ GAME 01"
        breadcrumb="DICE_01"
        title={t.games.dice.title}
        titleSuffix={t.games.dice.suffix}
        titleSuffixColor="acid"
        description={t.games.dice.description}
        rtpLabel="RTP 99%"
        rtpAccent="acid"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://DICE</span>
              <span className="text-neon-toxic">
                <span className="status-dot status-dot-live" />
                {t.common.ready.toUpperCase()}
              </span>
            </div>
            <div className="aspect-[16/10] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>
          </div>

          <div className="crt-panel p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] text-ink-500">02</span>
                <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-300">
                  {t.games.dice.threshold}
                </span>
              </div>
              <span className="data-num text-[10px] text-ink-500">
                {t.games.dice.range} {MIN_TARGET}–{MAX_TARGET}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('under')}
                className={`relative border-2 p-4 text-left transition ${
                  direction === 'under'
                    ? 'border-neon-acid bg-neon-acid/10'
                    : 'border-white/10 bg-ink-900/40 hover:border-white/30'
                }`}
              >
                <div className="text-[10px] tracking-[0.3em] text-ink-500">
                  {t.games.dice.directionA}
                </div>
                <div
                  className={`mt-1 font-display text-3xl tracking-tight ${
                    direction === 'under' ? 'text-neon-acid' : 'text-bone'
                  }`}
                >
                  {t.games.dice.rollUnder} ▾
                </div>
                <div className="mt-1 text-[11px] text-ink-400">
                  {t.games.dice.winIfLess} {target.toFixed(2)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setDirection('over')}
                className={`relative border-2 p-4 text-left transition ${
                  direction === 'over'
                    ? 'border-neon-ember bg-neon-ember/10'
                    : 'border-white/10 bg-ink-900/40 hover:border-white/30'
                }`}
              >
                <div className="text-[10px] tracking-[0.3em] text-ink-500">
                  {t.games.dice.directionB}
                </div>
                <div
                  className={`mt-1 font-display text-3xl tracking-tight ${
                    direction === 'over' ? 'text-neon-ember' : 'text-bone'
                  }`}
                >
                  {t.games.dice.rollOver} ▴
                </div>
                <div className="mt-1 text-[11px] text-ink-400">
                  {t.games.dice.winIfGreater} {target.toFixed(2)}
                </div>
              </button>
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-baseline justify-between">
                <div className="flex items-baseline gap-3">
                  <span className="label">{t.games.dice.threshold}</span>
                  <span className="big-num text-3xl text-bone">{target.toFixed(2)}</span>
                </div>
                <span className="data-num text-[11px] text-ink-400">
                  {t.bet.winChance} <span className="text-neon-acid">{winChance.toFixed(2)}%</span>
                </span>
              </div>
              <input
                type="range"
                min={MIN_TARGET}
                max={MAX_TARGET}
                step={0.01}
                value={target}
                onChange={(e) => setTarget(Number.parseFloat(e.target.value))}
                className={`term-range w-full ${direction === 'over' ? 'term-range-ember' : ''}`}
              />
              <div className="mt-1 flex justify-between text-[9px] text-ink-600">
                <span>0.00</span>
                <span>50.00</span>
                <span>99.99</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat k={t.bet.multiplier} v={formatMultiplier(multiplier)} accent="acid" />
            <Stat k={t.bet.winChance} v={`${winChance.toFixed(2)}%`} />
            <Stat k={t.bet.potentialPayout} v={formatAmount(potentialPayout)} />
          </div>

          {lastResult && (
            <div
              className={`border-2 p-5 ${
                lastResult.won
                  ? 'border-neon-acid bg-neon-acid/5 shadow-acid-glow'
                  : 'border-neon-ember/60 bg-neon-ember/5'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-display text-5xl ${
                      lastResult.won ? 'text-neon-acid' : 'text-neon-ember'
                    }`}
                  >
                    {lastResult.won ? t.games.dice.win : t.games.dice.loss}
                  </span>
                  <span className="text-[10px] tracking-[0.3em] text-ink-500">
                    {t.games.dice.roll}
                  </span>
                  <span className="big-num text-5xl text-bone">
                    {lastResult.roll.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="data-num text-[11px] text-ink-500">{t.games.dice.payout}</div>
                  <div
                    className={`data-num text-2xl font-bold ${
                      lastResult.won ? 'text-neon-acid' : 'text-ink-400'
                    }`}
                  >
                    {Number.parseFloat(lastResult.profit) >= 0 ? '+' : ''}
                    {formatAmount(lastResult.profit)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
              ⚠ {t.common.error.toUpperCase()}: {error.toUpperCase()}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="crt-panel p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={rolling}
            />

            <button
              type="button"
              onClick={handleBet}
              disabled={rolling || balance < amount}
              className="btn-acid mt-6 w-full py-4 text-base"
            >
              {rolling ? (
                <span>
                  {t.games.dice.rolling}
                  <span className="animate-blink">_</span>
                </span>
              ) : (
                `→ ${t.bet.place} · ${formatAmount(amount)}`
              )}
            </button>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] tracking-[0.25em]">
              <div className="border border-white/10 bg-ink-950/50 p-2 text-center">
                <div className="text-ink-500">{t.bet.balance}</div>
                <div className="mt-1 data-num text-sm text-bone">{formatAmount(balance)}</div>
              </div>
              <div className="border border-white/10 bg-ink-950/50 p-2 text-center">
                <div className="text-ink-500">{t.bet.after}</div>
                <div className="mt-1 data-num text-sm text-neon-acid">
                  {formatAmount(balance - amount)}
                </div>
              </div>
            </div>
          </div>

          <div className="crt-panel p-5">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] text-ink-500">03</span>
                <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-300">
                  {t.games.dice.recentRolls}
                </span>
              </div>
              <span className="data-num text-[10px] text-ink-500">{history.length}</span>
            </div>
            <div className="mt-3 space-y-1">
              {history.length === 0 && (
                <div className="py-6 text-center text-[10px] tracking-[0.3em] text-ink-600">
                  —
                </div>
              )}
              {history.map((h) => (
                <div
                  key={h.betId}
                  className={`flex items-center justify-between border px-3 py-1.5 text-[11px] ${
                    h.won
                      ? 'border-neon-acid/20 bg-neon-acid/5'
                      : 'border-neon-ember/20 bg-neon-ember/5'
                  }`}
                >
                  <span
                    className={`data-num ${h.won ? 'text-neon-acid' : 'text-ink-400'}`}
                  >
                    {h.roll.toFixed(2)}
                  </span>
                  <span className="text-[9px] tracking-[0.2em] text-ink-500">
                    {h.direction === 'under' ? '▾' : '▴'} {h.target.toFixed(2)}
                  </span>
                  <span
                    className={`data-num font-bold ${
                      h.won ? 'text-neon-acid' : 'text-neon-ember'
                    }`}
                  >
                    {h.won ? formatMultiplier(h.multiplier) : '×0'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: 'acid' }) {
  return (
    <div className="crt-panel p-4">
      <div className="label">{k}</div>
      <div
        className={`mt-1 big-num text-3xl ${accent === 'acid' ? 'text-neon-acid' : 'text-bone'}`}
      >
        {v}
      </div>
    </div>
  );
}
