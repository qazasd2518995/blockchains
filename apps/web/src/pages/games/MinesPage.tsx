import { useEffect, useRef, useState } from 'react';
import type {
  MinesRoundState,
  MinesStartRequest,
  MinesRevealResult,
  MinesCashoutResult,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { MinesScene } from '@/games/mines/MinesScene';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { GameHeader } from '@/components/game/GameHeader';

export function MinesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MinesScene | null>(null);
  const roundRef = useRef<MinesRoundState | null>(null);
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');

  const [amount, setAmount] = useState(10);
  const [mineCount, setMineCount] = useState(5);
  const [round, setRound] = useState<MinesRoundState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: MinesScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new MinesScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h, ({ index }) => {
        void handleReveal(index);
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
    void api
      .get<{ state: MinesRoundState | null }>('/games/mines/active')
      .then((res) => {
        if (res.data.state) {
          const state = res.data.state;
          setRound(state);
          roundRef.current = state;
          sceneRef.current?.setClickable(true);
          for (const idx of state.revealed) sceneRef.current?.revealGem(idx);
        }
      })
      .catch(() => undefined);
  }, []);

  const handleStart = async () => {
    if (busy) return;
    if (amount <= 0 || amount > balance) {
      setError(t.bet.insufficientBalance);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      sceneRef.current?.reset();
      const payload: MinesStartRequest = { amount, mineCount };
      const res = await api.post<MinesRoundState>('/games/mines/start', payload);
      const state = res.data;
      setRound(state);
      roundRef.current = state;
      setBalance((balance - amount).toFixed(2));
      sceneRef.current?.setClickable(true);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async (cellIndex: number) => {
    const current = roundRef.current;
    if (!current || current.status !== 'ACTIVE') return;
    if (busy) return;
    setBusy(true);
    // 樂觀動畫：立刻標記此格為「準備中」脈動
    sceneRef.current?.markPending(cellIndex);
    try {
      const res = await api.post<MinesRevealResult>('/games/mines/reveal', {
        roundId: current.roundId,
        cellIndex,
      });
      const { state, hitMine } = res.data;
      if (hitMine) {
        sceneRef.current?.revealMine(cellIndex, true);
        sceneRef.current?.setClickable(false);
        if (state.minePositions) sceneRef.current?.revealAllMines(state.minePositions);
      } else {
        sceneRef.current?.revealGem(cellIndex);
      }
      setRound(state);
      roundRef.current = state;
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCashout = async () => {
    const current = roundRef.current;
    if (!current || current.status !== 'ACTIVE' || current.revealed.length === 0) return;
    setBusy(true);
    try {
      const res = await api.post<MinesCashoutResult>('/games/mines/cashout', {
        roundId: current.roundId,
      });
      const { state, newBalance } = res.data;
      setRound(state);
      roundRef.current = state;
      sceneRef.current?.setClickable(false);
      sceneRef.current?.celebrateCashout(Number.parseFloat(state.currentMultiplier));
      setBalance(newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setRound(null);
    roundRef.current = null;
    sceneRef.current?.reset();
  };

  const isActive = round?.status === 'ACTIVE';
  const isBusted = round?.status === 'BUSTED';
  const isCashedOut = round?.status === 'CASHED_OUT';

  const riskLabel =
    mineCount <= 3
      ? t.games.mines.low
      : mineCount <= 8
      ? t.games.mines.medium
      : mineCount <= 16
      ? t.games.mines.high
      : t.games.mines.extreme;

  return (
    <div>
      <GameHeader
        section="§ GAME 02"
        breadcrumb="MINES_02"
        title={t.games.mines.title}
        titleSuffix={t.games.mines.suffix}
        titleSuffixColor="ember"
        description={t.games.mines.description}
        rtpLabel="RTP 97%"
        rtpAccent="ember"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://MINES</span>
              <div className="flex items-center gap-3 text-ink-600">
                <span>
                  {round
                    ? `${t.games.mines.revealed} ${round.revealed.length}/${25 - mineCount}`
                    : t.games.hilo.idle.toUpperCase()}
                </span>
                {isActive && (
                  <span className="text-neon-acid">
                    <span className="dot-online dot-online" />
                    {t.common.active.toUpperCase()}
                  </span>
                )}
                {isBusted && (
                  <span className="text-neon-ember">{t.games.mines.busted}</span>
                )}
                {isCashedOut && (
                  <span className="text-neon-toxic">{t.games.mines.cashedOut}</span>
                )}
              </div>
            </div>
            <div className="relative mx-auto aspect-square w-full max-h-[520px]" style={{ maxWidth: 520 }}>
              <canvas ref={canvasRef} className="h-full w-full" />
              {/* 右上 overlay — 當前倍率/下一倍/派彩 */}
              {round && (
                <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 text-[10px] tracking-[0.2em] text-ink-500">
                  <div>
                    {t.games.mines.current.toUpperCase()}{' '}
                    <span className="data-num ml-1 text-neon-acid">
                      {formatMultiplier(round.currentMultiplier)}
                    </span>
                  </div>
                  <div>
                    NEXT{' '}
                    <span className="data-num ml-1 text-ink-700">
                      {round.nextMultiplier ? formatMultiplier(round.nextMultiplier) : '—'}
                    </span>
                  </div>
                  <div>
                    PAYOUT{' '}
                    <span className="data-num ml-1 text-neon-toxic">
                      {formatAmount(round.potentialPayout)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isBusted && (
            <div className="border-2 border-neon-ember bg-neon-ember/5 p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-5xl text-neon-ember">
                    {t.games.mines.busted}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-600">
                    {t.games.mines.mineDetonated}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-ink-500">{t.games.mines.loss}</div>
                  <div className="num text-3xl text-neon-ember">
                    -{formatAmount(round.amount)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {isCashedOut && (
            <div className="border-2 border-neon-acid bg-neon-acid/5 p-5 shadow-acid-glow">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-5xl text-neon-acid">
                    {t.games.mines.cashedOut}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-600">
                    {t.games.mines.secured}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-ink-500">{t.games.dice.payout}</div>
                  <div className="num text-3xl text-neon-acid">
                    +{formatAmount(round.potentialPayout)}
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
              disabled={isActive || busy}
            />

            <div className="mt-6">
              <div className="flex items-center justify-between border-b border-ink-200 pb-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] text-ink-500">02</span>
                  <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-700">
                    {t.games.mines.mines}
                  </span>
                </div>
                <span className="data-num text-[10px] text-ink-500">{t.games.dice.range} 1–24</span>
              </div>
              <div className="mt-4 flex items-baseline gap-4">
                <span className="num text-6xl text-neon-ember">
                  {mineCount.toString().padStart(2, '0')}
                </span>
                <div className="flex-1 text-[10px] tracking-[0.2em] text-ink-500">{riskLabel}</div>
              </div>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={mineCount}
                onChange={(e) => setMineCount(Number.parseInt(e.target.value, 10))}
                disabled={isActive || busy}
                className="term-range term-range-ember mt-3 w-full"
              />
              <div className="mt-3 grid grid-cols-6 gap-1">
                {[1, 3, 5, 10, 15, 24].map((v) => (
                  <button
                    key={v}
                    type="button"
                    disabled={isActive || busy}
                    onClick={() => setMineCount(v)}
                    className={`border py-1.5 font-mono text-[11px] transition ${
                      mineCount === v
                        ? 'border-neon-ember bg-neon-ember/10 text-neon-ember'
                        : 'border-ink-200 bg-ink-50/50 text-ink-700 hover:border-neon-ember/50'
                    } disabled:opacity-30`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {!isActive && !isBusted && !isCashedOut && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={busy || balance < amount}
                  className="btn-acid w-full py-4 text-base"
                >
                  {busy ? (
                    <span>
                      {t.bet.starting}
                      <span className="animate-blink">_</span>
                    </span>
                  ) : (
                    `→ ${t.bet.start} · ${formatAmount(amount)}`
                  )}
                </button>
              )}
              {isActive && (
                <button
                  type="button"
                  onClick={handleCashout}
                  disabled={busy || !round || round.revealed.length === 0}
                  className="btn-acid w-full py-4 text-base"
                >
                  {busy ? (
                    <span>
                      {t.bet.cashing}
                      <span className="animate-blink">_</span>
                    </span>
                  ) : (
                    `⇧ ${t.bet.cashout} · ${round ? formatAmount(round.potentialPayout) : ''}`
                  )}
                </button>
              )}
              {(isBusted || isCashedOut) && (
                <button type="button" onClick={handleReset} className="btn-ember w-full py-4">
                  ⟲ {t.bet.newRound}
                </button>
              )}
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] tracking-[0.25em]">
                <div className="border border-ink-200 bg-ink-50/50 p-2 text-center">
                  <div className="text-ink-500">{t.bet.balance}</div>
                  <div className="mt-1 data-num text-sm text-ink-900">{formatAmount(balance)}</div>
                </div>
                <div className="border border-ink-200 bg-ink-50/50 p-2 text-center">
                  <div className="text-ink-500">{t.games.mines.atRisk}</div>
                  <div className="mt-1 data-num text-sm text-neon-ember">
                    {round && isActive ? formatAmount(round.amount) : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="crt-panel p-5">
            <div className="flex items-center justify-between border-b border-ink-200 pb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[9px] text-ink-500">03</span>
                <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-700">
                  {t.games.mines.probs}
                </span>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-[11px]">
              <ProbRow
                label={t.games.mines.hitMine}
                value={`${((mineCount / 25) * 100).toFixed(1)}%`}
                color="ember"
              />
              <ProbRow
                label={t.games.mines.safeCell}
                value={`${(((25 - mineCount) / 25) * 100).toFixed(1)}%`}
                color="acid"
              />
              <ProbRow
                label={t.games.mines.safeCells}
                value={`${25 - mineCount} / 25`}
                color="ink"
              />
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
        className={`mt-1 num text-3xl ${accent === 'acid' ? 'text-neon-acid' : 'text-ink-900'}`}
      >
        {v}
      </div>
    </div>
  );
}

function ProbRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'acid' | 'ember' | 'ink';
}) {
  const c = { acid: 'text-neon-acid', ember: 'text-neon-ember', ink: 'text-ink-700' }[color];
  return (
    <div className="flex items-baseline justify-between border-b border-ink-200 pb-2 last:border-0 last:pb-0">
      <span className="label">{label}</span>
      <span className={`data-num ${c}`}>{value}</span>
    </div>
  );
}
