import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import {
  HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND,
  HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS,
  HOTLINE_JACKPOT_RESET_OFFSET_SECONDS,
  HOTLINE_JACKPOT_RESET_VALUE,
  HOTLINE_JACKPOT_SIMULATION_EPOCH,
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
} from '@bg/shared';
import { HOTLINE_MEGA_SYMBOLS, HOTLINE_MINI_SYMBOLS, HOTLINE_SYMBOLS } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { AudioMenu } from '@/components/layout/AudioMenu';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { HotlineScene } from '@/games/hotline/HotlineScene';
import { describeSlotDebugError, slotDebug, SLOT_DEBUG_BUILD } from '@/lib/slotDebug';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { getSlotTheme, type SlotThemeConfig, type SlotThemeId } from '@/lib/slotThemes';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';

interface Props {
  theme?: SlotThemeId;
}

const SYMBOL_POSITIONS = ['0% 0%', '50% 0%', '100% 0%', '0% 100%', '50% 100%', '100% 100%'];

const BIG_WIN_MULTIPLIER = 20;
const MEGA_MAX_TOTAL_MULTIPLIER = 1000;
const MEGA_BUY_FEATURE_MAX_WIN_MULTIPLIER = 50000;
const MEGA_FREE_SPIN_INTRO_MS = 1600;
const MEGA_FREE_SPIN_RETRIGGER_MS = 1300;
const SCENE_RESIZE_DEBOUNCE_MS = 160;
const ORIENTATION_SCENE_RESIZE_DEBOUNCE_MS = 520;
const MEGA_RENDERER_RETRY_MS = 900;
const MEGA_SCENE_INIT_TIMEOUT_MS = 8500;
const JACKPOT_KEYS = ['grand', 'major', 'minor', 'mini'] as const;
type JackpotKey = (typeof JACKPOT_KEYS)[number];
const JACKPOT_LABELS: Record<JackpotKey, string> = {
  grand: 'GRAND',
  major: 'MAJOR',
  minor: 'MINOR',
  mini: 'MINI',
};
const JACKPOT_GROWTH_PER_SECOND = {
  grand: Number.parseFloat(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.grand),
  major: Number.parseFloat(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.major),
  minor: Number.parseFloat(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.minor),
  mini: Number.parseFloat(HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND.mini),
} as const;
const JACKPOT_RESET_VALUE = Number.parseFloat(HOTLINE_JACKPOT_RESET_VALUE);
const JACKPOT_EPOCH_MS = Date.parse(HOTLINE_JACKPOT_SIMULATION_EPOCH);
const JACKPOT_RESET_INTERVAL_MS: Record<JackpotKey, number> = {
  grand: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.grand, 10) * 1000,
  major: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.major, 10) * 1000,
  minor: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.minor, 10) * 1000,
  mini: Number.parseInt(HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS.mini, 10) * 1000,
};
const JACKPOT_RESET_OFFSET_MS: Record<JackpotKey, number> = {
  grand: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.grand, 10) * 1000,
  major: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.major, 10) * 1000,
  minor: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.minor, 10) * 1000,
  mini: Number.parseInt(HOTLINE_JACKPOT_RESET_OFFSET_SECONDS.mini, 10) * 1000,
};
type JackpotDisplayValue = { label: string; key: JackpotKey; value: number };
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

