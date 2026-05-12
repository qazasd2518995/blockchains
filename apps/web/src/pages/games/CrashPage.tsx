import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { MIN_BET_AMOUNT, type CrashPlayerBet, type CrashRoundSnapshot } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount } from '@/lib/utils';
import { getCrashSocket, disconnectCrashSocket } from '@/lib/socket';
import { useTranslation } from '@/i18n/useTranslation';
import { CrashScene } from '@/games/crash/CrashScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import type { CrashGameConfig } from './crashConfigs';

interface Props {
  config: CrashGameConfig;
}

type LocalCrashBet = { amount: number; cashed: boolean; payout?: string };
type QueuedCrashBet = { amount: number; autoCashOut?: number; roundNumber?: number };
type CrashAutoSettings = { rounds: number | null; amount: number; autoCashOut: number };
type CrashAutoDraft = { rounds: string; amount: string; autoCashOut: string };
type SimulatedCrashBet = {
  id: string;
  account: string;
  amount: number;
  cashoutAt: number | null;
};
const MIN_CASHOUT_MULTIPLIER = 1.01;
const CRASH_AUTO_ROUND_PRESETS = ['∞', '10', '100'];
const SIMULATED_LIVE_MIN = 10;
const SIMULATED_LIVE_MAX = 28;
let simulatedLiveBetSerial = 0;

