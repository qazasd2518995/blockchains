import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot } from 'lucide-react';
import {
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  type KenoBetRequest,
  type KenoBetResult,
  type KenoRisk,
} from '@bg/shared';
import { kenoMultiplier } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { KenoScene } from '@/games/keno/KenoScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';

const POOL_SIZE = 40;
const MAX_PICKS = 10;
const KENO_AUTO_ROUND_PRESETS = [10, 25, 50, 100] as const;
const KENO_AUTO_MAX_ROUNDS = 500;
const KENO_AUTO_DELAY_FAST_MS = 110;
const KENO_AUTO_DELAY_NORMAL_MS = 280;
const KENO_AUTO_ANIMATION_SPEED = 3;

type KenoAutoChangeMode = 'reset' | 'increase';

interface KenoAutoDraft {
  rounds: string;
  amount: string;
  stopProfit: string;
  stopLoss: string;
  maxBet: string;
  onWinMode: KenoAutoChangeMode;
  onWinIncrease: string;
  onLossMode: KenoAutoChangeMode;
  onLossIncrease: string;
  autoPickEachRound: boolean;
  fast: boolean;
}

interface KenoAutoSettings {
  rounds: number | null;
  amount: number;
  stopProfit: number;
  stopLoss: number;
  maxBet: number;
  onWinMode: KenoAutoChangeMode;
  onWinIncrease: number;
  onLossMode: KenoAutoChangeMode;
  onLossIncrease: number;
  autoPickEachRound: boolean;
  fast: boolean;
  risk: KenoRisk;
  selected: number[];
}

interface KenoAutoStats {
  placed: number;
  wins: number;
  losses: number;
  wagered: number;
  netProfit: number;
  currentAmount: number;
  lastHits: number;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function roundPositiveMoney(value: number): number {
  return Math.max(0, roundMoney(value));
}

function createKenoAutoDraft(amount: number): KenoAutoDraft {
  const stake = Math.max(MIN_BET_AMOUNT, Math.min(MAX_BET_AMOUNT, roundPositiveMoney(amount)));
  const maxBet = Math.max(stake, roundPositiveMoney(stake * 10));
  return {
    rounds: 'infinite',
    amount: stake.toFixed(2),
    stopProfit: '0',
    stopLoss: '0',
    maxBet: maxBet.toFixed(2),
    onWinMode: 'reset',
    onWinIncrease: '0',
    onLossMode: 'reset',
    onLossIncrease: '0',
    autoPickEachRound: false,
    fast: true,
  };
}

function createKenoAutoStats(currentAmount = 0): KenoAutoStats {
  return {
    placed: 0,
    wins: 0,
    losses: 0,
    wagered: 0,
    netProfit: 0,
    currentAmount: roundPositiveMoney(currentAmount),
    lastHits: 0,
  };
}

function parsePositiveAmount(value: string): number {
  return roundPositiveMoney(Number.parseFloat(value));
}

function parsePercent(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(1000, parsed);
}

function sortedPicks(picks: Iterable<number>): number[] {
  return Array.from(new Set(picks)).sort((a, b) => a - b);
}

function randomKenoPicks(count: number): number[] {
  const target = Math.max(1, Math.min(MAX_PICKS, Math.floor(count)));
  const next = new Set<number>();
  while (next.size < target) {
    next.add(Math.floor(Math.random() * POOL_SIZE) + 1);
  }
  return sortedPicks(next);
}

function parseKenoAutoSettings(
  draft: KenoAutoDraft,
  picks: Iterable<number>,
  risk: KenoRisk,
): KenoAutoSettings | null {
  const selected = sortedPicks(picks);
  if (selected.length < 1 || selected.length > MAX_PICKS) return null;

  const rawRounds = draft.rounds.trim().toLowerCase();
  let rounds: number | null = null;
  if (rawRounds === 'infinite' || rawRounds === '∞') {
    rounds = null;
  } else {
    const parsedRounds = Math.floor(Number.parseFloat(rawRounds));
    if (!Number.isFinite(parsedRounds) || parsedRounds < 1 || parsedRounds > KENO_AUTO_MAX_ROUNDS) {
      return null;
    }
    rounds = parsedRounds;
  }

  const amount = parsePositiveAmount(draft.amount);
  const stopProfit = parsePositiveAmount(draft.stopProfit);
  const stopLoss = parsePositiveAmount(draft.stopLoss);
  const maxBet = parsePositiveAmount(draft.maxBet);
  if (amount < MIN_BET_AMOUNT || amount > MAX_BET_AMOUNT) return null;
  if (maxBet < amount || maxBet > MAX_BET_AMOUNT) return null;

  return {
    rounds,
    amount,
    stopProfit,
    stopLoss,
    maxBet,
    onWinMode: draft.onWinMode,
    onWinIncrease: parsePercent(draft.onWinIncrease),
    onLossMode: draft.onLossMode,
    onLossIncrease: parsePercent(draft.onLossIncrease),
    autoPickEachRound: draft.autoPickEachRound,
    fast: draft.fast,
    risk,
    selected,
  };
}

function getNextKenoAutoAmount(
  settings: KenoAutoSettings,
  currentAmount: number,
  won: boolean,
): number {
  const mode = won ? settings.onWinMode : settings.onLossMode;
  const increase = won ? settings.onWinIncrease : settings.onLossIncrease;
  if (mode === 'increase' && increase > 0) {
    return roundPositiveMoney(currentAmount * (1 + increase / 100));
  }
  return settings.amount;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function KenoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [risk, setRisk] = useState<KenoRisk>('medium');
  const [result, setResult] = useState<KenoBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoDraft, setAutoDraft] = useState<KenoAutoDraft>(() => createKenoAutoDraft(10));
  const [autoActive, setAutoActive] = useState(false);
  const [autoRemaining, setAutoRemaining] = useState<number | null>(null);
  const [autoStopReason, setAutoStopReason] = useState('');
  const [autoStats, setAutoStats] = useState<KenoAutoStats>(() => createKenoAutoStats(10));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KenoScene | null>(null);
  const balanceRef = useRef(balance);
  const busyRef = useRef(false);
  const autoActiveRef = useRef(false);
  const autoSettingsRef = useRef<KenoAutoSettings | null>(null);
  const autoCurrentAmountRef = useRef(10);
  const autoStatsRef = useRef<KenoAutoStats>(createKenoAutoStats(10));

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: KenoScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new KenoScene();
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

