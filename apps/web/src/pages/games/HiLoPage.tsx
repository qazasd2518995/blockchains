import { useEffect, useState } from 'react';
import type {
  HiLoRoundState,
  HiLoGuessResult,
  HiLoCashoutResult,
  HiLoCard,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function HiLoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [round, setRound] = useState<HiLoRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastDrawn, setLastDrawn] = useState<HiLoCard | null>(null);

  useEffect(() => {
    void api
      .get<{ state: HiLoRoundState | null }>('/games/hilo/active')
      .then((res) => setRound(res.data.state))
      .catch(() => undefined);
  }, []);

  const handleStart = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<HiLoRoundState>('/games/hilo/start', { amount });
      setRound(res.data);
      setBalance((balance - amount).toFixed(2));
      setLastDrawn(null);
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
      setRound(res.data.state);
      setLastDrawn(res.data.drawn);
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
        section="§ GAME 03"
        breadcrumb="HILO_03"
        title={t.games.hilo.title}
        titleSuffix={t.games.hilo.suffix}
        titleSuffixColor="toxic"
        description={t.games.hilo.description}
        rtpLabel="RTP 99%"
        rtpAccent="toxic"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines p-10">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://HILO</span>
              <span className="text-ink-400">
                {round
                  ? `${t.games.hilo.card}${round.cardIndex + 1} · ${t.games.hilo.skips} ${round.skipsUsed}/${round.maxSkips}`
                  : t.games.hilo.idle}
              </span>
            </div>

            <div className="mt-8 flex items-center justify-center gap-8">
              {round?.history && round.history.length > 1 && (
                <PlayingCard card={round.history[round.history.length - 2]!} faded />
              )}
              <PlayingCard card={round?.currentCard ?? { rank: 7, suit: 0 }} big />
              {lastDrawn && <PlayingCard card={lastDrawn} dim />}
            </div>

            {round && (
              <div className="mt-8 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleGuess('higher')}
                  disabled={!isActive || busy}
                  className="group border-2 border-neon-toxic/30 bg-neon-toxic/5 p-5 text-left transition hover:border-neon-toxic hover:bg-neon-toxic/10 disabled:opacity-40"
                >
                  <div className="text-[10px] tracking-[0.3em] text-ink-500">
                    {t.games.hilo.higher}
                  </div>
                  <div className="mt-1 font-display text-3xl text-neon-toxic">
                    ▲ {t.games.hilo.high}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-[11px]">
                    <span className="text-ink-400">{t.games.hilo.chance}</span>
                    <span className="data-num text-bone">
                      {(round.higherChance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-ink-400">{t.games.hilo.nextMult}</span>
                    <span className="data-num text-neon-toxic">
                      {formatMultiplier(round.higherMultiplier)}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleGuess('lower')}
                  disabled={!isActive || busy}
                  className="group border-2 border-neon-ember/30 bg-neon-ember/5 p-5 text-left transition hover:border-neon-ember hover:bg-neon-ember/10 disabled:opacity-40"
                >
                  <div className="text-[10px] tracking-[0.3em] text-ink-500">
                    {t.games.hilo.lower}
                  </div>
                  <div className="mt-1 font-display text-3xl text-neon-ember">
                    ▼ {t.games.hilo.low}
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-[11px]">
                    <span className="text-ink-400">{t.games.hilo.chance}</span>
                    <span className="data-num text-bone">
                      {(round.lowerChance * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-[11px]">
                    <span className="text-ink-400">{t.games.hilo.nextMult}</span>
                    <span className="data-num text-neon-ember">
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
            <div className="border-2 border-neon-ember bg-neon-ember/5 p-5">
              <div className="font-display text-4xl text-neon-ember">{t.games.hilo.wrongGuess}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                {t.games.hilo.roundClosed} · -{formatAmount(round.amount)}
              </div>
            </div>
          )}
          {round?.status === 'CASHED_OUT' && (
            <div className="border-2 border-neon-acid bg-neon-acid/5 p-5 shadow-acid-glow">
              <div className="font-display text-4xl text-neon-acid">{t.games.hilo.cashedOut}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                {t.games.hilo.payoutPlus} {formatAmount(round.potentialPayout)}
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
                    className="btn-ghost w-full py-3"
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
              <div className="mt-2 text-center text-[10px] tracking-[0.25em] text-ink-500">
                {t.bet.balance} {formatAmount(balance)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayingCard({
  card,
  big,
  faded,
  dim,
}: {
  card: HiLoCard;
  big?: boolean;
  faded?: boolean;
  dim?: boolean;
}) {
  const red = card.suit === 1 || card.suit === 2;
  const size = big ? 'w-36 h-52 text-5xl' : 'w-24 h-36 text-3xl';
  return (
    <div
      className={`flex flex-col items-center justify-between ${size} border-2 ${
        big ? 'border-neon-acid bg-bone' : 'border-white/20 bg-bone/90'
      } p-3 font-serif ${faded ? 'opacity-40' : ''} ${dim ? 'opacity-70' : ''}`}
      style={{ color: red ? '#dc1f3b' : '#05060a' }}
    >
      <div className="self-start text-left font-display leading-none">
        <div>{RANKS[card.rank - 1]}</div>
        <div className="text-2xl">{SUITS[card.suit]}</div>
      </div>
      <div className="text-center font-display">{SUITS[card.suit]}</div>
      <div className="self-end rotate-180 text-left font-display leading-none">
        <div>{RANKS[card.rank - 1]}</div>
        <div className="text-2xl">{SUITS[card.suit]}</div>
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