interface MegaMultiplierActivation {
  symbols: HotlineSpecialSymbol[];
  total: number;
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

type AutoSpinNumberField = 'rounds' | 'amount' | 'lossLimit' | 'profitTarget' | 'singleWinLimit';

type AutoSpinInputDraft = Record<AutoSpinNumberField, string>;

const AUTO_SPIN_ROUND_PRESETS = [10, 25, 50, 100];

function createDefaultAutoSpinSettings(amount: number): AutoSpinSettings {
  const baseAmount = Math.max(MIN_BET_AMOUNT, Math.min(MAX_BET_AMOUNT, roundCurrency(amount)));
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

function createAutoSpinInputDraft(settings: AutoSpinSettings): AutoSpinInputDraft {
  return {
    rounds: String(settings.rounds),
    amount: String(settings.amount),
    lossLimit: String(settings.lossLimit),
    profitTarget: String(settings.profitTarget),
    singleWinLimit: String(settings.singleWinLimit),
  };
}

function isPixiRendererUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('does not support WebGL') ||
    message.includes('WebGL is not supported') ||
    message.includes('No available renderer') ||
    message.includes('Unable to auto-detect a suitable renderer') ||
    message.includes('webglcontextcreationerror')
  );
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
  const [megaAmountText, setMegaAmountText] = useState('10.00');
  const [megaAmountEditing, setMegaAmountEditing] = useState(false);
  const [result, setResult] = useState<HotlineBetResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneLoadingProgress, setSceneLoadingProgress] = useState(0);
  const [sceneLoadingMessage, setSceneLoadingMessage] = useState('正在準備高畫質遊戲畫面');
  const [sceneCanvasKey, setSceneCanvasKey] = useState(0);
  const [liveMegaRound, setLiveMegaRound] = useState<LiveMegaRoundState | null>(null);
  const [megaFreeSpinIntro, setMegaFreeSpinIntro] = useState<MegaFreeSpinIntro | null>(null);
  const [megaFallbackSpinning, setMegaFallbackSpinning] = useState(false);
  const [megaFallbackWinning, setMegaFallbackWinning] = useState<HotlineWinPosition[]>([]);
  const [megaFallbackSpecialWinning, setMegaFallbackSpecialWinning] = useState<
    HotlineWinPosition[]
  >([]);
  const [megaFallbackRemoved, setMegaFallbackRemoved] = useState<HotlineWinPosition[]>([]);
  const [megaFallbackDropping, setMegaFallbackDropping] = useState(false);
  const [megaFallbackDropOffsets, setMegaFallbackDropOffsets] = useState<Record<string, number>>(
    {},
  );
  const [megaFallbackWinPop, setMegaFallbackWinPop] = useState<MegaFallbackWinPop | null>(null);
  const [megaFallbackSpinSpecialSymbols, setMegaFallbackSpinSpecialSymbols] = useState<
    HotlineSpecialSymbol[]
  >([]);
  const [megaFreeSpinAwaitingClick, setMegaFreeSpinAwaitingClick] = useState(false);
  const [autoSpinOpen, setAutoSpinOpen] = useState(false);
  const [autoSpinSettings, setAutoSpinSettings] = useState<AutoSpinSettings>(() =>
    createDefaultAutoSpinSettings(10),
  );
  const [autoSpinInputDraft, setAutoSpinInputDraft] = useState<AutoSpinInputDraft>(() =>
    createAutoSpinInputDraft(createDefaultAutoSpinSettings(10)),
  );
  const [autoSpinActive, setAutoSpinActive] = useState(false);
  const [autoSpinRemaining, setAutoSpinRemaining] = useState(0);
  const [autoSpinStopReason, setAutoSpinStopReason] = useState('');
  const [fastSpin, setFastSpin] = useState(false);
  const [dismissedBigWinBetId, setDismissedBigWinBetId] = useState<string | null>(null);
  const [buyFeatureConfirmOpen, setBuyFeatureConfirmOpen] = useState(false);
  const [dismissedFeatureResultBetId, setDismissedFeatureResultBetId] = useState<string | null>(
    null,
  );
  const [jackpotSnapshot, setJackpotSnapshot] = useState<HotlineJackpotSnapshot | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HotlineScene | null>(null);
  const sceneReadyRef = useRef(false);
  const sceneResizeSchedulerRef = useRef<(() => void) | null>(null);
  const sceneResizeLockedRef = useRef(false);
  const pendingSceneResizeRef = useRef(false);
  const megaOrientationPendingRef = useRef(false);
  const sceneRecoveryAttemptsRef = useRef(0);
  const resultVisibleRef = useRef(false);
  const autoSpinStopRequestedRef = useRef(false);
  const megaFreeSpinContinueRef = useRef<(() => void) | null>(null);
  const fastSpinRef = useRef(false);
  const megaAmountEditingRef = useRef(false);
  const megaInputResizeIgnoreUntilRef = useRef(0);
  const fallbackGrid = useMemo(() => createFallbackGrid(slotTheme), [slotTheme]);
  const fallbackJackpotValues = useMemo(() => createFallbackJackpotValues(), [slotTheme.id]);
  const megaFallbackDisplayGrid = liveMegaRound?.grid ?? fallbackGrid;
  const megaFallbackDisplaySpecialSymbols = mergeMegaFallbackSpecialSymbols(
    liveMegaRound?.specialSymbols,
    megaFallbackSpinSpecialSymbols,
  );

  const setSceneAvailability = useCallback(
    (ready: boolean, _fallback = false): void => {
      sceneReadyRef.current = ready;
      if (ready) {
        sceneRecoveryAttemptsRef.current = 0;
        setSceneLoadingProgress(100);
        setSceneLoadingMessage('正在準備高畫質遊戲畫面');
        setError((prev) => (prev === '遊戲畫面載入中，請稍候' ? null : prev));
      } else if (isMegaSlot) {
        setSceneLoadingProgress(8);
      }
      setSceneReady(ready);
    },
    [isMegaSlot],
  );

  const scheduleSceneRecovery = useCallback((): void => {
    pendingSceneResizeRef.current = true;
    const attempt = Math.min(sceneRecoveryAttemptsRef.current + 1, 8);
    sceneRecoveryAttemptsRef.current = attempt;
    const delay = Math.min(3200, 360 * attempt);
    slotDebug('hotline-page:scene-recovery:schedule', { attempt, delay }, 'warn');
    window.setTimeout(() => {
      if (sceneResizeLockedRef.current) return;
      pendingSceneResizeRef.current = false;
      sceneResizeSchedulerRef.current?.();
    }, delay);
  }, []);

  const markSceneFallback = useCallback(
    (reason?: unknown): void => {
      slotDebug(
        'hotline-page:scene-fallback',
        { reason: reason ? describeSlotDebugError(reason) : null },
        'warn',
      );
      if (reason) console.warn('Slot canvas scene recovery requested', reason);
      try {
        sceneRef.current?.stopAnticipation();
        sceneRef.current?.resetWinLines();
        sceneRef.current?.dispose();
      } catch (err) {
        console.warn('Slot scene dispose failed during fallback', err);
      }
      sceneRef.current = null;
      setSceneAvailability(false, false);
      scheduleSceneRecovery();
    },
    [scheduleSceneRecovery, setSceneAvailability],
  );

  const getPlayableScene = useCallback((): HotlineScene | null => {
    const scene = sceneRef.current;
    if (!scene || !sceneReadyRef.current) return null;
    return scene;
  }, []);

  useEffect(() => {
    if (!megaAmountEditing) setMegaAmountText(amount.toFixed(2));
    megaAmountEditingRef.current = megaAmountEditing;
  }, [amount, megaAmountEditing]);

  useEffect(() => {
    fastSpinRef.current = fastSpin;
  }, [fastSpin]);

  useEffect(() => {
    resultVisibleRef.current = Boolean(result);
  }, [result]);

  useEffect(() => {
    if (!isMegaSlot) return;
    if (sceneReady) {
      setSceneLoadingProgress(100);
      return;
    }
    setSceneLoadingProgress(8);
    const timer = window.setInterval(() => {
      setSceneLoadingProgress((prev) => {
        if (sceneReadyRef.current) return 100;
        const increment = prev < 42 ? 7 : prev < 72 ? 4 : prev < 88 ? 2 : 1;
        return Math.min(94, prev + increment);
      });
    }, 260);
    return () => window.clearInterval(timer);
  }, [isMegaSlot, sceneReady, slotTheme.id]);

  useEffect(() => {
    sceneResizeLockedRef.current = busy || spinning;
    if (!sceneResizeLockedRef.current && pendingSceneResizeRef.current) {
      pendingSceneResizeRef.current = false;
      sceneResizeSchedulerRef.current?.();
    }
  }, [busy, spinning]);

  useEffect(() => {
    return () => {
      autoSpinStopRequestedRef.current = true;
      megaFreeSpinContinueRef.current = null;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    slotDebug('hotline-page:scene-effect:start', {
      build: SLOT_DEBUG_BUILD,
      canvasKey: sceneCanvasKey,
      themeId: slotTheme.id,
      gameId: slotTheme.gameId,
      isMegaSlot,
    });
    setSceneAvailability(false, false);

    let cancelled = false;
    let scene: HotlineScene | null = null;
    let rafId = 0;
    let resizeTimer: ReturnType<typeof window.setTimeout> | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let initToken = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    let forceNextRebuild = false;
    const initTimeouts = new Set<ReturnType<typeof window.setTimeout>>();
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      slotDebug(
        'hotline-page:webgl-context-lost',
        {
          themeId: slotTheme.id,
          gameId: slotTheme.gameId,
          lastWidth,
          lastHeight,
        },
        'warn',
      );
      const lostScene = scene;
      try {
        lostScene?.dispose();
      } catch (err) {
        console.warn('Slot scene dispose failed after context loss', err);
      }
      if (sceneRef.current === lostScene) sceneRef.current = null;
      scene = null;
      setSceneAvailability(false, false);
      scheduleSceneRecovery();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);

    const fillCanvas = () => {
      canvas.style.display = 'block';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    };

    const readSize = () => {
      const rect = (canvas.parentElement ?? canvas).getBoundingClientRect();
      const w = Math.round(rect.width || canvas.clientWidth);
      const h = Math.round(rect.height || canvas.clientHeight);
      return { w, h };
    };

    const initScene = (w: number, h: number) => {
      if (cancelled) return;
      forceNextRebuild = false;
      fillCanvas();
      lastWidth = w;
      lastHeight = h;
      const token = ++initToken;
      const previous = scene;
      const nextScene = new HotlineScene();
      let initTimeout: ReturnType<typeof window.setTimeout> | null = null;
      const clearInitTimeout = () => {
        if (!initTimeout) return;
        window.clearTimeout(initTimeout);
        initTimeouts.delete(initTimeout);
        initTimeout = null;
      };
      slotDebug('hotline-page:init-scene:request', {
        token,
        canvasKey: sceneCanvasKey,
        width: w,
        height: h,
        hadPreviousScene: Boolean(previous),
        themeId: slotTheme.id,
        gameId: slotTheme.gameId,
        isMegaSlot,
      });
      scene = nextScene;
      sceneRef.current = nextScene;
      previous?.dispose();
      setSceneAvailability(false, false);
      if (isMegaSlot) {
        initTimeout = window.setTimeout(() => {
          clearInitTimeout();
          if (cancelled || token !== initToken || sceneReadyRef.current) return;
          slotDebug(
            'hotline-page:init-scene:timeout-remount',
            {
              token,
              canvasKey: sceneCanvasKey,
              width: w,
              height: h,
              timeout: MEGA_SCENE_INIT_TIMEOUT_MS,
            },
            'warn',
          );
          try {
            nextScene.dispose();
          } catch (err) {
            console.warn('Slot scene dispose failed after init timeout', err);
          }
          if (scene === nextScene) scene = null;
          if (sceneRef.current === nextScene) sceneRef.current = null;
          pendingSceneResizeRef.current = true;
          setSceneLoadingMessage('正在重新建立高畫質遊戲畫面');
          setSceneAvailability(false, false);
          setSceneCanvasKey((key) => key + 1);
        }, MEGA_SCENE_INIT_TIMEOUT_MS);
        initTimeouts.add(initTimeout);
      }
      void nextScene
        .init(canvas, w, h, slotTheme)
        .then(() => {
          clearInitTimeout();
          if (cancelled || token !== initToken) {
            slotDebug('hotline-page:init-scene:stale-ready', {
              token,
              activeToken: initToken,
              cancelled,
            });
            nextScene.dispose();
            return;
          }
          fillCanvas();
          sceneRef.current = nextScene;
          setSceneAvailability(true, false);
          slotDebug('hotline-page:init-scene:ready', {
            token,
            width: w,
            height: h,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            pendingResize: pendingSceneResizeRef.current,
          });
          if (pendingSceneResizeRef.current) {
            pendingSceneResizeRef.current = false;
            sceneResizeSchedulerRef.current?.();
          }
        })
        .catch((err) => {
          clearInitTimeout();
          if (cancelled || token !== initToken) {
            slotDebug(
              'hotline-page:init-scene:stale-error',
              {
                token,
                activeToken: initToken,
                cancelled,
                error: describeSlotDebugError(err),
              },
              'warn',
            );
            nextScene.dispose();
            return;
          }
          slotDebug(
            'hotline-page:init-scene:error',
            {
              token,
              width: w,
              height: h,
              error: describeSlotDebugError(err),
            },
            'error',
          );
          console.error(err);
          nextScene.dispose();
          if (scene === nextScene) scene = null;
          if (sceneRef.current === nextScene) sceneRef.current = null;
          setSceneAvailability(false, false);
          if (isMegaSlot && isPixiRendererUnavailableError(err)) {
            slotDebug(
              'hotline-page:init-scene:renderer-unavailable-fallback',
              {
                token,
                width: w,
                height: h,
                themeId: slotTheme.id,
                gameId: slotTheme.gameId,
              },
              'warn',
            );
            pendingSceneResizeRef.current = true;
            resizeTimer = window.setTimeout(() => {
              resizeTimer = null;
              if (cancelled) return;
              slotDebug(
                'hotline-page:init-scene:renderer-unavailable-remount',
                {
                  token,
                  canvasKey: sceneCanvasKey,
                  width: w,
                  height: h,
                },
                'warn',
              );
              setSceneLoadingMessage('正在重新建立高畫質遊戲畫面');
              setSceneCanvasKey((key) => key + 1);
            }, MEGA_RENDERER_RETRY_MS);
            return;
          }
          scheduleSceneRecovery();
        });
    };

    const ensureSceneSize = () => {
      if (cancelled) return;
      fillCanvas();
      const { w, h } = readSize();
      if (w < 10 || h < 10) {
        slotDebug('hotline-page:ensure-size:too-small', { width: w, height: h });
        rafId = requestAnimationFrame(ensureSceneSize);
        return;
      }
      if (!scene) {
        slotDebug('hotline-page:ensure-size:no-scene', { width: w, height: h });
        initScene(w, h);
        return;
      }

      if (forceNextRebuild && !sceneResizeLockedRef.current) {
        slotDebug('hotline-page:ensure-size:forced-rebuild', {
          width: w,
          height: h,
          lastWidth,
          lastHeight,
        });
        initScene(w, h);
        return;
      }

      if (!sceneReadyRef.current) {
        slotDebug('hotline-page:ensure-size:init-pending', {
          width: w,
          height: h,
          lastWidth,
          lastHeight,
        });
        pendingSceneResizeRef.current = true;
        return;
      }

      const widthChanged = Math.abs(w - lastWidth) > 2;
      const heightChanged = Math.abs(h - lastHeight) > 2;
      if (!widthChanged && !heightChanged) return;

      const isInputResizeWindow =
        isMegaSlot &&
        !widthChanged &&
        heightChanged &&
        (megaAmountEditingRef.current || Date.now() < megaInputResizeIgnoreUntilRef.current);
      if (isInputResizeWindow) {
        slotDebug('hotline-page:ensure-size:ignore-input-keyboard-resize', {
          width: w,
          height: h,
          lastWidth,
          lastHeight,
        });
        lastHeight = h;
        return;
      }

      const isMobileResultLayout =
        resultVisibleRef.current &&
        !widthChanged &&
        heightChanged &&
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 767px)').matches;
      if (isMobileResultLayout) {
        slotDebug('hotline-page:ensure-size:mobile-result-height-only', {
          width: w,
          height: h,
          lastWidth,
          lastHeight,
        });
        lastWidth = w;
        lastHeight = h;
        return;
      }

      if (sceneResizeLockedRef.current) {
        slotDebug('hotline-page:ensure-size:locked', {
          width: w,
          height: h,
          lastWidth,
          lastHeight,
          locked: sceneResizeLockedRef.current,
        });
        pendingSceneResizeRef.current = true;
        return;
      }

      slotDebug('hotline-page:ensure-size:resize-init', {
        width: w,
        height: h,
        lastWidth,
        lastHeight,
      });
      initScene(w, h);
    };

    const scheduleEnsureSceneSize = () => {
      if (isMegaSlot && megaOrientationPendingRef.current) {
        pendingSceneResizeRef.current = true;
        slotDebug('hotline-page:schedule-size:orientation-pending', {
          canvasKey: sceneCanvasKey,
        });
        return;
      }
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(ensureSceneSize);
      }, SCENE_RESIZE_DEBOUNCE_MS);
    };

    const scheduleOrientationEnsureSceneSize = () => {
      if (!isMegaSlot) {
        scheduleEnsureSceneSize();
        return;
      }
      pendingSceneResizeRef.current = true;
      megaOrientationPendingRef.current = true;
      forceNextRebuild = true;
      setSceneLoadingMessage('正在配合螢幕方向重新建立遊戲畫面');
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        megaOrientationPendingRef.current = false;
        if (sceneResizeLockedRef.current) {
          if (rafId) cancelAnimationFrame(rafId);
          rafId = requestAnimationFrame(ensureSceneSize);
          return;
        }
        slotDebug('hotline-page:orientation-remount-canvas', {
          canvasKey: sceneCanvasKey,
          width: window.innerWidth,
          height: window.innerHeight,
          viewportWidth: window.visualViewport?.width,
          viewportHeight: window.visualViewport?.height,
        });
        setSceneAvailability(false, false);
        setSceneCanvasKey((key) => key + 1);
      }, ORIENTATION_SCENE_RESIZE_DEBOUNCE_MS);
    };

    sceneResizeSchedulerRef.current = scheduleEnsureSceneSize;
    ensureSceneSize();
    resizeObserver = new ResizeObserver(scheduleEnsureSceneSize);
    resizeObserver.observe(canvas.parentElement ?? canvas);
    window.screen.orientation?.addEventListener('change', scheduleOrientationEnsureSceneSize);
    window.addEventListener('orientationchange', scheduleOrientationEnsureSceneSize);
    window.addEventListener('resize', scheduleEnsureSceneSize);
    window.visualViewport?.addEventListener('resize', scheduleEnsureSceneSize);

    return () => {
      slotDebug('hotline-page:scene-effect:cleanup', {
        canvasKey: sceneCanvasKey,
        themeId: slotTheme.id,
        gameId: slotTheme.gameId,
        initToken,
      });
      cancelled = true;
      megaOrientationPendingRef.current = false;
      sceneResizeSchedulerRef.current = null;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      initTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      initTimeouts.clear();
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      resizeObserver?.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      window.screen.orientation?.removeEventListener('change', scheduleOrientationEnsureSceneSize);
      window.removeEventListener('orientationchange', scheduleOrientationEnsureSceneSize);
      window.removeEventListener('resize', scheduleEnsureSceneSize);
      window.visualViewport?.removeEventListener('resize', scheduleEnsureSceneSize);
      sceneRef.current = null;
    };
  }, [isMegaSlot, scheduleSceneRecovery, sceneCanvasKey, setSceneAvailability, slotTheme]);

  const setMegaAmount = (next: number, syncText = true): void => {
    const max = user ? Math.max(MIN_BET_AMOUNT, Math.min(balance, MAX_BET_AMOUNT)) : MAX_BET_AMOUNT;
    const clamped = Math.max(MIN_BET_AMOUNT, Math.min(max, next));
    const normalized = Number.parseFloat(clamped.toFixed(2));
    setAmount(normalized);
    if (syncText) setMegaAmountText(normalized.toFixed(2));
  };

  const handleMegaAmountInput = (raw: string): void => {
    setMegaAmountText(raw);
    const parsed = Number.parseFloat(raw.replace(/,/g, ''));
    if (Number.isFinite(parsed)) setMegaAmount(parsed, false);
  };

  const beginMegaAmountInput = (): void => {
    megaAmountEditingRef.current = true;
    megaInputResizeIgnoreUntilRef.current = Date.now() + 1200;
    setMegaAmountEditing(true);
  };

  const commitMegaAmountInput = (): void => {
    megaAmountEditingRef.current = false;
    megaInputResizeIgnoreUntilRef.current = Date.now() + 1200;
    setMegaAmountEditing(false);
    const parsed = Number.parseFloat(megaAmountText.replace(/,/g, ''));
    setMegaAmount(Number.isFinite(parsed) ? parsed : amount);
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

  const continueMegaFreeSpin = (): void => {
    const resume = megaFreeSpinContinueRef.current;
    if (!resume) return;
    megaFreeSpinContinueRef.current = null;
    setMegaFreeSpinAwaitingClick(false);
    resume();
  };

  const waitForMegaFreeSpinClick = (autoPlay: boolean): Promise<void> => {
    if (autoPlay) return Promise.resolve();
    setMegaFreeSpinAwaitingClick(true);
    return new Promise((resolve) => {
      megaFreeSpinContinueRef.current = resolve;
    });
  };

  const handleMegaSpinClick = (): void => {
    if (megaFreeSpinAwaitingClick) {
      continueMegaFreeSpin();
      return;
    }
    void spin();
  };

  const openMegaBuyFeatureConfirm = (): void => {
    if (!isMegaSlot || busy || autoSpinActive) return;
    if (!requireLogin()) return;
    const featureCost = roundCurrency(amount * 100);
    if (featureCost > balance) {
      setError('餘額不足，無法購買免費遊戲');
      return;
    }
    setError(null);
    setBuyFeatureConfirmOpen(true);
  };

  const confirmMegaBuyFeature = async (): Promise<void> => {
    setBuyFeatureConfirmOpen(false);
    await spin({ buyFeature: true });
  };

  const spin = async (options: SpinOptions = {}): Promise<HotlineBetResult | null> => {
    if (busy && !options.autoSpin) return null;
    if (!requireLogin()) return null;
    const spinAmount = roundCurrency(options.amountOverride ?? amount);
    const availableBalance = options.balanceOverride ?? balance;
    const buyFeature = Boolean(options.buyFeature && isMegaSlot);
    const spinFast = options.fastSpin ?? fastSpinRef.current;
    const stakeAmount = buyFeature ? roundCurrency(spinAmount * 100) : spinAmount;
    if (spinAmount < MIN_BET_AMOUNT || stakeAmount > availableBalance) return null;
    const activeScene = getPlayableScene();
    if (!activeScene) {
      setError('遊戲畫面載入中，請稍候');
      sceneResizeSchedulerRef.current?.();
      return null;
    }
    setBusy(true);
    setSpinning(true);
    setResult(null);
    setLiveMegaRound(isMegaSlot ? createInitialLiveMegaRound() : null);
    setMegaFreeSpinIntro(null);
    setMegaFallbackWinning([]);
    setMegaFallbackSpecialWinning([]);
    setMegaFallbackRemoved([]);
    setMegaFallbackDropping(false);
    setMegaFallbackDropOffsets({});
    setMegaFallbackWinPop(null);
    setMegaFallbackSpinSpecialSymbols([]);
    setMegaFreeSpinAwaitingClick(false);
    megaFreeSpinContinueRef.current = null;
    setDismissedBigWinBetId(null);
    setDismissedFeatureResultBetId(null);
    setBuyFeatureConfirmOpen(false);
    setError(null);

    activeScene?.resetWinLines();
    // 樂觀動畫：轉軸立刻開始滾。
    activeScene?.startAnticipation(spinFast);
    setMegaFallbackSpinning(false);

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
      const baseMultiplierActivation = createMultiplierActivation(
        features?.baseMultiplierSymbols ?? [],
        features?.baseAppliedMultiplier ?? 1,
        cascades,
      );
      const baseActivatedMultiplierTotal = getActivatedBaseMultiplierTotal(features);
      const baseCascadeDisplayMultiplier = baseMultiplierActivation
        ? 1
        : (features?.baseAppliedMultiplier ?? 1);

      const playSpinOrFallback = async (
        grid: number[][],
        lines: HotlineWinLine[],
        specialSymbols: HotlineSpecialSymbol[] = [],
      ): Promise<void> => {
        const scene = getPlayableScene();
        if (scene) {
          try {
            await scene.playSpin(grid, lines, {
              fast: spinFast,
              specialSymbols,
              payoutAmount: baseBetAmount,
            });
            return;
          } catch (err) {
            if (recoverSceneFrame(scene, grid, lines, specialSymbols, err)) return;
          }
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
        const scene = getPlayableScene();
        if (scene) {
          try {
            await scene.highlightSpecialSymbols(filtered, { fast: spinFast, type, label });
            return;
          } catch (err) {
            console.warn('Slot special highlight skipped after scene error', err);
            return;
          }
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
        multiplierActivation?: MegaMultiplierActivation,
        onMultiplierActivated?: () => void,
      ): Promise<void> => {
        const scene = getPlayableScene();
        if (scene) {
          try {
            await scene.playCascadeSpin(steps, finalGrid, {
              fast: spinFast,
              specialSymbols,
              finalSpecialSymbols,
              payoutAmount: baseBetAmount,
              onStepWin: (step) => void onStepWin(step),
            });
            if (multiplierActivation) {
              await scene.highlightSpecialSymbols(multiplierActivation.symbols, {
                fast: spinFast,
                type: 'multiplier',
                label: `倍數啟動 ×${multiplierActivation.total}`,
                multiplierTotal: multiplierActivation.total,
              });
              onMultiplierActivated?.();
            }
            return;
          } catch (err) {
            if (recoverSceneFrame(scene, finalGrid, [], finalSpecialSymbols, err)) return;
          }
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
          await playFallbackCascadeDrop(previous.grid, previous.removed, step.grid);
          await playFallbackWinHold(step.removed, onStepWin(step));
          previous = step;
        }

        await playFallbackCascadeDrop(
          previous.grid,
          previous.removed,
          finalGrid,
          finalSpecialSymbols,
        );
        if (multiplierActivation) {
          await playSpecialHighlightOrFallback(
            multiplierActivation.symbols,
            'multiplier',
            `倍數啟動 ×${multiplierActivation.total}`,
            {
              label: '倍數啟動',
              amount: `×${multiplierActivation.total}`,
              meta: '本輪消除贏分套用倍數',
            },
          );
          onMultiplierActivated?.();
        }
        updateLiveMegaRound({ grid: finalGrid, specialSymbols: finalSpecialSymbols });
      };

      const playFallbackCascadeDrop = async (
        currentGrid: number[][],
        removed: HotlineWinPosition[],
        nextGrid: number[][],
        specialSymbols: HotlineSpecialSymbol[] = [],
      ): Promise<void> => {
        setMegaFallbackRemoved(removed);
        await delay(scaleSpinDelay(420, spinFast));
        setMegaFallbackRemoved([]);
        setMegaFallbackWinning([]);
        setMegaFallbackDropOffsets(buildMegaFallbackDropOffsets(currentGrid, removed, nextGrid));
        setMegaFallbackDropping(true);
        updateLiveMegaRound({ grid: nextGrid, specialSymbols });
        await delay(scaleSpinDelay(520, spinFast));
        setMegaFallbackDropping(false);
        setMegaFallbackDropOffsets({});
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

      const recoverSceneFrame = (
        scene: HotlineScene,
        grid: number[][],
        lines: HotlineWinLine[],
        specialSymbols: HotlineSpecialSymbol[],
        cause: unknown,
      ): boolean => {
        console.warn('Slot scene animation recovered without canvas fallback', cause);
        try {
          scene.snapToGrid(grid, specialSymbols);
          scene.showResultLines(lines, baseBetAmount);
          return true;
        } catch (err) {
          markSceneFallback(err);
          return false;
        }
      };

      const revealCascadeStep = (
        step: HotlineCascadeStep,
        displayedAppliedMultiplier: number,
        patch: Partial<LiveMegaRoundState>,
      ): MegaFallbackWinPop => {
        revealedCascadeCount += 1;
        const appliedStepMultiplier = roundMegaMultiplier(
          step.multiplier * displayedAppliedMultiplier,
        );
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
            displayedAppliedMultiplier > 1 ? `倍數 ${displayedAppliedMultiplier}×` : '',
          ]
            .filter(Boolean)
            .join(' · '),
        };
      };

      const applyActivatedMultiplierToRevealedWin = (
        baseRoundMultiplier: number,
        displayedAppliedMultiplier: number,
        targetAppliedMultiplier: number,
        patch: Partial<LiveMegaRoundState>,
      ): void => {
        const displayedRoundMultiplier = roundMegaMultiplier(
          baseRoundMultiplier * displayedAppliedMultiplier,
        );
        const targetRoundMultiplier = roundMegaMultiplier(
          baseRoundMultiplier * targetAppliedMultiplier,
        );
        const multiplierDelta = roundMegaMultiplier(
          Math.max(0, targetRoundMultiplier - displayedRoundMultiplier),
        );
        if (multiplierDelta > 0) {
          revealedMultiplier = roundMegaMultiplier(revealedMultiplier + multiplierDelta);
        }
        updateLiveMegaRound({
          ...patch,
          multiplier: revealedMultiplier,
          payout: roundMegaPayout(baseBetAmount, revealedMultiplier),
        });
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
          activeMultiplier: Math.max(1, baseActivatedMultiplierTotal),
          baseMultiplierTotal: baseActivatedMultiplierTotal,
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
              baseCascadeDisplayMultiplier,
              features
                ? {
                    scatterCount: features.scatterCount,
                    freeSpinsAwarded: revealedFreeSpinsAwarded,
                    activeMultiplier: baseMultiplierActivation
                      ? 1
                      : Math.max(1, baseActivatedMultiplierTotal),
                    baseMultiplierTotal: baseMultiplierActivation
                      ? 0
                      : baseActivatedMultiplierTotal,
                  }
                : {},
            );
          },
          [],
          baseSpecialSymbols,
          baseMultiplierActivation,
          baseMultiplierActivation
            ? () =>
                applyActivatedMultiplierToRevealedWin(
                  sumCascadeMultipliers(cascades),
                  baseCascadeDisplayMultiplier,
                  features?.baseAppliedMultiplier ?? 1,
                  {
                    grid: res.data.grid,
                    scatterCount: features?.scatterCount ?? 0,
                    freeSpinsAwarded: revealedFreeSpinsAwarded,
                    activeMultiplier: Math.max(1, baseActivatedMultiplierTotal),
                    baseMultiplierTotal: baseActivatedMultiplierTotal,
                    specialSymbols: baseSpecialSymbols,
                  },
                )
            : undefined,
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
        await waitForMegaFreeSpinClick(Boolean(options.autoSpin));
        await delay(scaleSpinDelay(360, spinFast));
        const previousFreeMultiplierBank = revealedFreeMultiplierBank;
        const roundHasSymbolClear = hasCascadeSymbolClear(round.cascades);
        const nextFreeMultiplierBank = roundMegaMultiplier(
          revealedFreeMultiplierBank + (roundHasSymbolClear ? round.multiplierTotal : 0),
        );
        const freeRoundMultiplierActivation = createMultiplierActivation(
          round.multiplierSymbols,
          Math.max(1, nextFreeMultiplierBank),
          round.cascades,
        );
        const freeRoundDisplayMultiplier = freeRoundMultiplierActivation
          ? Math.max(1, previousFreeMultiplierBank)
          : Math.max(1, nextFreeMultiplierBank);
        const roundSpecialSymbols = [...round.scatterSymbols, ...round.multiplierSymbols];
        const freeRoundPatch: Partial<LiveMegaRoundState> = {
          freeSpinsPlayed: round.index + 1,
          freeSpinsAwarded: revealedFreeSpinsAwarded,
          freeSpinMode: true,
          activeMultiplier: Math.max(1, previousFreeMultiplierBank),
          scatterCount: 0,
          specialSymbols: [],
        };
        const freeRoundFinalPatch: Partial<LiveMegaRoundState> = {
          ...freeRoundPatch,
          activeMultiplier: Math.max(1, nextFreeMultiplierBank),
          scatterCount: round.scatterSymbols.length,
          specialSymbols: roundSpecialSymbols,
        };
        updateLiveMegaRound({ ...freeRoundPatch, grid: round.initialGrid });

        if (round.cascades.length > 0) {
          await playCascadeOrFallback(
            round.cascades,
            round.finalGrid,
            (step) => {
              return revealCascadeStep(step, freeRoundDisplayMultiplier, freeRoundPatch);
            },
            [],
            roundSpecialSymbols,
            freeRoundMultiplierActivation,
            freeRoundMultiplierActivation
              ? () => {
                  revealedFreeMultiplierBank = nextFreeMultiplierBank;
                  applyActivatedMultiplierToRevealedWin(
                    sumCascadeMultipliers(round.cascades),
                    freeRoundDisplayMultiplier,
                    Math.max(1, nextFreeMultiplierBank),
                    { ...freeRoundFinalPatch, grid: round.finalGrid },
                  );
                }
              : undefined,
          );
          if (!freeRoundMultiplierActivation) {
            revealedFreeMultiplierBank = nextFreeMultiplierBank;
          }
          updateLiveMegaRound({ ...freeRoundFinalPatch, grid: round.finalGrid });
        } else {
          await playSpinOrFallback(round.finalGrid, round.lines, roundSpecialSymbols);
          revealedFreeMultiplierBank = nextFreeMultiplierBank;
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
      const finalBaseActivatedMultiplierTotal = getActivatedBaseMultiplierTotal(features);
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
          finalBaseActivatedMultiplierTotal,
        ),
        baseMultiplierTotal: finalBaseActivatedMultiplierTotal,
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
      setMegaFreeSpinAwaitingClick(false);
      megaFreeSpinContinueRef.current = null;
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
      setMegaFreeSpinAwaitingClick(false);
      megaFreeSpinContinueRef.current = null;
    }
  };

  const openAutoSpinSettings = (): void => {
    if (busy || autoSpinActive) return;
    const nextSettings: AutoSpinSettings = {
      ...autoSpinSettings,
      amount: Math.max(MIN_BET_AMOUNT, Math.min(MAX_BET_AMOUNT, roundCurrency(amount))),
      lossLimit:
        autoSpinSettings.lossLimit > 0 ? autoSpinSettings.lossLimit : roundCurrency(amount * 25),
    };
    setAutoSpinSettings(nextSettings);
    setAutoSpinInputDraft(createAutoSpinInputDraft(nextSettings));
    setAutoSpinStopReason('');
    setAutoSpinOpen(true);
  };

  const updateAutoSpinSetting = <Key extends keyof AutoSpinSettings>(
    key: Key,
    value: AutoSpinSettings[Key],
  ): void => {
    setAutoSpinSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateAutoSpinNumberSetting = (key: AutoSpinNumberField, value: string): void => {
    setAutoSpinInputDraft((prev) => ({ ...prev, [key]: value }));

    const parsed = key === 'rounds' ? Number.parseInt(value, 10) : Number.parseFloat(value);
    updateAutoSpinSetting(key, Number.isFinite(parsed) ? parsed : 0);
  };

  const stopAutoSpin = (): void => {
    autoSpinStopRequestedRef.current = true;
    setAutoSpinStopReason('停止中');
  };

  const startAutoSpin = async (): Promise<void> => {
    if (busy || autoSpinActive) return;
    if (!requireLogin()) return;

    if (autoSpinSettings.amount > MAX_BET_AMOUNT) {
      setError(`單注上限為 ${formatAmount(MAX_BET_AMOUNT)}。`);
      return;
    }
    const config = normalizeAutoSpinSettings(autoSpinSettings);
    if (config.rounds <= 0 || config.amount < MIN_BET_AMOUNT) return;
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

    try {
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

        const nextBalance = Number.parseFloat(roundResult.newBalance);
        const payout = Number.parseFloat(roundResult.payout);
        if (!Number.isFinite(nextBalance) || !Number.isFinite(payout)) {
          stopReason = '自動轉動中斷';
          break;
        }
        runningBalance = nextBalance;
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
    } catch (err) {
      console.warn('Hotline auto spin stopped after unexpected error', err);
      setError(extractApiError(err).message || '自動轉動中斷');
      stopReason = '自動轉動中斷';
    } finally {
      setAutoSpinRemaining(0);
      setAutoSpinActive(false);
      autoSpinStopRequestedRef.current = false;
      setAutoSpinStopReason(stopReason || '自動轉動完成');
    }
  };

  const resultAmount = result ? Number.parseFloat(result.amount) : 0;
  const resultPayout = result ? Number.parseFloat(result.payout) : 0;
  const resultProfit = result ? Number.parseFloat(result.profit) : 0;
  const resultHasLineWin = Boolean(result && result.lines.length > 0);
  const resultMultiplier = result?.multiplier ?? 0;
  const megaFeatures = result?.features;
  const megaActivatedBaseMultiplier = getActivatedBaseMultiplierTotal(megaFeatures);
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
    megaActivatedBaseMultiplier,
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
        megaActivatedBaseMultiplier > 0 ? `倍數 ${megaActivatedBaseMultiplier}×` : '',
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
    ? megaActivatedBaseMultiplier
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
        : megaFreeSpinAwaitingClick
          ? `點擊轉動 · 剩餘 ${megaDisplayFreeSpinsRemaining}`
          : megaDisplayFreeSpinMode
            ? `本回合免費 · 剩餘 ${megaDisplayFreeSpinsRemaining}`
            : '已觸發，準備進入免費旋轉'
      : '4 SCATTER 觸發';
  const slotScenePending = !sceneReady;
  const megaScenePending = isMegaSlot && slotScenePending;
  const megaLoadingProgressLabel = `${Math.round(sceneLoadingProgress)}%`;
  const megaSpinButtonLabel = megaScenePending
    ? '載入中'
    : megaFreeSpinAwaitingClick
      ? '免費旋轉'
      : busy
        ? megaDisplayFreeSpinMode
          ? '免費旋轉'
          : '轉動中'
        : t.games.hotline.spin;
  const megaSpinButtonValue = megaScenePending
    ? '請稍候'
    : megaFreeSpinAwaitingClick
      ? '點擊轉動'
      : busy && megaDisplayFreeSpinMode
        ? `剩 ${megaDisplayFreeSpinsRemaining}`
        : formatAmount(amount);
  const megaBuyFeatureCost = Number((amount * 100).toFixed(2));
  const controlsLocked = busy || autoSpinActive || slotScenePending;
  const megaSpinDisabled =
    megaScenePending ||
    autoSpinActive ||
    (busy && !megaFreeSpinAwaitingClick) ||
    (!megaFreeSpinAwaitingClick && !!user && balance < amount);
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
  const showFeatureResultOverlay = Boolean(
    result?.buyFeature && !spinning && dismissedFeatureResultBetId !== result.betId,
  );
  const showBigWinOverlay = Boolean(
    result &&
    !spinning &&
    !result.buyFeature &&
    isBigWinResult &&
    dismissedBigWinBetId !== result.betId,
  );
  const resultTitle = isBigWinResult
    ? '恭喜爆分'
    : resultPayout > resultAmount
      ? '恭喜中獎'
      : resultPayout > 0
        ? '小中獎派彩'
        : '本局未中';
  const buyFeatureConfirmDialog = buyFeatureConfirmOpen ? (
    <div
      className="slot-auto-modal mega-buy-confirm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mega-buy-confirm-title"
    >
      <div className="slot-auto-modal__panel mega-buy-confirm__panel">
        <div className="slot-auto-modal__header">
          <div>
            <span>購買免費遊戲</span>
            <strong id="mega-buy-confirm-title">{slotTheme.title}</strong>
          </div>
          <button type="button" onClick={() => setBuyFeatureConfirmOpen(false)} aria-label="關閉">
            關閉
          </button>
        </div>

        <div className="slot-auto-modal__body">
          <div className="mega-buy-confirm__hero">
            <span>最高爆分</span>
            <strong>{MEGA_BUY_FEATURE_MAX_WIN_MULTIPLIER.toLocaleString('en-US')}×</strong>
            <small>免費遊戲買入功能</small>
          </div>
          <div className="mega-buy-confirm__grid">
            <div>
              <span>總下注金額</span>
              <strong>{formatAmount(megaBuyFeatureCost)}</strong>
            </div>
            <div>
              <span>買入倍率</span>
              <strong>100×</strong>
            </div>
            <div>
              <span>單注金額</span>
              <strong>{formatAmount(amount)}</strong>
            </div>
          </div>
        </div>

        <div className="slot-auto-modal__footer">
          <div className="slot-auto-summary">
            <span>確認後會立即下注</span>
            <strong>{formatAmount(megaBuyFeatureCost)}</strong>
          </div>
          <div className="slot-auto-actions">
            <button type="button" onClick={() => setBuyFeatureConfirmOpen(false)}>
              取消
            </button>
            <button
              type="button"
              onClick={() => void confirmMegaBuyFeature()}
              disabled={busy || autoSpinActive || (!!user && balance < megaBuyFeatureCost)}
            >
              確認投注
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;
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
              value={autoSpinInputDraft.rounds}
              onChange={(event) => updateAutoSpinNumberSetting('rounds', event.target.value)}
            />
          </label>
          <div className="slot-auto-presets">
            {AUTO_SPIN_ROUND_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  updateAutoSpinSetting('rounds', preset);
                  setAutoSpinInputDraft((prev) => ({ ...prev, rounds: String(preset) }));
                }}
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
                min={MIN_BET_AMOUNT}
                max={MAX_BET_AMOUNT}
                step={0.01}
                value={autoSpinInputDraft.amount}
                onChange={(event) => updateAutoSpinNumberSetting('amount', event.target.value)}
              />
            </label>
            <label className="slot-auto-field">
              <span>停損</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoSpinInputDraft.lossLimit}
                onChange={(event) => updateAutoSpinNumberSetting('lossLimit', event.target.value)}
              />
            </label>
            <label className="slot-auto-field">
              <span>停利</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoSpinInputDraft.profitTarget}
                onChange={(event) =>
                  updateAutoSpinNumberSetting('profitTarget', event.target.value)
                }
              />
            </label>
            <label className="slot-auto-field">
              <span>單局派彩</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={autoSpinInputDraft.singleWinLimit}
                onChange={(event) =>
                  updateAutoSpinNumberSetting('singleWinLimit', event.target.value)
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
                autoSpinSettings.amount < MIN_BET_AMOUNT ||
                autoSpinSettings.amount > MAX_BET_AMOUNT ||
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
            <MegaJackpotTicker snapshot={jackpotSnapshot} fallbackValues={fallbackJackpotValues} />
            <Link to={user ? '/history' : '/login'} className="mega-slot-pill">
              <History className="h-4 w-4" aria-hidden="true" />
              記錄
            </Link>
            <AudioMenu variant="dark" />
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
                <div className="mega-slot-mini-pay__head">
                  <span>賠率速覽</span>
                  <strong>8+ 連線</strong>
                </div>
                <div className="mega-slot-mini-pay__grid">
                  {slotTheme.symbols.map((symbol, index) => {
                    const payout = getSlotPayoutMeta(slotTheme, index, true);
                    return (
                      <div key={symbol.label}>
                        <SlotSymbolBadge theme={slotTheme} symbol={index} useShortLabel />
                        <span>{payout.multiplier}</span>
                      </div>
                    );
                  })}
                </div>
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
                  grid={megaFallbackDisplayGrid}
                  hidden
                  spinning={megaFallbackSpinning}
                  fast={fastSpin}
                  dropping={megaFallbackDropping}
                  winning={megaFallbackWinning}
                  specialWinning={megaFallbackSpecialWinning}
                  removed={megaFallbackRemoved}
                  dropOffsets={megaFallbackDropOffsets}
                  specialSymbols={megaFallbackDisplaySpecialSymbols}
                  winPop={megaFallbackWinPop}
                />
                <canvas
                  key={sceneCanvasKey}
                  ref={canvasRef}
                  className={`mega-slot-canvas ${sceneReady ? 'mega-slot-canvas--ready' : ''}`}
                />
                {!sceneReady && (
                  <div className="mega-slot-loading" role="status" aria-live="polite">
                    <div className="mega-slot-loading__panel">
                      <div className="mega-slot-loading__head">
                        <span>載入盤面</span>
                        <strong>{megaLoadingProgressLabel}</strong>
                      </div>
                      <div className="mega-slot-loading__bar" aria-hidden="true">
                        <span style={{ width: megaLoadingProgressLabel }} />
                      </div>
                      <div className="mega-slot-loading__meta">{sceneLoadingMessage}</div>
                    </div>
                  </div>
                )}
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
              {result && showFeatureResultOverlay && (
                <MegaFeatureResultOverlay
                  result={result}
                  displayMultiplier={resultDisplayMultiplier}
                  cascadeCount={cascadeCount}
                  maxWinMultiplier={MEGA_BUY_FEATURE_MAX_WIN_MULTIPLIER}
                  onClose={() => setDismissedFeatureResultBetId(result.betId)}
                />
              )}
            </section>

            <aside className="mega-slot-side mega-slot-side--right" aria-hidden="true">
              <div className="mega-slot-hero-art" />
            </aside>
          </div>

          <footer className="mega-slot-controls">
            <div className="mega-slot-control-tile mega-slot-control-tile--metrics">
              <div>
                <span>遊戲餘額</span>
                <strong>{user ? formatAmount(user.balance ?? '0') : '登入查看'}</strong>
              </div>
              <div>
                <span>本局派彩</span>
                <strong>{formatAmount(megaDisplayPayout)}</strong>
              </div>
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
                value={megaAmountText}
                disabled={controlsLocked}
                onFocus={beginMegaAmountInput}
                onChange={(event) => handleMegaAmountInput(event.target.value)}
                onBlur={commitMegaAmountInput}
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
                onClick={openMegaBuyFeatureConfirm}
                disabled={!canBuyMegaFeature}
                className="mega-slot-buy"
                aria-label="購買免費遊戲"
              >
                <span>購買免費</span>
                <strong>100× · {formatAmount(megaBuyFeatureCost)}</strong>
              </button>
              <button
                type="button"
                onClick={handleMegaSpinClick}
                disabled={megaSpinDisabled}
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
        {buyFeatureConfirmDialog}
        {autoSpinDialog}
      </div>
    );
  }

  const slotResultCard =
    result && !spinning ? (
      <div
        className={`game-result-card slot-result-card ${isBigWinResult ? 'slot-result-card-bigwin' : ''} ${resultHasLineWin ? 'game-result-card-win' : 'game-result-card-loss'}`}
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
            {resultHasLineWin ? '+' : resultProfit >= 0 ? '+' : ''}
            {formatAmount(resultHasLineWin ? result.payout : result.profit)}
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
                  <SlotSymbolBadge theme={slotTheme} symbol={l.symbol} showLabel useShortLabel />
                </div>
                <span className="data-num text-[#7DD3FC]">{l.payout}×</span>
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null;

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
              <GameActivityHeat gameId={slotTheme.gameId} />
              <span className="text-white/72">
                {spinning ? slotTheme.spinningLabel : slotTheme.readyLabel}
              </span>
            </div>

            <div className={`game-canvas-shell game-canvas-wide ${canvasAspectClass} w-full p-2`}>
              <canvas
                ref={canvasRef}
                className={`slot-canvas h-full w-full ${!sceneReady ? 'slot-canvas--hidden' : ''}`}
              />
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

            {slotResultCard}
          </div>

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
                {t.games.hotline.totalMult}{' '}
                <span className="data-num ml-1 text-[#FCA5A5]">
                  {result ? formatMultiplier(resultDisplayMultiplier) : '—'}
                </span>
              </span>
            </div>
          </div>

          <div className="game-side-card slot-payout-card p-5">
            <SlotPayoutTable slotTheme={slotTheme} isMegaSlot={isMegaSlot} />
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
      {autoSpinDialog}
    </div>
  );
}