  const clearRoundResult = useCallback(() => {
    setResult(null);
    sceneRef.current?.reset();
  }, []);

  const toggle = (n: number) => {
    if (busy || autoActive) return;
    if (result) clearRoundResult();
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else if (next.size < MAX_PICKS) next.add(n);
    setSelected(next);
  };

  const autoPick = () => {
    if (busy || autoActive) return;
    if (result) clearRoundResult();
    setSelected(new Set(randomKenoPicks(8)));
  };

  const clearAll = () => {
    if (busy || autoActive) return;
    if (result) clearRoundResult();
    setSelected(new Set());
  };

  useEffect(() => {
    return () => {
      autoActiveRef.current = false;
      autoSettingsRef.current = null;
    };
  }, []);

  const stopAutoBet = useCallback((reason: string, showReason = true) => {
    autoActiveRef.current = false;
    autoSettingsRef.current = null;
    setAutoActive(false);
    setAutoRemaining(null);
    if (showReason) setAutoStopReason(reason);
  }, []);

  const placeKenoBet = useCallback(
    async (
      betAmount: number,
      picks: number[],
      betRisk: KenoRisk,
      options: { fast?: boolean } = {},
    ): Promise<KenoBetResult | null> => {
      if (busyRef.current) return null;
      if (!requireLogin()) return null;

      const chosen = sortedPicks(picks);
      const stake = roundPositiveMoney(betAmount);
      const latestBalance = Number.parseFloat(
        useAuthStore.getState().user?.balance ?? String(balanceRef.current),
      );
      if (chosen.length === 0) {
        setError('請先選號或使用自動挑選。');
        return null;
      }
      if (stake < MIN_BET_AMOUNT || stake > MAX_BET_AMOUNT || stake > latestBalance) {
        setError(t.bet.insufficientBalance);
        return null;
      }

      setBusy(true);
      busyRef.current = true;
      setError(null);
      clearRoundResult();
      const releaseBalanceRefresh = holdWalletBalanceRefresh();

      try {
        const payload: KenoBetRequest = {
          amount: stake,
          selected: chosen,
          risk: betRisk,
        };
        const res = await api.post<KenoBetResult>('/games/keno/bet', payload);
        await sceneRef.current?.playDraw(
          res.data.drawn,
          res.data.selected,
          res.data.hits,
          options.fast ? KENO_AUTO_ANIMATION_SPEED : 1,
        );
        if (!options.fast || res.data.multiplier >= 10) {
          sceneRef.current?.playWinFx(res.data.multiplier, res.data.multiplier > 1);
        }
        setResult(res.data);
        const nextBalance = Number.parseFloat(res.data.newBalance);
        if (Number.isFinite(nextBalance)) balanceRef.current = nextBalance;
        setBalance(res.data.newBalance);
        setHistory((prev) =>
          [
            {
              id: res.data.betId,
              timestamp: Date.now(),
              betAmount: stake,
              multiplier: res.data.multiplier,
              payout: stake * res.data.multiplier,
              won: res.data.multiplier > 1,
              detail: `${res.data.hits.length}/${res.data.selected.length} 命中`,
            },
            ...prev,
          ].slice(0, 30),
        );
        return res.data;
      } catch (err) {
        setError(extractApiError(err).message);
        return null;
      } finally {
        releaseBalanceRefresh();
        busyRef.current = false;
        setBusy(false);
      }
    },
    [clearRoundResult, requireLogin, setBalance, t.bet.insufficientBalance],
  );

