import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, History, RotateCw, Zap } from 'lucide-react';
import type {
  HotlineBetRequest,
  HotlineBetResult,
  HotlineCascadeStep,
  HotlineJackpotSnapshot,
  HotlineMegaFeatureResult,
  HotlineSpecialSymbol,
  HotlineWinPosition,
  HotlineWinLine,
} from '@bg/shared';
import { HOTLINE_MINI_SYMBOLS, HOTLINE_SYMBOLS } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { SoundToggle } from '@/components/layout/SoundToggle';
import { MusicToggle } from '@/components/layout/MusicToggle';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { HotlineScene } from '@/games/hotline/HotlineScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { getSlotTheme, type SlotThemeConfig, type SlotThemeId } from '@/lib/slotThemes';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';

interface Props {
  theme?: SlotThemeId;
}

const SYMBOL_POSITIONS = ['0% 0%', '50% 0%', '100% 0%', '0% 100%', '50% 100%', '100% 100%'];

const MEGA_SYMBOL_PAYOUTS = [
  '8-9個 10x · 10-11個 25x · 12+個 50x',
  '8-9個 2.5x · 10-11個 10x · 12+個 25x',
  '8-9個 2x · 10-11個 5x · 12+個 15x',
  '8-9個 1.5x · 10-11個 2x · 12+個 12x',
  '8-9個 1x · 10-11個 1.5x · 12+個 10x',
  '8-9個 0.8x · 10-11個 1.2x · 12+個 8x',
  '8-9個 0.5x · 10-11個 1x · 12+個 5x',
  '8-9個 0.4x · 10-11個 0.9x · 12+個 4x',
  '8-9個 0.25x · 10-11個 0.75x · 12+個 2x',
];
const CLASSIC_SYMBOL_PAYOUTS = HOTLINE_SYMBOLS.map(
  (symbol) => `3個 ${symbol.payout3}x · 4個 ${symbol.payout4}x · 5個 ${symbol.payout5}x`,
);
const MINI_SYMBOL_PAYOUTS = HOTLINE_MINI_SYMBOLS.map((symbol) => `3個 ${symbol.payout3}x`);
const BIG_WIN_MULTIPLIER = 20;
const MEGA_MAX_TOTAL_MULTIPLIER = 1000;
const MEGA_FREE_SPIN_INTRO_MS = 1600;
const MEGA_FREE_SPIN_RETRIGGER_MS = 1300;
interface LiveMegaRoundState {
  payout: number;
  multiplier: number;
  cascadeCount: number;
  freeSpinsPlayed: number;
  freeSpinsAwarded: number;
  freeSpinMode: boolean;
  activeMultiplier: number;
  baseMultiplierTotal: number;
  scatterCount: number;
  specialSymbols: HotlineSpecialSymbol[];
  grid: number[][];
}

interface MegaFreeSpinIntro {
  kind: 'trigger' | 'retrigger';
  spins: number;
  totalSpins: number;
  scatterCount: number;
}

interface MegaFallbackWinPop {
  label?: string;
  amount: string;
  meta: string;
}

interface SpinOptions {
  amountOverride?: number;
  balanceOverride?: number;
  autoSpin?: boolean;
  buyFeature?: boolean;
  fastSpin?: boolean;
}

interface AutoSpinSettings {
  rounds: number;
  amount: number;
  lossLimit: number;
  profitTarget: number;
  singleWinLimit: number;
  stopOnAnyWin: boolean;
  stopOnFreeSpins: boolean;
}

const AUTO_SPIN_ROUND_PRESETS = [10, 25, 50, 100];

function createDefaultAutoSpinSettings(amount: number): AutoSpinSettings {
  const baseAmount = roundCurrency(amount);
  return {
    rounds: 25,
    amount: baseAmount,
    lossLimit: roundCurrency(baseAmount * 25),
    profitTarget: 0,
    singleWinLimit: 0,
    stopOnAnyWin: false,
    stopOnFreeSpins: true,
  };
}

