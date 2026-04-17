import { useEffect, useState } from 'react';
import type {
  TowerRoundState,
  TowerPickResult,
  TowerCashoutResult,
  TowerDifficulty,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

export function TowerPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] = useState<TowerDifficulty>('medium');
  const [round, setRound] = useState<TowerRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const difficulties: { id: TowerDifficulty; label: string; desc: string }[] = [
    { id: 'easy', label: t.games.tower.easy, desc: t.games.tower.easyDesc },
    { id: 'medium', label: t.games.tower.medium, desc: t.games.tower.mediumDesc },
    { id: 'hard', label: t.games.tower.hard, desc: t.games.tower.hardDesc },
    { id: 'expert', label: t.games.tower.expert, desc: t.games.tower.expertDesc },
    { id: 'master', label: t.games.tower.master, desc: t.games.tower.masterDesc },
  ];

  useEffect(() => {
    void api
      .get<{ state: TowerRoundState | null }>('/games/tower/active')
      .then((res) => setRound(res.data.state))
      .catch(() => undefined);
  }, []);

  const start = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<TowerRoundState>('/games/tower/start', { amount, difficulty });
      setRound(res.data);
      setBalance((balance - amount).toFixed(2));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (col: number) => {
    if (!round || busy || round.status !== 'ACTIVE') return;
    setBusy(true);
    try {
      const res = await api.post<TowerPickResult>('/games/tower/pick', {
        roundId: round.roundId,
        col,
      });
      setRound(res.data.state);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const cashout = async () => {
    if (!round || busy) return;
    setBusy(true);
    try {
      const res = await api.post<TowerCashoutResult>('/games/tower/cashout', {
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

  const cols = round?.cols ?? 3;
  const totalLevels = round?.totalLevels ?? 9;
  const levels = Array.from({ length: totalLevels }, (_, i) => totalLevels - 1 - i);

  return (
    <div>
      <GameHeader
        section="§ GAME 09"
        breadcrumb="TOWER_09"
        title={t.games.tower.title}
        titleSuffix={t.games.tower.suffix}
        titleSuffixColor="acid"
        description={t.games.tower.description}
        rtpLabel="RTP 97%"
        rtpAccent="acid"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://TOWER</span>
              <span className="text-ink-400">
                {round
                  ? `${t.games.tower.level} ${round.currentLevel}/${round.totalLevels}`
                  : t.games.hilo.idle.toUpperCase()}
              </span>
            </div>

            <div className="mt-6 space-y-1">
              {levels.map((level) => {
                const revealed = round?.revealedLayout?.[level];
                const picked = round?.picks[level];
                const isCurrent = round?.currentLevel === level && round.status === 'ACTIVE';
                const isPast = round && level < round.currentLevel;
                return (
                  <div
                    key={level}
                    className={`flex items-center gap-2 border p-2 ${
                      isCurrent
                        ? 'border-neon-acid bg-neon-acid/5 shadow-acid-glow'
                        : 'border-white/5'
                    }`}
                  >
                    <span className="w-10 text-center text-[10px] tracking-[0.25em] text-ink-500">
                      L{level + 1}
                    </span>
                    <div className="flex flex-1 gap-1">
                      {Array.from({ length: cols }, (_, c) => {
                        const isPickedCell = isPast && picked === c;
                        const isSafeReveal = revealed?.includes(c);
                        const isBombReveal = revealed !== undefined && !isSafeReveal;
                        const isClickable = isCurrent && !busy;
                        let cls = 'border border-white/10 bg-ink-900 text-ink-500';
                        let label = '·';
                        if (isPast && isPickedCell) {
                          cls = 'border-neon-acid bg-neon-acid/20 text-neon-acid';
                          label = '◆';
                        } else if (round?.status !== 'ACTIVE' && isSafeReveal) {
                          cls = 'border-neon-acid/30 bg-neon-acid/5 text-neon-acid';
                          label = '◆';
                        } else if (
                          round?.status !== 'ACTIVE' &&
                          isBombReveal &&
                          revealed
                        ) {
                          cls = 'border-neon-ember/30 bg-neon-ember/5 text-neon-ember';
                          label = '✕';
                        } else if (isClickable) {
                          cls =
                            'border-neon-acid/40 bg-ink-900 hover:bg-neon-acid/10 cursor-pointer text-ink-300';
                          label = '?';
                        }
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => isClickable && pick(c)}
                            disabled={!isClickable}
                            className={`flex-1 py-3 font-display text-2xl transition ${cls}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {round && (
            <div className="grid grid-cols-3 gap-3">
              <Stat
                k={t.games.tower.current}
                v={formatMultiplier(round.currentMultiplier)}
                accent="acid"
              />
              <Stat
                k={t.games.tower.next}
                v={round.nextMultiplier ? formatMultiplier(round.nextMultiplier) : '—'}
              />
              <Stat k={t.games.tower.payout} v={formatAmount(round.potentialPayout)} />
            </div>
          )}

          {round?.status === 'BUSTED' && (
            <div className="border-2 border-neon-ember bg-neon-ember/5 p-5">
              <div className="font-display text-4xl text-neon-ember">
                {t.games.tower.trapTriggered}
              </div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                {t.games.mines.loss} -{formatAmount(round.amount)}
              </div>
            </div>
          )}
          {round?.status === 'CASHED_OUT' && (
            <div className="border-2 border-neon-acid bg-neon-acid/5 p-5 shadow-acid-glow">
              <div className="font-display text-4xl text-neon-acid">{t.games.tower.secured}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-400">
                {t.games.tower.payout} +{formatAmount(round.potentialPayout)}
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
              disabled={round?.status === 'ACTIVE' || busy}
            />

            <div className="mt-6">
              <div className="label">{t.games.tower.difficulty}</div>
              <div className="mt-2 space-y-1">
                {difficulties.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    disabled={round?.status === 'ACTIVE' || busy}
                    className={`flex w-full items-center justify-between border p-2 text-left transition ${
                      difficulty === d.id
                        ? 'border-neon-acid bg-neon-acid/10'
                        : 'border-white/10 bg-ink-950/50 hover:border-white/30'
                    } disabled:opacity-40`}
                  >
                    <span className="font-mono text-[12px] font-semibold tracking-[0.2em] text-bone">
                      {d.label}
                    </span>
                    <span className="text-[10px] text-ink-500">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {(!round || round.status !== 'ACTIVE') && (
                <button
                  type="button"
                  onClick={() => {
                    if (round && round.status !== 'ACTIVE') setRound(null);
                    void start();
                  }}
                  disabled={busy || balance < amount}
                  className="btn-acid w-full py-4"
                >
                  → {t.games.tower.start} · {formatAmount(amount)}
                </button>
              )}
              {round?.status === 'ACTIVE' && (
                <button
                  type="button"
                  onClick={cashout}
                  disabled={busy || round.currentLevel === 0}
                  className="btn-acid w-full py-4"
                >
                  ⇧ {t.bet.cashout.toUpperCase()} · {formatAmount(round.potentialPayout)}
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