  const runAutoBetLoop = useCallback(async () => {
    while (autoActiveRef.current) {
      const settings = autoSettingsRef.current;
      if (!settings) break;

      const currentStats = autoStatsRef.current;
      if (settings.rounds !== null && currentStats.placed >= settings.rounds) {
        stopAutoBet('自動投注完成');
        break;
      }

      const stake = roundPositiveMoney(autoCurrentAmountRef.current);
      const latestBalance = Number.parseFloat(
        useAuthStore.getState().user?.balance ?? String(balanceRef.current),
      );
      if (stake < MIN_BET_AMOUNT || stake > MAX_BET_AMOUNT) {
        stopAutoBet('投注金額超出限制');
        break;
      }
      if (stake > settings.maxBet) {
        stopAutoBet('達到單注上限');
        break;
      }
      if (stake > latestBalance) {
        setError(t.bet.insufficientBalance);
        stopAutoBet('餘額不足，已停止');
        break;
      }

      const picks = settings.autoPickEachRound
        ? randomKenoPicks(settings.selected.length)
        : settings.selected;
      setSelected(new Set(picks));
      setAmount(stake);

      const betResult = await placeKenoBet(stake, picks, settings.risk, { fast: settings.fast });
      if (!betResult) {
        if (autoActiveRef.current) stopAutoBet('下注失敗，已停止');
        break;
      }

      const profit = Number.parseFloat(betResult.profit);
      const won = Number.isFinite(profit) && profit > 0;
      const nextAmount = getNextKenoAutoAmount(settings, stake, won);
      const nextStats: KenoAutoStats = {
        placed: currentStats.placed + 1,
        wins: currentStats.wins + (won ? 1 : 0),
        losses: currentStats.losses + (won ? 0 : 1),
        wagered: roundPositiveMoney(currentStats.wagered + stake),
        netProfit: roundMoney(currentStats.netProfit + (Number.isFinite(profit) ? profit : 0)),
        currentAmount: nextAmount,
        lastHits: betResult.hitCount,
      };
      autoCurrentAmountRef.current = nextAmount;
      autoStatsRef.current = nextStats;
      setAutoStats(nextStats);
      setAmount(nextAmount);
      setAutoRemaining(
        settings.rounds === null ? null : Math.max(0, settings.rounds - nextStats.placed),
      );

      if (!autoActiveRef.current) break;
      if (settings.rounds !== null && nextStats.placed >= settings.rounds) {
        stopAutoBet('自動投注完成');
        break;
      }
      if (settings.stopProfit > 0 && nextStats.netProfit >= settings.stopProfit) {
        stopAutoBet('達到停利');
        break;
      }
      if (settings.stopLoss > 0 && nextStats.netProfit <= -settings.stopLoss) {
        stopAutoBet('達到停損');
        break;
      }
      if (nextAmount > settings.maxBet) {
        stopAutoBet('達到單注上限');
        break;
      }

      await wait(settings.fast ? KENO_AUTO_DELAY_FAST_MS : KENO_AUTO_DELAY_NORMAL_MS);
    }
  }, [placeKenoBet, stopAutoBet, t.bet.insufficientBalance]);

