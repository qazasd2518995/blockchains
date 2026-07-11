import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  MIN_BET_AMOUNT,
  type HiLoRoundState,
  type HiLoGuessResult,
  type HiLoCashoutResult,
} from '@bg/shared';
import { Sfx } from '@bg/game-engine';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { HiLoScene } from '@/games/hilo/HiLoScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';

export function HiLoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [round, setRound] = useState<HiLoRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HiLoScene | null>(null);
  const roundRef = useRef<HiLoRoundState | null>(null);

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
      void scene.init(canvas, w, h).then(() => {
        if (cancelled) return;
        const active = roundRef.current;
        if (active) scene?.setCurrentCard(active.currentCard);
      });
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
    Sfx.preloadTableGames();
    void api
      .get<{ state: HiLoRoundState | null }>('/games/hilo/active')
      .then((res) => {
        setRound(res.data.state);
        roundRef.current = res.data.state;
        if (res.data.state && sceneRef.current) {
          sceneRef.current.setCurrentCard(res.data.state.currentCard);
        }
      })
      .catch(() => undefined);
  }, []);

  const handleStart = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) return;
    Sfx.unlock();
    setBusy(true);
    setError(null);
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    const previousBalance = useAuthStore.getState().debitBalance(amount);
    try {
      sceneRef.current?.reset();
      const res = await api.post<HiLoRoundState>('/games/hilo/start', { amount });
      Sfx.tableCardFlip();
      setRound(res.data);
      roundRef.current = res.data;
      sceneRef.current?.setCurrentCard(res.data.currentCard);
    } catch (err) {
      if (previousBalance) setBalance(previousBalance);
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  const handleGuess = async (guess: 'higher' | 'lower') => {
    if (!round || busy) return;
    Sfx.unlock();
    setBusy(true);
    try {
      const res = await api.post<HiLoGuessResult>('/games/hilo/guess', {
        roundId: round.roundId,
        guess,
      });
      Sfx.tableCardFlip();
      await sceneRef.current?.playDraw(res.data.drawn, res.data.correct);
      setRound(res.data.state);
      roundRef.current = res.data.state;
      if (res.data.newBalance) setBalance(res.data.newBalance);
      // 答錯 → 一局結束（BUSTED），記錄輸局
      if (res.data.state.status === 'BUSTED') {
        setHistory((prev) =>
          [
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
          ].slice(0, 30),
        );
      }
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (!round || busy) return;
    Sfx.unlock();
    setBusy(true);
    try {
      const res = await api.post<HiLoRoundState>('/games/hilo/skip', { roundId: round.roundId });
      Sfx.tableCardFlip();
      setRound(res.data);
      roundRef.current = res.data;
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
      roundRef.current = res.data.state;
      setBalance(res.data.newBalance);
      if (res.data.state.status === 'BUSTED') {
        setHistory((prev) =>
          [
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
          ].slice(0, 30),
        );
        return;
      }

      const payout = Number.parseFloat(res.data.payout || res.data.state.potentialPayout);
      const settledAmount = Number.parseFloat(res.data.state.amount);
      const cashMult =
        payout > 0 && settledAmount > 0
          ? payout / settledAmount
          : Number.parseFloat(res.data.state.currentMultiplier);
      sceneRef.current?.celebrateCashout(cashMult);
      sceneRef.current?.playWinFx(cashMult, true);
      setHistory((prev) =>
        [
          {
            id: res.data.state.roundId,
            timestamp: Date.now(),
            betAmount: amount,
            multiplier: cashMult,
            payout,
            won: true,
            detail: `${res.data.state.history.length} 連對`,
          },
          ...prev,
        ].slice(0, 30),
      );
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setRound(null);
    roundRef.current = null;
  };

  const isActive = round?.status === 'ACTIVE';
  const isBusted = round?.status === 'BUSTED';
  const displayCurrentMultiplier = isBusted ? '0' : round?.currentMultiplier;
  const displayPotentialPayout = isBusted ? '0' : round?.potentialPayout;

  return (
    <div>
      <GameHeader
        artwork="/game-art/hilo/background.png"
        section="§ GAME 03"
        breadcrumb="HILO_03"
        title={t.games.hilo.title}
        titleSuffix={t.games.hilo.suffix}
        titleSuffixColor="toxic"
        description={t.games.hilo.description}
        rtpLabel="RTP 96.5%"
        rtpAccent="toxic"
      />

      <div className="game-play-grid game-play-grid--hilo grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="hilo-stage-panel game-stage-panel scanlines p-4">
            <div className="game-stage-bar -mx-4 -mt-4 mb-4 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">猜大小</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Hi-Lo</span>
              <GameActivityHeat gameId="hilo" />
              <span className="text-white/72">
                {round
                  ? `${t.games.hilo.card}${round.cardIndex + 1} · ${t.games.hilo.skips} ${round.skipsUsed}/${round.maxSkips}`
                  : t.games.hilo.idle}
              </span>
            </div>

            <div className="hilo-canvas game-canvas-shell game-canvas-wide mt-3 aspect-[16/8] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            {round && (
              <div className="hilo-choice-grid mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleGuess('higher')}
                  disabled={!isActive || busy}
                  className="hilo-choice-card group rounded-[16px] border border-[rgba(9,184,38,0.28)] bg-[linear-gradient(180deg,rgba(236,253,245,0.96)_0%,rgba(255,255,255,0.94)_100%)] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_12px_28px_rgba(15,23,42,0.08)] transition hover:border-[rgba(9,184,38,0.44)] hover:bg-[linear-gradient(180deg,rgba(220,252,231,0.98)_0%,rgba(255,255,255,0.98)_100%)] disabled:opacity-40 sm:rounded-[20px] sm:p-5"
                >
                  <div className="hilo-choice-kicker text-[10px] font-black tracking-[0.3em] text-[#0F766E]/70">
                    {t.games.hilo.higher}
                  </div>
                  <div className="hilo-choice-title mt-1 font-display text-2xl text-[#059669] sm:text-3xl">
                    ▲ {t.games.hilo.high}
                  </div>
                  <div className="hilo-choice-stat-row mt-2 flex items-baseline justify-between rounded-[10px] bg-white/[0.72] px-2 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <span className="hilo-choice-stat-label font-black text-[#64748B]">
                      {t.games.hilo.chance}
                    </span>
                    <span className="hilo-choice-stat-value data-num font-black text-[#172033]">
                      {(round.higherChance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="hilo-choice-stat-row flex items-baseline justify-between rounded-[10px] bg-white/[0.72] px-2 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <span className="hilo-choice-stat-label font-black text-[#64748B]">
                      {t.games.hilo.nextMult}
                    </span>
                    <span className="hilo-choice-stat-value hilo-choice-stat-value--higher data-num font-black text-[#059669]">
                      {formatMultiplier(round.higherMultiplier)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleGuess('lower')}
                  disabled={!isActive || busy}
                  className="hilo-choice-card group rounded-[16px] border border-[rgba(212,87,74,0.28)] bg-[linear-gradient(180deg,rgba(254,242,242,0.96)_0%,rgba(255,255,255,0.94)_100%)] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_12px_28px_rgba(15,23,42,0.08)] transition hover:border-[rgba(212,87,74,0.44)] hover:bg-[linear-gradient(180deg,rgba(254,226,226,0.98)_0%,rgba(255,255,255,0.98)_100%)] disabled:opacity-40 sm:rounded-[20px] sm:p-5"
                >
                  <div className="hilo-choice-kicker text-[10px] font-black tracking-[0.3em] text-[#991B1B]/62">
                    {t.games.hilo.lower}
                  </div>
                  <div className="hilo-choice-title mt-1 font-display text-2xl text-[#DC2626] sm:text-3xl">
                    ▼ {t.games.hilo.low}
                  </div>
                  <div className="hilo-choice-stat-row mt-2 flex items-baseline justify-between rounded-[10px] bg-white/[0.72] px-2 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <span className="hilo-choice-stat-label font-black text-[#64748B]">
                      {t.games.hilo.chance}
                    </span>
                    <span className="hilo-choice-stat-value data-num font-black text-[#172033]">
                      {(round.lowerChance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="hilo-choice-stat-row flex items-baseline justify-between rounded-[10px] bg-white/[0.72] px-2 py-1 text-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
                    <span className="hilo-choice-stat-label font-black text-[#64748B]">
                      {t.games.hilo.nextMult}
                    </span>
                    <span className="hilo-choice-stat-value hilo-choice-stat-value--lower data-num font-black text-[#DC2626]">
                      {formatMultiplier(round.lowerMultiplier)}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>

          {round && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                k={t.games.mines.current}
                v={formatMultiplier(displayCurrentMultiplier ?? 0)}
                accent="acid"
              />
              <Stat k={t.bet.potentialPayout} v={formatAmount(displayPotentialPayout ?? 0)} />
              <Stat
                k={t.games.hilo.card.replace(/#|CARD /, '').trim() || 'CARD'}
                v={`#${round.cardIndex + 1}`}
              />
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

        <div
          className={`game-control-stack space-y-4 ${isActive ? 'hilo-control-stack--active' : ''}`}
        >
          <div
            className={`hilo-control-card game-side-card p-5 ${isActive ? 'hilo-control-card--active' : ''}`}
          >
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              gameId="hilo"
              disabled={isActive || busy}
            />
            <div className="hilo-action-panel mt-6 space-y-2">
              {!round && (
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={busy || (!!user && balance < amount)}
                  className="btn-acid w-full py-4"
                >
                  → {t.games.hilo.deal.toUpperCase()} · {formatAmount(amount)}
                </button>
              )}
              {isActive && (
                <div className="hilo-active-actions grid grid-cols-2 gap-2">
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
                </div>
              )}
              {(round?.status === 'BUSTED' || round?.status === 'CASHED_OUT') && (
                <button type="button" onClick={handleReset} className="btn-ember w-full py-4">
                  ⟲ {t.bet.newRound}
                </button>
              )}
              <div className="game-balance-strip mt-3">
                <span>
                  {t.games.mines.current}{' '}
                  <span className="data-num ml-1 text-[#6EE7B7]">
                    {round ? formatMultiplier(displayCurrentMultiplier ?? 0) : '—'}
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
      <div className={`mt-1 num text-3xl ${accent === 'acid' ? 'text-[#7DD3FC]' : 'text-white'}`}>
        {v}
      </div>
    </div>
  );
}
