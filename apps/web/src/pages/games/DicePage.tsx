import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bot } from 'lucide-react';
import {
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  type DiceBetRequest,
  type DiceBetResult,
} from '@bg/shared';
import { DICE_HOUSE_EDGE, DICE_MAX_TARGET, DICE_MIN_TARGET } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { DiceScene } from '@/games/dice/DiceScene';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { GameHeader } from '@/components/game/GameHeader';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';

const DICE_AUTO_ROUND_PRESETS = [10, 25, 50, 100] as const;
const DICE_AUTO_MAX_ROUNDS = 500;
const DICE_AUTO_DELAY_FAST_MS = 90;
const DICE_AUTO_DELAY_NORMAL_MS = 260;
const DICE_AUTO_ANIMATION_SPEED = 2.85;

type DiceAutoChangeMode = 'reset' | 'increase';

interface DiceAutoDraft {
  rounds: string;
  amount: string;
  stopProfit: string;
  stopLoss: string;
  maxBet: string;
  onWinMode: DiceAutoChangeMode;
  onWinIncrease: string;
  onLossMode: DiceAutoChangeMode;
  onLossIncrease: string;
  fast: boolean;
}

interface DiceAutoSettings {
  rounds: number | null;
  amount: number;
  stopProfit: number;
  stopLoss: number;
  maxBet: number;
  onWinMode: DiceAutoChangeMode;
  onWinIncrease: number;
  onLossMode: DiceAutoChangeMode;
  onLossIncrease: number;
  fast: boolean;
}

interface DiceAutoStats {
  placed: number;
  wins: number;
  losses: number;
  wagered: number;
  netProfit: number;
  currentAmount: number;
}

function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function roundPositiveMoney(value: number): number {
  return Math.max(0, roundMoney(value));
}

function createDiceAutoDraft(amount: number): DiceAutoDraft {
  const stake = Math.max(MIN_BET_AMOUNT, Math.min(MAX_BET_AMOUNT, roundPositiveMoney(amount)));
  const maxBet = Math.max(stake, roundPositiveMoney(stake * 10));
  return {
    rounds: '25',
    amount: stake.toFixed(2),
    stopProfit: '0',
    stopLoss: '0',
    maxBet: maxBet.toFixed(2),
    onWinMode: 'reset',
    onWinIncrease: '0',
    onLossMode: 'reset',
    onLossIncrease: '0',
    fast: true,
  };
}

