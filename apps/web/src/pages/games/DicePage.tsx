import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { DiceBetRequest, DiceBetResult } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { DiceScene } from '@/games/dice/DiceScene';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { GameHeader } from '@/components/game/GameHeader';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

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
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);

  const winChance = direction === 'under' ? target : 100 - target;
  const multiplier = winChance > 0 ? 99 / winChance : 0;
  const potentialPayout = amount * multiplier;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: DiceScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new DiceScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h).then(() => {
        if (!cancelled) scene?.setTargetLabel(target, direction);
      });
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
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
    // 乐观动画：立刻启动骰子旋转，不等 API
    sceneRef.current?.startAnticipation();
    try {
      const payload: DiceBetRequest = { amount, target, direction };
      const res = await api.post<DiceBetResult>('/games/dice/bet', payload);
      const result = res.data;
      await sceneRef.current?.playRoll(result.roll, result.won, result.multiplier);
      sceneRef.current?.playWinFx(result.multiplier, result.won);
      setLastResult(result);
      setHistory((prev) => [
        {
          id: result.betId,
          timestamp: Date.now(),
          betAmount: amount,
          multiplier: result.won ? result.multiplier : 0,
          payout: Number.parseFloat(result.payout),
          won: result.won,
          detail: `${result.direction === 'under' ? '▾' : '▴'} ${result.target.toFixed(2)}`,
        },
        ...prev,
      ].slice(0, 30));
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
        artwork="/games/dice.jpg"
        section="§ GAME 01"
        breadcrumb="DICE_01"
        title={t.games.dice.title}
        titleSuffix={t.games.dice.suffix}
        titleSuffixColor="acid"
        description={t.games.dice.description}
        rtpLabel="RTP 99%"
        rtpAccent="acid"
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">骰子</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">Dice</span>
              <span className="text-[#7EE0A4]">
                <span className="dot-online dot-online" />
                {t.common.ready.toUpperCase()}
              </span>
            </div>
            <div className="game-canvas-shell game-canvas-wide relative aspect-[16/7] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />

              {/* 右上角即時統計（疊在画布上） */}
              <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 rounded-[16px] border border-white/10 bg-[#07131F]/50 px-3 py-2 text-[10px] tracking-[0.2em] text-white/62 backdrop-blur">
                <div>
                  {t.bet.multiplier.toUpperCase()}{' '}
                  <span className="data-num ml-1 text-[#7DD3FC]">
                    {formatMultiplier(multiplier)}
                  </span>
                </div>
                <div>
                  {t.bet.winChance.toUpperCase()}{' '}
                    <span className="data-num ml-1 text-white">{winChance.toFixed(2)}%</span>
                </div>
                <div>
                  {t.bet.potentialPayout.toUpperCase()}{' '}
                  <span className="data-num ml-1 text-[#6EE7B7]">
                    {formatAmount(potentialPayout)}
                  </span>
                </div>
              </div>
            </div>

            {/* 滑杆 + 方向 toggle（紧贴画布底部，免滚动） */}
            <div className="border-t border-[#16324A]/10 p-4 md:p-5">
              <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="label">{t.games.dice.threshold}</span>
                  <span className="num text-2xl text-white">{target.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] sm:flex">
                  <button
                    type="button"
                    onClick={() => setDirection('under')}
                    className={`game-choice-btn px-3 py-2 ${direction === 'under' ? 'game-choice-btn-acid' : ''}`}
                  >
                    ▾ {t.games.dice.rollUnder}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('over')}
                    className={`game-choice-btn px-3 py-2 ${direction === 'over' ? 'game-choice-btn-ember' : ''}`}
                  >
                    ▴ {t.games.dice.rollOver}
                  </button>
                </div>
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
              <div className="mt-1 flex justify-between text-[9px] text-white/40">
                <span>0.00</span>
                <span>50.00</span>
                <span>99.99</span>
              </div>
            </div>
          </div>

          {lastResult && (
            <div
              className={`game-result-card ${lastResult.won ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="flex items-baseline justify-between">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`font-display text-5xl font-bold ${
                      lastResult.won ? 'text-[#F3D67D]' : 'text-[#FCA5A5]'
                    }`}
                  >
                    {lastResult.won ? t.games.dice.win : t.games.dice.loss}
                  </span>
                  <span className="text-[10px] tracking-[0.3em] text-white/65">
                    {t.games.dice.roll}
                  </span>
                  <span className="num text-5xl font-bold text-white">
                    {lastResult.roll.toFixed(2)}
                  </span>
                </div>
                <div className="text-right">
                  <div className="data-num text-[11px] text-white/65">{t.games.dice.payout}</div>
                  <div
                    className={`data-num text-2xl font-bold ${
                      lastResult.won ? 'text-[#F3D67D]' : 'text-white/85'
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
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">
                {t.common.error.toUpperCase()}: {error.toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <div className="game-control-stack space-y-4">
          <div className="game-side-card p-5">
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

            <div className="game-balance-strip mt-3">
              <span className="text-white/55">
                {t.bet.balance}{' '}
                <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
              </span>
              <span className="text-white/55">
                {t.bet.after}{' '}
                <span className="data-num ml-1 text-[#7DD3FC]">
                  {formatAmount(balance - amount)}
                </span>
              </span>
            </div>
          </div>

          <RecentBetsList records={history} />

        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string; accent?: 'acid' }) {
  return (
    <div className="game-stat-card">
      <div className="label">{k}</div>
      <div
        className={`mt-1 num text-3xl ${accent === 'acid' ? 'text-[#7DD3FC]' : 'text-white'}`}
      >
        {v}
      </div>
    </div>
  );
}
