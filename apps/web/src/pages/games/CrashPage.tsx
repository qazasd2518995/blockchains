import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  type CrashBetStartResponse,
  type CrashSoloRoundState,
} from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount } from '@/lib/utils';
import { api, extractApiError } from '@/lib/api';
import { useTranslation } from '@/i18n/useTranslation';
import { CrashScene } from '@/games/crash/CrashScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import type { CrashGameConfig } from './crashConfigs';

interface Props {
  config: CrashGameConfig;
}

type LocalCrashBet = {
  amount: number;
  payout?: string;
  roundId?: string;
  betId?: string;
};
type CrashAutoSettings = { rounds: number | null; amount: number };
type CrashAutoDraft = { rounds: string; amount: string };
type SimulatedCrashBet = {
  id: string;
  account: string;
  amount: number;
  resultMultiplier: number | null;
};
const CRASH_AUTO_ROUND_PRESETS = ['∞', '10', '100'];
const SIMULATED_LIVE_MIN = 10;
const SIMULATED_LIVE_MAX = 28;
const SIMULATED_STAKE_MIN = 20;
const SIMULATED_STAKE_MAX = 500;
const SOLO_CLIENT_GROWTH_RATE = 0.00072;
let simulatedLiveBetSerial = 0;

function formatCrashMultiplier(value: string | number): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}×`;
}

function createCrashAutoDraft(amount: number): CrashAutoDraft {
  return {
    rounds: '∞',
    amount: amount.toFixed(2),
  };
}

function parseCrashAutoSettings(draft: CrashAutoDraft): CrashAutoSettings | null {
  const roundsRaw = draft.rounds.trim();
  const rounds =
    roundsRaw === '∞'
      ? null
      : Math.max(1, Math.min(1000, Math.floor(Number.parseFloat(roundsRaw))));
  const amount = roundCurrency(Number.parseFloat(draft.amount));
  if (roundsRaw !== '∞' && !Number.isFinite(rounds)) return null;
  if (!Number.isFinite(amount) || amount < MIN_BET_AMOUNT || amount > MAX_BET_AMOUNT) return null;
  return {
    rounds,
    amount,
  };
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(2));
}

function crashElapsedMs(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 1) return 0;
  return Math.max(0, Math.floor(Math.log(multiplier) / SOLO_CLIENT_GROWTH_RATE));
}

function nextRoundPollDelay(state: CrashSoloRoundState): number {
  const finalMultiplier = state.visualCrashPoint;
  if (!Number.isFinite(finalMultiplier) || finalMultiplier === undefined) return 70;
  const remainingMs = crashElapsedMs(finalMultiplier) - state.elapsedMs;
  if (remainingMs <= 180) return 24;
  if (remainingMs <= 650) return 42;
  return 70;
}

function createSimulatedCrashBets(gameId: string): SimulatedCrashBet[] {
  const count = SIMULATED_LIVE_MIN + (hashString(gameId) % 10) + Math.floor(Math.random() * 6);
  return Array.from({ length: Math.min(SIMULATED_LIVE_MAX, count) }, () =>
    createSimulatedCrashBet(gameId),
  );
}

function updateSimulatedCrashBets(gameId: string, current: SimulatedCrashBet[]) {
  const next = current.map((bet) =>
    bet.resultMultiplier === null && Math.random() > 0.76
      ? { ...bet, resultMultiplier: randomSimulatedMultiplier() }
      : bet,
  );
  const additions = 1 + (Math.random() > 0.72 ? 1 : 0);
  for (let i = 0; i < additions; i += 1) {
    next.unshift(createSimulatedCrashBet(gameId));
  }
  const target = SIMULATED_LIVE_MIN + Math.floor(Math.random() * (SIMULATED_LIVE_MAX - 7));
  return next.slice(0, Math.max(SIMULATED_LIVE_MIN, target));
}

function createSimulatedCrashBet(gameId: string): SimulatedCrashBet {
  simulatedLiveBetSerial += 1;
  return {
    id: `${gameId}-${Date.now()}-${simulatedLiveBetSerial}`,
    account: createMaskedAccount(),
    amount: createSimulatedStake(),
    resultMultiplier: Math.random() > 0.62 ? randomSimulatedMultiplier() : null,
  };
}

function createMaskedAccount() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const prefix = letters[Math.floor(Math.random() * letters.length)] ?? 'a';
  const suffix = String(10 + Math.floor(Math.random() * 90));
  return `${prefix}******${suffix}`;
}

function createSimulatedStake() {
  const weighted = Math.random() ** 1.45;
  const range = SIMULATED_STAKE_MAX - SIMULATED_STAKE_MIN;
  const amount = SIMULATED_STAKE_MIN + Math.floor((weighted * range) / 10) * 10;
  return Math.max(SIMULATED_STAKE_MIN, Math.min(SIMULATED_STAKE_MAX, amount));
}

function randomSimulatedMultiplier() {
  return Number((1.1 + Math.random() ** 1.7 * 10.9).toFixed(1));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function CrashPage({ config }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [multiplier, setMultiplier] = useState(1.0);
  const [status, setStatus] = useState<'BETTING' | 'RUNNING' | 'CRASHED'>('BETTING');
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [myBet, setMyBet] = useState<LocalCrashBet | null>(null);
  const [simulatedLiveBets, setSimulatedLiveBets] = useState<SimulatedCrashBet[]>(() =>
    createSimulatedCrashBets(config.gameId),
  );
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [myHistory, setMyHistory] = useState<RecentBetRecord[]>([]);
  const [autoBetOpen, setAutoBetOpen] = useState(false);
  const [autoBetDraft, setAutoBetDraft] = useState<CrashAutoDraft>(() =>
    createCrashAutoDraft(10),
  );
  const [autoBetActive, setAutoBetActive] = useState(false);
  const [autoBetRemaining, setAutoBetRemaining] = useState<number | null>(null);
  const [autoBetStopReason, setAutoBetStopReason] = useState('');
  const roundPollRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const optimisticFlightRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CrashScene | null>(null);
  const myBetRef = useRef<LocalCrashBet | null>(null);
  const finalizedRoundRef = useRef<string | null>(null);
  const statusRef = useRef(status);
  const crashPointRef = useRef(crashPoint);
  const visualCrashPointRef = useRef<number | null>(null);
  const multiplierRef = useRef(1.0);
  const userIdRef = useRef<string | null>(user?.id ?? null);
  const autoBetActiveRef = useRef(false);
  const autoBetRemainingRef = useRef<number | null>(null);
  const autoBetSettingsRef = useRef<CrashAutoSettings | null>(null);
  const autoBetSubmittingRef = useRef(false);

  useEffect(() => {
    myBetRef.current = myBet;
  }, [myBet]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    crashPointRef.current = crashPoint;
  }, [crashPoint]);

  useEffect(() => {
    multiplierRef.current = multiplier;
  }, [multiplier]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    autoBetActiveRef.current = autoBetActive;
  }, [autoBetActive]);

  useEffect(() => {
    autoBetRemainingRef.current = autoBetRemaining;
  }, [autoBetRemaining]);

  const applySceneState = useCallback((scene: CrashScene) => {
    if (statusRef.current === 'BETTING') {
      scene.startBetting(0);
      return;
    }

    if (statusRef.current === 'RUNNING') {
      scene.startRunning();
      scene.setCrashLimit(visualCrashPointRef.current);
      scene.setMultiplier(multiplierRef.current);
      return;
    }

    if (statusRef.current === 'CRASHED' && crashPointRef.current !== null) {
      scene.crash(crashPointRef.current);
    }
  }, []);

  // 初始化 Pixi scene
  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = canvasShellRef.current ?? canvas?.parentElement;
    if (!canvas) return;
    let cancelled = false;
    let scene: CrashScene | null = null;
    let rafId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let initToken = 0;
    let lastWidth = 0;
    let lastHeight = 0;

    const fillCanvas = () => {
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
    };

    const readSize = () => {
      const rect = (shell ?? canvas).getBoundingClientRect();
      const w = Math.round(rect.width || canvas.clientWidth);
      const h = Math.round(rect.height || canvas.clientHeight);
      return { w, h };
    };

    const initScene = (w: number, h: number) => {
      if (cancelled) return;
      fillCanvas();
      lastWidth = w;
      lastHeight = h;
      const token = ++initToken;
      const previous = scene;
      const nextScene = new CrashScene();
      scene = nextScene;
      sceneRef.current = nextScene;
      previous?.dispose();
      void nextScene
        .init(canvas, w, h, config.variant ?? 'rocket')
        .then(() => {
          if (cancelled || token !== initToken) {
            nextScene.dispose();
            return;
          }
          fillCanvas();
          sceneRef.current = nextScene;
          applySceneState(nextScene);
        })
        .catch((err) => {
          if (!cancelled) console.error(err);
          if (sceneRef.current === nextScene) sceneRef.current = null;
        });
    };

    const ensureSceneSize = () => {
      if (cancelled) return;
      fillCanvas();
      const { w, h } = readSize();
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(ensureSceneSize);
        return;
      }
      if (!scene || Math.abs(w - lastWidth) > 3 || Math.abs(h - lastHeight) > 3) {
        if (scene && statusRef.current === 'RUNNING') return;
        initScene(w, h);
      }
    };

    const scheduleEnsureSceneSize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(ensureSceneSize);
    };

    const tryInit = () => {
      if (cancelled) return;
      fillCanvas();
      const { w, h } = readSize();
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      initScene(w, h);
      resizeObserver = new ResizeObserver(scheduleEnsureSceneSize);
      resizeObserver.observe(shell ?? canvas);
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      if (scene && sceneRef.current === scene) {
        scene.dispose();
        sceneRef.current = null;
      }
    };
  }, [applySceneState, config.variant]);

  // Sync state to Pixi scene
  useEffect(() => {
    if (!sceneRef.current) return;
    if (status === 'BETTING') {
      sceneRef.current.startBetting(0);
    }
  }, [status]);

  useEffect(() => {
    if (!sceneRef.current) return;
    if (status === 'RUNNING') {
      sceneRef.current.startRunning();
      sceneRef.current.setCrashLimit(visualCrashPointRef.current);
      sceneRef.current.setMultiplier(multiplierRef.current);
    }
  }, [status]);

  useEffect(() => {
    if (!sceneRef.current) return;
    if (status === 'RUNNING') {
      sceneRef.current.setMultiplier(multiplier);
    }
  }, [multiplier, status]);

  useEffect(() => {
    if (!sceneRef.current) return;
    if (status === 'CRASHED' && crashPoint !== null) {
      sceneRef.current.crash(crashPoint);
    }
  }, [status, crashPoint]);

  // Derive title/desc from i18n per gameId
  const titleMap: Record<string, { title: string; suffix: string; desc: string }> = {
    rocket: {
      title: t.games.crash.rocketTitle,
      suffix: t.games.crash.defaultSuffix,
      desc: t.games.crash.descRocket,
    },
    aviator: {
      title: t.games.crash.aviatorTitle,
      suffix: t.games.crash.defaultSuffix,
      desc: t.games.crash.descAviator,
    },
    'space-fleet': {
      title: t.games.crash.fleetTitle,
      suffix: t.games.crash.fleetSuffix,
      desc: t.games.crash.descFleet,
    },
    jetx: {
      title: t.games.crash.jetxTitle,
      suffix: t.games.crash.jetxSuffix,
      desc: t.games.crash.descJetx,
    },
    balloon: {
      title: t.games.crash.balloonTitle,
      suffix: t.games.crash.defaultSuffix,
      desc: t.games.crash.descBalloon,
    },
    jetx3: {
      title: t.games.crash.jetx3Title,
      suffix: t.games.crash.jetx3Suffix,
      desc: t.games.crash.descJetx3,
    },
    'double-x': {
      title: t.games.crash.doubleTitle,
      suffix: t.games.crash.doubleSuffix,
      desc: t.games.crash.descDouble,
    },
  };
  const meta = titleMap[config.gameId] ?? {
    title: config.gameId,
    suffix: '',
    desc: '',
  };

  const clearOptimisticFlight = useCallback(() => {
    if (optimisticFlightRef.current) {
      window.clearTimeout(optimisticFlightRef.current);
      optimisticFlightRef.current = null;
    }
  }, []);

  const startOptimisticFlight = useCallback(
    (betAmount: number) => {
      clearOptimisticFlight();
      statusRef.current = 'RUNNING';
      multiplierRef.current = 1;
      crashPointRef.current = null;
      visualCrashPointRef.current = null;
      finalizedRoundRef.current = null;
      const optimisticBet = { amount: betAmount };
      myBetRef.current = optimisticBet;
      setMyBet(optimisticBet);
      setCrashPoint(null);
      setStatus('RUNNING');
      setMultiplier(1);
      sceneRef.current?.startRunning();
      sceneRef.current?.setCrashLimit(null);
      sceneRef.current?.setPreflightMultiplierCap(1.04);
    },
    [clearOptimisticFlight],
  );

  const clearRoundPoll = useCallback(() => {
    if (roundPollRef.current) {
      window.clearTimeout(roundPollRef.current);
      roundPollRef.current = null;
    }
  }, []);

  const handleRoundState = useCallback(
    (state: CrashSoloRoundState) => {
      clearOptimisticFlight();
      statusRef.current = state.status;
      const visualCrashPoint = Number.isFinite(state.visualCrashPoint)
        ? state.visualCrashPoint!
        : null;
      visualCrashPointRef.current = visualCrashPoint;
      const safeCurrentMultiplier =
        visualCrashPoint && state.status === 'RUNNING'
          ? Math.min(state.currentMultiplier, visualCrashPoint)
          : state.currentMultiplier;
      const displayMultiplier =
        state.status === 'RUNNING'
          ? Math.min(
              visualCrashPoint ?? Number.POSITIVE_INFINITY,
              Math.max(multiplierRef.current, safeCurrentMultiplier),
            )
          : safeCurrentMultiplier;
      multiplierRef.current = displayMultiplier;
      setStatus(state.status);
      setRoundNumber(state.roundNumber);
      setMultiplier(displayMultiplier);
      if (state.status === 'RUNNING') {
        sceneRef.current?.setPreflightMultiplierCap(null);
        sceneRef.current?.setCrashLimit(visualCrashPoint);
        sceneRef.current?.setMultiplier(displayMultiplier, state.elapsedMs);
      }
      if (state.newBalance) setBalance(state.newBalance);

      if (state.status === 'CRASHED') {
        const finalMultiplier = state.crashPoint ?? state.currentMultiplier;
        crashPointRef.current = finalMultiplier;
        visualCrashPointRef.current = finalMultiplier;
        setCrashPoint(finalMultiplier);
        sceneRef.current?.setCrashLimit(finalMultiplier);
        if (finalizedRoundRef.current !== state.roundId) {
          finalizedRoundRef.current = state.roundId;
          setHistory((h) => [finalMultiplier, ...h].slice(0, 20));
          const bet = myBetRef.current;
          if (bet) {
            setMyHistory((prev) =>
              [
                {
                  id: `${Date.now()}-${Math.random()}`,
                  timestamp: Date.now(),
                  betAmount: bet.amount,
                  multiplier: 0,
                  payout: 0,
                  won: false,
                  detail: `Crashed @ ${formatCrashMultiplier(finalMultiplier)}`,
                },
                ...prev,
              ].slice(0, 30),
            );
          }
        }
      } else if (state.status === 'RUNNING') {
        crashPointRef.current = null;
        setCrashPoint(null);
      }
    },
    [clearOptimisticFlight, setBalance],
  );

  const scheduleRoundPoll = useCallback(
    (roundId: string) => {
      clearRoundPoll();
      const tick = async () => {
        try {
          const res = await api.get<CrashSoloRoundState>(
            `/games/crash/round/${encodeURIComponent(roundId)}`,
          );
          handleRoundState(res.data);
          if (res.data.status === 'RUNNING') {
            roundPollRef.current = window.setTimeout(tick, nextRoundPollDelay(res.data));
          } else {
            clearRoundPoll();
          }
        } catch (err) {
          setError(extractApiError(err).message);
          clearRoundPoll();
        }
      };
      roundPollRef.current = window.setTimeout(tick, 60);
    },
    [clearRoundPoll, handleRoundState],
  );

  useEffect(() => {
    finalizedRoundRef.current = null;
    clearRoundPoll();
    clearOptimisticFlight();
    setRoundNumber(null);
    setStatus('BETTING');
    statusRef.current = 'BETTING';
    multiplierRef.current = 1;
    setMultiplier(1);
    setCrashPoint(null);
    visualCrashPointRef.current = null;
    api
      .get<{ multipliers?: number[] }>('/games/crash/history', {
        params: { gameId: config.gameId },
      })
      .then((res) => {
        const multipliers = Array.isArray(res.data.multipliers)
          ? res.data.multipliers.filter((value) => Number.isFinite(value) && value > 0)
          : [];
        setHistory(multipliers.slice(0, 20));
      })
      .catch(() => undefined);
    return () => {
      clearRoundPoll();
      clearOptimisticFlight();
    };
  }, [clearOptimisticFlight, clearRoundPoll, config.gameId]);

  useEffect(() => {
    setSimulatedLiveBets(createSimulatedCrashBets(config.gameId));
    const timer = window.setInterval(
      () => {
        setSimulatedLiveBets((current) => updateSimulatedCrashBets(config.gameId, current));
      },
      850 + (hashString(config.gameId) % 650),
    );
    return () => window.clearInterval(timer);
  }, [config.gameId]);

  const submitCrashBet = useCallback(
    async (
      betAmount: number,
      options?: { silentAuth?: boolean },
    ): Promise<boolean> => {
      if (!user) {
        if (!options?.silentAuth) requireLogin();
        return Promise.resolve(false);
      }
      const currentBalance = Number.parseFloat(useAuthStore.getState().user?.balance ?? '0');
      if (betAmount < MIN_BET_AMOUNT) {
        setError(`最低下注為 ${formatAmount(MIN_BET_AMOUNT)}。`);
        return Promise.resolve(false);
      }
      if (betAmount > MAX_BET_AMOUNT) {
        setError(`單注上限為 ${formatAmount(MAX_BET_AMOUNT)}。`);
        return Promise.resolve(false);
      }
      if (betAmount > currentBalance) {
        setError(t.bet.insufficientBalance);
        return Promise.resolve(false);
      }
      try {
        clearRoundPoll();
        startOptimisticFlight(betAmount);
        const res = await api.post<CrashBetStartResponse>('/games/crash/bet', {
          gameId: config.gameId,
          amount: betAmount,
        });
        const placedBet = {
          amount: betAmount,
          roundId: res.data.roundId,
          betId: res.data.betId,
          payout: res.data.payout,
        };
        myBetRef.current = placedBet;
        finalizedRoundRef.current = null;
        setMyBet(placedBet);
        setError(null);
        setBalance(res.data.newBalance ?? (currentBalance - betAmount).toFixed(2));
        handleRoundState(res.data);
        if (res.data.status === 'RUNNING') scheduleRoundPoll(res.data.roundId);
        return true;
      } catch (err) {
        clearOptimisticFlight();
        statusRef.current = 'BETTING';
        multiplierRef.current = 1;
        myBetRef.current = null;
        setStatus('BETTING');
        setMultiplier(1);
        setCrashPoint(null);
        setMyBet(null);
        sceneRef.current?.startBetting(0);
        setError(extractApiError(err).message);
        return false;
      }
    },
    [
      clearRoundPoll,
      clearOptimisticFlight,
      config.gameId,
      handleRoundState,
      requireLogin,
      scheduleRoundPoll,
      setBalance,
      startOptimisticFlight,
      t.bet.insufficientBalance,
      user,
    ],
  );

  const handlePlaceBet = () => {
    void submitCrashBet(amount);
  };

  const stopAutoBet = useCallback(
    (reason?: string, _cancelQueued = true): void => {
      autoBetActiveRef.current = false;
      autoBetSubmittingRef.current = false;
      autoBetSettingsRef.current = null;
      setAutoBetActive(false);
      setAutoBetStopReason(reason ?? t.games.crash.autoStopped);
    },
    [t.games.crash.autoStopped],
  );

  const finishAutoBetSubmission = useCallback(() => {
    if (!autoBetActiveRef.current) return;
    const remaining = autoBetRemainingRef.current;
    if (remaining === null) return;
    const nextRemaining = Math.max(0, remaining - 1);
    autoBetRemainingRef.current = nextRemaining;
    setAutoBetRemaining(nextRemaining);
    if (nextRemaining <= 0) {
      stopAutoBet(t.games.crash.autoFinished, false);
    }
  }, [stopAutoBet, t.games.crash.autoFinished]);

  const tryAutoBet = useCallback(async () => {
    if (!autoBetActiveRef.current || autoBetSubmittingRef.current) return;
    const settings = autoBetSettingsRef.current;
    if (!settings) return;
    const remaining = autoBetRemainingRef.current;
    if (remaining !== null && remaining <= 0) {
      stopAutoBet(t.games.crash.autoFinished, false);
      return;
    }
    if (!userIdRef.current) {
      stopAutoBet(t.games.crash.autoFailed, true);
      return;
    }
    if (statusRef.current === 'RUNNING') return;

    autoBetSubmittingRef.current = true;
    const ok = await submitCrashBet(settings.amount, { silentAuth: true });
    autoBetSubmittingRef.current = false;
    if (!autoBetActiveRef.current) return;
    if (!ok) {
      stopAutoBet(t.games.crash.autoFailed, true);
      return;
    }
    finishAutoBetSubmission();
  }, [
    finishAutoBetSubmission,
    stopAutoBet,
    submitCrashBet,
    t.games.crash.autoFailed,
    t.games.crash.autoFinished,
  ]);

  useEffect(() => {
    if (!autoBetActive) return;
    const timer = window.setTimeout(() => {
      void tryAutoBet();
    }, 90);
    return () => window.clearTimeout(timer);
  }, [autoBetActive, myBet, status, tryAutoBet]);

  const openAutoBetSettings = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoBetActive) return;
    setAutoBetDraft(createCrashAutoDraft(amount));
    setAutoBetStopReason('');
    setAutoBetOpen(true);
  };

  const updateAutoBetDraft = (field: keyof CrashAutoDraft, value: string) => {
    setAutoBetDraft((prev) => ({ ...prev, [field]: value }));
  };

  const startAutoBet = () => {
    if (!user) {
      requireLogin();
      return;
    }
    const settings = parseCrashAutoSettings(autoBetDraft);
    if (!settings) {
      const draftAmount = roundCurrency(Number.parseFloat(autoBetDraft.amount));
      if (!Number.isFinite(draftAmount) || draftAmount < MIN_BET_AMOUNT) {
        setError(`最低下注為 ${formatAmount(MIN_BET_AMOUNT)}。`);
      } else if (draftAmount > MAX_BET_AMOUNT) {
        setError(`單注上限為 ${formatAmount(MAX_BET_AMOUNT)}。`);
      }
      return;
    }
    const currentBalance = Number.parseFloat(useAuthStore.getState().user?.balance ?? '0');
    if (settings.amount > currentBalance) {
      setError(t.bet.insufficientBalance);
      return;
    }
    autoBetSettingsRef.current = settings;
    autoBetRemainingRef.current = settings.rounds;
    autoBetActiveRef.current = true;
    autoBetSubmittingRef.current = false;
    setAmount(settings.amount);
    setAutoBetRemaining(settings.rounds);
    setAutoBetStopReason('');
    setAutoBetOpen(false);
    setAutoBetActive(true);
    window.setTimeout(() => {
      void tryAutoBet();
    }, 0);
  };

  const autoSettingsPreview = parseCrashAutoSettings(autoBetDraft);
  const autoBetButtonLabel = autoBetActive ? t.games.crash.autoBotStop : t.games.crash.autoBot;
  const autoBetButtonValue = autoBetActive
    ? autoBetRemaining === null
      ? '∞'
      : `${t.games.crash.autoRemaining} ${autoBetRemaining}`
    : t.games.crash.autoBotSettings;
  const controlsLocked = autoBetActive || status === 'RUNNING';
  const canShowCurrentBetButton = status !== 'RUNNING';
  const stageHistory = history.slice(0, 12);
  const mobileLiveBetRows = simulatedLiveBets.slice(0, 12);
  const autoBetDialog = autoBetOpen ? (
    <div
      className="slot-auto-modal crash-auto-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crash-auto-title"
    >
      <div className="slot-auto-modal__panel crash-auto-modal__panel">
        <div className="slot-auto-modal__header">
          <div>
            <span>{t.games.crash.autoBot}</span>
            <strong id="crash-auto-title">{meta.title}</strong>
          </div>
          <button type="button" onClick={() => setAutoBetOpen(false)} aria-label={t.common.close}>
            {t.common.close}
          </button>
        </div>

        <div className="slot-auto-modal__body">
          <label className="slot-auto-field">
            <span>{t.games.crash.autoBetCount}</span>
            <input
              type="text"
              inputMode="numeric"
              value={autoBetDraft.rounds}
              onChange={(event) => updateAutoBetDraft('rounds', event.target.value)}
            />
          </label>
          <div className="slot-auto-presets crash-auto-presets">
            {CRASH_AUTO_ROUND_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => updateAutoBetDraft('rounds', preset)}
                className={autoBetDraft.rounds === preset ? 'slot-auto-preset--active' : ''}
              >
                {preset === '∞' ? t.games.crash.infinite : preset}
              </button>
            ))}
          </div>

          <div className="slot-auto-grid">
            <label className="slot-auto-field">
              <span>{t.games.crash.autoBetAmount}</span>
              <input
                type="number"
                min={MIN_BET_AMOUNT}
                max={MAX_BET_AMOUNT}
                step={0.01}
                value={autoBetDraft.amount}
                onChange={(event) => updateAutoBetDraft('amount', event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="slot-auto-modal__footer">
          <div className="slot-auto-summary">
            <span>{t.games.crash.autoBotActive}</span>
            <strong>
              {autoSettingsPreview ? formatAmount(autoSettingsPreview.amount) : '—'}
            </strong>
          </div>
          <div className="slot-auto-actions">
            <button type="button" onClick={() => setAutoBetOpen(false)}>
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={startAutoBet}
              disabled={!autoSettingsPreview || (!!user && balance < autoSettingsPreview.amount)}
            >
              {t.games.crash.autoBotStart}
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <GameHeader
        artwork={`/games/${config.gameId}.jpg`}
        section={config.section}
        breadcrumb={config.breadcrumb}
        title={meta.title}
        titleSuffix={meta.suffix}
        titleSuffixColor={config.accent}
        description={meta.desc}
        rtpLabel={t.games.crash.rtp}
        rtpAccent={config.accent}
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">{meta.title}</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">{meta.suffix}</span>
              <GameActivityHeat gameId={config.gameId} />
              <div className="flex items-center gap-3 text-white/72">
                {status === 'BETTING' && (
                  <span className="text-[#7DD3FC]">
                    <span className="dot-online dot-online" />
                    即開
                  </span>
                )}
                {status === 'RUNNING' && (
                  <span className="text-[#6EE7B7]">
                    <span className="dot-online dot-online" />
                    {config.runningLabel ?? t.games.crash.running}
                  </span>
                )}
                {status === 'CRASHED' && (
                  <span className="text-[#FCA5A5]">{t.games.crash.crashed}</span>
                )}
                <span className="hidden text-white/55 md:inline">
                  #{roundNumber ?? '—'}
                </span>
              </div>
            </div>

            <div ref={canvasShellRef} className="game-canvas-shell game-canvas-wide relative aspect-[16/7] w-full overflow-hidden">
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
              {stageHistory.length > 0 && (
                <div className="crash-history-strip" aria-label={t.games.crash.recentCrashes}>
                  {stageHistory.map((m, i) => (
                    <span
                      key={`${m}-${i}`}
                      className={`crash-history-chip ${
                        m >= 10
                          ? 'crash-history-chip--hot'
                          : m >= 2
                            ? 'crash-history-chip--win'
                            : 'crash-history-chip--low'
                      }`}
                    >
                      {formatCrashMultiplier(m)}
                    </span>
                  ))}
                </div>
              )}
              <div className="crash-mobile-live-bets" aria-label={t.games.crash.liveBets}>
                <div className="crash-mobile-live-bets__header">
                  <span>{t.games.crash.liveBets}</span>
                  <strong>
                    {t.common.activityHeat} · {simulatedLiveBets.length}
                  </strong>
                </div>
                <div className="crash-mobile-live-bets__table">
                  <div className="crash-mobile-live-bets__head">
                    <span>{t.games.crash.livePlayer}</span>
                    <span>{t.games.crash.liveStake}</span>
                    <span>{t.games.crash.liveCashout}</span>
                  </div>
                  <div className="crash-mobile-live-bets__body">
                    {mobileLiveBetRows.map((p) => (
                      <div className="crash-mobile-live-bets__row" key={p.id}>
                        <span>{p.account}</span>
                        <span className="data-num">{formatAmount(p.amount)}</span>
                        <span className={p.resultMultiplier ? 'text-[#6EE7B7]' : 'text-white/55'}>
                          {p.resultMultiplier
                            ? formatCrashMultiplier(p.resultMultiplier)
                            : t.games.crash.liveWaiting}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="game-side-card p-4">
            <div className="flex items-center justify-between">
              <span className="label">{t.games.crash.recentCrashes}</span>
              <span className="data-num text-[10px] text-white/55">{history.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {history.length === 0 && (
                <span className="text-[10px] tracking-[0.3em] text-white/40">
                  {t.games.crash.noHistory}
                </span>
              )}
              {history.map((m, i) => (
                <span
                  key={i}
                  className={`rounded-[14px] border px-2 py-1.5 font-mono text-[11px] ${
                    m >= 10
                      ? 'border-neon-acid/40 bg-neon-acid/10 text-[#7DD3FC]'
                      : m >= 2
                        ? 'border-neon-toxic/30 bg-neon-toxic/5 text-[#6EE7B7]'
                        : 'border-neon-ember/30 bg-neon-ember/5 text-[#FCA5A5]'
                  }`}
                >
                  {formatCrashMultiplier(m)}
                </span>
              ))}
            </div>
          </div>

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="crash-control-stack game-control-stack space-y-4">
          <div className="crash-control-card game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              disabled={controlsLocked}
            />

            <button
              type="button"
              onClick={
                autoBetActive
                  ? () => stopAutoBet(t.games.crash.autoStopped, true)
                  : openAutoBetSettings
              }
              className={`crash-auto-bot-button slot-auto-button mt-4 ${
                autoBetActive ? 'crash-auto-bot-button--active' : ''
              }`}
              aria-label={autoBetActive ? t.games.crash.autoBotStop : t.games.crash.autoBot}
            >
              <span>{autoBetButtonLabel}</span>
              <strong>{autoBetButtonValue}</strong>
            </button>

            {autoBetStopReason && (
              <div className="slot-auto-status crash-auto-bot-status">
                <span>{t.games.crash.autoBot}</span>
                <strong>{autoBetStopReason}</strong>
              </div>
            )}

            <div className="crash-action-stack mt-6 space-y-2">
              {status === 'RUNNING' ? (
                <button
                  type="button"
                  disabled
                  className="crash-flight-status-button btn-acid w-full py-4"
                >
                  <span>
                    {config.runningLabel ?? t.games.crash.running} ·{' '}
                    {formatAmount(myBet?.amount ?? amount)}
                  </span>
                  <span className="data-num">{formatCrashMultiplier(multiplier)}</span>
                </button>
              ) : canShowCurrentBetButton ? (
                <button
                  type="button"
                  onClick={handlePlaceBet}
                  disabled={!!user && balance < amount}
                  className="btn-acid w-full py-4"
                >
                  → {t.games.crash.placeBet} · {formatAmount(amount)}
                </button>
              ) : null}
              {status === 'CRASHED' && myBet && (
                <div className="game-result-card game-result-card-loss text-center">
                  <div className="font-display text-xl text-[#FCA5A5]">{t.games.crash.busted}</div>
                </div>
              )}
              <div className="game-balance-strip mt-3">
                <span>
                  MULTI{' '}
                  <span className="data-num ml-1 text-[#7DD3FC]">
                    {formatCrashMultiplier(multiplier)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="game-side-card p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="label">{t.games.crash.liveBets}</span>
              <span className="data-num text-[10px] text-white/55">{simulatedLiveBets.length}</span>
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto text-[11px]">
              {simulatedLiveBets.slice(0, 30).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-2 py-1.5"
                >
                  <span className="font-mono text-white/75">{p.account}</span>
                  <span className="data-num text-white/85">{formatAmount(p.amount)}</span>
                  <span
                    className={`data-num ${p.resultMultiplier ? 'text-[#7DD3FC]' : 'text-white/55'}`}
                  >
                    {p.resultMultiplier ? formatCrashMultiplier(p.resultMultiplier) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <RecentBetsList records={myHistory} title="我的注單" />
        </div>
      </div>
      {autoBetDialog}
    </div>
  );
}