function createDiceAutoStats(currentAmount = 0): DiceAutoStats {
  return {
    placed: 0,
    wins: 0,
    losses: 0,
    wagered: 0,
    netProfit: 0,
    currentAmount: roundPositiveMoney(currentAmount),
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

function parseDiceAutoSettings(draft: DiceAutoDraft): DiceAutoSettings | null {
  const rawRounds = draft.rounds.trim().toLowerCase();
  let rounds: number | null = null;
  if (rawRounds === 'infinite' || rawRounds === '∞') {
    rounds = null;
  } else {
    const parsedRounds = Math.floor(Number.parseFloat(rawRounds));
    if (!Number.isFinite(parsedRounds) || parsedRounds < 1 || parsedRounds > DICE_AUTO_MAX_ROUNDS) {
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
    fast: draft.fast,
  };
}

function getNextDiceAutoAmount(
  settings: DiceAutoSettings,
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

export function DicePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DiceScene | null>(null);
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');

  const [amount, setAmount] = useState(10);
  const [target, setTarget] = useState(50);
  const [direction, setDirection] = useState<'under' | 'over'>('under');
  const [lastResult, setLastResult] = useState<DiceBetResult | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoDraft, setAutoDraft] = useState<DiceAutoDraft>(() => createDiceAutoDraft(10));
  const [autoActive, setAutoActive] = useState(false);
  const [autoRemaining, setAutoRemaining] = useState<number | null>(null);
  const [autoStopReason, setAutoStopReason] = useState('');
  const [autoStats, setAutoStats] = useState<DiceAutoStats>(() => createDiceAutoStats(10));

  const balanceRef = useRef(balance);
  const rollingRef = useRef(false);
  const autoActiveRef = useRef(false);
  const autoSettingsRef = useRef<DiceAutoSettings | null>(null);
  const autoCurrentAmountRef = useRef(10);
  const autoStatsRef = useRef<DiceAutoStats>(createDiceAutoStats(10));

  const winChance = direction === 'under' ? target : 100 - target;
  const multiplier =
    winChance > 0 ? Math.floor(((1 - DICE_HOUSE_EDGE) * 10000 * 100) / winChance) / 10000 : 0;
  const potentialPayout = amount * multiplier;

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    rollingRef.current = rolling;
  }, [rolling]);

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

  const placeDiceBet = useCallback(
    async (
      betAmount: number,
      options: { auto?: boolean; fast?: boolean } = {},
    ): Promise<DiceBetResult | null> => {
      if (rollingRef.current) return null;
      if (!requireLogin()) return null;

      const stake = roundPositiveMoney(betAmount);
      const latestBalance = Number.parseFloat(
        useAuthStore.getState().user?.balance ?? String(balanceRef.current),
      );
      if (stake < MIN_BET_AMOUNT || stake > MAX_BET_AMOUNT || stake > latestBalance) {
        setError(t.bet.insufficientBalance);
        return null;
      }

      setError(null);
      setRolling(true);
      rollingRef.current = true;
      // 樂觀動畫：立刻啟動骰子旋轉，不等 API
      sceneRef.current?.startAnticipation();
      const releaseBalanceRefresh = holdWalletBalanceRefresh();
      const previousBalance = useAuthStore.getState().debitBalance(stake);
      if (previousBalance) {
        const optimisticBalance = Number.parseFloat(previousBalance) - stake;
        if (Number.isFinite(optimisticBalance)) balanceRef.current = optimisticBalance;
      }

      try {
        const payload: DiceBetRequest = { amount: stake, target, direction };
        const res = await api.post<DiceBetResult>('/games/dice/bet', payload);
        const result = res.data;
        await sceneRef.current?.playRoll(
          result.roll,
          result.won,
          result.multiplier,
          options.fast ? DICE_AUTO_ANIMATION_SPEED : 1,
        );
        if (!options.fast || (result.won && result.multiplier >= 5)) {
          sceneRef.current?.playWinFx(result.multiplier, result.won);
        }
        setLastResult(result);
        setHistory((prev) =>
          [
            {
              id: result.betId,
              timestamp: Date.now(),
              betAmount: stake,
              multiplier: result.won ? result.multiplier : 0,
              payout: Number.parseFloat(result.payout),
              won: result.won,
              detail: `${result.direction === 'under' ? '▾' : '▴'} ${result.target.toFixed(2)}`,
            },
            ...prev,
          ].slice(0, 30),
        );
        const nextBalance = Number.parseFloat(result.newBalance);
        if (Number.isFinite(nextBalance)) balanceRef.current = nextBalance;
        setBalance(result.newBalance);
        return result;
      } catch (err) {
        if (previousBalance) {
          setBalance(previousBalance);
          const restored = Number.parseFloat(previousBalance);
          if (Number.isFinite(restored)) balanceRef.current = restored;
        }
        sceneRef.current?.stopAnticipation();
        setError(extractApiError(err).message);
        return null;
      } finally {
        releaseBalanceRefresh();
        rollingRef.current = false;
        setRolling(false);
      }
    },
    [direction, requireLogin, setBalance, t.bet.insufficientBalance, target],
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

      setAmount(stake);
      const result = await placeDiceBet(stake, { auto: true, fast: settings.fast });
      if (!result) {
        if (autoActiveRef.current) stopAutoBet('下注失敗，已停止');
        break;
      }

      const profit = Number.parseFloat(result.profit);
      const nextAmount = getNextDiceAutoAmount(settings, stake, result.won);
      const nextStats: DiceAutoStats = {
        placed: currentStats.placed + 1,
        wins: currentStats.wins + (result.won ? 1 : 0),
        losses: currentStats.losses + (result.won ? 0 : 1),
        wagered: roundPositiveMoney(currentStats.wagered + stake),
        netProfit: roundMoney(currentStats.netProfit + (Number.isFinite(profit) ? profit : 0)),
        currentAmount: nextAmount,
      };
      autoCurrentAmountRef.current = nextAmount;
      autoStatsRef.current = nextStats;
      setAutoStats(nextStats);
      setAmount(nextAmount);
      setAutoRemaining(
        settings.rounds === null ? null : Math.max(0, settings.rounds - nextStats.placed),
      );

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

      await wait(settings.fast ? DICE_AUTO_DELAY_FAST_MS : DICE_AUTO_DELAY_NORMAL_MS);
    }
  }, [placeDiceBet, stopAutoBet, t.bet.insufficientBalance]);

  const handleBet = () => {
    if (autoActive) return;
    void placeDiceBet(amount);
  };

  const openAutoSettings = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoActive) return;
    setAutoDraft(createDiceAutoDraft(amount));
    setAutoStopReason('');
    setAutoOpen(true);
  };

  const updateAutoDraft = <K extends keyof DiceAutoDraft>(field: K, value: DiceAutoDraft[K]) => {
    setAutoDraft((prev) => ({ ...prev, [field]: value }));
  };

  const startAutoBet = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoActiveRef.current) return;
    const settings = parseDiceAutoSettings(autoDraft);
    if (!settings) {
      const draftAmount = parsePositiveAmount(autoDraft.amount);
      if (draftAmount < MIN_BET_AMOUNT) {
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

    const initialStats = createDiceAutoStats(settings.amount);
    autoSettingsRef.current = settings;
    autoCurrentAmountRef.current = settings.amount;
    autoStatsRef.current = initialStats;
    autoActiveRef.current = true;
    setAmount(settings.amount);
    setAutoStats(initialStats);
    setAutoRemaining(settings.rounds);
    setAutoStopReason('');
    setAutoOpen(false);
    setAutoActive(true);
    void runAutoBetLoop();
  };

  const autoSettingsPreview = parseDiceAutoSettings(autoDraft);
  const autoButtonValue = autoActive
    ? autoRemaining === null
      ? '∞'
      : `剩 ${autoRemaining}`
    : '設定';
  const controlsLocked = autoActive || rolling;
  const autoDialog = autoOpen ? (
    <div
      className="slot-auto-modal dice-auto-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dice-auto-title"
    >
      <div className="slot-auto-modal__panel dice-auto-modal__panel">
        <div className="slot-auto-modal__header">
          <div>
            <span>骰子自動投注</span>
            <strong id="dice-auto-title">自動下注設定</strong>
          </div>
          <button type="button" onClick={() => setAutoOpen(false)} aria-label={t.common.close}>
            {t.common.close}
          </button>
        </div>

        <div className="slot-auto-modal__body">
          <section className="dice-auto-section">
            <div className="dice-auto-section__title">投注次數</div>
            <div className="slot-auto-presets dice-auto-presets">
              {DICE_AUTO_ROUND_PRESETS.map((preset) => {
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
              <button
                type="button"
                onClick={() => updateAutoDraft('rounds', 'infinite')}
                className={autoDraft.rounds === 'infinite' ? 'slot-auto-preset--active' : ''}
              >
                ∞
              </button>
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

          <section className="dice-auto-section">
            <div className="dice-auto-section__title">贏局後</div>
            <div className="dice-auto-adjust-grid">
              <div className="slot-auto-presets dice-auto-mode-presets">
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

          <section className="dice-auto-section">
            <div className="dice-auto-section__title">輸局後</div>
            <div className="dice-auto-adjust-grid">
              <div className="slot-auto-presets dice-auto-mode-presets">
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

          <div className="slot-auto-switches dice-auto-switches">
            <label className="slot-auto-switch">
              <input
                type="checkbox"
                checked={autoDraft.fast}
                onChange={(event) => updateAutoDraft('fast', event.target.checked)}
              />
              快速動畫
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
                  } 次 · ${formatAmount(autoSettingsPreview.amount)} / 注 · 上限 ${formatAmount(
                    autoSettingsPreview.maxBet,
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
              開始自動
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="dice-game-page">
      {autoDialog}
      <GameHeader
        artwork="/game-art/dice/background.png"
        section="§ GAME 01"
        breadcrumb="DICE_01"
        title={t.games.dice.title}
        titleSuffix={t.games.dice.suffix}
        titleSuffixColor="acid"
        description={t.games.dice.description}
        rtpLabel="RTP 97%"
        rtpAccent="acid"
      />

      <div className="game-play-grid game-play-grid--dice grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="dice-stage-panel game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">骰子</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Dice</span>
              <GameActivityHeat gameId="dice" />
              <span className="text-[#7EE0A4]">
                <span className="dot-online dot-online" />
                {t.common.ready.toUpperCase()}
              </span>
            </div>
            <div className="dice-canvas game-canvas-shell game-canvas-wide relative aspect-[16/7] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />

              {/* 右上角即時統計（疊在画布上） */}
              <div className="dice-live-stats pointer-events-none absolute right-3 top-3 flex min-w-[148px] flex-col gap-1 rounded-[16px] border border-[rgba(125,211,252,0.32)] bg-[linear-gradient(180deg,rgba(7,19,31,0.88),rgba(15,23,42,0.78))] px-3 py-2 text-[10px] font-black tracking-[0.14em] text-[#E5EDF8] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-md">
                <div className="dice-live-stat flex items-center justify-between gap-3">
                  <span className="dice-live-stat__label">{t.bet.multiplier.toUpperCase()}</span>
                  <span className="dice-live-stat__value dice-live-stat__value--blue data-num">
                    {formatMultiplier(multiplier)}
                  </span>
                </div>
                <div className="dice-live-stat flex items-center justify-between gap-3">
                  <span className="dice-live-stat__label">{t.bet.winChance.toUpperCase()}</span>
                  <span className="dice-live-stat__value data-num">{winChance.toFixed(2)}%</span>
                </div>
                <div className="dice-live-stat flex items-center justify-between gap-3">
                  <span className="dice-live-stat__label">{t.bet.potentialPayout.toUpperCase()}</span>
                  <span className="dice-live-stat__value dice-live-stat__value--green data-num">
                    {formatAmount(potentialPayout)}
                  </span>
                </div>
              </div>

              {(autoActive || autoStats.placed > 0) && (
                <div className="dice-auto-stage-card pointer-events-none absolute left-3 top-3">
                  <div>
                    <span>已投注</span>
                    <strong>{formatAmount(autoStats.wagered)}</strong>
                  </div>
                  <div>
                    <span>贏</span>
                    <strong className="text-[#86EFAC]">{autoStats.wins}</strong>
                  </div>
                  <div>
                    <span>輸</span>
                    <strong className="text-[#FCA5A5]">{autoStats.losses}</strong>
                  </div>
                </div>
              )}

              {lastResult && (
                <div
                  className={`dice-mobile-result-pill ${
                    lastResult.won
                      ? 'dice-mobile-result-pill--win'
                      : 'dice-mobile-result-pill--loss'
                  }`}
                >
                  <span>{lastResult.won ? t.games.dice.win : t.games.dice.loss}</span>
                  <strong>
                    {Number.parseFloat(lastResult.profit) >= 0 ? '+' : ''}
                    {formatAmount(lastResult.profit)}
                  </strong>
                </div>
              )}
            </div>

            {/* 滑桿 + 方向 toggle（緊貼畫布底部，免滾動） */}
            <div className="dice-threshold-panel border-t border-[#16324A]/10 p-4 md:p-5">
              <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="label">{t.games.dice.threshold}</span>
                  <span className="num text-2xl text-white">{target.toFixed(2)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[10px] sm:flex">
                  <button
                    type="button"
                    onClick={() => setDirection('under')}
                    disabled={controlsLocked}
                    className={`game-choice-btn px-3 py-2 ${direction === 'under' ? 'game-choice-btn-acid' : ''}`}
                  >
                    ▾ {t.games.dice.rollUnder}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('over')}
                    disabled={controlsLocked}
                    className={`game-choice-btn px-3 py-2 ${direction === 'over' ? 'game-choice-btn-ember' : ''}`}
                  >
                    ▴ {t.games.dice.rollOver}
                  </button>
                </div>
              </div>
              <input
                type="range"
                min={DICE_MIN_TARGET}
                max={DICE_MAX_TARGET}
                step={0.01}
                value={target}
                onChange={(e) => setTarget(Number.parseFloat(e.target.value))}
                disabled={controlsLocked}
                className={`term-range w-full ${direction === 'over' ? 'term-range-ember' : ''}`}
              />
              <div className="mt-1 flex justify-between text-[9px] text-white/40">
                <span>{DICE_MIN_TARGET.toFixed(2)}</span>
                <span>50.00</span>
                <span>{DICE_MAX_TARGET.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {lastResult && (
            <div
              className={`dice-result-card game-result-card ${
                lastResult.won ? 'game-result-card-win' : 'game-result-card-loss'
              }`}
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

        <div className="dice-control-stack game-control-stack space-y-4">
          <div className="dice-control-card game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              gameId="dice"
              disabled={controlsLocked}
            />

            <button
              type="button"
              onClick={handleBet}
              disabled={controlsLocked || (!!user && balance < amount)}
              className="dice-bet-button btn-acid mt-6 w-full py-4 text-base"
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

            <button
              type="button"
              onClick={autoActive ? () => stopAutoBet('手動停止') : openAutoSettings}
              className={`dice-auto-bot-button slot-auto-button mt-3 ${
                autoActive ? 'dice-auto-bot-button--active' : ''
              }`}
              aria-label={autoActive ? '停止自動投注' : '自動投注設定'}
            >
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>{autoActive ? '停止自動' : '自動投注'}</span>
              <strong>{autoButtonValue}</strong>
            </button>

            {(autoActive || autoStats.placed > 0 || autoStopReason) && (
              <div className="dice-auto-stats" aria-live="polite">
                <div className="dice-auto-stat">
                  <span>已投注</span>
                  <strong>{formatAmount(autoStats.wagered)}</strong>
                </div>
                <div className="dice-auto-stat">
                  <span>贏 / 輸</span>
                  <strong>
                    {autoStats.wins} / {autoStats.losses}
                  </strong>
                </div>
                <div
                  className={`dice-auto-stat ${
                    autoStats.netProfit >= 0 ? 'dice-auto-stat--win' : 'dice-auto-stat--loss'
                  }`}
                >
                  <span>淨利</span>
                  <strong>
                    {autoStats.netProfit >= 0 ? '+' : ''}
                    {formatAmount(autoStats.netProfit)}
                  </strong>
                </div>
                <div className="dice-auto-stat">
                  <span>目前注額</span>
                  <strong>{formatAmount(autoStats.currentAmount)}</strong>
                </div>
              </div>
            )}

            {autoStopReason && (
              <div className="slot-auto-status dice-auto-bot-status">
                <span>自動投注</span>
                <strong>{autoStopReason}</strong>
              </div>
            )}

            {user ? (
              <div className="game-balance-strip mt-3">
                <span className="text-white/55">
                  {t.bet.after}{' '}
                  <span className="data-num ml-1 text-[#7DD3FC]">
                    {formatAmount(balance - amount)}
                  </span>
                </span>
              </div>
            ) : null}
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}
