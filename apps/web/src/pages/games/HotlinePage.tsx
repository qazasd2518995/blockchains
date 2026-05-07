import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, History, RotateCw } from 'lucide-react';
import type {
  HotlineBetRequest,
  HotlineBetResult,
  HotlineCascadeStep,
  HotlineMegaFeatureResult,
  HotlineSpecialSymbol,
  HotlineWinPosition,
  HotlineWinLine,
} from '@bg/shared';
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
  '8-9個 0.024x · 10-11個 0.072x · 12+個 0.24x',
  '8-9個 0.030x · 10-11個 0.096x · 12+個 0.36x',
  '8-9個 0.048x · 10-11個 0.156x · 12+個 0.66x',
  '8-9個 0.072x · 10-11個 0.264x · 12+個 1.32x',
  '8-9個 0.144x · 10-11個 0.660x · 12+個 3.60x',
  '8-9個 0.336x · 10-11個 1.920x · 12+個 12.00x',
];
const BIG_WIN_MULTIPLIER = 20;
const MEGA_MAX_TOTAL_MULTIPLIER = 1000;
const MEGA_FREE_SPIN_INTRO_MS = 1600;
const MEGA_FREE_SPIN_RETRIGGER_MS = 1300;
const MEGA_PRESETS = [1, 10, 100, 1000];

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
  const [megaFallbackRemoved, setMegaFallbackRemoved] = useState<HotlineWinPosition[]>([]);
  const [megaFallbackDropping, setMegaFallbackDropping] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HotlineScene | null>(null);
  const fallbackGrid = useMemo(() => createFallbackGrid(slotTheme), [slotTheme]);
  const jackpotValues = useMemo(() => createJackpotValues(slotTheme.id), [slotTheme.id]);

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

  const spin = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount <= 0 || amount > balance) return;
    setBusy(true);
    setSpinning(true);
    setResult(null);
    setLiveMegaRound(isMegaSlot ? createInitialLiveMegaRound() : null);
    setMegaFreeSpinIntro(null);
    setMegaFallbackRemoved([]);
    setMegaFallbackDropping(false);
    setError(null);

    const activeScene = sceneReady && !sceneFallback ? sceneRef.current : null;
    activeScene?.resetWinLines();
    // 乐观动画：转轴立刻开始滚
    activeScene?.startAnticipation();
    setMegaFallbackSpinning(isMegaSlot && !activeScene);

    try {
      const payload: HotlineBetRequest = { amount, gameId: slotTheme.gameId };
      const res = await api.post<HotlineBetResult>('/games/hotline/bet', payload);
      const cascades = res.data.cascades ?? [];
      const features = res.data.features;
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
      ): Promise<void> => {
        const scene = sceneReady && !sceneFallback ? sceneRef.current : null;
        if (scene) {
          await scene.playSpin(grid, lines);
          return;
        }
        setMegaFallbackRemoved([]);
        setMegaFallbackDropping(false);
        setMegaFallbackSpinning(true);
        await delay(lines.length > 0 ? 820 : 620);
        setMegaFallbackSpinning(false);
        updateLiveMegaRound({ grid });
        if (lines.length > 0) await delay(260);
      };

      const playCascadeOrFallback = async (
        steps: HotlineCascadeStep[],
        finalGrid: number[][],
        onStepWin: (step: HotlineCascadeStep) => void,
      ): Promise<void> => {
        const scene = sceneReady && !sceneFallback ? sceneRef.current : null;
        if (scene) {
          await scene.playCascadeSpin(steps, finalGrid, { onStepWin });
          return;
        }

        const first = steps[0];
        if (!first) {
          await playSpinOrFallback(finalGrid, []);
          return;
        }

        await playSpinOrFallback(first.grid, first.lines);
        onStepWin(first);

        let previous = first;
        for (let i = 1; i < steps.length; i += 1) {
          const step = steps[i]!;
          await playFallbackCascadeDrop(previous.removed, step.grid);
          onStepWin(step);
          previous = step;
        }

        await playFallbackCascadeDrop(previous.removed, finalGrid);
        updateLiveMegaRound({ grid: finalGrid });
      };

      const playFallbackCascadeDrop = async (
        removed: HotlineWinPosition[],
        nextGrid: number[][],
      ): Promise<void> => {
        await delay(460);
        setMegaFallbackRemoved(removed);
        await delay(280);
        setMegaFallbackRemoved([]);
        setMegaFallbackDropping(true);
        updateLiveMegaRound({ grid: nextGrid });
        await delay(380);
        setMegaFallbackDropping(false);
      };

      const revealCascadeStep = (
        step: HotlineCascadeStep,
        appliedMultiplier: number,
        patch: Partial<LiveMegaRoundState>,
      ): void => {
        revealedCascadeCount += 1;
        revealedMultiplier = roundMegaMultiplier(
          revealedMultiplier + step.multiplier * appliedMultiplier,
        );
        updateLiveMegaRound({
          ...patch,
          grid: step.grid,
          cascadeCount: revealedCascadeCount,
          multiplier: revealedMultiplier,
          payout: roundMegaPayout(amount, revealedMultiplier),
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
          activeMultiplier: Math.max(1, features.baseMultiplierTotal),
          baseMultiplierTotal: features.baseMultiplierTotal,
          specialSymbols: [...features.scatterSymbols, ...features.baseMultiplierSymbols],
        });
      };

      if (cascades.length > 0) {
        await playCascadeOrFallback(cascades, res.data.grid, (step) => {
          revealCascadeStep(
            step,
            features?.baseAppliedMultiplier ?? 1,
            features
              ? {
                  scatterCount: features.scatterCount,
                  freeSpinsAwarded: revealedFreeSpinsAwarded,
                  activeMultiplier: Math.max(1, features.baseMultiplierTotal),
                  baseMultiplierTotal: features.baseMultiplierTotal,
                  specialSymbols: [...features.scatterSymbols, ...features.baseMultiplierSymbols],
                }
              : {},
          );
        });
        revealBaseState(res.data.grid);
      } else {
        await playSpinOrFallback(res.data.grid, res.data.lines);
        revealBaseState(res.data.grid);
      }
      if (features && revealedFreeSpinsAwarded > 0 && freeSpinRounds.length > 0) {
        await delay(260);
        await showMegaFreeSpinIntro({
          kind: 'trigger',
          spins: revealedFreeSpinsAwarded,
          totalSpins: revealedFreeSpinsAwarded,
          scatterCount: features.scatterCount,
        });
      }
      for (const round of freeSpinRounds) {
        await delay(360);
        revealedFreeMultiplierBank = roundMegaMultiplier(
          revealedFreeMultiplierBank + round.multiplierTotal,
        );
        const roundSpecialSymbols = [...round.scatterSymbols, ...round.multiplierSymbols];
        const freeRoundPatch: Partial<LiveMegaRoundState> = {
          freeSpinsPlayed: round.index + 1,
          freeSpinsAwarded: revealedFreeSpinsAwarded,
          freeSpinMode: true,
          activeMultiplier: Math.max(1, revealedFreeMultiplierBank),
          scatterCount: round.scatterSymbols.length,
          specialSymbols: roundSpecialSymbols,
        };
        updateLiveMegaRound({ ...freeRoundPatch, grid: round.initialGrid });

        if (round.cascades.length > 0) {
          await playCascadeOrFallback(round.cascades, round.finalGrid, (step) => {
            revealCascadeStep(step, round.appliedMultiplier, freeRoundPatch);
          });
          updateLiveMegaRound({ ...freeRoundPatch, grid: round.finalGrid });
        } else {
          await playSpinOrFallback(round.finalGrid, round.lines);
          updateLiveMegaRound({ ...freeRoundPatch, grid: round.finalGrid });
        }

        if (round.extraFreeSpinsAwarded > 0 && features) {
          revealedFreeSpinsAwarded = Math.min(
            features.freeSpinsAwarded,
            revealedFreeSpinsAwarded + round.extraFreeSpinsAwarded,
          );
          updateLiveMegaRound({
            freeSpinsAwarded: revealedFreeSpinsAwarded,
          });
          await showMegaFreeSpinIntro(
            {
              kind: 'retrigger',
              spins: round.extraFreeSpinsAwarded,
              totalSpins: revealedFreeSpinsAwarded,
              scatterCount: round.scatterSymbols.length,
            },
            MEGA_FREE_SPIN_RETRIGGER_MS,
          );
        }
      }
      const mult = res.data.multiplier ?? 0;
      const profitValue = Number.parseFloat(res.data.profit);
      const featureDetail = formatMegaFeatureDetail(res.data.features);
      const totalCascadeCount =
        cascades.length + freeSpinRounds.reduce((sum, round) => sum + round.cascades.length, 0);
      sceneRef.current?.playWinFx(mult, mult > 0);
      updateLiveMegaRound({
        payout: Number.parseFloat(res.data.payout),
        multiplier: mult,
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
      setBalance(res.data.newBalance);
      setHistory((prev) =>
        [
          {
            id: res.data.betId,
            timestamp: Date.now(),
            betAmount: amount,
            multiplier: mult,
            payout: amount * mult,
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
    } catch (err) {
      sceneRef.current?.stopAnticipation();
      sceneRef.current?.resetWinLines();
      setLiveMegaRound(null);
      setMegaFreeSpinIntro(null);
      setMegaFallbackSpinning(false);
      setMegaFallbackRemoved([]);
      setMegaFallbackDropping(false);
      setError(extractApiError(err).message);
    } finally {
      setSpinning(false);
      setBusy(false);
      setMegaFallbackSpinning(false);
      setMegaFallbackRemoved([]);
      setMegaFallbackDropping(false);
    }
  };

  const resultAmount = result ? Number.parseFloat(result.amount) : 0;
  const resultPayout = result ? Number.parseFloat(result.payout) : 0;
  const resultProfit = result ? Number.parseFloat(result.profit) : 0;
  const resultMultiplier = result?.multiplier ?? 0;
  const megaFeatures = result?.features;
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
  const isBigWinResult = resultProfit > 0 && resultMultiplier >= BIG_WIN_MULTIPLIER;
  const resultTitle = isBigWinResult
    ? '恭喜爆分'
    : resultPayout > resultAmount
      ? '恭喜中獎'
      : resultPayout > 0
        ? '小中獎派彩'
        : '本局未中';

  if (isMegaSlot) {
    return (
      <div
        className="slot-game-page slot-game-page--mega mega-slot-machine"
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
                  removed={megaFallbackRemoved}
                  dropping={megaFallbackDropping}
                  hidden={sceneReady && !sceneFallback}
                />
                <MegaSpecialOverlay theme={slotTheme} symbols={megaDisplaySpecialSymbols} />
                <canvas
                  ref={canvasRef}
                  className={`mega-slot-canvas ${sceneReady && !sceneFallback ? 'mega-slot-canvas--ready' : ''}`}
                />
                {megaFreeSpinIntro && <MegaFreeSpinIntroOverlay intro={megaFreeSpinIntro} />}
              </div>
              {result && !spinning && isBigWinResult && (
                <div
                  className="slot-bigwin-stage"
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
                    <div className="slot-bigwin-stage__amount">+{formatAmount(result.profit)}</div>
                    <div className="slot-bigwin-stage__meta">
                      {formatMultiplier(result.multiplier)}
                      {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                    </div>
                  </div>
                </div>
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
              <button type="button" onClick={() => setMegaAmount(amount / 2)} disabled={busy}>
                ½
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={amount.toFixed(2)}
                disabled={busy}
                onChange={(event) => {
                  const next = Number.parseFloat(event.target.value);
                  if (Number.isFinite(next)) setMegaAmount(next);
                }}
                aria-label="下注金額"
              />
              <button type="button" onClick={() => setMegaAmount(amount * 2)} disabled={busy}>
                2×
              </button>
            </div>
            <div className="mega-slot-presets">
              {MEGA_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMegaAmount(preset)}
                  disabled={busy || (!!user && preset > balance)}
                >
                  {preset}
                </button>
              ))}
              <button type="button" onClick={() => setMegaAmount(balance)} disabled={busy || !user}>
                最大
              </button>
            </div>
            <button
              type="button"
              onClick={spin}
              disabled={busy || (!!user && balance < amount)}
              className="mega-slot-spin"
              aria-label={t.games.hotline.spin}
            >
              <span>{megaSpinButtonLabel}</span>
              <strong>{megaSpinButtonValue}</strong>
            </button>
          </footer>

          {error && (
            <div className="mega-slot-alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error.toUpperCase()}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`slot-game-page ${isMegaSlot ? 'slot-game-page--mega' : 'slot-game-page--classic'}`}
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

            {result && !spinning && isBigWinResult && (
              <div
                className="slot-bigwin-stage"
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
                  <div className="slot-bigwin-stage__amount">+{formatAmount(result.profit)}</div>
                  <div className="slot-bigwin-stage__meta">
                    {formatMultiplier(result.multiplier)}
                    {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                  </div>
                </div>
              </div>
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
                    {t.games.hotline.totalMult} {formatMultiplier(result.multiplier)}
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
              disabled={busy}
            />

            <button
              type="button"
              onClick={spin}
              disabled={busy || (!!user && balance < amount)}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.hotline.spin} · {formatAmount(amount)}
            </button>
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
                  {result ? formatMultiplier(result.multiplier) : '—'}
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
                    {isMegaSlot ? MEGA_SYMBOL_PAYOUTS[index] : '3x · 4x · 5x'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <RecentBetsList records={history} />
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
  removed,
  dropping,
  hidden,
}: {
  theme: SlotThemeConfig;
  grid: number[][];
  spinning: boolean;
  removed: HotlineWinPosition[];
  dropping: boolean;
  hidden: boolean;
}) {
  const removedKeys = useMemo(
    () => new Set(removed.map((position) => `${position.reel}:${position.row}`)),
    [removed],
  );

  return (
    <div
      className={`mega-slot-fallback-grid ${spinning ? 'mega-slot-fallback-grid--spinning' : ''} ${dropping ? 'mega-slot-fallback-grid--dropping' : ''} ${hidden ? 'mega-slot-fallback-grid--hidden' : ''}`}
      aria-hidden="true"
    >
      {grid.map((reel, reelIndex) => {
        const reelStrip = spinning ? createFallbackSpinStrip(theme, reel, reelIndex) : reel;
        const style = {
          '--mega-slot-reel-items': reelStrip.length,
          '--mega-slot-reel-duration': `${0.46 + reelIndex * 0.055}s`,
        } as CSSProperties;
        return (
          <div key={`${theme.id}-fallback-reel-${reelIndex}`} className="mega-slot-fallback-reel">
            <div className="mega-slot-fallback-reel-track" style={style}>
              {reelStrip.map((symbol, rowIndex) => {
                const meta = theme.symbols[symbol] ?? theme.symbols[0]!;
                const symbolImage = getMegaSlotSymbolImage(theme, symbol);
                const removing = !spinning && removedKeys.has(`${reelIndex}:${rowIndex}`);
                return (
                  <div
                    key={`${reelIndex}-${rowIndex}-${symbol}-${spinning ? 'spin' : 'idle'}`}
                    className={`mega-slot-fallback-symbol ${removing ? 'mega-slot-fallback-symbol--removing' : ''}`}
                    style={{
                      borderColor: `${meta.accentHex}88`,
                      backgroundImage: symbolImage ? 'none' : `url(${theme.symbolSheet})`,
                      backgroundPosition: symbolImage
                        ? 'center'
                        : (SYMBOL_POSITIONS[symbol] ?? '0% 0%'),
                      '--mega-slot-reel-index': reelIndex,
                      '--mega-slot-row-index': rowIndex,
                    } as CSSProperties}
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
                    <span>{meta.shortLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function createFallbackSpinStrip(
  theme: SlotThemeConfig,
  reel: number[],
  reelIndex: number,
): number[] {
  const symbolCount = theme.symbols.length || 6;
  const extraRows = theme.rows * 2;
  const lead = Array.from(
    { length: extraRows },
    (_, index) => (index + reelIndex * 2 + theme.id.length) % symbolCount,
  );
  const trail = Array.from(
    { length: extraRows },
    (_, index) => (index * 2 + reelIndex + theme.id.length + 3) % symbolCount,
  );
  return [...lead, ...reel, ...trail];
}

function getMegaSlotSymbolImage(theme: SlotThemeConfig, symbol: number): string | null {
  if (theme.rows <= 3) return null;
  if (!Number.isInteger(symbol) || symbol < 0 || symbol >= theme.symbols.length) return null;
  return theme.symbolSheet.replace(/symbols\.png$/, `symbol-${symbol}.png`);
}

function getMegaSlotMultiplierImage(theme: SlotThemeConfig): string {
  return theme.symbolSheet.replace(/symbols\.png$/, 'multiplier.png');
}

function getMegaSlotScatterImage(theme: SlotThemeConfig): string {
  return theme.symbolSheet.replace(/symbols\.png$/, 'scatter.png');
}

function MegaSpecialOverlay({
  theme,
  symbols,
}: {
  theme: SlotThemeConfig;
  symbols: HotlineSpecialSymbol[];
}) {
  if (symbols.length === 0) return null;

  return (
    <div className="mega-slot-special-overlay" aria-hidden="true">
      {symbols.map((symbol, index) => {
        const multiplierImage = getMegaSlotMultiplierImage(theme);
        const scatterImage = getMegaSlotScatterImage(theme);
        return (
          <div
            key={`${symbol.type}-${symbol.reel}-${symbol.row}-${symbol.value ?? 'free'}-${index}`}
            className={`mega-slot-special-symbol mega-slot-special-symbol--${symbol.type}`}
            style={{
              gridColumn: symbol.reel + 1,
              gridRow: symbol.row + 1,
            }}
          >
            {symbol.type === 'multiplier' ? (
              <>
                <span
                  className="mega-slot-special-symbol__art"
                  style={{ backgroundImage: `url(${multiplierImage})` }}
                />
                <span className="mega-slot-special-symbol__value">{symbol.value ?? 2}×</span>
              </>
            ) : (
              <span
                className="mega-slot-special-symbol__art"
                style={{ backgroundImage: `url(${scatterImage})` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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

function formatJackpot(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function roundMegaMultiplier(value: number): number {
  return Math.min(MEGA_MAX_TOTAL_MULTIPLIER, Number(value.toFixed(4)));
}

function roundMegaPayout(amount: number, multiplier: number): number {
  return Number((amount * multiplier).toFixed(2));
}

function getFinalMegaGrid(result: HotlineBetResult, fallbackGrid: number[][]): number[][] {
  const rounds = result.features?.freeSpinRounds ?? [];
  return rounds[rounds.length - 1]?.finalGrid ?? result.grid ?? fallbackGrid;
}

function getFinalMegaSpecialSymbols(features?: HotlineMegaFeatureResult): HotlineSpecialSymbol[] {
  if (!features) return [];
  const lastFreeSpinRound = features.freeSpinRounds[features.freeSpinRounds.length - 1];
  return [...features.baseMultiplierSymbols, ...(lastFreeSpinRound?.multiplierSymbols ?? [])];
}

function formatMegaFeatureDetail(features?: HotlineMegaFeatureResult): string {
  if (!features) return '';
  const parts = [
    features.baseMultiplierTotal > 0 ? `倍數 ${features.baseMultiplierTotal}×` : '',
    features.freeSpinsAwarded > 0
      ? `免費 ${features.freeSpinsPlayed}/${features.freeSpinsAwarded}`
      : '',
  ].filter(Boolean);
  return parts.join(' · ');
}
