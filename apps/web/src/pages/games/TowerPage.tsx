import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  MIN_BET_AMOUNT,
  type TowerRoundState,
  type TowerPickResult,
  type TowerCashoutResult,
  type TowerDifficulty,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { TowerScene } from '@/games/tower/TowerScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';

const TOWER_PREVIEW_LEVELS: Record<TowerDifficulty, number> = {
  easy: 9,
  medium: 9,
  hard: 9,
  expert: 9,
  master: 9,
};
const TOWER_PREVIEW_COLS: Record<TowerDifficulty, number> = {
  easy: 4,
  medium: 3,
  hard: 4,
  expert: 5,
  master: 6,
};

export function TowerPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [difficulty, setDifficulty] = useState<TowerDifficulty>('easy');
  const [round, setRound] = useState<TowerRoundState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [winModal, setWinModal] = useState<{
    multiplier: number;
    payout: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<TowerScene | null>(null);
  const roundRef = useRef<TowerRoundState | null>(null);
  const pickLockRef = useRef(false);
  const stageHintRef = useRef<HTMLDivElement | null>(null);
  const stageHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const difficulties: { id: TowerDifficulty; label: string; desc: string }[] = [
    { id: 'easy', label: t.games.tower.easy, desc: t.games.tower.easyDesc },
    { id: 'medium', label: t.games.tower.medium, desc: t.games.tower.mediumDesc },
    { id: 'hard', label: t.games.tower.hard, desc: t.games.tower.hardDesc },
    { id: 'expert', label: t.games.tower.expert, desc: t.games.tower.expertDesc },
    { id: 'master', label: t.games.tower.master, desc: t.games.tower.masterDesc },
  ];

  const hideStageHintElement = (hint: HTMLElement | null) => {
    if (!hint) return;
    hint.style.opacity = '0';
    hint.style.transform = 'translateY(0.5rem)';
    hint.setAttribute('aria-hidden', 'true');
  };

  const showStageHintElement = (hint: HTMLElement | null) => {
    if (stageHintTimerRef.current) clearTimeout(stageHintTimerRef.current);
    if (hint) {
      hint.style.opacity = '1';
      hint.style.transform = 'translateY(0)';
      hint.setAttribute('aria-hidden', 'false');
    }
    stageHintTimerRef.current = setTimeout(() => hideStageHintElement(hint), 2200);
  };

  const hideStageHint = () => {
    hideStageHintElement(stageHintRef.current);
  };

  const showStageHint = () => {
    showStageHintElement(stageHintRef.current);
  };

  const showStageHintFromBlocker = (node: HTMLElement) => {
    const hint = node.parentElement?.querySelector<HTMLElement>('[data-stage-hint]');
    showStageHintElement(hint ?? stageHintRef.current);
  };

  useEffect(() => {
    return () => {
      if (stageHintTimerRef.current) clearTimeout(stageHintTimerRef.current);
    };
  }, []);

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
      void scene
        .init(canvas, w, h, (level, col) => {
          void pickInternal(level, col);
        })
        .then(() => {
          if (cancelled) return;
          const active = roundRef.current;
          if (active) renderTowerState(active);
          else renderTowerPreview(difficulty);
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
          hideStageHint();
          renderTowerState(res.data.state);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (roundRef.current?.status === 'ACTIVE') return;
    renderTowerPreview(difficulty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty]);

  function renderTowerPreview(mode: TowerDifficulty) {
    sceneRef.current?.setup(TOWER_PREVIEW_LEVELS[mode], TOWER_PREVIEW_COLS[mode]);
    sceneRef.current?.setMultiplier('1.00');
  }

  function renderTowerState(state: TowerRoundState) {
    sceneRef.current?.setup(state.totalLevels, state.cols);
    for (let lv = 0; lv < state.picks.length; lv += 1) {
      const col = state.picks[lv];
      if (col !== undefined) sceneRef.current?.pick(lv, col, true);
    }
    sceneRef.current?.focusOnLevel(state.currentLevel, false);
    sceneRef.current?.setMultiplier(Number.parseFloat(state.currentMultiplier).toFixed(2));
  }

  const start = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) return;
    setBusy(true);
    setError(null);
    setWinModal(null);
    hideStageHint();
    const releaseBalanceRefresh = holdWalletBalanceRefresh();
    const previousBalance = useAuthStore.getState().debitBalance(amount);
    try {
      const res = await api.post<TowerRoundState>('/games/tower/start', { amount, difficulty });
      setRound(res.data);
      roundRef.current = res.data;
      sceneRef.current?.setup(res.data.totalLevels, res.data.cols);
      sceneRef.current?.setInputLocked(false);
      sceneRef.current?.focusOnLevel(0, true);
      sceneRef.current?.setMultiplier('1.00');
    } catch (err) {
      if (previousBalance) setBalance(previousBalance);
      setError(extractApiError(err).message);
    } finally {
      releaseBalanceRefresh();
      setBusy(false);
    }
  };

  const pickInternal = async (level: number, col: number) => {
    if (pickLockRef.current) return;
    const current = roundRef.current;
    if (!current || current.status !== 'ACTIVE') {
      showStageHint();
      return;
    }
    if (level !== current.currentLevel) return;
    pickLockRef.current = true;
    sceneRef.current?.setInputLocked(true);
    // 樂觀動畫：確認有進行中局之後，才脈動該格。
    sceneRef.current?.markPending(level, col);
    setBusy(true);
    try {
      const res = await api.post<TowerPickResult>('/games/tower/pick', {
        roundId: current.roundId,
        level,
        col,
      });
      sceneRef.current?.pick(level, col, !res.data.hitTrap);
      setRound(res.data.state);
      roundRef.current = res.data.state;
      if (res.data.newBalance) setBalance(res.data.newBalance);
      if (res.data.hitTrap && res.data.state.revealedLayout) {
        setWinModal(null);
        sceneRef.current?.revealAll(res.data.state.revealedLayout);
        setHistory((prev) =>
          [
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
          ].slice(0, 30),
        );
      } else if (res.data.state.status === 'CASHED_OUT') {
        if (res.data.state.revealedLayout)
          sceneRef.current?.revealAll(res.data.state.revealedLayout);
        const cashMult = Number.parseFloat(res.data.state.currentMultiplier);
        const payout = Number.parseFloat(res.data.state.potentialPayout);
        setWinModal({ multiplier: cashMult, payout });
        sceneRef.current?.celebrate(cashMult);
        sceneRef.current?.playWinFx(cashMult, true);
        setHistory((prev) =>
          [
            {
              id: res.data.state.roundId,
              timestamp: Date.now(),
              betAmount: amount,
              multiplier: cashMult,
              payout,
              won: cashMult >= 1,
              detail: `通關 · ${res.data.state.difficulty}`,
            },
            ...prev,
          ].slice(0, 30),
        );
      } else {
        sceneRef.current?.setMultiplier(
          Number.parseFloat(res.data.state.currentMultiplier).toFixed(2),
        );
      }
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
      window.setTimeout(() => {
        pickLockRef.current = false;
        sceneRef.current?.setInputLocked(false);
      }, 420);
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
      if (res.data.state.status === 'BUSTED') {
        setWinModal(null);
        setHistory((prev) =>
          [
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
      setWinModal({ multiplier: cashMult, payout });
      sceneRef.current?.celebrate(cashMult);
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
            detail: `${res.data.state.picks.length} 層 · ${res.data.state.difficulty}`,
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

  const isActive = round?.status === 'ACTIVE';

  return (
    <div>
      <GameHeader
        artwork="/game-art/tower/background.png"
        section="§ GAME 09"
        breadcrumb="TOWER_09"
        title="爬階梯"
        titleSuffix="STAIRS"
        titleSuffixColor="acid"
        description={t.games.tower.description}
        rtpLabel="RTP 90%"
        rtpAccent="acid"
      />

      <div
        className={`game-play-grid game-play-grid--tower grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] ${isActive ? 'game-play-grid--tower-active' : ''}`}
      >
        <div className="game-main-stack space-y-4">
          <div
            className={`tower-stage-panel game-stage-panel scanlines p-3 ${isActive ? 'tower-stage-panel--active' : ''}`}
          >
            <div className="game-stage-bar -mx-3 -mt-3 mb-3 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">爬階梯</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">STAIRS</span>
              <GameActivityHeat gameId="tower" />
              <span className="text-white/72">
                {round
                  ? `${t.games.tower.level} ${round.currentLevel}/${round.totalLevels}`
                  : t.games.hilo.idle.toUpperCase()}
              </span>
            </div>

            <div
              className="tower-canvas game-canvas-shell game-canvas-tall relative mx-auto mt-2 aspect-[4/5] w-full max-w-[620px]"
              style={{ width: 'min(100%, 620px, calc(74svh * 0.8))', maxHeight: 'none' }}
            >
              <canvas ref={canvasRef} className="h-full w-full" />
              {!isActive ? (
                <button
                  type="button"
                  aria-label="請先下注"
                  className="absolute inset-0 z-10 cursor-pointer bg-transparent"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    showStageHintFromBlocker(event.currentTarget);
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    showStageHintFromBlocker(event.currentTarget);
                  }}
                />
              ) : null}
              <div
                ref={stageHintRef}
                data-stage-hint="tower"
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-3 bottom-3 z-20 translate-y-2 rounded-[14px] border border-[#F3D67D]/45 bg-[#07131F]/88 px-3 py-2 text-center text-[12px] font-bold tracking-[0.08em] text-[#F3D67D] opacity-0 shadow-[0_12px_28px_rgba(2,6,23,0.28)] backdrop-blur transition duration-200"
              >
                請先下注並開始本局，再點擊塔格。
              </div>
              {round?.status === 'BUSTED' && (
                <div className="tower-result-toast tower-result-toast--loss">
                  <span>{t.games.tower.trapTriggered}</span>
                  <strong>
                    {t.games.mines.loss} -{formatAmount(round.amount)}
                  </strong>
                </div>
              )}
              {round?.status === 'CASHED_OUT' && (
                <div className="tower-result-toast tower-result-toast--win">
                  <span>{t.games.tower.secured}</span>
                  <strong>
                    {t.games.tower.payout} +{formatAmount(round.potentialPayout)}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {round && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div
          className={`game-control-stack space-y-4 ${isActive ? 'tower-control-stack--active' : ''}`}
        >
          <div
            className={`tower-control-card game-side-card p-5 ${isActive ? 'tower-control-card--active' : ''}`}
          >
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              gameId="tower"
              disabled={round?.status === 'ACTIVE' || busy}
            />

            <div className="tower-difficulty-control mt-6">
              <div className="label">{t.games.tower.difficulty}</div>
              <div className="tower-difficulty-options mt-2 space-y-1">
                {difficulties.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDifficulty(d.id)}
                    disabled={round?.status === 'ACTIVE' || busy}
                    className={`tower-difficulty-option ${
                      difficulty === d.id ? 'tower-difficulty-option--active' : ''
                    }`}
                  >
                    <span className="tower-difficulty-option__label">{d.label}</span>
                    <span className="tower-difficulty-option__desc">{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="tower-action-panel mt-6 space-y-2">
              {(!round || round.status !== 'ACTIVE') && (
                <button
                  type="button"
                  onClick={() => {
                    if (round && round.status !== 'ACTIVE') setRound(null);
                    void start();
                  }}
                  disabled={busy || (!!user && balance < amount)}
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
      {winModal ? (
        <button
          type="button"
          className="tower-win-modal"
          aria-label="關閉贏分畫面"
          onClick={() => setWinModal(null)}
        >
          <span className="tower-win-modal__panel">
            <span className="tower-win-modal__sparkles">✦ · ✦</span>
            <span className="tower-win-modal__multiplier">
              {formatMultiplier(winModal.multiplier.toFixed(4))}
            </span>
            <span className="tower-win-modal__title">YOU WON</span>
            <span className="tower-win-modal__payout">{formatAmount(winModal.payout)}</span>
          </span>
        </button>
      ) : null}
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
