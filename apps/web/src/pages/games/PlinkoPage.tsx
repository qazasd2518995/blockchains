import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  type PlinkoBatchBetRequest,
  type PlinkoBatchBetResult,
  type PlinkoBetResult,
  type PlinkoRisk,
} from '@bg/shared';
import { plinkoTable } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { PlinkoScene } from '@/games/plinko/PlinkoScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { holdWalletBalanceRefresh } from '@/hooks/useLiveBalance';

interface PlinkoPageProps {
  variant?: 'classic' | 'x';
}

const PLINKO_MIN_ROWS = 8;
const PLINKO_MAX_ROWS = 12;
const PLINKO_BALL_PRESETS = [1, 5, 10, 20] as const;
const PLINKO_MIN_BALLS = 1;
const PLINKO_MAX_BALLS = 20;
const MAX_ACTIVE_PLINKO_DROPS = 36;
const PLINKO_BULK_RELEASE_THRESHOLD = 10;
const PLINKO_AUTO_ROUND_PRESETS = [10, 25, 50, 75, 100, 500, 1000];
const PLINKO_AUTO_LOSS_PRESETS = [5, 20, 50] as const;
const PLINKO_AUTO_PRIZE_PRESETS = [10, 20, 75] as const;

type PlinkoAutoLimitMode = `${number}` | 'none' | 'custom';
type PlinkoAutoDraft = {
  rounds: string;
  amount: string;
  balls: string;
  lossMode: PlinkoAutoLimitMode;
  lossCustom: string;
  prizeMode: PlinkoAutoLimitMode;
  prizeCustom: string;
};
type PlinkoAutoSettings = {
  rounds: number;
  amount: number;
  balls: number;
  rows: number;
  risk: PlinkoRisk;
  lossLimit: number | null;
  singlePrizeLimit: number | null;
};
type PlinkoDropSource = 'manual' | 'auto';
type PlinkoDropOptions = {
  amount?: number;
  rows?: number;
  risk?: PlinkoRisk;
  source?: PlinkoDropSource;
};
type PlinkoWinSummary = {
  balls: number;
  totalStake: number;
  totalPayout: number;
  netProfit: number;
  bestMultiplier: number;
};

function clampBallCount(value: number): number {
  if (!Number.isFinite(value)) return PLINKO_MIN_BALLS;
  return Math.max(PLINKO_MIN_BALLS, Math.min(PLINKO_MAX_BALLS, Math.floor(value)));
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(2));
}

function roundSignedCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function plinkoResultReleaseDelay(index: number, batchSize: number): number {
  if (batchSize >= PLINKO_BULK_RELEASE_THRESHOLD) return Math.min(260, index * 18);
  if (batchSize >= 5) return index * 10;
  return 0;
}

function summarizePlinkoBatch(results: PlinkoBetResult[], betAmount: number): PlinkoWinSummary {
  const totalPayout = roundCurrency(
    results.reduce((sum, result) => sum + Number.parseFloat(result.payout || '0'), 0),
  );
  const totalStake = roundCurrency(betAmount * results.length);
  return {
    balls: results.length,
    totalStake,
    totalPayout,
    netProfit: roundSignedCurrency(totalPayout - totalStake),
    bestMultiplier: results.reduce((max, result) => Math.max(max, result.multiplier), 0),
  };
}

function readViewportBox() {
  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
  };
}

function createPlinkoAutoDraft(amount: number, balls = 1): PlinkoAutoDraft {
  const stake = Math.max(MIN_BET_AMOUNT, Math.min(MAX_BET_AMOUNT, amount));
  return {
    rounds: '10',
    amount: stake.toFixed(2),
    balls: String(clampBallCount(balls)),
    lossMode: '5',
    lossCustom: (stake * 5).toFixed(2),
    prizeMode: '10',
    prizeCustom: (stake * 10).toFixed(2),
  };
}

function parseAutoLimit(
  mode: PlinkoAutoLimitMode,
  customValue: string,
  amount: number,
): number | null {
  if (mode === 'none') return null;
  if (mode === 'custom') {
    const parsed = roundCurrency(Number.parseFloat(customValue));
    return parsed > 0 ? parsed : Number.NaN;
  }
  const multiplier = Number.parseFloat(mode);
  return Number.isFinite(multiplier) && multiplier > 0 ? roundCurrency(amount * multiplier) : NaN;
}

