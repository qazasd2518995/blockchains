import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type {
  HiLoRoundState,
  HiLoGuessResult,
  HiLoCashoutResult,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { HiLoScene } from '@/games/hilo/HiLoScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

export function HiLoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [round, setRound] = useState<HiLoRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HiLoScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: HiLoScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new HiLoScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h);
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    void api
      .get<{ state: HiLoRoundState | null }>('/games/hilo/active')
      .then((res) => {
        setRound(res.data.state);
        if (res.data.state && sceneRef.current) {
          sceneRef.current.setCurrentCard(res.data.state.currentCard);
        }
      })
      .catch(() => undefined);
  }, []);

  const handleStart = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      sceneRef.current?.reset();
      const res = await api.post<HiLoRoundState>('/games/hilo/start', { amount });
      setRound(res.data);
      setBalance((balance - amount).toFixed(2));
      sceneRef.current?.setCurrentCard(res.data.currentCard);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleGuess = async (guess: 'higher' | 'lower') => {
    if (!round || busy) return;
    setBusy(true);
    try {
      const res = await api.post<HiLoGuessResult>('/games/hilo/guess', {
        roundId: round.roundId,
        guess,
      });
      await sceneRef.current?.playDraw(res.data.drawn, res.data.correct);
      setRound(res.data.state);
      // 答錯 → 一局結束（BUSTED），記錄輸局
      if (res.data.state.status === 'BUSTED') {
        setHistory((prev) => [
          {
            id: res.data.state.roundId,
            timestamp: Date.now(),
            betAmount: amount,
            multiplier: 0,
            payout: 0,
            won: false,
            detail: `${res.data.state.history.length} 連對`,
          },
          ...prev,
        ].slice(0, 30));
      }
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (!round || busy) return;
    setBusy(true);
    try {
      const res = await api.post<HiLoRoundState>('/games/hilo/skip', { roundId: round.roundId });
      setRound(res.data);
      sceneRef.current?.setCurrentCard(res.data.currentCard);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    try {
      const res = await api.post<HiLoCashoutResult>('/games/hilo/cashout', {
        roundId: round.roundId,
      });
      setRound(res.data.state);
      setBalance(res.data.newBalance);
      const cashMult = Number.parseFloat(res.data.state.currentMultiplier);
      sceneRef.current?.celebrateCashout(cashMult);
      sceneRef.current?.playWinFx(cashMult, true);
      setHistory((prev) => [
        {
          id: res.data.state.roundId,
          timestamp: Date.now(),
          betAmount: amount,
          multiplier: cashMult,
          payout: amount * cashMult,
          won: true,
          detail: `${res.data.state.history.length} 連對`,
        },
        ...prev,
      ].slice(0, 30));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => setRound(null);

  const isActive = round?.status === 'ACTIVE';

  return (
    <div>
      <GameHeader
        artwork="/games/hilo.jpg"
        section="§ GAME 03"
        breadcrumb="HILO_03"
        title={t.games.hilo.title}
        titleSuffix={t.games.hilo.suffix}
        titleSuffixColor="toxic"
        description={t.games.hilo.description}
        rtpLabel="RTP 99%"
        rtpAccent="toxic"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="game-stage-panel scanlines p-4">
            <div className="game-stage-bar -mx-4 -mt-4 mb-4 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">猜大小</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">Hi-Lo</span>
              <span className="text-white/72">
                {round
                  ? `${t.games.hilo.card}${round.cardIndex + 1} · ${t.games.hilo.skips} ${round.skipsUsed}/${round.maxSkips}`
                  : t.games.hilo.idle}
              </span>
            </div>

            <div className="game-canvas-shell mt-3 aspect-[16/8] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            {round && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleGuess('higher')}
                  disabled={!isActive || busy}
                  className="group rounded-[20px] border border-[rgba(9,184,38,0.22)] bg-[linear-gradient(180deg,rgba(9,184,38,0.08)_0%,rgba(255,255,255,0.94)_100%)] p-5 text-left transition hover:border-[rgba(9,184,38,0.38)] hover:bg-[linear-gradient(180deg,rgba(9,184,38,0.12)_0%,rgba(255,255,255,0.98)_100%)] disabled:opacity-40"
                >
                  <div className="text-[10px] tracking-[0.3em] text-white/55">
                    {t.games.hilo.higher}
                  </div>
                  <div className="mt-1 font-display text-3xl text-[#6EE7B7]">
                    ▲ {t.games.hilo.high}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-[11px]">
                    <span className="text-white/75">{t.games.hilo.chance}</span>
                    <span className="data-num text-white">
                      {(round.higherChance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-white/75">{t.games.hilo.nextMult}</span>
                    <span className="data-num text-[#6EE7B7]">
                      {formatMultiplier(round.higherMultiplier)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleGuess('lower')}
                  disabled={!isActive || busy}
                  className="group rounded-[20px] border border-[rgba(212,87,74,0.22)] bg-[linear-gradient(180deg,rgba(212,87,74,0.08)_0%,rgba(255,255,255,0.94)_100%)] p-5 text-left transition hover:border-[rgba(212,87,74,0.38)] hover:bg-[linear-gradient(180deg,rgba(212,87,74,0.12)_0%,rgba(255,255,255,0.98)_100%)] disabled:opacity-40"
                >
                  <div className="text-[10px] tracking-[0.3em] text-white/55">
                    {t.games.hilo.lower}
                  </div>
                  <div className="mt-1 font-display text-3xl text-[#FCA5A5]">
                    ▼ {t.games.hilo.low}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-[11px]">
                    <span className="text-white/75">{t.games.hilo.chance}</span>
                    <span className="data-num text-white">
                      {(round.lowerChance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-white/75">{t.games.hilo.nextMult}</span>
                    <span className="data-num text-[#FCA5A5]">
                      {formatMultiplier(round.lowerMultiplier)}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {round && (
            <div className="grid grid-cols-3 gap-3">
              <Stat
                k={t.games.mines.current}
                v={formatMultiplier(round.currentMultiplier)}
                accent="acid"
              />
              <Stat k={t.bet.potentialPayout} v={formatAmount(round.potentialPayout)} />
              <Stat k={t.games.hilo.card.replace(/#|CARD /, '').trim() || 'CARD'} v={`#${round.cardIndex + 1}`} />
            </div>
          )}

          {round?.status === 'BUSTED' && (
            <div className="game-result-card game-result-card-loss">
              <div className="font-display text-4xl text-[#FCA5A5]">{t.games.hilo.wrongGuess}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                {t.games.hilo.roundClosed} · -{formatAmount(round.amount)}
              </div>
            </div>
          )}
          {round?.status === 'CASHED_OUT' && (
            <div className="game-result-card game-result-card-win">
              <div className="font-display text-4xl text-[#7DD3FC]">{t.games.hilo.cashedOut}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                {t.games.hilo.payoutPlus} {formatAmount(round.potentialPayout)}
              </div>
            </div>
          )}
          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={isActive || busy}
            />
            <div className="mt-6 space-y-2">
              {!round && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={busy || balance < amount}
                  className="btn-acid w-full py-4"
                >
                  → {t.games.hilo.deal.toUpperCase()} · {formatAmount(amount)}
                </button>
              )}
              {isActive && (
                <>
                  <button
                    type="button"
                    onClick={handleCashout}
                    disabled={busy || Number.parseFloat(round.currentMultiplier) <= 1}
                    className="btn-acid w-full py-4"
                  >
                    ⇧ {t.bet.cashout.toUpperCase()} · {formatAmount(round.potentialPayout)}
                  </button>
                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={busy || round.skipsUsed >= round.maxSkips}
                    className="game-choice-btn game-choice-btn-ice w-full justify-center py-3"
                  >
                    ⟳ {t.games.hilo.skip.toUpperCase()} ({round.maxSkips - round.skipsUsed}{' '}
                    {t.games.hilo.leftSkips})
                  </button>
                </>
              )}
              {(round?.status === 'BUSTED' || round?.status === 'CASHED_OUT') && (
                <button type="button" onClick={handleReset} className="btn-ember w-full py-4">
                  ⟲ {t.bet.newRound}
                </button>
              )}
              <div className="game-balance-strip mt-3">
                <span>
                  {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
                </span>
                <span>
                  {t.games.mines.current}{' '}
                  <span className="data-num ml-1 text-[#6EE7B7]">
                    {round ? formatMultiplier(round.currentMultiplier) : '—'}
                  </span>
                </span>
              </div>
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