function formatCrashMultiplier(value: string | number): string {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(1)}×`;
}

function createCrashAutoDraft(amount: number, autoCashOut: string): CrashAutoDraft {
  return {
    rounds: '∞',
    amount: amount.toFixed(2),
    autoCashOut: autoCashOut.trim() || '2.00',
  };
}

function parseCrashAutoSettings(draft: CrashAutoDraft): CrashAutoSettings | null {
  const roundsRaw = draft.rounds.trim();
  const rounds =
    roundsRaw === '∞'
      ? null
      : Math.max(1, Math.min(1000, Math.floor(Number.parseFloat(roundsRaw))));
  const amount = roundCurrency(Number.parseFloat(draft.amount));
  const autoCashOut = Number.parseFloat(draft.autoCashOut);
  if (roundsRaw !== '∞' && !Number.isFinite(rounds)) return null;
  if (!Number.isFinite(amount) || amount < MIN_BET_AMOUNT) return null;
  if (!Number.isFinite(autoCashOut) || autoCashOut < MIN_CASHOUT_MULTIPLIER) return null;
  return {
    rounds,
    amount,
    autoCashOut: Number(autoCashOut.toFixed(4)),
  };
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(2));
}

function createSimulatedCrashBets(gameId: string): SimulatedCrashBet[] {
  const count = SIMULATED_LIVE_MIN + (hashString(gameId) % 10) + Math.floor(Math.random() * 6);
  return Array.from({ length: Math.min(SIMULATED_LIVE_MAX, count) }, () =>
    createSimulatedCrashBet(gameId),
  );
}

function updateSimulatedCrashBets(gameId: string, current: SimulatedCrashBet[]) {
  const next = current.map((bet) =>
    bet.cashoutAt === null && Math.random() > 0.76
      ? { ...bet, cashoutAt: randomSimulatedCashout() }
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
    cashoutAt: Math.random() > 0.62 ? randomSimulatedCashout() : null,
  };
}

function createMaskedAccount() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const prefix = letters[Math.floor(Math.random() * letters.length)] ?? 'a';
  const suffix = String(10 + Math.floor(Math.random() * 90));
  return `${prefix}******${suffix}`;
}

function createSimulatedStake() {
  const weighted = Math.random() ** 1.85;
  const amount = 10 + Math.floor((weighted * 19990) / 10) * 10;
  return Math.max(10, Math.min(20000, amount));
}

function randomSimulatedCashout() {
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
  const [autoCashOut, setAutoCashOut] = useState('');
  const [multiplier, setMultiplier] = useState(1.0);
  const [status, setStatus] = useState<'BETTING' | 'RUNNING' | 'CRASHED'>('BETTING');
  const [snapshot, setSnapshot] = useState<CrashRoundSnapshot | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [myBet, setMyBet] = useState<LocalCrashBet | null>(null);
  const [queuedBet, setQueuedBet] = useState<QueuedCrashBet | null>(null);
  const [players, setPlayers] = useState<CrashPlayerBet[]>([]);
  const [simulatedLiveBets, setSimulatedLiveBets] = useState<SimulatedCrashBet[]>(() =>
    createSimulatedCrashBets(config.gameId),
  );
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bettingCountdown, setBettingCountdown] = useState(0);
  const [myHistory, setMyHistory] = useState<RecentBetRecord[]>([]);
  const [autoBetOpen, setAutoBetOpen] = useState(false);
  const [autoBetDraft, setAutoBetDraft] = useState<CrashAutoDraft>(() =>
    createCrashAutoDraft(10, ''),
  );
  const [autoBetActive, setAutoBetActive] = useState(false);
  const [autoBetRemaining, setAutoBetRemaining] = useState<number | null>(null);
  const [autoBetStopReason, setAutoBetStopReason] = useState('');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CrashScene | null>(null);
  const myBetRef = useRef<LocalCrashBet | null>(null);
  const queuedBetRef = useRef<QueuedCrashBet | null>(null);
  const appliedCashoutRef = useRef(false);
  const statusRef = useRef(status);
  const bettingCountdownRef = useRef(bettingCountdown);
  const crashPointRef = useRef(crashPoint);
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
    queuedBetRef.current = queuedBet;
  }, [queuedBet]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    bettingCountdownRef.current = bettingCountdown;
  }, [bettingCountdown]);

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
      scene.startBetting(bettingCountdownRef.current);
      scene.setCountdown(bettingCountdownRef.current);
      return;
    }

    if (statusRef.current === 'RUNNING') {
      scene.startRunning();
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
    if (!canvas) return;
    let cancelled = false;
    let scene: CrashScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      const nextScene = new CrashScene();
      scene = nextScene;
      void nextScene
        .init(canvas, w, h, config.variant ?? 'rocket')
        .then(() => {
          if (cancelled) {
            nextScene.dispose();
            return;
          }
          sceneRef.current = nextScene;
          applySceneState(nextScene);
        })
        .catch((err) => {
          if (!cancelled) console.error(err);
          if (sceneRef.current === nextScene) sceneRef.current = null;
        });
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
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
      sceneRef.current.startBetting(bettingCountdown);
    }
  }, [status]);

  useEffect(() => {
    if (!sceneRef.current) return;
    if (status === 'BETTING') {
      sceneRef.current.setCountdown(bettingCountdown);
    }
  }, [bettingCountdown, status]);

  useEffect(() => {
    if (!sceneRef.current) return;
    if (status === 'RUNNING') {
      sceneRef.current.startRunning();
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

  const applyCashoutResult = useCallback(
    (result: { payout: string; newBalance?: string; multiplier?: number }) => {
      const bet = myBetRef.current;
      if (!bet || bet.cashed || appliedCashoutRef.current) return false;
      appliedCashoutRef.current = true;

      const payoutNumber = Number.parseFloat(result.payout);
      const payoutMult =
        result.multiplier ??
        (Number.isFinite(payoutNumber) && bet.amount > 0
          ? payoutNumber / bet.amount
          : multiplierRef.current);
      const updatedBet = { ...bet, cashed: true, payout: result.payout };
      myBetRef.current = updatedBet;
      setMyBet(updatedBet);
      setError(null);

      if (result.newBalance) {
        setBalance(result.newBalance);
      } else if (Number.isFinite(payoutNumber)) {
        const currentBalance = Number.parseFloat(useAuthStore.getState().user?.balance ?? '0');
        if (Number.isFinite(currentBalance)) {
          setBalance((currentBalance + payoutNumber).toFixed(2));
        }
      }

      sceneRef.current?.celebrateCashout(payoutMult);
      sceneRef.current?.playWinFx(payoutMult, true);
      setMyHistory((prev) =>
        [
          {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: Date.now(),
            betAmount: bet.amount,
            multiplier: payoutMult,
            payout: Number.isFinite(payoutNumber) ? payoutNumber : bet.amount * payoutMult,
            won: true,
            detail: `Cashed @ ${formatCrashMultiplier(payoutMult)}`,
          },
          ...prev,
        ].slice(0, 30),
      );
      return true;
    },
    [setBalance],
  );

  useEffect(() => {
    const socket = getCrashSocket(config.gameId);

    const syncBettingCountdown = (snap: CrashRoundSnapshot) => {
      if (snap.bettingEndsAt) {
        const end = new Date(snap.bettingEndsAt).getTime();
        if (countdownRef.current) clearInterval(countdownRef.current);
        const tick = () => {
          const left = Math.max(0, end - Date.now());
          const nextCountdown = Math.ceil(left / 1000);
          bettingCountdownRef.current = nextCountdown;
          setBettingCountdown(nextCountdown);
          if (left <= 0 && countdownRef.current) clearInterval(countdownRef.current);
        };
        tick();
        countdownRef.current = setInterval(tick, 100);
      }
    };

    const onSnapshot = (snap: CrashRoundSnapshot) => {
      statusRef.current = snap.status;
      setSnapshot(snap);
      setStatus(snap.status);
      if (snap.status === 'BETTING') {
        crashPointRef.current = null;
        multiplierRef.current = 1.0;
        setCrashPoint(null);
        setMultiplier(1.0);
        syncBettingCountdown(snap);
      }
    };

    const onBetting = (snap: CrashRoundSnapshot) => {
      statusRef.current = 'BETTING';
      crashPointRef.current = null;
      multiplierRef.current = 1.0;
      setSnapshot(snap);
      setStatus('BETTING');
      setCrashPoint(null);
      myBetRef.current = null;
      appliedCashoutRef.current = false;
      setMyBet(null);
      setMultiplier(1.0);
      syncBettingCountdown(snap);
    };

    const onRunning = () => {
      statusRef.current = 'RUNNING';
      setStatus('RUNNING');
    };

    const onTick = (payload: { multiplier: number }) => {
      multiplierRef.current = payload.multiplier;
      setMultiplier(payload.multiplier);
    };

    const onCrashed = (payload: { finalMultiplier: number; serverSeed: string }) => {
      statusRef.current = 'CRASHED';
      multiplierRef.current = payload.finalMultiplier;
      crashPointRef.current = payload.finalMultiplier;
      setStatus('CRASHED');
      setMultiplier(payload.finalMultiplier);
      setCrashPoint(payload.finalMultiplier);
      setHistory((h) => [payload.finalMultiplier, ...h].slice(0, 20));
      // 玩家本局有下注但沒 cashout → 記為輸局
      setMyBet((b) => {
        if (b && !b.cashed) {
          setMyHistory((prev) =>
            [
              {
                id: `${Date.now()}-${Math.random()}`,
                timestamp: Date.now(),
                betAmount: b.amount,
                multiplier: 0,
                payout: 0,
                won: false,
                detail: `Crashed @ ${formatCrashMultiplier(payload.finalMultiplier)}`,
              },
              ...prev,
            ].slice(0, 30),
          );
        }
        return b;
      });
    };

    const onBetsUpdate = (payload: { players: CrashPlayerBet[] }) => {
      setPlayers(payload.players);
      const currentUserId = userIdRef.current;
      if (!currentUserId) return;
      const ownBet = payload.players.find((p) => p.userId === currentUserId);
      if (ownBet && !ownBet.cashedOutAt) {
        const activeAmount = Number.parseFloat(ownBet.amount);
        if (Number.isFinite(activeAmount)) {
          const restoredBet = { amount: activeAmount, cashed: false };
          myBetRef.current = restoredBet;
          setMyBet(restoredBet);
          queuedBetRef.current = null;
          setQueuedBet(null);
        }
      }
      if (ownBet?.cashedOutAt && ownBet.payout) {
        applyCashoutResult({
          payout: ownBet.payout,
          multiplier: ownBet.cashedOutAt,
        });
      }
    };

    const onHistory = (payload: { multipliers?: number[] }) => {
      const multipliers = Array.isArray(payload.multipliers)
        ? payload.multipliers.filter((value) => Number.isFinite(value) && value > 0)
        : [];
      setHistory(multipliers.slice(0, 20));
    };

    const onBetQueued = (payload: {
      amount: string;
      autoCashOut?: number;
      roundNumber?: number;
    }) => {
      const queuedAmount = Number.parseFloat(payload.amount);
      if (!Number.isFinite(queuedAmount)) return;
      const queued = {
        amount: queuedAmount,
        autoCashOut: payload.autoCashOut,
        roundNumber: payload.roundNumber,
      };
      queuedBetRef.current = queued;
      setQueuedBet(queued);
      setError(null);
    };

    const onBetConfirmed = (payload: {
      amount: string;
      autoCashOut?: number;
      newBalance?: string;
      roundNumber?: number;
    }) => {
      const confirmedAmount = Number.parseFloat(payload.amount);
      if (!Number.isFinite(confirmedAmount)) return;
      const placedBet = { amount: confirmedAmount, cashed: false };
      queuedBetRef.current = null;
      myBetRef.current = placedBet;
      appliedCashoutRef.current = false;
      setQueuedBet(null);
      setMyBet(placedBet);
      setError(null);
      if (payload.newBalance) setBalance(payload.newBalance);
    };

    const onBetQueueFailed = (payload: { error?: string }) => {
      queuedBetRef.current = null;
      setQueuedBet(null);
      setError(payload.error ?? 'NEXT ROUND BET FAILED');
      if (autoBetActiveRef.current) {
        autoBetActiveRef.current = false;
        autoBetSubmittingRef.current = false;
        autoBetSettingsRef.current = null;
        setAutoBetActive(false);
        setAutoBetStopReason(payload.error ?? t.games.crash.autoFailed);
      }
    };

    const onBetQueueCanceled = () => {
      queuedBetRef.current = null;
      setQueuedBet(null);
    };

    socket.on('round:snapshot', onSnapshot);
    socket.on('round:betting', onBetting);
    socket.on('round:running', onRunning);
    socket.on('round:tick', onTick);
    socket.on('round:crashed', onCrashed);
    socket.on('bets:update', onBetsUpdate);
    socket.on('round:history', onHistory);
    socket.on('bet:queued', onBetQueued);
    socket.on('bet:confirmed', onBetConfirmed);
    socket.on('bet:queue_failed', onBetQueueFailed);
    socket.on('bet:queue_canceled', onBetQueueCanceled);

    return () => {
      socket.off('round:snapshot', onSnapshot);
      socket.off('round:betting', onBetting);
      socket.off('round:running', onRunning);
      socket.off('round:tick', onTick);
      socket.off('round:crashed', onCrashed);
      socket.off('bets:update', onBetsUpdate);
      socket.off('round:history', onHistory);
      socket.off('bet:queued', onBetQueued);
      socket.off('bet:confirmed', onBetConfirmed);
      socket.off('bet:queue_failed', onBetQueueFailed);
      socket.off('bet:queue_canceled', onBetQueueCanceled);
      if (countdownRef.current) clearInterval(countdownRef.current);
      disconnectCrashSocket(config.gameId);
    };
  }, [applyCashoutResult, config.gameId, setBalance, t.games.crash.autoFailed]);

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
    (
      betAmount: number,
      autoCashOutValue?: number,
      options?: { silentAuth?: boolean },
    ): Promise<boolean> => {
      if (!user) {
        if (!options?.silentAuth) requireLogin();
        return Promise.resolve(false);
      }
      const currentBalance = Number.parseFloat(useAuthStore.getState().user?.balance ?? '0');
      if (betAmount < MIN_BET_AMOUNT || betAmount > currentBalance) {
        setError(t.bet.insufficientBalance);
        return Promise.resolve(false);
      }
      if (
        autoCashOutValue !== undefined &&
        (!Number.isFinite(autoCashOutValue) || autoCashOutValue < MIN_CASHOUT_MULTIPLIER)
      ) {
        setError(`AUTO CASHOUT MIN ${MIN_CASHOUT_MULTIPLIER.toFixed(2)}X`);
        return Promise.resolve(false);
      }

      return new Promise((resolve) => {
        const socket = getCrashSocket(config.gameId);
        socket.emit(
          'bet:place',
          {
            amount: betAmount,
            autoCashOut:
              autoCashOutValue !== undefined ? Number(autoCashOutValue.toFixed(4)) : undefined,
          },
          (res: {
            ok: boolean;
            error?: string;
            newBalance?: string;
            queued?: boolean;
            roundNumber?: number;
          }) => {
            if (!res.ok) {
              setError(res.error ?? 'BET FAILED');
              resolve(false);
              return;
            }
            setError(null);
            if (res.queued) {
              const queued = {
                amount: betAmount,
                autoCashOut: autoCashOutValue,
                roundNumber: res.roundNumber,
              };
              queuedBetRef.current = queued;
              setQueuedBet(queued);
              resolve(true);
              return;
            }
            const placedBet = { amount: betAmount, cashed: false };
            myBetRef.current = placedBet;
            appliedCashoutRef.current = false;
            setMyBet(placedBet);
            setBalance(res.newBalance ?? (currentBalance - betAmount).toFixed(2));
            resolve(true);
          },
        );
      });
    },
    [config.gameId, requireLogin, setBalance, t.bet.insufficientBalance, user],
  );

  const handlePlaceBet = () => {
    const autoCO = Number.parseFloat(autoCashOut);
    if (autoCashOut.trim() && (!Number.isFinite(autoCO) || autoCO < MIN_CASHOUT_MULTIPLIER)) {
      setError(`AUTO CASHOUT MIN ${MIN_CASHOUT_MULTIPLIER.toFixed(2)}X`);
      return;
    }
    void submitCrashBet(
      amount,
      Number.isFinite(autoCO) && autoCO >= MIN_CASHOUT_MULTIPLIER ? autoCO : undefined,
    );
  };

  const handleCashOut = () => {
    if (!user || !myBet || myBet.cashed) return;
    if (status !== 'RUNNING') return;
    if (multiplier < MIN_CASHOUT_MULTIPLIER) {
      setError(`CASHOUT AVAILABLE FROM ${MIN_CASHOUT_MULTIPLIER.toFixed(2)}X`);
      return;
    }
    const socket = getCrashSocket(config.gameId);
    socket.emit(
      'bet:cashout',
      {},
      (res: {
        ok: boolean;
        error?: string;
        payout?: string;
        newBalance?: string;
        multiplier?: number;
      }) => {
        if (!res.ok) {
          if (res.error?.toLowerCase().includes('no active bet') && myBetRef.current?.cashed) {
            setError(null);
            return;
          }
          setError(res.error ?? 'CASHOUT FAILED');
          return;
        }
        if (res.payout) {
          applyCashoutResult({
            payout: res.payout,
            newBalance: res.newBalance,
            multiplier: res.multiplier,
          });
        }
      },
    );
  };

  const stopAutoBet = useCallback(
    (reason?: string, cancelQueued = true): void => {
      autoBetActiveRef.current = false;
      autoBetSubmittingRef.current = false;
      autoBetSettingsRef.current = null;
      setAutoBetActive(false);
      setAutoBetStopReason(reason ?? t.games.crash.autoStopped);
      if (cancelQueued && queuedBetRef.current) {
        const socket = getCrashSocket(config.gameId);
        socket.emit('bet:cancelQueued', {}, () => undefined);
        queuedBetRef.current = null;
        setQueuedBet(null);
      }
    },
    [config.gameId, t.games.crash.autoStopped],
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
    if (queuedBetRef.current) return;
    if (statusRef.current === 'BETTING' && myBetRef.current) return;

    autoBetSubmittingRef.current = true;
    const ok = await submitCrashBet(settings.amount, settings.autoCashOut, { silentAuth: true });
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
  }, [
    autoBetActive,
    bettingCountdown,
    myBet,
    queuedBet,
    snapshot?.roundNumber,
    status,
    tryAutoBet,
  ]);

  const openAutoBetSettings = () => {
    if (!user) {
      requireLogin();
      return;
    }
    if (autoBetActive) return;
    setAutoBetDraft(createCrashAutoDraft(amount, autoCashOut));
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
      setError(`AUTO CASHOUT MIN ${MIN_CASHOUT_MULTIPLIER.toFixed(2)}X`);
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
    setAutoCashOut(settings.autoCashOut.toFixed(2));
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
  const controlsLocked =
    autoBetActive || (status === 'BETTING' && (Boolean(myBet) || Boolean(queuedBet)));
  const liveCashoutPayout =
    status === 'RUNNING' && myBet && !myBet.cashed ? myBet.amount * multiplier : 0;
  const canShowCurrentBetButton = status === 'BETTING' && !myBet && !queuedBet;
  const canShowNextRoundBetButton = status !== 'BETTING';
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
                step={0.01}
                value={autoBetDraft.amount}
                onChange={(event) => updateAutoBetDraft('amount', event.target.value)}
              />
            </label>
            <label className="slot-auto-field">
              <span>{t.games.crash.autoCashoutRate}</span>
              <input
                type="number"
                min={MIN_CASHOUT_MULTIPLIER}
                step={0.01}
                value={autoBetDraft.autoCashOut}
                onChange={(event) => updateAutoBetDraft('autoCashOut', event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="slot-auto-modal__footer">
          <div className="slot-auto-summary">
            <span>{t.games.crash.autoBotActive}</span>
            <strong>
              {autoSettingsPreview
                ? `${formatAmount(autoSettingsPreview.amount)} · ${formatCrashMultiplier(
                    autoSettingsPreview.autoCashOut,
                  )}`
                : '—'}
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
                    {t.games.crash.betting} · {bettingCountdown}
                    {t.games.crash.seconds}
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
                  #{snapshot?.roundNumber ?? '—'}
                </span>
              </div>
            </div>

            <div className="game-canvas-shell game-canvas-wide relative aspect-[16/7] w-full overflow-hidden">
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
                        <span className={p.cashoutAt ? 'text-[#6EE7B7]' : 'text-white/55'}>
                          {p.cashoutAt
                            ? formatCrashMultiplier(p.cashoutAt)
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

            <div className="crash-auto-cashout mt-5">
              <div className="crash-auto-cashout__label label">{t.games.crash.autoCashout}</div>
              <div className="crash-auto-cashout__field mt-2 rounded-[18px] border border-[#16324A]/10 bg-white/80 p-2 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)]">
                <input
                  type="text"
                  inputMode="decimal"
                  value={autoCashOut}
                  onChange={(e) => setAutoCashOut(e.target.value)}
                  disabled={controlsLocked}
                  placeholder={t.games.crash.autoCashoutPlaceholder}
                  className="crash-auto-cashout__input term-input border-0 bg-transparent text-center font-display text-2xl shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:shadow-none"
                />
              </div>
            </div>

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
              {canShowCurrentBetButton && (
                <button
                  type="button"
                  onClick={handlePlaceBet}
                  disabled={!!user && balance < amount}
                  className="btn-acid w-full py-4"
                >
                  → {t.games.crash.placeBet} · {formatAmount(amount)}
                </button>
              )}
              {status === 'RUNNING' && myBet && !myBet.cashed && (
                <button
                  type="button"
                  onClick={handleCashOut}
                  disabled={multiplier < MIN_CASHOUT_MULTIPLIER}
                  className="btn-acid w-full py-4 text-base"
                >
                  <span className="flex flex-col items-center justify-center gap-1 leading-tight">
                    <span>
                      ⇧ {t.games.crash.cashoutAt} {formatCrashMultiplier(multiplier)}
                    </span>
                    <strong className="data-num text-xl text-white">
                      {formatAmount(liveCashoutPayout)}
                    </strong>
                  </span>
                </button>
              )}
              {canShowNextRoundBetButton && (
                <button
                  type="button"
                  onClick={handlePlaceBet}
                  disabled={!!user && balance < amount}
                  className="btn-acid w-full py-4"
                >
                  → {queuedBet ? t.games.crash.updateNextRoundBet : t.games.crash.nextRoundBet} ·{' '}
                  {formatAmount(amount)}
                </button>
              )}
              {queuedBet && (
                <div className="game-stat-card text-center">
                  <div className="text-[10px] tracking-[0.3em] text-white/55">
                    {t.games.crash.nextRoundQueued}
                    {queuedBet.roundNumber ? ` #${queuedBet.roundNumber}` : ''}
                  </div>
                  <div className="data-num text-lg text-[#7DD3FC]">
                    {formatAmount(queuedBet.amount)}
                  </div>
                </div>
              )}
              {myBet && myBet.cashed && (
                <div className="game-result-card game-result-card-win text-center">
                  <div className="font-display text-xl text-[#7DD3FC]">{t.games.crash.secured}</div>
                  <div className="data-num text-[11px] text-white/75">+{myBet.payout}</div>
                </div>
              )}
              {status === 'CRASHED' && myBet && !myBet.cashed && (
                <div className="game-result-card game-result-card-loss text-center">
                  <div className="font-display text-xl text-[#FCA5A5]">{t.games.crash.busted}</div>
                </div>
              )}
              {status === 'BETTING' && myBet && (
                <div className="game-stat-card text-center">
                  <div className="text-[10px] tracking-[0.3em] text-white/55">
                    {t.games.crash.betPlaced}
                  </div>
                  <div className="data-num text-lg text-[#7DD3FC]">
                    {formatAmount(myBet.amount)}
                  </div>
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
                  <span className={`data-num ${p.cashoutAt ? 'text-[#7DD3FC]' : 'text-white/55'}`}>
                    {p.cashoutAt ? formatCrashMultiplier(p.cashoutAt) : '—'}
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