function MegaFeatureResultOverlay({
  result,
  displayMultiplier,
  cascadeCount,
  maxWinMultiplier,
  onClose,
}: {
  result: HotlineBetResult;
  displayMultiplier: number;
  cascadeCount: number;
  maxWinMultiplier: number;
  onClose: () => void;
}) {
  const features = result.features;
  const stakeAmount = Number.parseFloat(result.stakeAmount ?? result.amount);
  const payout = Number.parseFloat(result.payout);
  const profit = Number.parseFloat(result.profit);
  const freeSpinProgress = features
    ? `${features.freeSpinsPlayed}/${features.freeSpinsAwarded}`
    : '0';

  return (
    <div
      className="mega-feature-result-stage"
      role="dialog"
      aria-modal="false"
      aria-labelledby="mega-feature-result-title"
      tabIndex={0}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="mega-feature-result-stage__burst" aria-hidden="true" />
      <div className="mega-feature-result-stage__panel">
        <div className="mega-feature-result-stage__eyebrow">免費遊戲結算</div>
        <div id="mega-feature-result-title" className="mega-feature-result-stage__title">
          爆分獎金
        </div>
        <div className="mega-feature-result-stage__amount">{formatAmount(payout)}</div>
        <div className="mega-feature-result-stage__meta">
          {formatMultiplier(displayMultiplier)} · 最高爆分{' '}
          {maxWinMultiplier.toLocaleString('en-US')}×
        </div>
        <div className="mega-feature-result-stage__grid">
          <div>
            <span>總下注金額</span>
            <strong>{formatAmount(stakeAmount)}</strong>
          </div>
          <div>
            <span>淨利</span>
            <strong className={profit >= 0 ? 'is-win' : 'is-loss'}>
              {profit >= 0 ? '+' : ''}
              {formatAmount(profit)}
            </strong>
          </div>
          <div>
            <span>免費旋轉</span>
            <strong>{freeSpinProgress}</strong>
          </div>
          <div>
            <span>連鎖消除</span>
            <strong>{cascadeCount}</strong>
          </div>
        </div>
      </div>
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
  const symbolImage = getSlotSymbolImage(theme, symbol);
  const sheetPosition = theme.rows > 3 ? SYMBOL_POSITIONS[symbol] : undefined;
  const fallbackFill = `radial-gradient(circle at 35% 28%, rgba(255,255,255,0.5), transparent 22%), linear-gradient(135deg, ${meta.accentHex}55, ${meta.accentHex}18)`;

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
          backgroundImage: symbolImage
            ? `url(${symbolImage})`
            : sheetPosition
              ? `url(${theme.symbolSheet})`
              : fallbackFill,
          backgroundSize: symbolImage ? 'contain' : sheetPosition ? '300% 200%' : '100% 100%',
          backgroundPosition: symbolImage ? 'center' : (sheetPosition ?? 'center'),
          backgroundRepeat: 'no-repeat',
        }}
        aria-hidden="true"
      />
      {showLabel ? <span className="tracking-[0.18em]">{label}</span> : null}
    </span>
  );
}