export function HotlinePage({ theme = 'cyber' }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const returnTarget = useGameReturnTarget();
  const slotTheme = getSlotTheme(theme);
  const isMegaSlot = slotTheme.rows > 3;
  const canvasAspectClass = isMegaSlot ? 'aspect-[16/10]' : 'aspect-[16/7]';
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [result, setResult] = useState<HotlineBetResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFallback, setSceneFallback] = useState(false);
  const [liveMegaRound, setLiveMegaRound] = useState<LiveMegaRoundState | null>(null);
  const [megaFreeSpinIntro, setMegaFreeSpinIntro] = useState<MegaFreeSpinIntro | null>(null);
  const [megaFallbackSpinning, setMegaFallbackSpinning] = useState(false);
  const [megaFallbackWinning, setMegaFallbackWinning] = useState<HotlineWinPosition[]>([]);
  const [megaFallbackSpecialWinning, setMegaFallbackSpecialWinning] = useState<
    HotlineWinPosition[]
  >([]);
  const [megaFallbackRemoved, setMegaFallbackRemoved] = useState<HotlineWinPosition[]>([]);
  const [megaFallbackDropping, setMegaFallbackDropping] = useState(false);
  const [megaFallbackWinPop, setMegaFallbackWinPop] = useState<MegaFallbackWinPop | null>(null);
  const [megaFallbackSpinSpecialSymbols, setMegaFallbackSpinSpecialSymbols] = useState<
    HotlineSpecialSymbol[]
  >([]);
  const [autoSpinOpen, setAutoSpinOpen] = useState(false);
  const [autoSpinSettings, setAutoSpinSettings] = useState<AutoSpinSettings>(() =>
    createDefaultAutoSpinSettings(10),
  );
  const [autoSpinActive, setAutoSpinActive] = useState(false);
  const [autoSpinRemaining, setAutoSpinRemaining] = useState(0);
  const [autoSpinStopReason, setAutoSpinStopReason] = useState('');
  const [fastSpin, setFastSpin] = useState(false);
  const [dismissedBigWinBetId, setDismissedBigWinBetId] = useState<string | null>(null);
  const [jackpotSnapshot, setJackpotSnapshot] = useState<HotlineJackpotSnapshot | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HotlineScene | null>(null);
  const autoSpinStopRequestedRef = useRef(false);
  const fastSpinRef = useRef(false);
  const fallbackGrid = useMemo(() => createFallbackGrid(slotTheme), [slotTheme]);
  const fallbackJackpotValues = useMemo(() => createJackpotValues(slotTheme.id), [slotTheme.id]);
  const jackpotValues = useMemo(
    () =>
      jackpotSnapshot ? createJackpotValuesFromSnapshot(jackpotSnapshot) : fallbackJackpotValues,
    [fallbackJackpotValues, jackpotSnapshot],
  );

  useEffect(() => {
    fastSpinRef.current = fastSpin;
  }, [fastSpin]);

  useEffect(() => {
    return () => {
      autoSpinStopRequestedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!isMegaSlot || !user?.id) {
      setJackpotSnapshot(null);
      return;
    }

    let cancelled = false;
    const loadJackpot = async () => {
      try {
        const res = await api.get<HotlineJackpotSnapshot>('/games/hotline/jackpot', {
          params: { gameId: slotTheme.gameId },
        });
        if (!cancelled) setJackpotSnapshot(res.data);
      } catch {
        // Keep the current snapshot or fallback seed values if live jackpot is temporarily unavailable.
      }
    };

    void loadJackpot();
    const timer = window.setInterval(loadJackpot, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isMegaSlot, slotTheme.gameId, user?.id]);

  useEffect(() => {
    if (!isMegaSlot) return;
    let timer = 0;
    const scheduleSceneResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setLayoutVersion((v) => v + 1), 140);
    };
    window.addEventListener('resize', scheduleSceneResize);
    window.addEventListener('orientationchange', scheduleSceneResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', scheduleSceneResize);
      window.removeEventListener('orientationchange', scheduleSceneResize);
    };
  }, [isMegaSlot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSceneReady(false);
    const useHtmlMegaBoard =
      isMegaSlot &&
      window.matchMedia('(orientation: landscape)').matches &&
      window.matchMedia('(max-height: 420px)').matches;
    if (useHtmlMegaBoard) {
      sceneRef.current = null;
      setSceneFallback(true);
      return;
    }
    setSceneFallback(false);

    let cancelled = false;
    let scene: HotlineScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.parentElement?.clientWidth ?? canvas.clientWidth;
      const h = canvas.parentElement?.clientHeight ?? canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new HotlineScene();
      sceneRef.current = scene;
      void scene
        .init(canvas, w, h, slotTheme)
        .then(() => {
          if (cancelled) {
            scene?.dispose();
            return;
          }
          setSceneReady(true);
          setSceneFallback(false);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error(err);
          scene?.dispose();
          sceneRef.current = null;
          setSceneReady(false);
          setSceneFallback(true);
        });
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [isMegaSlot, layoutVersion, slotTheme]);

  const setMegaAmount = (next: number): void => {
    const max = user ? Math.max(balance, 0.01) : 100000;
    const clamped = Math.min(max, Math.max(0.01, next));
    setAmount(Number.parseFloat(clamped.toFixed(2)));
  };

  const createInitialLiveMegaRound = (grid: number[][] = fallbackGrid): LiveMegaRoundState => ({
    payout: 0,
    multiplier: 0,
    cascadeCount: 0,
    freeSpinsPlayed: 0,
    freeSpinsAwarded: 0,
    freeSpinMode: false,
    activeMultiplier: 1,
    baseMultiplierTotal: 0,
    scatterCount: 0,
    specialSymbols: [],
    grid,
  });

  const updateLiveMegaRound = (patch: Partial<LiveMegaRoundState>): void => {
    if (!isMegaSlot) return;
    setLiveMegaRound((prev) => ({
      ...createInitialLiveMegaRound(),
      ...prev,
      ...patch,
    }));
  };

  const showMegaFreeSpinIntro = async (
    intro: MegaFreeSpinIntro,
    duration = MEGA_FREE_SPIN_INTRO_MS,
  ): Promise<void> => {
    if (!isMegaSlot) return;
    setMegaFreeSpinIntro(intro);
    await delay(duration);
    setMegaFreeSpinIntro(null);
  };

  const spin = async (options: SpinOptions = {}): Promise<HotlineBetResult | null> => {
    if (busy && !options.autoSpin) return null;
    if (!requireLogin()) return null;
    const spinAmount = roundCurrency(options.amountOverride ?? amount);
    const availableBalance = options.balanceOverride ?? balance;
    const buyFeature = Boolean(options.buyFeature && isMegaSlot);
    const spinFast = options.fastSpin ?? fastSpinRef.current;
    const stakeAmount = buyFeature ? roundCurrency(spinAmount * 100) : spinAmount;
    if (spinAmount <= 0 || stakeAmount > availableBalance) return null;
    setBusy(true);
    setSpinning(true);
    setResult(null);
    setLiveMegaRound(isMegaSlot ? createInitialLiveMegaRound() : null);
    setMegaFreeSpinIntro(null);
    setMegaFallbackWinning([]);
    setMegaFallbackSpecialWinning([]);
    setMegaFallbackRemoved([]);
    setMegaFallbackDropping(false);
    setMegaFallbackWinPop(null);
    setMegaFallbackSpinSpecialSymbols([]);
    setDismissedBigWinBetId(null);
    setError(null);

    const activeScene = sceneReady && !sceneFallback ? sceneRef.current : null;
    activeScene?.resetWinLines();
    // 乐观动画：转轴立刻开始滚
    activeScene?.startAnticipation(spinFast);
    setMegaFallbackSpinning(isMegaSlot && !activeScene);

    try {
      const payload: HotlineBetRequest = {
        amount: spinAmount,
        gameId: slotTheme.gameId,
        ...(buyFeature ? { buyFeature: true } : {}),
      };
      const res = await api.post<HotlineBetResult>('/games/hotline/bet', payload);
      const cascades = res.data.cascades ?? [];
      const features = res.data.features;
      const baseBetAmount = Number.parseFloat(res.data.baseAmount ?? String(spinAmount));
      const settledStakeAmount = Number.parseFloat(res.data.stakeAmount ?? res.data.amount);
      const displayMultiplier =
        res.data.buyFeature && features ? features.totalMultiplier : (res.data.multiplier ?? 0);
      const freeSpinRounds = features?.freeSpinRounds ?? [];
      const totalExtraFreeSpins = freeSpinRounds.reduce(
        (sum, round) => sum + round.extraFreeSpinsAwarded,
        0,
      );
      let revealedFreeSpinsAwarded = Math.max(
        0,
        (features?.freeSpinsAwarded ?? 0) - totalExtraFreeSpins,
      );
      let revealedFreeMultiplierBank = 0;
      let revealedMultiplier = 0;
      let revealedCascadeCount = 0;

      const playSpinOrFallback = async (
        grid: number[][],
        lines: HotlineWinLine[],
        specialSymbols: HotlineSpecialSymbol[] = [],
      ): Promise<void> => {
        const scene = sceneReady && !sceneFallback ? sceneRef.current : null;
        if (scene) {
          await scene.playSpin(grid, lines, {
            fast: spinFast,
            specialSymbols,
            payoutAmount: baseBetAmount,
          });
          return;
        }
        setMegaFallbackRemoved([]);
        setMegaFallbackDropping(false);
        setMegaFallbackSpinSpecialSymbols(specialSymbols);
        updateLiveMegaRound({ grid, specialSymbols: [] });
        setMegaFallbackSpinning(true);
        await delay(scaleSpinDelay(lines.length > 0 ? 820 : 620, spinFast));
        setMegaFallbackSpinning(false);
        setMegaFallbackSpinSpecialSymbols([]);
        updateLiveMegaRound({ grid, specialSymbols });
        if (lines.length > 0) await delay(scaleSpinDelay(260, spinFast));
      };

      const playSpecialHighlightOrFallback = async (
        symbols: HotlineSpecialSymbol[],
        type: HotlineSpecialSymbol['type'],
        label: string,
        winPop?: MegaFallbackWinPop,
      ): Promise<void> => {
        const filtered = symbols.filter((symbol) => symbol.type === type);
        if (filtered.length === 0) return;
        const scene = sceneReady && !sceneFallback ? sceneRef.current : null;
        if (scene) {
          await scene.highlightSpecialSymbols(filtered, { fast: spinFast, type, label });
          return;
        }
        setMegaFallbackSpecialWinning(filtered.map(({ reel, row }) => ({ reel, row })));
        if (winPop) setMegaFallbackWinPop(winPop);
        await delay(scaleSpinDelay(type === 'scatter' ? 980 : 860, spinFast));
        setMegaFallbackSpecialWinning([]);
        if (winPop) setMegaFallbackWinPop(null);
      };

      const playCascadeOrFallback = async (
        steps: HotlineCascadeStep[],
        finalGrid: number[][],
        onStepWin: (step: HotlineCascadeStep) => MegaFallbackWinPop,
        specialSymbols: HotlineSpecialSymbol[] = [],
        finalSpecialSymbols: HotlineSpecialSymbol[] = specialSymbols,
      ): Promise<void> => {
        const scene = sceneReady && !sceneFallback ? sceneRef.current : null;
        if (scene) {
          await scene.playCascadeSpin(steps, finalGrid, {
            fast: spinFast,
            specialSymbols,
            finalSpecialSymbols,
            payoutAmount: baseBetAmount,
            onStepWin: (step) => void onStepWin(step),
          });
          return;
        }

        const first = steps[0];
        if (!first) {
          await playSpinOrFallback(finalGrid, [], finalSpecialSymbols);
          return;
        }

        await playSpinOrFallback(first.grid, first.lines, specialSymbols);
        await playFallbackWinHold(first.removed, onStepWin(first));

        let previous = first;
        for (let i = 1; i < steps.length; i += 1) {
          const step = steps[i]!;
          await playFallbackCascadeDrop(previous.removed, step.grid);
          await playFallbackWinHold(step.removed, onStepWin(step));
          previous = step;
        }

        await playFallbackCascadeDrop(previous.removed, finalGrid, finalSpecialSymbols);
        const multiplierSymbols = finalSpecialSymbols.filter(
          (symbol) => symbol.type === 'multiplier',
        );
        if (multiplierSymbols.length > 0) {
          const multiplierTotal = sumSpecialSymbolValues(multiplierSymbols);
          await playSpecialHighlightOrFallback(
            multiplierSymbols,
            'multiplier',
            `倍數啟動 ×${multiplierTotal}`,
            {
              label: '倍數啟動',
              amount: `×${multiplierTotal}`,
              meta: '倍數符號啟動',
            },
          );
        }
        updateLiveMegaRound({ grid: finalGrid, specialSymbols: finalSpecialSymbols });
      };

      const playFallbackCascadeDrop = async (
        removed: HotlineWinPosition[],
        nextGrid: number[][],
        specialSymbols: HotlineSpecialSymbol[] = [],
      ): Promise<void> => {
        setMegaFallbackRemoved(removed);
        await delay(scaleSpinDelay(420, spinFast));
        setMegaFallbackRemoved([]);
        setMegaFallbackWinning([]);
        setMegaFallbackDropping(true);
        updateLiveMegaRound({ grid: nextGrid, specialSymbols });
        await delay(scaleSpinDelay(520, spinFast));
        setMegaFallbackDropping(false);
        await delay(scaleSpinDelay(120, spinFast));
      };

      const playFallbackWinHold = async (
        positions: HotlineWinPosition[],
        winPop: MegaFallbackWinPop,
      ): Promise<void> => {
        if (positions.length === 0) return;
        setMegaFallbackWinning(positions);
        setMegaFallbackWinPop(winPop);
        await delay(scaleSpinDelay(980, spinFast));
        setMegaFallbackWinPop(null);
      };

      const revealCascadeStep = (
        step: HotlineCascadeStep,
        appliedMultiplier: number,
        patch: Partial<LiveMegaRoundState>,
      ): MegaFallbackWinPop => {
        revealedCascadeCount += 1;
        const appliedStepMultiplier = roundMegaMultiplier(step.multiplier * appliedMultiplier);
        revealedMultiplier = roundMegaMultiplier(revealedMultiplier + appliedStepMultiplier);
        updateLiveMegaRound({
          ...patch,
          grid: step.grid,
          cascadeCount: revealedCascadeCount,
          multiplier: revealedMultiplier,
          payout: roundMegaPayout(baseBetAmount, revealedMultiplier),
        });
        return {
          amount: `+${formatAmount(roundMegaPayout(baseBetAmount, appliedStepMultiplier))}`,
          meta: [
            `${step.removed.length} 個符號`,
            formatMultiplier(step.multiplier),
            appliedMultiplier > 1 ? `倍數 ${appliedMultiplier}×` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        };
      };

      const revealBaseState = (grid: number[][]): void => {
        if (!features) {
          updateLiveMegaRound({ grid });
          return;
        }
        updateLiveMegaRound({
          grid,
          freeSpinMode: false,
          scatterCount: features.scatterCount,
          freeSpinsAwarded: revealedFreeSpinsAwarded,
          activeMultiplier: Math.max(1, features.baseMultiplierTotal),
          baseMultiplierTotal: features.baseMultiplierTotal,
          specialSymbols: [...features.scatterSymbols, ...features.baseMultiplierSymbols],
        });
      };

      const baseSpecialSymbols = features
        ? [...features.scatterSymbols, ...features.baseMultiplierSymbols]
        : [];

      if (cascades.length > 0) {
        await playCascadeOrFallback(
          cascades,
          res.data.grid,
          (step) => {
            return revealCascadeStep(
              step,
              features?.baseAppliedMultiplier ?? 1,
              features
                ? {
                    scatterCount: features.scatterCount,
                    freeSpinsAwarded: revealedFreeSpinsAwarded,
                    activeMultiplier: Math.max(1, features.baseMultiplierTotal),
                    baseMultiplierTotal: features.baseMultiplierTotal,
                  }
                : {},
            );
          },
          [],
          baseSpecialSymbols,
        );
        revealBaseState(res.data.grid);
      } else {
        await playSpinOrFallback(res.data.grid, res.data.lines, baseSpecialSymbols);
        revealBaseState(res.data.grid);
      }
      if (features && revealedFreeSpinsAwarded > 0 && freeSpinRounds.length > 0) {
        await playSpecialHighlightOrFallback(
          features.scatterSymbols,
          'scatter',
          `${features.scatterCount} SCATTER 免費旋轉`,
          {
            label: 'BONUS',
            amount: 'FREE SPINS',
            meta: `${features.scatterCount} SCATTER`,
          },
        );
        await delay(scaleSpinDelay(260, spinFast));
        await showMegaFreeSpinIntro(
          {
            kind: 'trigger',
            spins: revealedFreeSpinsAwarded,
            totalSpins: revealedFreeSpinsAwarded,
            scatterCount: features.scatterCount,
          },
          scaleSpinDelay(MEGA_FREE_SPIN_INTRO_MS, spinFast),
        );
      }
      for (const round of freeSpinRounds) {
        await delay(scaleSpinDelay(360, spinFast));
        revealedFreeMultiplierBank = roundMegaMultiplier(
          revealedFreeMultiplierBank + round.multiplierTotal,
        );
        const roundSpecialSymbols = [...round.scatterSymbols, ...round.multiplierSymbols];
        const freeRoundPatch: Partial<LiveMegaRoundState> = {
          freeSpinsPlayed: round.index + 1,
          freeSpinsAwarded: revealedFreeSpinsAwarded,
          freeSpinMode: true,
          activeMultiplier: Math.max(1, revealedFreeMultiplierBank),
          scatterCount: 0,
          specialSymbols: [],
        };
        const freeRoundFinalPatch: Partial<LiveMegaRoundState> = {
          ...freeRoundPatch,
          scatterCount: round.scatterSymbols.length,
          specialSymbols: roundSpecialSymbols,
        };
        updateLiveMegaRound({ ...freeRoundPatch, grid: round.initialGrid });

        if (round.cascades.length > 0) {
          await playCascadeOrFallback(
            round.cascades,
            round.finalGrid,
            (step) => {
              return revealCascadeStep(step, round.appliedMultiplier, freeRoundPatch);
            },
            [],
            roundSpecialSymbols,
          );
          updateLiveMegaRound({ ...freeRoundFinalPatch, grid: round.finalGrid });
        } else {
          await playSpinOrFallback(round.finalGrid, round.lines, roundSpecialSymbols);
          updateLiveMegaRound({ ...freeRoundFinalPatch, grid: round.finalGrid });
        }

        if (round.extraFreeSpinsAwarded > 0 && features) {
          revealedFreeSpinsAwarded = Math.min(
            features.freeSpinsAwarded,
            revealedFreeSpinsAwarded + round.extraFreeSpinsAwarded,
          );
          updateLiveMegaRound({
            freeSpinsAwarded: revealedFreeSpinsAwarded,
          });
          await playSpecialHighlightOrFallback(
            round.scatterSymbols,
            'scatter',
            `${round.scatterSymbols.length} SCATTER 追加`,
            {
              label: 'BONUS',
              amount: `+${round.extraFreeSpinsAwarded} FREE`,
              meta: `${round.scatterSymbols.length} SCATTER`,
            },
          );
          await showMegaFreeSpinIntro(
            {
              kind: 'retrigger',
              spins: round.extraFreeSpinsAwarded,
              totalSpins: revealedFreeSpinsAwarded,
              scatterCount: round.scatterSymbols.length,
            },
            scaleSpinDelay(MEGA_FREE_SPIN_RETRIGGER_MS, spinFast),
          );
        }
      }
      const mult = res.data.multiplier ?? 0;
      const profitValue = Number.parseFloat(res.data.profit);
      const payoutValue = Number.parseFloat(res.data.payout);
      const featureDetail = formatMegaFeatureDetail(res.data.features, res.data.buyFeature);
      const totalCascadeCount =
        cascades.length + freeSpinRounds.reduce((sum, round) => sum + round.cascades.length, 0);
      sceneRef.current?.playWinFx(displayMultiplier, profitValue >= 0);
      updateLiveMegaRound({
        payout: payoutValue,
        multiplier: displayMultiplier,
        cascadeCount: totalCascadeCount,
        freeSpinsPlayed: features?.freeSpinsPlayed ?? 0,
        freeSpinsAwarded: features?.freeSpinsAwarded ?? 0,
        freeSpinMode: false,
        activeMultiplier: Math.max(
          1,
          features?.freeSpinMultiplierBank ?? 0,
          features?.baseMultiplierTotal ?? 0,
        ),
        baseMultiplierTotal: features?.baseMultiplierTotal ?? 0,
        scatterCount: features?.scatterCount ?? 0,
        specialSymbols: getFinalMegaSpecialSymbols(features),
        grid: getFinalMegaGrid(res.data, fallbackGrid),
      });
      setResult(res.data);
      if (res.data.jackpot) setJackpotSnapshot(res.data.jackpot);
      setBalance(res.data.newBalance);
      setHistory((prev) =>
        [
          {
            id: res.data.betId,
            timestamp: Date.now(),
            betAmount: settledStakeAmount,
            multiplier: mult,
            payout: payoutValue,
            won: profitValue >= 0,
            detail: `${
              totalCascadeCount > 0
                ? `${totalCascadeCount} 次消除 · ${res.data.lines.length} 組合`
                : `${res.data.lines.length} 連線`
            }${featureDetail ? ` · ${featureDetail}` : ''}`,
          },
          ...prev,
        ].slice(0, 30),
      );
      return res.data;
    } catch (err) {
      sceneRef.current?.stopAnticipation();
      sceneRef.current?.resetWinLines();
      setLiveMegaRound(null);
      setMegaFreeSpinIntro(null);
      setMegaFallbackSpinning(false);
      setMegaFallbackWinning([]);
      setMegaFallbackSpecialWinning([]);
      setMegaFallbackRemoved([]);
      setMegaFallbackDropping(false);
      setMegaFallbackWinPop(null);
      setMegaFallbackSpinSpecialSymbols([]);
      setError(extractApiError(err).message);
      return null;
    } finally {
      setSpinning(false);
      setBusy(false);
      setMegaFallbackSpinning(false);
      setMegaFallbackWinning([]);
      setMegaFallbackSpecialWinning([]);
      setMegaFallbackRemoved([]);
      setMegaFallbackDropping(false);
      setMegaFallbackWinPop(null);
      setMegaFallbackSpinSpecialSymbols([]);
    }
  };

  const openAutoSpinSettings = (): void => {
    if (busy || autoSpinActive) return;
    setAutoSpinSettings((prev) => ({
      ...prev,
      amount: roundCurrency(amount),
      lossLimit: prev.lossLimit > 0 ? prev.lossLimit : roundCurrency(amount * 25),
    }));
    setAutoSpinStopReason('');
    setAutoSpinOpen(true);
  };

  const updateAutoSpinSetting = <Key extends keyof AutoSpinSettings>(
    key: Key,
    value: AutoSpinSettings[Key],
  ): void => {
    setAutoSpinSettings((prev) => ({ ...prev, [key]: value }));
  };

  const stopAutoSpin = (): void => {
    autoSpinStopRequestedRef.current = true;
    setAutoSpinStopReason('停止中');
  };

  const startAutoSpin = async (): Promise<void> => {
    if (busy || autoSpinActive) return;
    if (!requireLogin()) return;

    const config = normalizeAutoSpinSettings(autoSpinSettings);
    if (config.rounds <= 0 || config.amount <= 0) return;
    if (balance < config.amount) {
      setError('餘額不足，無法啟動自動轉動');
      return;
    }

    setAmount(config.amount);
    setAutoSpinOpen(false);
    setAutoSpinActive(true);
    setAutoSpinRemaining(config.rounds);
    setAutoSpinStopReason('');
    autoSpinStopRequestedRef.current = false;

    let runningBalance = balance;
    const startBalance = balance;
    let stopReason = '';

    for (let index = 0; index < config.rounds; index += 1) {
      if (autoSpinStopRequestedRef.current) {
        stopReason = '手動停止';
        break;
      }
      if (runningBalance < config.amount) {
        stopReason = '餘額不足';
        break;
      }

      setAutoSpinRemaining(config.rounds - index);
      const roundResult = await spin({
        amountOverride: config.amount,
        balanceOverride: runningBalance,
        autoSpin: true,
        fastSpin: fastSpinRef.current,
      });

      if (!roundResult) {
        stopReason = '自動轉動中斷';
        break;
      }
      if (autoSpinStopRequestedRef.current) {
        stopReason = '手動停止';
        break;
      }

      runningBalance = Number.parseFloat(roundResult.newBalance);
      const payout = Number.parseFloat(roundResult.payout);
      const cumulativeProfit = Math.max(0, runningBalance - startBalance);
      const cumulativeLoss = Math.max(0, startBalance - runningBalance);

      if (config.stopOnAnyWin && payout > 0) {
        stopReason = '任意中獎';
        break;
      }
      if (config.stopOnFreeSpins && (roundResult.features?.freeSpinsAwarded ?? 0) > 0) {
        stopReason = '免費遊戲';
        break;
      }
      if (config.singleWinLimit > 0 && payout >= config.singleWinLimit) {
        stopReason = '單局派彩達標';
        break;
      }
      if (config.profitTarget > 0 && cumulativeProfit >= config.profitTarget) {
        stopReason = '停利達標';
        break;
      }
      if (config.lossLimit > 0 && cumulativeLoss >= config.lossLimit) {
        stopReason = '停損達標';
        break;
      }

      if (index < config.rounds - 1) {
        await delay(scaleSpinDelay(isMegaSlot ? 420 : 240, fastSpinRef.current));
      }
    }

    setAutoSpinRemaining(0);
    setAutoSpinActive(false);
    autoSpinStopRequestedRef.current = false;
    setAutoSpinStopReason(stopReason || '自動轉動完成');
  };

  const resultAmount = result ? Number.parseFloat(result.amount) : 0;
  const resultPayout = result ? Number.parseFloat(result.payout) : 0;
  const resultProfit = result ? Number.parseFloat(result.profit) : 0;
  const resultMultiplier = result?.multiplier ?? 0;
  const megaFeatures = result?.features;
  const resultDisplayMultiplier =
    result?.buyFeature && megaFeatures ? megaFeatures.totalMultiplier : resultMultiplier;
  const megaFreeSpinRounds = megaFeatures?.freeSpinRounds ?? [];
  const lastFreeSpinRound = megaFreeSpinRounds[megaFreeSpinRounds.length - 1];
  const cascadeCount =
    (result?.cascades?.length ?? 0) +
    megaFreeSpinRounds.reduce((sum, round) => sum + round.cascades.length, 0);
  const resultDisplayGrid = lastFreeSpinRound?.finalGrid ?? result?.grid ?? fallbackGrid;
  const visibleSpecialSymbols = megaFeatures
    ? [
        ...megaFeatures.scatterSymbols,
        ...megaFeatures.baseMultiplierSymbols,
        ...(lastFreeSpinRound?.scatterSymbols ?? []),
        ...(lastFreeSpinRound?.multiplierSymbols ?? []),
      ]
    : [];
  const megaActiveMultiplier = Math.max(
    1,
    megaFeatures?.freeSpinMultiplierBank ?? 0,
    megaFeatures?.baseMultiplierTotal ?? 0,
  );
  const megaFreeSpinProgress =
    megaFeatures && megaFeatures.freeSpinsAwarded > 0
      ? `${megaFeatures.freeSpinsPlayed}/${megaFeatures.freeSpinsAwarded}`
      : '0';
  const megaWinMeterLabel = result ? '本局贏分' : '翻轉獎金';
  const megaWinMeterMeta = megaFeatures
    ? [
        result?.buyFeature ? `買入 ${formatAmount(resultAmount)}` : '',
        cascadeCount > 0 ? `${cascadeCount} 次消除` : '',
        megaFeatures.baseMultiplierTotal > 0 ? `倍數 ${megaFeatures.baseMultiplierTotal}×` : '',
        megaFeatures.freeSpinsAwarded > 0
          ? `免費旋轉 ${megaFeatures.freeSpinsPlayed}/${megaFeatures.freeSpinsAwarded}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : slotTheme.readyLabel;
  const megaDisplayGrid = result ? resultDisplayGrid : (liveMegaRound?.grid ?? fallbackGrid);
  const megaDisplaySpecialSymbols = result
    ? visibleSpecialSymbols
    : (liveMegaRound?.specialSymbols ?? []);
  const megaDisplayPayout = result ? resultPayout : (liveMegaRound?.payout ?? 0);
  const megaDisplayActiveMultiplier = result
    ? megaActiveMultiplier
    : (liveMegaRound?.activeMultiplier ?? 1);
  const megaDisplayFreeSpinsPlayed = result
    ? (megaFeatures?.freeSpinsPlayed ?? 0)
    : (liveMegaRound?.freeSpinsPlayed ?? 0);
  const megaDisplayFreeSpinsAwarded = result
    ? (megaFeatures?.freeSpinsAwarded ?? 0)
    : (liveMegaRound?.freeSpinsAwarded ?? 0);
  const megaDisplayFreeSpinMode = !result && (liveMegaRound?.freeSpinMode ?? false);
  const megaDisplayFreeSpinsRemaining = Math.max(
    0,
    megaDisplayFreeSpinsAwarded - megaDisplayFreeSpinsPlayed,
  );
  const megaDisplayFreeSpinProgress = result
    ? megaFreeSpinProgress
    : megaDisplayFreeSpinsAwarded > 0
      ? `${megaDisplayFreeSpinsPlayed}/${megaDisplayFreeSpinsAwarded}`
      : '0';
  const megaDisplayBaseMultiplier = result
    ? (megaFeatures?.baseMultiplierTotal ?? 0)
    : (liveMegaRound?.baseMultiplierTotal ?? 0);
  const megaDisplayScatterCount = result
    ? (megaFeatures?.scatterCount ?? 0)
    : (liveMegaRound?.scatterCount ?? 0);
  const megaScatterTriggerTarget = megaDisplayFreeSpinMode ? 3 : 4;
  const megaDisplayCascadeCount = result ? cascadeCount : (liveMegaRound?.cascadeCount ?? 0);
  const megaDisplayWinMeterLabel = result || liveMegaRound ? '本局贏分' : megaWinMeterLabel;
  const liveMegaWinMeterMeta = liveMegaRound
    ? [
        megaDisplayCascadeCount > 0 ? `${megaDisplayCascadeCount} 次消除` : '',
        megaDisplayBaseMultiplier > 0 ? `倍數 ${megaDisplayBaseMultiplier}×` : '',
        liveMegaRound.freeSpinsAwarded > 0
          ? `免費旋轉 ${liveMegaRound.freeSpinsPlayed}/${liveMegaRound.freeSpinsAwarded}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ') || slotTheme.readyLabel
    : slotTheme.readyLabel;
  const megaDisplayWinMeterMeta = result ? megaWinMeterMeta : liveMegaWinMeterMeta;
  const megaFreeSpinStatus =
    megaDisplayFreeSpinsAwarded > 0
      ? result
        ? '已完成'
        : megaDisplayFreeSpinMode
          ? `本回合免費 · 剩餘 ${megaDisplayFreeSpinsRemaining}`
          : '已觸發，準備進入免費旋轉'
      : '4 SCATTER 觸發';
  const megaSpinButtonLabel = busy
    ? megaDisplayFreeSpinMode
      ? '免費旋轉'
      : '轉動中'
    : t.games.hotline.spin;
  const megaSpinButtonValue =
    busy && megaDisplayFreeSpinMode ? `剩 ${megaDisplayFreeSpinsRemaining}` : formatAmount(amount);
  const megaBuyFeatureCost = Number((amount * 100).toFixed(2));
  const controlsLocked = busy || autoSpinActive;
  const canBuyMegaFeature =
    isMegaSlot && !controlsLocked && (!user || balance >= megaBuyFeatureCost);
  const autoSpinButtonLabel = autoSpinActive ? '停止' : 'AUTO';
  const autoSpinButtonValue = autoSpinActive
    ? autoSpinRemaining > 0
      ? `剩 ${autoSpinRemaining}`
      : '停止中'
    : '設定';
  const fastSpinButtonValue = fastSpin ? '開啟' : '一般';
  const isBigWinResult = resultProfit > 0 && resultDisplayMultiplier >= BIG_WIN_MULTIPLIER;
  const showBigWinOverlay = Boolean(
    result && !spinning && isBigWinResult && dismissedBigWinBetId !== result.betId,
  );
  const resultTitle = isBigWinResult
    ? '恭喜爆分'
    : resultPayout > resultAmount
      ? '恭喜中獎'
      : resultPayout > 0
        ? '小中獎派彩'
        : '本局未中';
  const autoSpinDialog = autoSpinOpen ? (
    <div
      className="slot-auto-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slot-auto-title"
    >
      <div className="slot-auto-modal__panel">
        <div className="slot-auto-modal__header">
          <div>
            <span>自動轉動</span>
            <strong id="slot-auto-title">{slotTheme.title}</strong>
          </div>
          <button type="button" onClick={() => setAutoSpinOpen(false)} aria-label="關閉">
            關閉
          </button>
        </div>

        <div className="slot-auto-modal__body">
          <label className="slot-auto-field">
            <span>轉動次數</span>
            <input
              type="number"
              min={1}
              max={500}
              value={autoSpinSettings.rounds}
              onChange={(event) =>
                updateAutoSpinSetting('rounds', Number.parseInt(event.target.value, 10) || 1)
              }
            />
          </label>
          <div className="slot-auto-presets">
            {AUTO_SPIN_ROUND_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => updateAutoSpinSetting('rounds', preset)}
                className={autoSpinSettings.rounds === preset ? 'slot-auto-preset--active' : ''}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="slot-auto-grid">
            <label className="slot-auto-field">
              <span>下注金額</span>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={autoSpinSettings.amount}
                onChange={(event) =>
                  updateAutoSpinSetting('amount', Number.parseFloat(event.target.value) || 0)
                }
              />
            </label>
            <label className="slot-auto-field">
              <span>停損</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoSpinSettings.lossLimit}
                onChange={(event) =>
                  updateAutoSpinSetting('lossLimit', Number.parseFloat(event.target.value) || 0)
                }
              />
            </label>
            <label className="slot-auto-field">
              <span>停利</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoSpinSettings.profitTarget}
                onChange={(event) =>
                  updateAutoSpinSetting('profitTarget', Number.parseFloat(event.target.value) || 0)
                }
              />
            </label>
            <label className="slot-auto-field">
              <span>單局派彩</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoSpinSettings.singleWinLimit}
                onChange={(event) =>
                  updateAutoSpinSetting(
                    'singleWinLimit',
                    Number.parseFloat(event.target.value) || 0,
                  )
                }
              />
            </label>
          </div>

          <div className="slot-auto-switches">
            <label className="slot-auto-switch">
              <input
                type="checkbox"
                checked={autoSpinSettings.stopOnAnyWin}
                onChange={(event) => updateAutoSpinSetting('stopOnAnyWin', event.target.checked)}
              />
              <span>任意中獎停止</span>
            </label>
            <label className="slot-auto-switch">
              <input
                type="checkbox"
                checked={autoSpinSettings.stopOnFreeSpins}
                onChange={(event) => updateAutoSpinSetting('stopOnFreeSpins', event.target.checked)}
              />
              <span>免費遊戲停止</span>
            </label>
          </div>
        </div>

        <div className="slot-auto-modal__footer">
          <div className="slot-auto-summary">
            <span>餘額 {user ? formatAmount(balance) : '登入後顯示'}</span>
            <strong>每轉 {formatAmount(autoSpinSettings.amount)}</strong>
          </div>
          <div className="slot-auto-actions">
            <button type="button" onClick={() => setAutoSpinOpen(false)}>
              取消
            </button>
            <button
              type="button"
              onClick={() => void startAutoSpin()}
              disabled={
                autoSpinSettings.rounds <= 0 ||
                autoSpinSettings.amount <= 0 ||
                (!!user && balance < autoSpinSettings.amount)
              }
            >
              開始自動
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  if (isMegaSlot) {
    return (
      <div
        className={`slot-game-page slot-game-page--mega mega-slot-machine ${fastSpin ? 'mega-slot-machine--fast' : ''}`}
        style={
          {
            '--mega-slot-bg': `url(${slotTheme.background})`,
            '--mega-slot-cover': `url(${slotTheme.cover})`,
            '--mega-slot-accent': slotTheme.symbols[5]?.accentHex ?? '#F3D67D',
          } as CSSProperties
        }
      >
        <div className="slot-landscape-gate" role="status" aria-live="polite">
          <div className="slot-landscape-gate__panel">
            <RotateCw className="h-9 w-9 text-[#F3D67D]" aria-hidden="true" />
            <div className="text-center">
              <div className="text-sm font-black tracking-[0.18em] text-white">
                請將手機轉為橫向
              </div>
              <div className="mt-1 text-xs font-semibold text-white/65">
                Mega 寬版盤面需要更寬的遊玩空間
              </div>
            </div>
          </div>
        </div>

        <div className="mega-slot-machine__backdrop" aria-hidden="true" />
        <div className="mega-slot-machine__chrome">
          <header className="mega-slot-topbar">
            <Link
              to={returnTarget.to}
              className="mega-slot-icon-btn"
              aria-label={`返回${returnTarget.label}`}
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
            <div className="mega-slot-brand">
              <div className="mega-slot-brand__title">{slotTheme.title}</div>
              <div className="mega-slot-brand__sub">{slotTheme.suffix} MEGA WAYS</div>
            </div>
            <div className="mega-slot-jackpots" aria-label="彩金">
              {jackpotValues.map((item) => (
                <div key={item.label} className="mega-slot-jackpot">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <Link to={user ? '/history' : '/login'} className="mega-slot-pill">
              <History className="h-4 w-4" aria-hidden="true" />
              記錄
            </Link>
            <SoundToggle variant="dark" />
            <MusicToggle variant="dark" />
          </header>

          <div className="mega-slot-body">
            <aside className="mega-slot-side mega-slot-side--left">
              <div className="mega-slot-logo-card">
                <div className="mega-slot-logo-card__eyebrow">{slotTheme.section}</div>
                <div className="mega-slot-logo-card__title">{slotTheme.title}</div>
                <div className="mega-slot-logo-card__suffix">{slotTheme.suffix}</div>
              </div>
              <div className="mega-slot-bonus-panel">
                <div className="mega-slot-multiplier">{megaDisplayActiveMultiplier}×</div>
                <div
                  className={`mega-slot-free-spins ${megaDisplayFreeSpinsAwarded > 0 ? 'mega-slot-free-spins--active' : ''}`}
                >
                  <strong>{megaDisplayFreeSpinProgress}</strong>
                  <span>{megaDisplayFreeSpinMode ? '免費旋轉中' : '免費旋轉'}</span>
                  <small>{megaFreeSpinStatus}</small>
                </div>
                <div className="mega-slot-feature-stack">
                  <div>
                    <span>倍數符號</span>
                    <strong>
                      {megaDisplayBaseMultiplier > 0 ? `${megaDisplayBaseMultiplier}×` : '待觸發'}
                    </strong>
                  </div>
                  <div>
                    <span>SCATTER</span>
                    <strong>
                      {megaDisplayScatterCount}/{megaScatterTriggerTarget}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="mega-slot-mini-pay">
                {slotTheme.symbols.slice(0, 3).map((symbol, index) => (
                  <div key={symbol.label}>
                    <SlotSymbolBadge theme={slotTheme} symbol={index} useShortLabel />
                    <span>{MEGA_SYMBOL_PAYOUTS[index]}</span>
                  </div>
                ))}
              </div>
            </aside>

            <section className="mega-slot-stage" aria-label={`${slotTheme.title} 6x5 盤面`}>
              <div
                className={`mega-slot-win-meter ${result || megaDisplayPayout > 0 ? 'mega-slot-win-meter--settled' : ''}`}
              >
                <div className="mega-slot-win-meter__label">{megaDisplayWinMeterLabel}</div>
                <strong>{formatAmount(megaDisplayPayout)}</strong>
                <div className="mega-slot-win-meter__meta">{megaDisplayWinMeterMeta}</div>
              </div>
              <div className="mega-slot-board">
                <MegaFallbackGrid
                  theme={slotTheme}
                  grid={megaDisplayGrid}
                  spinning={megaFallbackSpinning}
                  winning={megaFallbackWinning}
                  specialWinning={megaFallbackSpecialWinning}
                  removed={megaFallbackRemoved}
                  dropping={megaFallbackDropping}
                  winPop={megaFallbackWinPop}
                  hidden={sceneReady && !sceneFallback}
                  fast={fastSpin}
                  specialSymbols={megaDisplaySpecialSymbols}
                  spinSpecialSymbols={megaFallbackSpinSpecialSymbols}
                />
                <canvas
                  ref={canvasRef}
                  className={`mega-slot-canvas ${sceneReady && !sceneFallback ? 'mega-slot-canvas--ready' : ''}`}
                />
                {megaFreeSpinIntro && <MegaFreeSpinIntroOverlay intro={megaFreeSpinIntro} />}
              </div>
              {result && showBigWinOverlay && (
                <button
                  type="button"
                  className="slot-bigwin-stage"
                  aria-label="關閉大獎畫面"
                  onClick={() => setDismissedBigWinBetId(result.betId)}
                  style={
                    slotTheme.bigWin
                      ? {
                          backgroundImage: `linear-gradient(90deg, rgba(5, 10, 19, 0.72), rgba(5, 10, 19, 0.32)), url(${slotTheme.bigWin})`,
                        }
                      : undefined
                  }
                >
                  <div className="slot-bigwin-stage__content">
                    <div className="slot-bigwin-stage__eyebrow">連鎖消除</div>
                    <div className="slot-bigwin-stage__title">恭喜爆分</div>
                    <div className="slot-bigwin-stage__amount">{formatAmount(result.payout)}</div>
                    <div className="slot-bigwin-stage__meta">
                      {formatMultiplier(resultDisplayMultiplier)}
                      {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                    </div>
                  </div>
                </button>
              )}
            </section>

            <aside className="mega-slot-side mega-slot-side--right" aria-hidden="true">
              <div className="mega-slot-hero-art" />
            </aside>
          </div>

          <footer className="mega-slot-controls">
            <div className="mega-slot-control-tile">
              <span>餘額</span>
              <strong>{user ? formatAmount(balance) : '登入後顯示'}</strong>
            </div>
            <div className="mega-slot-control-tile">
              <span>本局派彩</span>
              <strong>{formatAmount(megaDisplayPayout)}</strong>
            </div>
            <div className="mega-slot-betbox">
              <button
                type="button"
                onClick={() => setMegaAmount(amount / 2)}
                disabled={controlsLocked}
              >
                ½
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={amount.toFixed(2)}
                disabled={controlsLocked}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (Number.isFinite(next)) setMegaAmount(next);
                }}
                aria-label="下注金額"
              />
              <button
                type="button"
                onClick={() => setMegaAmount(amount * 2)}
                disabled={controlsLocked}
              >
                2×
              </button>
            </div>
            <div className="mega-slot-action-stack">
              <button
                type="button"
                onClick={() => setFastSpin((value) => !value)}
                className={`mega-slot-speed ${fastSpin ? 'mega-slot-speed--active' : ''}`}
                aria-label={fastSpin ? '關閉加速轉動' : '開啟加速轉動'}
                aria-pressed={fastSpin}
              >
                <Zap className="h-4 w-4" aria-hidden="true" />
                <span>加速</span>
                <strong>{fastSpinButtonValue}</strong>
              </button>
              <button
                type="button"
                onClick={autoSpinActive ? stopAutoSpin : openAutoSpinSettings}
                disabled={busy && !autoSpinActive}
                className="mega-slot-auto"
                aria-label={autoSpinActive ? '停止自動轉動' : '設定自動轉動'}
              >
                <span>{autoSpinButtonLabel}</span>
                <strong>{autoSpinButtonValue}</strong>
              </button>
              <button
                type="button"
                onClick={() => void spin({ buyFeature: true })}
                disabled={!canBuyMegaFeature}
                className="mega-slot-buy"
                aria-label="購買免費遊戲"
              >
                <span>購買免費</span>
                <strong>100× · {formatAmount(megaBuyFeatureCost)}</strong>
              </button>
              <button
                type="button"
                onClick={() => void spin()}
                disabled={controlsLocked || (!!user && balance < amount)}
                className="mega-slot-spin"
                aria-label={t.games.hotline.spin}
              >
                <span>{megaSpinButtonLabel}</span>
                <strong>{megaSpinButtonValue}</strong>
              </button>
            </div>
          </footer>

          {autoSpinStopReason && (
            <div className="mega-slot-auto-status">
              <span>自動轉動</span>
              <strong>{autoSpinStopReason}</strong>
            </div>
          )}

          {error && (
            <div className="mega-slot-alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error.toUpperCase()}</span>
            </div>
          )}
        </div>
        {autoSpinDialog}
      </div>
    );
  }

  return (
    <div
      className={`slot-game-page ${isMegaSlot ? 'slot-game-page--mega' : 'slot-game-page--classic'} ${fastSpin ? 'slot-game-page--fast' : ''}`}
    >
      {isMegaSlot && (
        <div className="slot-landscape-gate" role="status" aria-live="polite">
          <div className="slot-landscape-gate__panel">
            <RotateCw className="h-9 w-9 text-[#F3D67D]" aria-hidden="true" />
            <div className="text-center">
              <div className="text-sm font-black tracking-[0.18em] text-white">
                請將手機轉為橫向
              </div>
              <div className="mt-1 text-xs font-semibold text-white/65">
                Mega 寬版盤面需要更寬的遊玩空間
              </div>
            </div>
          </div>
        </div>
      )}

      <GameHeader
        artwork={slotTheme.cover}
        section={slotTheme.section}
        breadcrumb={slotTheme.breadcrumb}
        title={slotTheme.title}
        titleSuffix={slotTheme.suffix}
        titleSuffixColor={slotTheme.rtpAccent}
        description={slotTheme.description}
        rtpLabel={slotTheme.rtpLabel}
        rtpAccent={slotTheme.rtpAccent}
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">
                {slotTheme.stageLabel}
              </span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">{slotTheme.suffix}</span>
              <span className="text-white/72">
                {spinning ? slotTheme.spinningLabel : slotTheme.readyLabel}
              </span>
            </div>

            <div className={`game-canvas-shell game-canvas-wide ${canvasAspectClass} w-full p-2`}>
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            {result && showBigWinOverlay && (
              <button
                type="button"
                className="slot-bigwin-stage"
                aria-label="關閉大獎畫面"
                onClick={() => setDismissedBigWinBetId(result.betId)}
                style={
                  slotTheme.bigWin
                    ? {
                        backgroundImage: `linear-gradient(90deg, rgba(5, 10, 19, 0.72), rgba(5, 10, 19, 0.32)), url(${slotTheme.bigWin})`,
                      }
                    : undefined
                }
              >
                <div className="slot-bigwin-stage__content">
                  <div className="slot-bigwin-stage__eyebrow">連鎖消除</div>
                  <div className="slot-bigwin-stage__title">恭喜爆分</div>
                  <div className="slot-bigwin-stage__amount">{formatAmount(result.payout)}</div>
                  <div className="slot-bigwin-stage__meta">
                    {formatMultiplier(resultDisplayMultiplier)}
                    {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                  </div>
                </div>
              </button>
            )}
          </div>

          {result && !spinning && (
            <div
              className={`game-result-card slot-result-card ${isBigWinResult ? 'slot-result-card-bigwin' : ''} ${resultProfit >= 0 ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="slot-result-summary flex flex-col items-center justify-center gap-1 text-center">
                <div>
                  <div className="mb-1 text-[12px] font-black tracking-[0.22em] text-[#F3D67D]">
                    {resultTitle}
                  </div>
                  <div className="font-display text-4xl text-white">
                    {result.lines.length}{' '}
                    {result.lines.length !== 1 ? t.games.hotline.lines : t.games.hotline.line}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                    {t.games.hotline.totalMult} {formatMultiplier(resultDisplayMultiplier)}
                    {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                  </div>
                </div>
                <div className="slot-result-payout num text-2xl text-[#F3D67D]">
                  派彩 {formatAmount(result.payout)}
                </div>
                <div className="slot-result-profit num text-3xl text-[#7DD3FC]">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
              {result.lines.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.lines.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.05] px-3 py-2 text-[11px]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-white/85">
                          {l.ways
                            ? l.lineId?.startsWith('cluster-')
                              ? `組合 ${i + 1} · ${l.count} 個`
                              : `方式 ${i + 1} · ${l.count} 軸 · ${l.ways} 組`
                            : `${l.lineId ? `${t.games.hotline.line} ${i + 1}` : `${t.games.hotline.row} ${l.row + 1}`} · ${l.count}×`}
                        </span>
                        <SlotSymbolBadge
                          theme={slotTheme}
                          symbol={l.symbol}
                          showLabel
                          useShortLabel
                        />
                      </div>
                      <span className="data-num text-[#7DD3FC]">{l.payout}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="game-control-stack space-y-4">
          <div className="game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              disabled={controlsLocked}
            />

            <div className="slot-spin-actions">
              <button
                type="button"
                onClick={() => setFastSpin((value) => !value)}
                className={`slot-speed-button ${fastSpin ? 'slot-speed-button--active' : ''}`}
                aria-label={fastSpin ? '關閉加速轉動' : '開啟加速轉動'}
                aria-pressed={fastSpin}
              >
                <Zap className="h-4 w-4" aria-hidden="true" />
                <span>加速</span>
                <strong>{fastSpinButtonValue}</strong>
              </button>
              <button
                type="button"
                onClick={autoSpinActive ? stopAutoSpin : openAutoSpinSettings}
                disabled={busy && !autoSpinActive}
                className="slot-auto-button"
              >
                <span>{autoSpinButtonLabel}</span>
                <strong>{autoSpinButtonValue}</strong>
              </button>
              <button
                type="button"
                onClick={() => void spin()}
                disabled={controlsLocked || (!!user && balance < amount)}
                className="btn-acid w-full py-4"
              >
                → {t.games.hotline.spin} · {formatAmount(amount)}
              </button>
            </div>
            {autoSpinStopReason && (
              <div className="slot-auto-status">
                <span>自動轉動</span>
                <strong>{autoSpinStopReason}</strong>
              </div>
            )}
            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance}{' '}
                <span className="data-num ml-1 text-white">
                  {user ? formatAmount(balance) : '登入後顯示'}
                </span>
              </span>
              <span>
                {t.games.hotline.totalMult}{' '}
                <span className="data-num ml-1 text-[#FCA5A5]">
                  {result ? formatMultiplier(resultDisplayMultiplier) : '—'}
                </span>
              </span>
            </div>
          </div>

          <div className="game-side-card p-5">
            <div className="label">{t.games.hotline.payoutTable}</div>
            <div className="mt-3 space-y-2 text-[11px]">
              {slotTheme.symbols.map((symbol, index) => (
                <div
                  key={`${slotTheme.id}-${symbol.label}`}
                  className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-0 last:pb-0"
                >
                  <SlotSymbolBadge theme={slotTheme} symbol={index} showLabel />
                  <span className="data-num text-right text-white/85">
                    {getSlotPayoutLabel(slotTheme, index, isMegaSlot)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
      {autoSpinDialog}
    </div>
  );
}

function SlotSymbolBadge({
  theme,
  symbol,
  showLabel = false,
  useShortLabel = false,
}: {
  theme: SlotThemeConfig;
  symbol: number;
  showLabel?: boolean;
  useShortLabel?: boolean;
}) {
  const meta = theme.symbols[symbol] ?? theme.symbols[0]!;
  const label = useShortLabel ? meta.shortLabel : meta.label;
  const symbolImage = getMegaSlotSymbolImage(theme, symbol);

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{
        borderColor: `${meta.accentHex}33`,
        backgroundColor: `${meta.accentHex}14`,
        color: meta.accentHex,
      }}
    >
      <span
        className="block h-7 w-7 shrink-0 rounded-full border bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]"
        style={{
          borderColor: `${meta.accentHex}40`,
          backgroundImage: `url(${symbolImage ?? theme.symbolSheet})`,
          backgroundSize: symbolImage ? 'contain' : '300% 200%',
          backgroundPosition: symbolImage ? 'center' : (SYMBOL_POSITIONS[symbol] ?? '0% 0%'),
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />
      {showLabel ? <span className="tracking-[0.18em]">{label}</span> : null}
    </span>
  );
}

function MegaFallbackGrid({
  theme,
  grid,
  spinning,
  winning,
  specialWinning,
  removed,
  dropping,
  winPop,
  hidden,
  fast,
  specialSymbols,
  spinSpecialSymbols,
}: {
  theme: SlotThemeConfig;
  grid: number[][];
  spinning: boolean;
  winning: HotlineWinPosition[];
  specialWinning: HotlineWinPosition[];
  removed: HotlineWinPosition[];
  dropping: boolean;
  winPop: MegaFallbackWinPop | null;
  hidden: boolean;
  fast: boolean;
  specialSymbols: HotlineSpecialSymbol[];
  spinSpecialSymbols: HotlineSpecialSymbol[];
}) {
  const winningKeys = useMemo(
    () => new Set(winning.map((position) => `${position.reel}:${position.row}`)),
    [winning],
  );
  const specialWinningKeys = useMemo(
    () => new Set(specialWinning.map((position) => `${position.reel}:${position.row}`)),
    [specialWinning],
  );
  const removedKeys = useMemo(
    () => new Set(removed.map((position) => `${position.reel}:${position.row}`)),
    [removed],
  );
  const specialByCell = useMemo(() => createSpecialSymbolMap(specialSymbols), [specialSymbols]);

  return (
    <div
      className={`mega-slot-fallback-grid ${spinning ? 'mega-slot-fallback-grid--spinning' : ''} ${dropping ? 'mega-slot-fallback-grid--dropping' : ''} ${hidden ? 'mega-slot-fallback-grid--hidden' : ''} ${fast ? 'mega-slot-fallback-grid--fast' : ''}`}
      aria-hidden="true"
    >
      <div className="mega-slot-fallback-frame">
        {grid.map((reel, reelIndex) => {
          const reelStrip: MegaFallbackSpinItem[] = spinning
            ? createFallbackSpinStrip(theme, reel, reelIndex, spinSpecialSymbols)
            : reel.map((symbol, row) => ({ symbol, row }));
          const style = {
            '--mega-slot-reel-items': reelStrip.length,
            '--mega-slot-reel-duration': `${(fast ? 0.18 : 0.46) + reelIndex * (fast ? 0.018 : 0.055)}s`,
          } as CSSProperties;
          return (
            <div key={`${theme.id}-fallback-reel-${reelIndex}`} className="mega-slot-fallback-reel">
              <div className="mega-slot-fallback-reel-track" style={style}>
                {reelStrip.map((item, rowIndex) => {
                  const symbol = item.symbol;
                  const meta = theme.symbols[symbol] ?? theme.symbols[0]!;
                  const cellRow = item.row ?? rowIndex;
                  const cellKey = `${reelIndex}:${cellRow}`;
                  const special =
                    item.special ?? (spinning ? undefined : specialByCell.get(cellKey));
                  const symbolImage = getMegaSlotDisplayImage(theme, symbol, special);
                  const winning = !spinning && winningKeys.has(cellKey);
                  const specialHighlighted = !spinning && specialWinningKeys.has(cellKey);
                  const removing = !spinning && removedKeys.has(cellKey);
                  return (
                    <div
                      key={`${reelIndex}-${rowIndex}-${symbol}-${specialKey(special)}-${spinning ? 'spin' : 'idle'}`}
                      className={`mega-slot-fallback-symbol ${special ? `mega-slot-fallback-symbol--${special.type}` : ''} ${winning ? 'mega-slot-fallback-symbol--winning' : ''} ${specialHighlighted ? 'mega-slot-fallback-symbol--special-highlight' : ''} ${removing ? 'mega-slot-fallback-symbol--removing' : ''}`}
                      style={
                        {
                          borderColor: `${meta.accentHex}88`,
                          '--mega-slot-accent': meta.accentHex,
                          backgroundImage: symbolImage ? 'none' : `url(${theme.symbolSheet})`,
                          backgroundPosition: symbolImage
                            ? 'center'
                            : (SYMBOL_POSITIONS[symbol] ?? '0% 0%'),
                          '--mega-slot-reel-index': reelIndex,
                          '--mega-slot-row-index': rowIndex,
                        } as CSSProperties
                      }
                    >
                      {symbolImage && (
                        <img
                          src={symbolImage}
                          alt=""
                          draggable={false}
                          decoding="async"
                          aria-hidden="true"
                        />
                      )}
                      {special?.type === 'multiplier' ? (
                        <strong className="mega-slot-fallback-symbol__multiplier">
                          {special.value ?? 2}×
                        </strong>
                      ) : null}
                      <span>
                        {special ? (special.type === 'scatter' ? 'SC' : '倍') : meta.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {winPop ? (
        <div className="mega-slot-fallback-win-pop" role="status">
          <span>{winPop.label ?? '消除贏分'}</span>
          <strong>{winPop.amount}</strong>
          <small>{winPop.meta}</small>
        </div>
      ) : null}
    </div>
  );
}

interface MegaFallbackSpinItem {
  symbol: number;
  row?: number;
  special?: HotlineSpecialSymbol;
}

function createFallbackSpinStrip(
  theme: SlotThemeConfig,
  reel: number[],
  reelIndex: number,
  specialSymbols: HotlineSpecialSymbol[] = [],
): MegaFallbackSpinItem[] {
  const symbolCount = theme.symbols.length || 6;
  const extraRows = theme.rows * 2;
  const specialByRow = new Map(
    specialSymbols
      .filter((symbol) => symbol.reel === reelIndex)
      .map((symbol) => [symbol.row, symbol] as const),
  );
  const lead = Array.from({ length: extraRows }, (_, index) => ({
    symbol: (index + reelIndex * 2 + theme.id.length) % symbolCount,
  }));
  const final = reel.map((symbol, row) => ({
    symbol,
    row,
    special: specialByRow.get(row),
  }));
  const trail = Array.from({ length: extraRows }, (_, index) => ({
    symbol: (index * 2 + reelIndex + theme.id.length + 3) % symbolCount,
  }));
  return [...lead, ...final, ...trail];
}

function getMegaSlotSymbolImage(theme: SlotThemeConfig, symbol: number): string | null {
  if (theme.rows <= 3) return null;
  if (!Number.isInteger(symbol) || symbol < 0 || symbol >= theme.symbols.length) return null;
  return theme.symbolSheet.replace(/symbols\.png$/, `symbol-${symbol}.png`);
}

function getMegaSlotDisplayImage(
  theme: SlotThemeConfig,
  symbol: number,
  special?: HotlineSpecialSymbol,
): string | null {
  if (special?.type === 'scatter') return getMegaSlotScatterImage(theme);
  if (special?.type === 'multiplier') return getMegaSlotMultiplierImage(theme);
  return getMegaSlotSymbolImage(theme, symbol);
}

function getMegaSlotMultiplierImage(theme: SlotThemeConfig): string {
  return theme.symbolSheet.replace(/symbols\.png$/, 'multiplier.png');
}

function getMegaSlotScatterImage(theme: SlotThemeConfig): string {
  return theme.symbolSheet.replace(/symbols\.png$/, 'scatter.png');
}

function createSpecialSymbolMap(
  symbols: HotlineSpecialSymbol[],
): Map<string, HotlineSpecialSymbol> {
  const map = new Map<string, HotlineSpecialSymbol>();
  for (const symbol of symbols) {
    map.set(`${symbol.reel}:${symbol.row}`, symbol);
  }
  return map;
}

function specialKey(symbol?: HotlineSpecialSymbol): string {
  if (!symbol) return '';
  return `${symbol.type}:${symbol.value ?? ''}`;
}

function MegaFreeSpinIntroOverlay({ intro }: { intro: MegaFreeSpinIntro }) {
  const isRetrigger = intro.kind === 'retrigger';
  return (
    <div
      className={`mega-slot-free-spin-intro ${isRetrigger ? 'mega-slot-free-spin-intro--retrigger' : ''}`}
      role="status"
      aria-live="assertive"
    >
      <div className="mega-slot-free-spin-intro__burst" aria-hidden="true" />
      <div className="mega-slot-free-spin-intro__panel">
        <div className="mega-slot-free-spin-intro__eyebrow">{intro.scatterCount} SCATTER</div>
        <div className="mega-slot-free-spin-intro__title">
          {isRetrigger ? '追加免費旋轉' : '免費旋轉已觸發'}
        </div>
        <div className="mega-slot-free-spin-intro__spins">
          {isRetrigger ? `+${intro.spins}` : intro.spins}
          <span>次</span>
        </div>
        <div className="mega-slot-free-spin-intro__meta">
          {isRetrigger ? `目前總次數 ${intro.totalSpins}` : '接下來轉動不扣下注'}
        </div>
      </div>
    </div>
  );
}

function createFallbackGrid(theme: SlotThemeConfig): number[][] {
  const symbolCount = theme.symbols.length || 6;
  return Array.from({ length: theme.reels }, (_, reel) =>
    Array.from(
      { length: theme.rows },
      (_, row) => (reel * 2 + row + theme.id.length) % symbolCount,
    ),
  );
}

function createJackpotValues(themeId: string): { label: string; value: string }[] {
  const seed = Array.from(themeId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return [
    { label: 'GRAND', value: formatJackpot(820000 + seed * 37.12) },
    { label: 'MAJOR', value: formatJackpot(180000 + seed * 19.8) },
    { label: 'MINOR', value: formatJackpot(18000 + seed * 2.7) },
    { label: 'MINI', value: formatJackpot(5200 + seed * 0.92) },
  ];
}

function createJackpotValuesFromSnapshot(
  snapshot: HotlineJackpotSnapshot,
): { label: string; value: string }[] {
  return [
    { label: 'GRAND', value: formatJackpot(Number.parseFloat(snapshot.grand)) },
    { label: 'MAJOR', value: formatJackpot(Number.parseFloat(snapshot.major)) },
    { label: 'MINOR', value: formatJackpot(Number.parseFloat(snapshot.minor)) },
    { label: 'MINI', value: formatJackpot(Number.parseFloat(snapshot.mini)) },
  ];
}

function formatJackpot(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scaleSpinDelay(ms: number, fast: boolean): number {
  if (!fast) return ms;
  return Math.max(40, Math.round(ms * 0.34));
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(2));
}

function normalizeAutoSpinSettings(settings: AutoSpinSettings): AutoSpinSettings {
  return {
    rounds: Math.max(1, Math.min(500, Math.floor(settings.rounds || 1))),
    amount: roundCurrency(settings.amount),
    lossLimit: roundCurrency(settings.lossLimit),
    profitTarget: roundCurrency(settings.profitTarget),
    singleWinLimit: roundCurrency(settings.singleWinLimit),
    stopOnAnyWin: settings.stopOnAnyWin,
    stopOnFreeSpins: settings.stopOnFreeSpins,
  };
}

function roundMegaMultiplier(value: number): number {
  return Math.min(MEGA_MAX_TOTAL_MULTIPLIER, Number(value.toFixed(4)));
}

function roundMegaPayout(amount: number, multiplier: number): number {
  return Number((amount * multiplier).toFixed(2));
}

function sumSpecialSymbolValues(symbols: HotlineSpecialSymbol[]): number {
  return symbols.reduce((sum, symbol) => sum + (symbol.value ?? 0), 0);
}

function getFinalMegaGrid(result: HotlineBetResult, fallbackGrid: number[][]): number[][] {
  const rounds = result.features?.freeSpinRounds ?? [];
  return rounds[rounds.length - 1]?.finalGrid ?? result.grid ?? fallbackGrid;
}

function getFinalMegaSpecialSymbols(features?: HotlineMegaFeatureResult): HotlineSpecialSymbol[] {
  if (!features) return [];
  const lastFreeSpinRound = features.freeSpinRounds[features.freeSpinRounds.length - 1];
  return [
    ...features.scatterSymbols,
    ...features.baseMultiplierSymbols,
    ...(lastFreeSpinRound?.scatterSymbols ?? []),
    ...(lastFreeSpinRound?.multiplierSymbols ?? []),
  ];
}

function getSlotPayoutLabel(
  slotTheme: SlotThemeConfig,
  symbolIndex: number,
  isMegaSlot: boolean,
): string {
  if (isMegaSlot) return MEGA_SYMBOL_PAYOUTS[symbolIndex] ?? '';
  if (slotTheme.reels === 3) return MINI_SYMBOL_PAYOUTS[symbolIndex] ?? '';
  return CLASSIC_SYMBOL_PAYOUTS[symbolIndex] ?? '';
}

function formatMegaFeatureDetail(features?: HotlineMegaFeatureResult, buyFeature = false): string {
  if (!features) return '';
  const parts = [
    buyFeature ? '購買免費' : '',
    features.baseMultiplierTotal > 0 ? `倍數 ${features.baseMultiplierTotal}×` : '',
    features.freeSpinsAwarded > 0
      ? `免費 ${features.freeSpinsPlayed}/${features.freeSpinsAwarded}`
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}
