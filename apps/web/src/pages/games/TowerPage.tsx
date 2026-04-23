import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
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
import { TowerScene } from '@/games/tower/TowerScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

export function TowerPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] = useState<TowerDifficulty>('medium');
  const [round, setRound] = useState<TowerRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TowerScene | null>(null);
  const roundRef = useRef<TowerRoundState | null>(null);

  const difficulties: { id: TowerDifficulty; label: string; desc: string }[] = [
    { id: 'easy', label: t.games.tower.easy, desc: t.games.tower.easyDesc },
    { id: 'medium', label: t.games.tower.medium, desc: t.games.tower.mediumDesc },
    { id: 'hard', label: t.games.tower.hard, desc: t.games.tower.hardDesc },
    { id: 'expert', label: t.games.tower.expert, desc: t.games.tower.expertDesc },
    { id: 'master', label: t.games.tower.master, desc: t.games.tower.masterDesc },
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: TowerScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new TowerScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h, (level, col) => {
        void pickInternal(level, col);
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
      .get<{ state: TowerRoundState | null }>('/games/tower/active')
      .then((res) => {
        if (res.data.state) {
          setRound(res.data.state);
          roundRef.current = res.data.state;
          // 恢復 scene 狀態
          sceneRef.current?.setup(res.data.state.totalLevels, res.data.state.cols);
          for (let lv = 0; lv < res.data.state.picks.length; lv += 1) {
            const col = res.data.state.picks[lv];
            if (col !== undefined) sceneRef.current?.pick(lv, col, true);
          }
          sceneRef.current?.focusOnLevel(res.data.state.currentLevel, false);
          sceneRef.current?.setMultiplier(Number.parseFloat(res.data.state.currentMultiplier).toFixed(2));
        }
      })
      .catch(() => undefined);
  }, []);

  const start = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<TowerRoundState>('/games/tower/start', { amount, difficulty });
      setRound(res.data);
      roundRef.current = res.data;
      setBalance((balance - amount).toFixed(2));
      sceneRef.current?.setup(res.data.totalLevels, res.data.cols);
      sceneRef.current?.focusOnLevel(0, true);
      sceneRef.current?.setMultiplier('1.00');
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const pickInternal = async (level: number, col: number) => {
    // 乐观动画：立刻脉动该格
    sceneRef.current?.markPending(level, col);
    const current = roundRef.current;
    if (!current || current.status !== 'ACTIVE') return;
    if (level !== current.currentLevel) return;
    setBusy(true);
    try {
      const res = await api.post<TowerPickResult>('/games/tower/pick', {
        roundId: current.roundId,
        col,
      });
      sceneRef.current?.pick(level, col, !res.data.hitTrap);
      setRound(res.data.state);
      roundRef.current = res.data.state;
      if (res.data.hitTrap && res.data.state.revealedLayout) {
        sceneRef.current?.revealAll(res.data.state.revealedLayout);
        setHistory((prev) => [
          {
            id: res.data.state.roundId,
            timestamp: Date.now(),
            betAmount: amount,
            multiplier: 0,
            payout: 0,
            won: false,
            detail: `${res.data.state.picks.length} 層 · ${res.data.state.difficulty}`,
          },
          ...prev,
        ].slice(0, 30));
      } else {
        sceneRef.current?.setMultiplier(
          Number.parseFloat(res.data.state.currentMultiplier).toFixed(2),
        );
      }
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
      roundRef.current = res.data.state;
      setBalance(res.data.newBalance);
      if (res.data.state.revealedLayout) {
        sceneRef.current?.revealAll(res.data.state.revealedLayout);
      }
      const cashMult = Number.parseFloat(res.data.state.currentMultiplier);
      sceneRef.current?.celebrate(cashMult);
      sceneRef.current?.playWinFx(cashMult, true);
      setHistory((prev) => [
        {
          id: res.data.state.roundId,
          timestamp: Date.now(),
          betAmount: amount,
          multiplier: cashMult,
          payout: amount * cashMult,
          won: true,
          detail: `${res.data.state.picks.length} 層 · ${res.data.state.difficulty}`,
        },
        ...prev,
      ].slice(0, 30));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        artwork="/games/tower.jpg"
        section="§ GAME 09"
        breadcrumb="TOWER_09"
        title={t.games.tower.title}
        titleSuffix={t.games.tower.suffix}
        titleSuffixColor="acid"
        description={t.games.tower.description}
        rtpLabel="RTP 97%"
        rtpAccent="acid"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="game-stage-panel scanlines p-3">
            <div className="game-stage-bar -mx-3 -mt-3 mb-3 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">疊塔</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">Tower</span>
              <span className="text-white/72">
                {round
                  ? `${t.games.tower.level} ${round.currentLevel}/${round.totalLevels}`
                  : t.games.hilo.idle.toUpperCase()}
              </span>
            </div>

            <div className="game-canvas-shell mx-auto mt-2 aspect-[3/4] w-full max-w-[420px]">
              <canvas ref={canvasRef} className="h-full w-full" />
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
            <div className="game-result-card game-result-card-loss">
              <div className="font-display text-4xl text-[#FCA5A5]">
                {t.games.tower.trapTriggered}
              </div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                {t.games.mines.loss} -{formatAmount(round.amount)}
              </div>
            </div>
          )}
          {round?.status === 'CASHED_OUT' && (
            <div className="game-result-card game-result-card-win">
              <div className="font-display text-4xl text-[#7DD3FC]">{t.games.tower.secured}</div>
              <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                {t.games.tower.payout} +{formatAmount(round.potentialPayout)}
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
                    className={`flex w-full items-center justify-between rounded-[16px] border p-3 text-left transition ${
                      difficulty === d.id
                        ? 'border-neon-acid/30 bg-neon-acid/8'
                        : 'border-white/10 bg-white/76 hover:border-[#186073]/28'
                    } disabled:opacity-40`}
                  >
                    <span className="font-mono text-[12px] font-semibold tracking-[0.2em] text-white">
                      {d.label}
                    </span>
                    <span className="text-[10px] text-white/55">{d.desc}</span>
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
              <div className="game-balance-strip mt-3">
                <span>
                  {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
                </span>
                <span>
                  {t.games.tower.current}{' '}
                  <span className="data-num ml-1 text-[#7DD3FC]">
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