function SlotPayoutTable({
  slotTheme,
  isMegaSlot,
}: {
  slotTheme: SlotThemeConfig;
  isMegaSlot: boolean;
}) {
  const subtitle = isMegaSlot ? '8+ 連線觸發派彩' : '連線越多倍率越高';

  return (
    <div className="slot-payout-table">
      <div className="slot-payout-table__header">
        <div>
          <div className="label">賠率表</div>
          <p>{subtitle}</p>
        </div>
        <span>{slotTheme.symbols.length} 符號</span>
      </div>
      <div className="slot-payout-table__list">
        {slotTheme.symbols.map((symbol, index) => {
          const payout = getSlotPayoutMeta(slotTheme, index, isMegaSlot);
          const tone = payout.primaryValue < 1 ? 'soft' : 'premium';

          return (
            <div
              key={`${slotTheme.id}-${symbol.label}`}
              className={`slot-payout-row slot-payout-row--${tone}`}
            >
              <div className="slot-payout-row__symbol">
                <SlotSymbolBadge theme={slotTheme} symbol={index} />
                <div>
                  <strong>{symbol.label}</strong>
                  <span>{tone === 'soft' ? '小派彩' : '高派彩'}</span>
                </div>
              </div>
              <div className="slot-payout-row__value">
                <span>{payout.condition}</span>
                <strong className="data-num">{payout.multiplier}</strong>
                {payout.detail ? <em>{payout.detail}</em> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MegaFallbackGrid({
  theme,
  grid,
  hidden,
  spinning,
  fast,
  dropping,
  winning,
  specialWinning,
  removed,
  dropOffsets,
  specialSymbols,
  winPop,
}: {
  theme: SlotThemeConfig;
  grid: number[][];
  hidden: boolean;
  spinning: boolean;
  fast: boolean;
  dropping: boolean;
  winning: HotlineWinPosition[];
  specialWinning: HotlineWinPosition[];
  removed: HotlineWinPosition[];
  dropOffsets: Record<string, number>;
  specialSymbols: HotlineSpecialSymbol[];
  winPop: MegaFallbackWinPop | null;
}) {
  const winningKeys = useMemo(() => new Set(winning.map(positionKey)), [winning]);
  const specialWinningKeys = useMemo(
    () => new Set(specialWinning.map(positionKey)),
    [specialWinning],
  );
  const removedKeys = useMemo(() => new Set(removed.map(positionKey)), [removed]);
  const specialByPosition = useMemo(() => {
    const map = new Map<string, HotlineSpecialSymbol>();
    for (const symbol of specialSymbols) map.set(positionKey(symbol), symbol);
    return map;
  }, [specialSymbols]);
  const classes = [
    'mega-slot-fallback-grid',
    hidden ? 'mega-slot-fallback-grid--hidden' : '',
    spinning ? 'mega-slot-fallback-grid--spinning' : '',
    fast ? 'mega-slot-fallback-grid--fast' : '',
    dropping ? 'mega-slot-fallback-grid--dropping' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} aria-hidden={hidden}>
      <div className="mega-slot-fallback-frame">
        {grid.map((reel, reelIndex) => (
          <div className="mega-slot-fallback-reel" key={`${theme.id}-${reelIndex}`}>
            <div
              className="mega-slot-fallback-reel-track"
              style={{ '--mega-slot-reel-index': reelIndex } as CSSProperties}
            >
              {reel.map((symbol, rowIndex) => {
                const key = `${reelIndex}:${rowIndex}`;
                const special = specialByPosition.get(key);
                const meta = theme.symbols[symbol] ?? theme.symbols[0]!;
                const symbolImage = special
                  ? getSlotSpecialImage(theme, special.type)
                  : getSlotSymbolImage(theme, symbol);
                const className = [
                  'mega-slot-fallback-symbol',
                  winningKeys.has(key) ? 'mega-slot-fallback-symbol--winning' : '',
                  removedKeys.has(key) ? 'mega-slot-fallback-symbol--removing' : '',
                  dropping ? 'mega-slot-fallback-symbol--dropping-cell' : '',
                  special ? `mega-slot-fallback-symbol--${special.type}` : '',
                  specialWinningKeys.has(key) ? 'mega-slot-fallback-symbol--special-highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <div
                    className={className}
                    key={key}
                    style={
                      {
                        '--mega-slot-accent': meta.accentHex,
                        '--mega-slot-row-index': rowIndex,
                        '--mega-slot-drop-offset': dropOffsets[key] ?? -1.15,
                        borderColor: `${meta.accentHex}66`,
                      } as CSSProperties
                    }
                  >
                    {symbolImage ? <img src={symbolImage} alt="" draggable={false} /> : null}
                    {special?.type === 'multiplier' ? (
                      <span className="mega-slot-fallback-symbol__multiplier">
                        ×{special.value ?? 2}
                      </span>
                    ) : null}
                    {special?.type === 'scatter' ? (
                      <span className="mega-slot-fallback-symbol__bonus">FREE</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {winPop ? (
        <div className="mega-slot-fallback-win-pop" role="status" aria-live="polite">
          {winPop.label ? <span>{winPop.label}</span> : null}
          <strong>{winPop.amount}</strong>
          <small>{winPop.meta}</small>
        </div>
      ) : null}
    </div>
  );
}

function buildMegaFallbackDropOffsets(
  currentGrid: number[][],
  removed: HotlineWinPosition[],
  nextGrid: number[][],
): Record<string, number> {
  const offsets: Record<string, number> = {};
  const removedRowsByReel = new Map<number, Set<number>>();
  for (const position of removed) {
    const rows = removedRowsByReel.get(position.reel) ?? new Set<number>();
    rows.add(position.row);
    removedRowsByReel.set(position.reel, rows);
  }

  for (const [reelIndex, removedRows] of removedRowsByReel.entries()) {
    const currentReel = currentGrid[reelIndex] ?? [];
    const nextReel = nextGrid[reelIndex] ?? [];
    const rowCount = nextReel.length;
    if (rowCount === 0 || removedRows.size === 0) continue;

    const survivorRows = currentReel
      .map((_, row) => row)
      .filter((row) => row < rowCount && !removedRows.has(row));
    const entryCount = Math.max(0, rowCount - survivorRows.length);

    for (let row = 0; row < rowCount; row += 1) {
      const offset =
        row < entryCount
          ? -(entryCount - row + 0.2)
          : (survivorRows[row - entryCount] ?? row) - row;
      if (offset !== 0) offsets[`${reelIndex}:${row}`] = offset;
    }
  }

  return offsets;
}

function getSlotSymbolImage(theme: SlotThemeConfig, symbol: number): string | null {
  if (!Number.isInteger(symbol) || symbol < 0 || symbol >= theme.symbols.length) return null;
  return theme.symbolSheet.replace(/symbols\.png$/, `symbol-${symbol}.png`);
}

function getSlotSpecialImage(theme: SlotThemeConfig, type: HotlineSpecialSymbol['type']): string {
  return theme.symbolSheet.replace(/symbols\.png$/, `${type}.png`);
}

function positionKey(position: HotlineWinPosition): string {
  return `${position.reel}:${position.row}`;
}

function mergeMegaFallbackSpecialSymbols(
  current: HotlineSpecialSymbol[] | undefined,
  spinning: HotlineSpecialSymbol[],
): HotlineSpecialSymbol[] {
  const map = new Map<string, HotlineSpecialSymbol>();
  for (const symbol of current ?? []) map.set(positionKey(symbol), symbol);
  for (const symbol of spinning) map.set(positionKey(symbol), symbol);
  return Array.from(map.values());
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

function MegaJackpotTicker({
  snapshot,
  fallbackValues,
}: {
  snapshot: HotlineJackpotSnapshot | null;
  fallbackValues: JackpotDisplayValue[];
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  const fallbackStartedAtRef = useRef(Date.now());

  useEffect(() => {
    fallbackStartedAtRef.current = Date.now();
  }, [fallbackValues]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  const values = useMemo(
    () => createLiveJackpotValues(snapshot, fallbackValues, now, fallbackStartedAtRef.current),
    [fallbackValues, now, snapshot],
  );

  return (
    <div className="mega-slot-jackpots" aria-label="彩金">
      {values.map((item) => (
        <div key={item.key} className="mega-slot-jackpot">
          <span>{item.label}</span>
          <strong>{formatJackpot(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function createFallbackJackpotValues(): JackpotDisplayValue[] {
  return [
    { label: JACKPOT_LABELS.grand, key: 'grand', value: JACKPOT_RESET_VALUE },
    { label: JACKPOT_LABELS.major, key: 'major', value: JACKPOT_RESET_VALUE },
    { label: JACKPOT_LABELS.minor, key: 'minor', value: JACKPOT_RESET_VALUE },
    { label: JACKPOT_LABELS.mini, key: 'mini', value: JACKPOT_RESET_VALUE },
  ];
}

function createLiveJackpotValues(
  snapshot: HotlineJackpotSnapshot | null,
  fallbackValues: JackpotDisplayValue[],
  now: number,
  fallbackAsOf: number,
): JackpotDisplayValue[] {
  const snapshotAsOf = snapshot ? Date.parse(snapshot.asOf ?? snapshot.updatedAt) : fallbackAsOf;
  const asOf = Number.isFinite(snapshotAsOf) ? snapshotAsOf : fallbackAsOf;

  return JACKPOT_KEYS.map((key) => {
    const fallback = fallbackValues.find((item) => item.key === key);
    const baseValue = snapshot ? Number.parseFloat(snapshot[key]) : (fallback?.value ?? 0);
    const value = growJackpotDisplayValue(
      Number.isFinite(baseValue) ? baseValue : (fallback?.value ?? JACKPOT_RESET_VALUE),
      asOf,
      now,
      key,
    );
    return {
      key,
      label: JACKPOT_LABELS[key],
      value,
    };
  });
}

function growJackpotDisplayValue(
  baseValue: number,
  baseAsOf: number,
  now: number,
  key: JackpotKey,
): number {
  const cycleStart = getJackpotCycleStartMs(now, key);
  const effectiveBaseAsOf = baseAsOf < cycleStart ? cycleStart : baseAsOf;
  const effectiveBaseValue = baseAsOf < cycleStart ? JACKPOT_RESET_VALUE : baseValue;
  const elapsedSeconds = Math.max(0, Math.floor((now - effectiveBaseAsOf) / 1000));
  return effectiveBaseValue + JACKPOT_GROWTH_PER_SECOND[key] * elapsedSeconds;
}

function getJackpotCycleStartMs(timestampMs: number, key: JackpotKey): number {
  const epochMs = Number.isFinite(JACKPOT_EPOCH_MS) ? JACKPOT_EPOCH_MS : Date.UTC(2026, 0, 1);
  const shifted = timestampMs - epochMs - JACKPOT_RESET_OFFSET_MS[key];
  if (shifted <= 0) return epochMs + JACKPOT_RESET_OFFSET_MS[key];
  return (
    epochMs +
    JACKPOT_RESET_OFFSET_MS[key] +
    Math.floor(shifted / JACKPOT_RESET_INTERVAL_MS[key]) * JACKPOT_RESET_INTERVAL_MS[key]
  );
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
    amount: Math.max(MIN_BET_AMOUNT, Math.min(MAX_BET_AMOUNT, roundCurrency(settings.amount))),
    lossLimit: roundCurrency(settings.lossLimit),
    profitTarget: roundCurrency(settings.profitTarget),
    singleWinLimit: roundCurrency(settings.singleWinLimit),
    stopOnAnyWin: settings.stopOnAnyWin,
    stopOnFreeSpins: settings.stopOnFreeSpins,
  };
}

function roundMegaMultiplier(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MEGA_MAX_TOTAL_MULTIPLIER, Number(Math.max(0, value).toFixed(4)));
}

function roundMegaPayout(amount: number, multiplier: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(multiplier)) return 0;
  return Number((amount * multiplier).toFixed(2));
}

function hasCascadeSymbolClear(cascades: HotlineCascadeStep[]): boolean {
  return cascades.some((step) => step.removed.length > 0 && step.multiplier > 0);
}

function sumCascadeMultipliers(cascades: HotlineCascadeStep[]): number {
  return roundMegaMultiplier(cascades.reduce((sum, step) => sum + step.multiplier, 0));
}

function getActivatedBaseMultiplierTotal(features?: HotlineMegaFeatureResult): number {
  if (!features || features.baseAppliedMultiplier <= 1) return 0;
  return features.baseMultiplierTotal;
}

function createMultiplierActivation(
  symbols: HotlineSpecialSymbol[],
  appliedMultiplier: number,
  cascades: HotlineCascadeStep[],
): MegaMultiplierActivation | undefined {
  const multiplierSymbols = symbols.filter((symbol) => symbol.type === 'multiplier');
  if (
    !hasCascadeSymbolClear(cascades) ||
    multiplierSymbols.length === 0 ||
    appliedMultiplier <= 1
  ) {
    return undefined;
  }
  return {
    symbols: multiplierSymbols,
    total: appliedMultiplier,
  };
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

function getSlotPayoutMeta(
  slotTheme: SlotThemeConfig,
  symbolIndex: number,
  isMegaSlot: boolean,
): {
  condition: string;
  multiplier: string;
  detail: string;
  primaryValue: number;
} {
  if (isMegaSlot) {
    const symbol = HOTLINE_MEGA_SYMBOLS[symbolIndex];
    const value = symbol?.payout3 ?? 0;
    return {
      condition: '8+ 連線',
      multiplier: `${value}×`,
      detail: '',
      primaryValue: value,
    };
  }

  if (slotTheme.reels === 3) {
    const symbol = HOTLINE_MINI_SYMBOLS[symbolIndex];
    const value = symbol?.payout3 ?? 0;
    return {
      condition: '3 個',
      multiplier: `${value}×`,
      detail: '',
      primaryValue: value,
    };
  }

  const symbol = HOTLINE_SYMBOLS[symbolIndex];
  const value = symbol?.payout3 ?? 0;
  return {
    condition: '3 個',
    multiplier: `${value}×`,
    detail: symbol ? `4個 ${symbol.payout4}× · 5個 ${symbol.payout5}×` : '',
    primaryValue: value,
  };
}

function formatMegaFeatureDetail(features?: HotlineMegaFeatureResult, buyFeature = false): string {
  if (!features) return '';
  const activatedBaseMultiplierTotal = getActivatedBaseMultiplierTotal(features);
  const parts = [
    buyFeature ? '購買免費' : '',
    activatedBaseMultiplierTotal > 0 ? `倍數 ${activatedBaseMultiplierTotal}×` : '',
    features.freeSpinsAwarded > 0
      ? `免費 ${features.freeSpinsPlayed}/${features.freeSpinsAwarded}`
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}