  const handleBet = () => {
    if (autoActive) return;
    void placeKenoBet(amount, sortedPicks(selected), risk);
  };

  const openAutoSettings = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoActive) return;
    setAutoDraft(createKenoAutoDraft(amount));
    setAutoStopReason('');
    setAutoOpen(true);
  };

  const updateAutoDraft = <K extends keyof KenoAutoDraft>(field: K, value: KenoAutoDraft[K]) => {
    setAutoDraft((prev) => ({ ...prev, [field]: value }));
  };

  const startAutoBet = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoActiveRef.current) return;

    const settings = parseKenoAutoSettings(autoDraft, selected, risk);
    if (!settings) {
      const draftAmount = parsePositiveAmount(autoDraft.amount);
      if (selected.size === 0) {
        setError('請先選號或使用自動挑選。');
      } else if (draftAmount < MIN_BET_AMOUNT) {
        setError(`最低下注為 ${formatAmount(MIN_BET_AMOUNT)}。`);
      } else if (draftAmount > MAX_BET_AMOUNT) {
        setError(`單注上限為 ${formatAmount(MAX_BET_AMOUNT)}。`);
      } else {
        setError('自動投注設定不完整。');
      }
      return;
    }

    const latestBalance = Number.parseFloat(
      useAuthStore.getState().user?.balance ?? String(balanceRef.current),
    );
    if (settings.amount > latestBalance) {
      setError(t.bet.insufficientBalance);
      return;
    }

    const initialStats = createKenoAutoStats(settings.amount);
    autoSettingsRef.current = settings;
    autoCurrentAmountRef.current = settings.amount;
    autoStatsRef.current = initialStats;
    autoActiveRef.current = true;
    setAmount(settings.amount);
    setRisk(settings.risk);
    setSelected(new Set(settings.selected));
    setAutoStats(initialStats);
    setAutoRemaining(settings.rounds);
    setAutoStopReason('');
    setAutoOpen(false);
    setAutoActive(true);
    void runAutoBetLoop();
  };

  const drawn = new Set(result?.drawn ?? []);
  const hits = new Set(result?.hits ?? []);
  const selectedCount = selected.size;
  const payoutRow =
    selectedCount > 0
      ? Array.from({ length: selectedCount + 1 }, (_, hitCount) => ({
          hitCount,
          multiplier: kenoMultiplier(risk, selectedCount, hitCount),
        }))
      : [];
  const controlsLocked = busy || autoActive;
  const autoSettingsPreview = parseKenoAutoSettings(autoDraft, selected, risk);
  const autoButtonValue = autoActive
    ? autoRemaining === null
      ? '∞'
      : `剩 ${autoRemaining}`
    : '設定';
  const autoDialog = autoOpen ? (
    <div
      className="slot-auto-modal keno-auto-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="keno-auto-title"
    >
      <div className="slot-auto-modal__panel keno-auto-modal__panel">
        <div className="slot-auto-modal__header">
          <div>
            <span>基諾自動投注</span>
            <strong id="keno-auto-title">掛機設定</strong>
          </div>
          <button type="button" onClick={() => setAutoOpen(false)} aria-label={t.common.close}>
            {t.common.close}
          </button>
        </div>

        <div className="slot-auto-modal__body">
          <section className="keno-auto-section">
            <div className="keno-auto-section__title">投注數量</div>
            <div className="slot-auto-presets keno-auto-presets">
              <button
                type="button"
                onClick={() => updateAutoDraft('rounds', 'infinite')}
                className={autoDraft.rounds === 'infinite' ? 'slot-auto-preset--active' : ''}
              >
                ∞
              </button>
              {KENO_AUTO_ROUND_PRESETS.map((preset) => {
                const value = String(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateAutoDraft('rounds', value)}
                    className={autoDraft.rounds === value ? 'slot-auto-preset--active' : ''}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="slot-auto-grid">
            <label className="slot-auto-field">
              <span>每注金額</span>
              <input
                type="number"
                min={MIN_BET_AMOUNT}
                max={MAX_BET_AMOUNT}
                step={0.01}
                value={autoDraft.amount}
                onChange={(event) => updateAutoDraft('amount', event.target.value)}
              />
            </label>
            <label className="slot-auto-field">
              <span>單注上限</span>
              <input
                type="number"
                min={MIN_BET_AMOUNT}
                max={MAX_BET_AMOUNT}
                step={0.01}
                value={autoDraft.maxBet}
                onChange={(event) => updateAutoDraft('maxBet', event.target.value)}
              />
            </label>
            <label className="slot-auto-field">
              <span>停利金額</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoDraft.stopProfit}
                onChange={(event) => updateAutoDraft('stopProfit', event.target.value)}
              />
            </label>
            <label className="slot-auto-field">
              <span>停損金額</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoDraft.stopLoss}
                onChange={(event) => updateAutoDraft('stopLoss', event.target.value)}
              />
            </label>
          </div>

          <section className="keno-auto-section">
            <div className="keno-auto-section__title">贏局後</div>
            <div className="keno-auto-adjust-grid">
              <div className="slot-auto-presets keno-auto-mode-presets">
                <button
                  type="button"
                  onClick={() => updateAutoDraft('onWinMode', 'reset')}
                  className={autoDraft.onWinMode === 'reset' ? 'slot-auto-preset--active' : ''}
                >
                  重設
                </button>
                <button
                  type="button"
                  onClick={() => updateAutoDraft('onWinMode', 'increase')}
                  className={autoDraft.onWinMode === 'increase' ? 'slot-auto-preset--active' : ''}
                >
                  加注
                </button>
              </div>
              <label className="slot-auto-field">
                <span>增加 %</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  value={autoDraft.onWinIncrease}
                  disabled={autoDraft.onWinMode !== 'increase'}
                  onChange={(event) => updateAutoDraft('onWinIncrease', event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="keno-auto-section">
            <div className="keno-auto-section__title">輸局後</div>
            <div className="keno-auto-adjust-grid">
              <div className="slot-auto-presets keno-auto-mode-presets">
                <button
                  type="button"
                  onClick={() => updateAutoDraft('onLossMode', 'reset')}
                  className={autoDraft.onLossMode === 'reset' ? 'slot-auto-preset--active' : ''}
                >
                  重設
                </button>
                <button
                  type="button"
                  onClick={() => updateAutoDraft('onLossMode', 'increase')}
                  className={autoDraft.onLossMode === 'increase' ? 'slot-auto-preset--active' : ''}
                >
                  加注
                </button>
              </div>
              <label className="slot-auto-field">
                <span>增加 %</span>
                <input
                  type="number"
                  min={0}
                  max={1000}
                  step={1}
                  value={autoDraft.onLossIncrease}
                  disabled={autoDraft.onLossMode !== 'increase'}
                  onChange={(event) => updateAutoDraft('onLossIncrease', event.target.value)}
                />
              </label>
            </div>
          </section>

          <div className="slot-auto-switches keno-auto-switches">
            <label className="slot-auto-switch">
              <input
                type="checkbox"
                checked={autoDraft.autoPickEachRound}
                onChange={(event) => updateAutoDraft('autoPickEachRound', event.target.checked)}
              />
              每局重新自動挑選
            </label>
            <label className="slot-auto-switch">
              <input
                type="checkbox"
                checked={autoDraft.fast}
                onChange={(event) => updateAutoDraft('fast', event.target.checked)}
              />
              快速開獎
            </label>
          </div>
        </div>

        <div className="slot-auto-modal__footer">
          <div className="slot-auto-summary">
            <span>設定預覽</span>
            <strong>
              {autoSettingsPreview
                ? `${
                    autoSettingsPreview.rounds === null ? '∞' : autoSettingsPreview.rounds
                  } 局 · ${autoSettingsPreview.selected.length} 號 · ${formatAmount(
                    autoSettingsPreview.amount,
                  )}`
                : '—'}
            </strong>
          </div>
          <div className="slot-auto-actions">
            <button type="button" onClick={() => setAutoOpen(false)}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={startAutoBet}
              disabled={!autoSettingsPreview || (!!user && balance < autoSettingsPreview.amount)}
            >
              開始掛機
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="keno-game-page">
      {autoDialog}
      <GameHeader
        artwork="/game-art/keno/background.png"
        section="§ GAME 04"
        breadcrumb="KENO_04"
        title={t.games.keno.title}
        titleSuffix={t.games.keno.suffix}
        titleSuffixColor="ice"
        description={t.games.keno.description}
        rtpLabel="RTP 97%"
        rtpAccent="ice"
      />

      <div className="game-play-grid game-play-grid--keno grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="keno-stage-panel game-stage-panel scanlines p-4">
            <div className="game-stage-bar -mx-4 -mt-4 mb-4 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">基諾</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Keno</span>
              <GameActivityHeat gameId="keno" />
              <span className="text-white/72">
                {t.games.keno.selected} {selectedCount}/{MAX_PICKS}
              </span>
            </div>

            <div className="game-canvas-shell game-canvas-keno mt-3 aspect-[16/5] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            <div className="keno-number-grid mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-8 sm:gap-2">
              {Array.from({ length: POOL_SIZE }, (_, i) => i + 1).map((n) => {
                const picked = selected.has(n);
                const isDrawn = drawn.has(n);
                const isHit = hits.has(n);
                let cls =
                  'border-white/12 bg-white/[0.06] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]';
                if (isHit)
                  cls =
                    'border-[#F3D67D] bg-[#F3D67D] text-[#0A0806] shadow-[0_0_18px_rgba(243,214,125,0.45),inset_0_1px_0_rgba(255,255,255,0.42)]';
                else if (isDrawn)
                  cls =
                    'border-[#D4574A]/70 bg-[#D4574A]/16 text-[#FFD7D3] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]';
                else if (picked)
                  cls =
                    'border-[#FDBA74]/80 bg-[#F97316]/18 text-[#FED7AA] shadow-[0_0_14px_rgba(253,186,116,0.22),inset_0_1px_0_rgba(255,255,255,0.16)]';
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggle(n)}
                    disabled={controlsLocked}
                    className={`aspect-square min-h-[46px] rounded-[12px] border-2 font-display text-lg font-black leading-none transition ${cls} hover:border-neon-ice/50 sm:rounded-[18px] sm:text-2xl`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            {payoutRow.length > 0 && (
              <div className="keno-payout-ladder mt-3" aria-label="Keno payout table">
                {payoutRow.map((item) => {
                  const active = result?.hitCount === item.hitCount;
                  const positive = item.multiplier > 1;
                  return (
                    <div
                      key={item.hitCount}
                      className={`keno-payout-cell ${active ? 'keno-payout-cell--active' : ''} ${
                        positive ? 'keno-payout-cell--positive' : ''
                      }`}
                    >
                      <strong>{formatMultiplier(item.multiplier)}</strong>
                      <span>{item.hitCount} 點擊數</span>
                    </div>
                  );
                })}
              </div>
            )}

            {(autoActive || autoStats.placed > 0) && (
              <div className="keno-auto-stage-card mt-3" aria-live="polite">
                <div>
                  <span>已投注</span>
                  <strong>{formatAmount(autoStats.wagered)}</strong>
                </div>
                <div>
                  <span>贏 / 輸</span>
                  <strong>
                    {autoStats.wins} / {autoStats.losses}
                  </strong>
                </div>
                <div>
                  <span>最近命中</span>
                  <strong>
                    {autoStats.lastHits} / {selectedCount || '-'}
                  </strong>
                </div>
              </div>
            )}

            <div className="keno-stage-actions mt-4 grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={autoPick}
                disabled={controlsLocked}
                className="game-choice-btn game-choice-btn-ice"
              >
                ⚂ {t.games.keno.autoPick}
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={controlsLocked}
                className="game-choice-btn"
              >
                ⨯ {t.games.keno.clear}
              </button>
            </div>
          </div>

          {result && (
            <div
              className={`keno-result-card game-result-card ${result.payout !== '0.00' ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl text-white">
                    {result.hitCount} / {result.selected.length} {t.games.keno.hits}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                    {formatMultiplier(result.multiplier)} {t.games.dice.payout}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/55">{t.history.net}</div>
                  <div
                    className={`num text-3xl ${
                      Number.parseFloat(result.profit) >= 0 ? 'text-[#7DD3FC]' : 'text-[#FCA5A5]'
                    }`}
                  >
                    {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                    {formatAmount(result.profit)}
                  </div>
                </div>
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

        <div className="keno-control-stack game-control-stack space-y-4">
          <div className="keno-control-card game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              gameId="keno"
              disabled={controlsLocked}
            />

            <div className="keno-risk-control mt-6">
              <div className="label">{t.games.mines.risk}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as KenoRisk[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRisk(r)}
                    disabled={controlsLocked}
                    className={`game-choice-btn px-0 py-3 ${risk === r ? 'game-choice-btn-ice' : ''}`}
                  >
                    {t.games.mines[r]}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleBet}
              disabled={controlsLocked || selectedCount === 0 || (!!user && balance < amount)}
              className="keno-draw-button btn-acid mt-6 w-full py-4"
            >
              → {t.games.keno.draw.toUpperCase()} · {formatAmount(amount)}
            </button>

            <button
              type="button"
              onClick={autoActive ? () => stopAutoBet('手動停止') : openAutoSettings}
              className={`keno-auto-bot-button slot-auto-button mt-3 ${
                autoActive ? 'keno-auto-bot-button--active' : ''
              }`}
              aria-label={autoActive ? '停止自動投注' : '自動投注設定'}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>{autoActive ? '停止自動投注' : '開始自動投注'}</span>
              <strong>{autoButtonValue}</strong>
            </button>

            {(autoActive || autoStats.placed > 0 || autoStopReason) && (
              <div className="keno-auto-stats" aria-live="polite">
                <div className="keno-auto-stat">
                  <span>投注數量</span>
                  <strong>
                    {autoActive ? (autoRemaining === null ? '∞' : autoRemaining) : autoStats.placed}
                  </strong>
                </div>
                <div className="keno-auto-stat">
                  <span>已投注</span>
                  <strong>{formatAmount(autoStats.wagered)}</strong>
                </div>
                <div className="keno-auto-stat">
                  <span>贏 / 輸</span>
                  <strong>
                    {autoStats.wins} / {autoStats.losses}
                  </strong>
                </div>
                <div
                  className={`keno-auto-stat ${
                    autoStats.netProfit >= 0 ? 'keno-auto-stat--win' : 'keno-auto-stat--loss'
                  }`}
                >
                  <span>淨利</span>
                  <strong>
                    {autoStats.netProfit >= 0 ? '+' : ''}
                    {formatAmount(autoStats.netProfit)}
                  </strong>
                </div>
              </div>
            )}

            {autoStopReason && (
              <div className="slot-auto-status keno-auto-bot-status">
                <span>基諾掛機</span>
                <strong>{autoStopReason}</strong>
              </div>
            )}
            <div className="game-balance-strip mt-3">
              <span>
                {t.games.keno.selected}{' '}
                <span className="data-num ml-1 text-[#F97316]">{selectedCount}</span>
              </span>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}