function parsePlinkoAutoSettings(
  draft: PlinkoAutoDraft,
  rows: number,
  risk: PlinkoRisk,
): PlinkoAutoSettings | null {
  const rounds = Math.floor(Number.parseFloat(draft.rounds));
  const amount = roundCurrency(Number.parseFloat(draft.amount));
  const balls = clampBallCount(Number.parseFloat(draft.balls));
  if (!Number.isFinite(rounds) || rounds < 1 || rounds > 1000) return null;
  if (!Number.isFinite(amount) || amount < MIN_BET_AMOUNT || amount > MAX_BET_AMOUNT) return null;
  if (!Number.isFinite(balls) || balls < PLINKO_MIN_BALLS || balls > PLINKO_MAX_BALLS) {
    return null;
  }
  const lossLimit = parseAutoLimit(draft.lossMode, draft.lossCustom, amount);
  const singlePrizeLimit = parseAutoLimit(draft.prizeMode, draft.prizeCustom, amount);
  if (Number.isNaN(lossLimit) || Number.isNaN(singlePrizeLimit)) return null;
  return {
    rounds,
    amount,
    balls,
    rows,
    risk,
    lossLimit,
    singlePrizeLimit,
  };
}

export function PlinkoPage({ variant = 'classic' }: PlinkoPageProps) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const isX = variant === 'x';
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [ballCount, setBallCount] = useState(1);
  const [rows, setRows] = useState(10);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [results, setResults] = useState<PlinkoBetResult[]>([]);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [activeDrops, setActiveDrops] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoDraft, setAutoDraft] = useState<PlinkoAutoDraft>(() => createPlinkoAutoDraft(10));
  const [autoActive, setAutoActive] = useState(false);
  const [autoRemaining, setAutoRemaining] = useState<number | null>(null);
  const [autoStopReason, setAutoStopReason] = useState('');
  const [winModal, setWinModal] = useState<PlinkoWinSummary | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PlinkoScene | null>(null);
  const activeDropsRef = useRef(0);
  const pendingStakeRef = useRef(0);
  const autoActiveRef = useRef(false);
  const autoRemainingRef = useRef<number | null>(null);
  const autoSettingsRef = useRef<PlinkoAutoSettings | null>(null);
  const autoNetProfitRef = useRef(0);
  const [sceneReady, setSceneReady] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const shell = canvasRef.current?.closest<HTMLElement>('.game-fullscreen-shell');
    if (!shell) return;

    const root = document.documentElement;
    let stableBox = readViewportBox();
    let refreshTimer: number | null = null;

    const applyStableHeight = () => {
      const value = `${Math.max(1, stableBox.height)}px`;
      shell.style.setProperty('--plinko-shell-height', value);
      root.style.setProperty('--plinko-shell-height', value);
    };

    const refreshStableHeight = () => {
      stableBox = readViewportBox();
      applyStableHeight();
    };

    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshStableHeight, 320);
    };

    const handleViewportResize = () => {
      const nextBox = readViewportBox();
      const orientationChanged = Math.abs(nextBox.width - stableBox.width) > 24;
      if (orientationChanged) scheduleRefresh();
    };

    applyStableHeight();
    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('orientationchange', scheduleRefresh);
    window.visualViewport?.addEventListener('resize', handleViewportResize);

    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener('resize', handleViewportResize);
      window.removeEventListener('orientationchange', scheduleRefresh);
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
      shell.style.removeProperty('--plinko-shell-height');
      root.style.removeProperty('--plinko-shell-height');
    };
  }, []);

  const changeActiveDrops = useCallback((delta: number) => {
    activeDropsRef.current = Math.max(0, activeDropsRef.current + delta);
    setActiveDrops(activeDropsRef.current);
  }, []);

  const stopAutoDrop = useCallback((reason: string, showReason = true) => {
    autoActiveRef.current = false;
    autoSettingsRef.current = null;
    autoRemainingRef.current = null;
    setAutoActive(false);
    setAutoRemaining(null);
    if (showReason) setAutoStopReason(reason);
  }, []);

  const applyAutoResult = useCallback(
    (dropResult: PlinkoBetResult) => {
      const settings = autoSettingsRef.current;
      if (!settings || !autoActiveRef.current) return;
      const profit = Number.parseFloat(dropResult.profit);
      const payout = Number.parseFloat(dropResult.payout);
      if (Number.isFinite(profit)) autoNetProfitRef.current += profit;
      if (
        settings.singlePrizeLimit !== null &&
        Number.isFinite(payout) &&
        payout >= settings.singlePrizeLimit
      ) {
        stopAutoDrop(t.games.plinko.autoPrizeLimitReached);
        return;
      }
      if (
        settings.lossLimit !== null &&
        Number.isFinite(autoNetProfitRef.current) &&
        autoNetProfitRef.current <= -settings.lossLimit
      ) {
        stopAutoDrop(t.games.plinko.autoLossLimitReached);
      }
    },
    [stopAutoDrop, t.games.plinko.autoLossLimitReached, t.games.plinko.autoPrizeLimitReached],
  );

  // 初始化 Pixi scene — 等 layout 穩定再 init（避免 StrictMode 雙次 + clientWidth=0 race）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: PlinkoScene | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        requestAnimationFrame(tryInit);
        return;
      }
      scene = new PlinkoScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h).then(() => {
        if (cancelled || !scene) return;
        resizeObserver = new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          if (!rect || cancelled || !scene) return;
          scene.resize(rect.width, rect.height);
        });
        resizeObserver.observe(canvas);
        setSceneReady(true);
      });
    };
    tryInit();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      scene?.dispose();
      sceneRef.current = null;
      setSceneReady(false);
    };
  }, []);

  // rows/risk 改變時更新預覽（需等 scene init 完）。
  // 預覽必須使用後端同一份正式賠率表，避免下注後倍率槽突然改變。
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    sceneRef.current.setBoard(rows, plinkoTable(risk, rows));
  }, [rows, risk, sceneReady]);

  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    sceneRef.current.setBetAmount(amount);
  }, [amount, sceneReady]);

  useEffect(() => {
    autoActiveRef.current = autoActive;
  }, [autoActive]);

  useEffect(() => {
    autoRemainingRef.current = autoRemaining;
  }, [autoRemaining]);

  useEffect(() => {
    return () => {
      autoActiveRef.current = false;
    };
  }, []);

  const startPlinkoDrops = useCallback(
    async (count: number, options: PlinkoDropOptions = {}): Promise<boolean> => {
      const balls = clampBallCount(count);
      const betAmount = options.amount ?? amount;
      const betRows = options.rows ?? rows;
      const betRisk = options.risk ?? risk;
      const dropSource = options.source ?? 'manual';
      if (!sceneReady || activeDropsRef.current + balls > MAX_ACTIVE_PLINKO_DROPS) {
        if (dropSource === 'manual') setError(t.games.plinko.tooManyBalls);
        return false;
      }
      if (!requireLogin()) return false;
      const latestBalance = Number.parseFloat(useAuthStore.getState().user?.balance ?? '0');
      const totalStake = roundCurrency(betAmount * balls);
      if (betAmount < MIN_BET_AMOUNT || totalStake + pendingStakeRef.current > latestBalance) {
        setError(t.bet.insufficientBalance);
        return false;
      }

      changeActiveDrops(balls);
      pendingStakeRef.current = roundCurrency(pendingStakeRef.current + totalStake);
      const releaseBalanceRefresh = holdWalletBalanceRefresh();
      setError(null);
      let anticipationBalls: Array<ReturnType<PlinkoScene['startAnticipation']> | undefined> = [];

      try {
        const payload: PlinkoBatchBetRequest = {
          amount: betAmount,
          rows: betRows,
          risk: betRisk,
          balls,
        };
        const betRequest = api.post<PlinkoBatchBetResult>('/games/plinko/bet-batch', payload);
        anticipationBalls = Array.from({ length: balls }, (_, index) =>
          sceneRef.current?.startAnticipation(index, balls),
        );
        const res = await betRequest;
        const dropResults = res.data.results;
        const firstResult = dropResults[0];
        if (firstResult) {
          sceneRef.current?.setBoard(firstResult.rows, firstResult.multipliers);
        }

        await Promise.all(
          dropResults.map(
            async (dropResult, index) => {
              const releaseDelay = plinkoResultReleaseDelay(index, balls);
              if (releaseDelay > 0) await waitMs(releaseDelay);
              return sceneRef.current?.dropBall(
                dropResult.path,
                dropResult.bucket,
                dropResult.multiplier,
                anticipationBalls[index],
              ) ?? Promise.resolve();
            },
          ),
        );

        // 額度必須等彈珠落袋後才更新，避免下注瞬間就透露本局結算。
        setBalance(res.data.newBalance);

        const winSummary = summarizePlinkoBatch(dropResults, betAmount);
        if (dropSource === 'manual' && winSummary.totalPayout > 0) {
          setWinModal(winSummary);
        }

        const newestFirst = [...dropResults].reverse();
        setResults((prev) => [...newestFirst, ...prev].slice(0, 8));
        setHistory((prev) =>
          [
            ...newestFirst.map((dropResult) => ({
              id: dropResult.betId,
              timestamp: Date.now(),
              betAmount,
              multiplier: dropResult.multiplier,
              payout: Number.parseFloat(dropResult.payout),
              won: dropResult.multiplier >= 1,
              detail: `Bucket ${dropResult.bucket}`,
            })),
            ...prev,
          ].slice(0, 30),
        );
        if (dropSource === 'auto') {
          for (const dropResult of dropResults) applyAutoResult(dropResult);
        }
        return dropResults.length > 0;
      } catch (err) {
        for (const anticipationBall of anticipationBalls) {
          sceneRef.current?.cancelAnticipation(anticipationBall);
        }
        setError(extractApiError(err).message);
        return false;
      } finally {
        releaseBalanceRefresh();
        changeActiveDrops(-balls);
        pendingStakeRef.current = roundCurrency(pendingStakeRef.current - totalStake);
        if (
          dropSource === 'auto' &&
          autoActiveRef.current &&
          autoRemainingRef.current === 0 &&
          activeDropsRef.current === 0
        ) {
          stopAutoDrop(t.games.plinko.autoFinished);
        }
      }
    },
    [
      amount,
      applyAutoResult,
      changeActiveDrops,
      requireLogin,
      risk,
      rows,
      sceneReady,
      setBalance,
      stopAutoDrop,
      t.bet.insufficientBalance,
      t.games.plinko.autoFinished,
      t.games.plinko.tooManyBalls,
    ],
  );

  const drop = async () => {
    if (autoActive) return;
    await startPlinkoDrops(ballCount);
  };

  const launchAutoDrop = useCallback(async () => {
    const settings = autoSettingsRef.current;
    if (!settings || !autoActiveRef.current) return;
    if (!sceneReady || activeDropsRef.current + settings.balls > MAX_ACTIVE_PLINKO_DROPS) {
      return;
    }
    const remaining = autoRemainingRef.current;
    if (remaining !== null) {
      if (remaining <= 0) return;
      autoRemainingRef.current = remaining - 1;
      setAutoRemaining(remaining - 1);
    }
    const started = await startPlinkoDrops(settings.balls, {
      amount: settings.amount,
      rows: settings.rows,
      risk: settings.risk,
      source: 'auto',
    });
    if (!started && autoActiveRef.current) {
      stopAutoDrop(t.games.plinko.autoFailed);
    }
  }, [sceneReady, startPlinkoDrops, stopAutoDrop, t.games.plinko.autoFailed]);

  useEffect(() => {
    if (!autoActive) return;
    const settings = autoSettingsRef.current;
    if (!settings) return;
    if (autoRemaining === 0) {
      if (activeDrops === 0) stopAutoDrop(t.games.plinko.autoFinished);
      return;
    }
    if (activeDrops + settings.balls > MAX_ACTIVE_PLINKO_DROPS) return;
    const timer = window.setTimeout(() => {
      void launchAutoDrop();
    }, 360);
    return () => window.clearTimeout(timer);
  }, [
    activeDrops,
    autoActive,
    autoRemaining,
    balance,
    launchAutoDrop,
    stopAutoDrop,
    t.games.plinko.autoFinished,
  ]);

  const openAutoSettings = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoActive) return;
    setAutoDraft(createPlinkoAutoDraft(amount, ballCount));
    setAutoStopReason('');
    setAutoOpen(true);
  };

  const updateAutoDraft = (field: keyof PlinkoAutoDraft, value: string) => {
    setAutoDraft((prev) => ({ ...prev, [field]: value }));
  };

  const startAutoDrop = () => {
    if (!user) {
      requireLogin();
      return;
    }
    const settings = parsePlinkoAutoSettings(autoDraft, rows, risk);
    if (!settings) {
      const draftAmount = roundCurrency(Number.parseFloat(autoDraft.amount));
      if (!Number.isFinite(draftAmount) || draftAmount < MIN_BET_AMOUNT) {
        setError(`最低下注為 ${formatAmount(MIN_BET_AMOUNT)}。`);
      } else if (draftAmount > MAX_BET_AMOUNT) {
        setError(`單注上限為 ${formatAmount(MAX_BET_AMOUNT)}。`);
      } else {
        setError(t.games.plinko.autoInvalid);
      }
      return;
    }
    const currentBalance = Number.parseFloat(useAuthStore.getState().user?.balance ?? '0');
    if (settings.amount * settings.balls > currentBalance) {
      setError(t.bet.insufficientBalance);
      return;
    }
    autoSettingsRef.current = settings;
    autoRemainingRef.current = settings.rounds;
    autoNetProfitRef.current = 0;
    autoActiveRef.current = true;
    setAmount(settings.amount);
    setBallCount(settings.balls);
    setAutoRemaining(settings.rounds);
    setAutoStopReason('');
    setAutoOpen(false);
    setAutoActive(true);
  };

  const autoSettingsPreview = parsePlinkoAutoSettings(autoDraft, rows, risk);
  const autoButtonLabel = autoActive ? t.games.plinko.autoStop : t.games.plinko.autoBot;
  const autoButtonValue = autoActive
    ? autoRemaining === null
      ? '—'
      : `${t.games.plinko.autoRemaining} ${autoRemaining}`
    : t.games.plinko.autoSettings;
  const boardControlsLocked = autoActive || activeDrops > 0;
  const selectedBallCount = clampBallCount(ballCount);
  const selectedTotalStake = roundCurrency(amount * selectedBallCount);
  const dropLimitReached = activeDrops + selectedBallCount > MAX_ACTIVE_PLINKO_DROPS;
  const autoDialog = autoOpen ? (
    <div
      className="slot-auto-modal plinko-auto-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plinko-auto-title"
    >
      <div className="slot-auto-modal__panel plinko-auto-modal__panel">
        <div className="slot-auto-modal__header">
          <div>
            <span>{t.games.plinko.autoGame}</span>
            <strong id="plinko-auto-title">{isX ? '掉珠挑戰X' : t.games.plinko.title}</strong>
          </div>
          <button type="button" onClick={() => setAutoOpen(false)} aria-label={t.common.close}>
            {t.common.close}
          </button>
        </div>

        <div className="slot-auto-modal__body">
          <section className="plinko-auto-section">
            <div className="plinko-auto-section__title">{t.games.plinko.autoRounds}</div>
            <div className="slot-auto-presets plinko-auto-presets plinko-auto-presets--rounds">
              {PLINKO_AUTO_ROUND_PRESETS.map((preset) => {
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

          <section className="plinko-auto-section">
            <div className="plinko-auto-section__title">{t.games.plinko.ballsPerDrop}</div>
            <div className="slot-auto-presets plinko-auto-presets">
              {PLINKO_BALL_PRESETS.map((preset) => {
                const value = String(preset);
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateAutoDraft('balls', value)}
                    className={autoDraft.balls === value ? 'slot-auto-preset--active' : ''}
                  >
                    {preset}
                    {t.games.plinko.balls}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="slot-auto-grid">
            <label className="slot-auto-field">
              <span>{t.games.crash.autoBetAmount}</span>
              <input
                type="number"
                min={MIN_BET_AMOUNT}
                max={MAX_BET_AMOUNT}
                step={0.01}
                value={autoDraft.amount}
                onChange={(event) => updateAutoDraft('amount', event.target.value)}
              />
            </label>
            <div className="slot-auto-field">
              <span>{t.games.plinko.rows}</span>
              <div className="plinko-auto-readonly">
                {rows} · {t.games.mines[risk]}
              </div>
            </div>
          </div>

          <section className="plinko-auto-section">
            <div className="plinko-auto-section__title">{t.games.plinko.autoLossLimit}</div>
            <div className="slot-auto-presets plinko-auto-presets">
              {PLINKO_AUTO_LOSS_PRESETS.map((preset) => {
                const value = String(preset) as PlinkoAutoLimitMode;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateAutoDraft('lossMode', value)}
                    className={autoDraft.lossMode === value ? 'slot-auto-preset--active' : ''}
                  >
                    {preset}X {t.games.plinko.autoStakeUnit}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => updateAutoDraft('lossMode', 'none')}
                className={autoDraft.lossMode === 'none' ? 'slot-auto-preset--active' : ''}
              >
                {t.games.plinko.autoUnlimited}
              </button>
              <button
                type="button"
                onClick={() => updateAutoDraft('lossMode', 'custom')}
                className={autoDraft.lossMode === 'custom' ? 'slot-auto-preset--active' : ''}
              >
                {t.games.plinko.autoCustom}
              </button>
            </div>
            {autoDraft.lossMode === 'custom' && (
              <label className="slot-auto-field plinko-auto-custom">
                <span>{t.games.plinko.autoCustomAmount}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={autoDraft.lossCustom}
                  onChange={(event) => updateAutoDraft('lossCustom', event.target.value)}
                />
              </label>
            )}
          </section>

          <section className="plinko-auto-section">
            <div className="plinko-auto-section__title">{t.games.plinko.autoPrizeLimit}</div>
            <div className="slot-auto-presets plinko-auto-presets">
              {PLINKO_AUTO_PRIZE_PRESETS.map((preset) => {
                const value = String(preset) as PlinkoAutoLimitMode;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateAutoDraft('prizeMode', value)}
                    className={autoDraft.prizeMode === value ? 'slot-auto-preset--active' : ''}
                  >
                    {preset}X {t.games.plinko.autoStakeUnit}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => updateAutoDraft('prizeMode', 'none')}
                className={autoDraft.prizeMode === 'none' ? 'slot-auto-preset--active' : ''}
              >
                {t.games.plinko.autoUnlimited}
              </button>
              <button
                type="button"
                onClick={() => updateAutoDraft('prizeMode', 'custom')}
                className={autoDraft.prizeMode === 'custom' ? 'slot-auto-preset--active' : ''}
              >
                {t.games.plinko.autoCustom}
              </button>
            </div>
            {autoDraft.prizeMode === 'custom' && (
              <label className="slot-auto-field plinko-auto-custom">
                <span>{t.games.plinko.autoCustomAmount}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={autoDraft.prizeCustom}
                  onChange={(event) => updateAutoDraft('prizeCustom', event.target.value)}
                />
              </label>
            )}
          </section>
        </div>

        <div className="slot-auto-modal__footer">
          <div className="slot-auto-summary">
            <span>{t.games.plinko.autoPreview}</span>
            <strong>
              {autoSettingsPreview
                ? `${autoSettingsPreview.rounds} · ${autoSettingsPreview.balls}${
                    t.games.plinko.balls
                  } · ${formatAmount(autoSettingsPreview.amount * autoSettingsPreview.balls)}`
                : '—'}
            </strong>
          </div>
          <div className="slot-auto-actions">
            <button type="button" onClick={() => setAutoOpen(false)}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={startAutoDrop}
              disabled={
                !autoSettingsPreview ||
                (!!user && balance < autoSettingsPreview.amount * autoSettingsPreview.balls)
              }
            >
              {t.games.plinko.autoStart}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div>
      {autoDialog}
      <GameHeader
        artwork="/game-art/plinko/background.png"
        section={isX ? '§ GAME 17' : '§ GAME 07'}
        breadcrumb={isX ? 'PLINKOX_17' : 'PLINKO_07'}
        title={isX ? '掉珠挑戰' : t.games.plinko.title}
        titleSuffix={isX ? 'X' : t.games.plinko.suffix}
        titleSuffixColor="acid"
        description={t.games.plinko.description}
        rtpLabel="RTP 96.5%"
        rtpAccent="acid"
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">
                {isX ? '掉珠挑戰X' : '彈珠台'}
              </span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">{isX ? 'Plinko X' : 'Plinko'}</span>
              <GameActivityHeat gameId={isX ? 'plinko-x' : 'plinko'} />
              <span className="text-white/72">
                {rows} {t.games.plinko.rows} · {t.games.mines[risk]}
              </span>
            </div>
            <div className="game-canvas-shell game-canvas-wide relative aspect-[16/11] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
              {/* 右上角 overlay */}
              <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 rounded-[16px] border border-white/10 bg-[#07131F]/52 px-3 py-2 text-[10px] tracking-[0.2em] text-white/62 backdrop-blur">
                <div>
                  ROWS <span className="data-num ml-1 text-[#7DD3FC]">{rows}</span>
                </div>
                <div>
                  RISK <span className="data-num ml-1 text-[#7DD3FC]">{risk.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="game-control-stack space-y-4">
          <div className="game-side-card plinko-control-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              disabled={autoActive}
            />

            <div className="plinko-balls-control mt-4">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="label">{t.games.plinko.ballsPerDrop}</span>
                <span className="data-num text-[#7DD3FC]">
                  {selectedBallCount}
                  {t.games.plinko.balls} · {formatAmount(selectedTotalStake)}
                </span>
              </div>
              <div className="plinko-balls-grid grid grid-cols-4 gap-2">
                {PLINKO_BALL_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setBallCount(preset)}
                    disabled={autoActive}
                    className={`game-choice-btn px-0 py-3 ${
                      selectedBallCount === preset ? 'game-choice-btn-acid' : ''
                    }`}
                  >
                    {preset}
                    {t.games.plinko.balls}
                  </button>
                ))}
              </div>
            </div>

            <div className="plinko-board-controls">
              <div className="plinko-risk-control mt-6">
                <div className="label">{t.games.mines.risk}</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(['low', 'medium', 'high'] as PlinkoRisk[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRisk(r)}
                      disabled={boardControlsLocked}
                      className={`game-choice-btn px-0 py-3 ${risk === r ? 'game-choice-btn-acid' : ''}`}
                    >
                      {t.games.mines[r]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="plinko-rows-control mt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="label">{t.games.plinko.rows}</span>
                  <span className="data-num text-[#7DD3FC]">{rows}</span>
                </div>
                <input
                  type="range"
                  min={PLINKO_MIN_ROWS}
                  max={PLINKO_MAX_ROWS}
                  value={rows}
                  onChange={(e) => setRows(Number.parseInt(e.target.value, 10))}
                  disabled={boardControlsLocked}
                  className="term-range w-full"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={drop}
              disabled={
                autoActive ||
                !sceneReady ||
                dropLimitReached ||
                (!!user && balance < selectedTotalStake)
              }
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.plinko.drop} · {selectedBallCount}
              {t.games.plinko.balls} · {formatAmount(selectedTotalStake)}
            </button>

            <button
              type="button"
              onClick={
                autoActive ? () => stopAutoDrop(t.games.plinko.autoStopped) : openAutoSettings
              }
              className={`plinko-auto-bot-button slot-auto-button mt-3 ${
                autoActive ? 'plinko-auto-bot-button--active' : ''
              }`}
              aria-label={autoActive ? t.games.plinko.autoStop : t.games.plinko.autoBot}
            >
              <span>{autoButtonLabel}</span>
              <strong>{autoButtonValue}</strong>
            </button>

            {autoStopReason && (
              <div className="slot-auto-status plinko-auto-bot-status">
                <span>{t.games.plinko.autoBot}</span>
                <strong>{autoStopReason}</strong>
              </div>
            )}
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
      {winModal ? (
        <button
          type="button"
          className="plinko-win-modal"
          aria-label="關閉彈珠結算畫面"
          onClick={() => setWinModal(null)}
        >
          <span className="plinko-win-modal__panel">
            <span className="plinko-win-modal__eyebrow">
              彈珠結算 · {winModal.balls}
              {t.games.plinko.balls}
            </span>
            <span className="plinko-win-modal__title">
              {winModal.netProfit > 0 ? 'YOU WON' : '本次派彩'}
            </span>
            <span className="plinko-win-modal__amount">{formatAmount(winModal.totalPayout)}</span>
            <span className="plinko-win-modal__meta">
              <span>
                下注 <strong>{formatAmount(winModal.totalStake)}</strong>
              </span>
              <span>
                最高 <strong>{formatMultiplier(winModal.bestMultiplier)}</strong>
              </span>
              <span className={winModal.netProfit >= 0 ? 'is-win' : 'is-loss'}>
                淨利{' '}
                <strong>
                  {winModal.netProfit >= 0 ? '+' : '-'}
                  {formatAmount(Math.abs(winModal.netProfit))}
                </strong>
              </span>
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
