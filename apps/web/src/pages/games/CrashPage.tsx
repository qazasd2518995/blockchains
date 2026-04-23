import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { CrashPlayerBet, CrashRoundSnapshot } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { getCrashSocket, disconnectCrashSocket } from '@/lib/socket';
import { useTranslation } from '@/i18n/useTranslation';
import { CrashScene, type CrashVariant } from '@/games/crash/CrashScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

interface CrashGameConfig {
  gameId: string;
  breadcrumb: string;
  section: string;
  accent: 'acid' | 'ember' | 'toxic' | 'ice';
  glyph: string;
  variant?: CrashVariant;
}

interface Props {
  config: CrashGameConfig;
}

type LocalCrashBet = { amount: number; cashed: boolean; payout?: string };

export function CrashPage({ config }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [autoCashOut, setAutoCashOut] = useState('');
  const [multiplier, setMultiplier] = useState(1.0);
  const [status, setStatus] = useState<'BETTING' | 'RUNNING' | 'CRASHED'>('BETTING');
  const [snapshot, setSnapshot] = useState<CrashRoundSnapshot | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [myBet, setMyBet] = useState<LocalCrashBet | null>(null);
  const [players, setPlayers] = useState<CrashPlayerBet[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bettingCountdown, setBettingCountdown] = useState(0);
  const [myHistory, setMyHistory] = useState<RecentBetRecord[]>([]);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CrashScene | null>(null);
  const myBetRef = useRef<LocalCrashBet | null>(null);
  const appliedCashoutRef = useRef(false);
  const multiplierRef = useRef(1.0);
  const userIdRef = useRef<string | null>(user?.id ?? null);

  useEffect(() => {
    myBetRef.current = myBet;
  }, [myBet]);

  useEffect(() => {
    multiplierRef.current = multiplier;
  }, [multiplier]);

  useEffect(() => {
    userIdRef.current = user?.id ?? null;
  }, [user?.id]);

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
      scene = new CrashScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h, config.variant ?? 'rocket');
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [config.variant]);

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
    rocket: { title: t.games.crash.rocketTitle, suffix: t.games.crash.defaultSuffix, desc: t.games.crash.descRocket },
    aviator: { title: t.games.crash.aviatorTitle, suffix: t.games.crash.defaultSuffix, desc: t.games.crash.descAviator },
    'space-fleet': { title: t.games.crash.fleetTitle, suffix: t.games.crash.fleetSuffix, desc: t.games.crash.descFleet },
    jetx: { title: t.games.crash.jetxTitle, suffix: t.games.crash.jetxSuffix, desc: t.games.crash.descJetx },
    balloon: { title: t.games.crash.balloonTitle, suffix: t.games.crash.defaultSuffix, desc: t.games.crash.descBalloon },
    jetx3: { title: t.games.crash.jetx3Title, suffix: t.games.crash.jetx3Suffix, desc: t.games.crash.descJetx3 },
    'double-x': { title: t.games.crash.doubleTitle, suffix: t.games.crash.doubleSuffix, desc: t.games.crash.descDouble },
    'plinko-x': { title: t.games.crash.plinkoXTitle, suffix: t.games.crash.plinkoXSuffix, desc: t.games.crash.descPlinkoX },
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
        const currentBalance = Number.parseFloat(
          useAuthStore.getState().user?.balance ?? '0',
        );
        if (Number.isFinite(currentBalance)) {
          setBalance((currentBalance + payoutNumber).toFixed(2));
        }
      }

      sceneRef.current?.celebrateCashout(payoutMult);
      sceneRef.current?.playWinFx(payoutMult, true);
      setMyHistory((prev) => [
        {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: Date.now(),
          betAmount: bet.amount,
          multiplier: payoutMult,
          payout: Number.isFinite(payoutNumber) ? payoutNumber : bet.amount * payoutMult,
          won: true,
          detail: `Cashed @ ${payoutMult.toFixed(2)}×`,
        },
        ...prev,
      ].slice(0, 30));
      return true;
    },
    [setBalance],
  );

  useEffect(() => {
    const socket = getCrashSocket(config.gameId);

    const onSnapshot = (snap: CrashRoundSnapshot) => {
      setSnapshot(snap);
      setStatus(snap.status);
    };

    const onBetting = (snap: CrashRoundSnapshot) => {
      setSnapshot(snap);
      setStatus('BETTING');
      setCrashPoint(null);
      myBetRef.current = null;
      appliedCashoutRef.current = false;
      setMyBet(null);
      setMultiplier(1.0);
      if (snap.bettingEndsAt) {
        const end = new Date(snap.bettingEndsAt).getTime();
        if (countdownRef.current) clearInterval(countdownRef.current);
        const tick = () => {
          const left = Math.max(0, end - Date.now());
          setBettingCountdown(Math.ceil(left / 1000));
          if (left <= 0 && countdownRef.current) clearInterval(countdownRef.current);
        };
        tick();
        countdownRef.current = setInterval(tick, 100);
      }
    };

    const onRunning = () => setStatus('RUNNING');

    const onTick = (payload: { multiplier: number }) => {
      setMultiplier(payload.multiplier);
    };

    const onCrashed = (payload: { finalMultiplier: number; serverSeed: string }) => {
      setStatus('CRASHED');
      setMultiplier(payload.finalMultiplier);
      setCrashPoint(payload.finalMultiplier);
      setHistory((h) => [payload.finalMultiplier, ...h].slice(0, 20));
      // 玩家本局有下注但沒 cashout → 記為輸局
      setMyBet((b) => {
        if (b && !b.cashed) {
          setMyHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random()}`,
              timestamp: Date.now(),
              betAmount: b.amount,
              multiplier: 0,
              payout: 0,
              won: false,
              detail: `Crashed @ ${payload.finalMultiplier.toFixed(2)}×`,
            },
            ...prev,
          ].slice(0, 30));
        }
        return b;
      });
    };

    const onBetsUpdate = (payload: { players: CrashPlayerBet[] }) => {
      setPlayers(payload.players);
      const currentUserId = userIdRef.current;
      if (!currentUserId) return;
      const ownBet = payload.players.find((p) => p.userId === currentUserId);
      if (ownBet?.cashedOutAt && ownBet.payout) {
        applyCashoutResult({
          payout: ownBet.payout,
          multiplier: ownBet.cashedOutAt,
        });
      }
    };

    socket.on('round:snapshot', onSnapshot);
    socket.on('round:betting', onBetting);
    socket.on('round:running', onRunning);
    socket.on('round:tick', onTick);
    socket.on('round:crashed', onCrashed);
    socket.on('bets:update', onBetsUpdate);

    return () => {
      socket.off('round:snapshot', onSnapshot);
      socket.off('round:betting', onBetting);
      socket.off('round:running', onRunning);
      socket.off('round:tick', onTick);
      socket.off('round:crashed', onCrashed);
      socket.off('bets:update', onBetsUpdate);
      if (countdownRef.current) clearInterval(countdownRef.current);
      disconnectCrashSocket(config.gameId);
    };
  }, [applyCashoutResult, config.gameId]);

  const handlePlaceBet = () => {
    if (!user) return;
    if (status !== 'BETTING') {
      setError(t.bet.roundNotAccepting);
      return;
    }
    if (amount <= 0 || amount > balance) {
      setError(t.bet.insufficientBalance);
      return;
    }
    const socket = getCrashSocket(config.gameId);
    const autoCO = Number.parseFloat(autoCashOut);
    socket.emit(
      'bet:place',
      {
        userId: user.id,
        amount,
        autoCashOut: Number.isFinite(autoCO) && autoCO > 1 ? autoCO : undefined,
      },
      (res: { ok: boolean; error?: string }) => {
        if (!res.ok) {
          setError(res.error ?? 'BET FAILED');
          return;
        }
        setError(null);
        const placedBet = { amount, cashed: false };
        myBetRef.current = placedBet;
        appliedCashoutRef.current = false;
        setMyBet(placedBet);
        setBalance((balance - amount).toFixed(2));
      },
    );
  };

  const handleCashOut = () => {
    if (!user || !myBet || myBet.cashed) return;
    if (status !== 'RUNNING') return;
    const socket = getCrashSocket(config.gameId);
    socket.emit(
      'bet:cashout',
      { userId: user.id },
      (res: { ok: boolean; error?: string; payout?: string; newBalance?: string; multiplier?: number }) => {
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">{meta.title}</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">{meta.suffix}</span>
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
                    {t.games.crash.running}
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

            <div className="game-canvas-shell relative aspect-[16/7] w-full overflow-hidden">
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
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
                  {m.toFixed(2)}×
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

        <div className="space-y-4">
          <div className="game-side-card p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={status !== 'BETTING' || !!myBet}
            />

            <div className="mt-5">
              <div className="label">{t.games.crash.autoCashout}</div>
              <div className="mt-2 rounded-[18px] border border-[#16324A]/10 bg-white/80 p-2 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.35)]">
                <input
                  type="text"
                  value={autoCashOut}
                  onChange={(e) => setAutoCashOut(e.target.value)}
                  disabled={status !== 'BETTING' || !!myBet}
                  placeholder={t.games.crash.autoCashoutPlaceholder}
                  className="term-input border-0 bg-transparent text-center font-display text-2xl shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:shadow-none"
                />
              </div>
            </div>

            <div className="mt-6 space-y-2">
              {status === 'BETTING' && !myBet && (
                <button
                  type="button"
                  onClick={handlePlaceBet}
                  disabled={balance < amount}
                  className="btn-acid w-full py-4"
                >
                  → {t.games.crash.placeBet} · {formatAmount(amount)}
                </button>
              )}
              {status === 'RUNNING' && myBet && !myBet.cashed && (
                <button
                  type="button"
                  onClick={handleCashOut}
                  className="btn-acid w-full py-4 text-base"
                >
                  ⇧ {t.games.crash.cashoutAt} {formatMultiplier(multiplier)}
                </button>
              )}
              {myBet && myBet.cashed && (
                <div className="game-result-card game-result-card-win text-center">
                  <div className="font-display text-xl text-[#7DD3FC]">
                    {t.games.crash.secured}
                  </div>
                  <div className="data-num text-[11px] text-white/75">+{myBet.payout}</div>
                </div>
              )}
              {status === 'CRASHED' && myBet && !myBet.cashed && (
                <div className="game-result-card game-result-card-loss text-center">
                  <div className="font-display text-xl text-[#FCA5A5]">
                    {t.games.crash.busted}
                  </div>
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
                  {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
                </span>
                <span>
                  MULTI <span className="data-num ml-1 text-[#7DD3FC]">{formatMultiplier(multiplier)}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="game-side-card p-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="label">{t.games.crash.liveBets}</span>
              <span className="data-num text-[10px] text-white/55">{players.length}</span>
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto text-[11px]">
              {players.length === 0 && <div className="py-3 text-center text-white/40">—</div>}
              {players.slice(0, 30).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.04] px-2 py-1.5"
                >
                  <span className="font-mono text-white/75">
                    0x{p.userId.slice(-6).toUpperCase()}
                  </span>
                  <span className="data-num text-white/85">{p.amount}</span>
                  <span
                    className={`data-num ${p.cashedOutAt ? 'text-[#7DD3FC]' : 'text-white/55'}`}
                  >
                    {p.cashedOutAt ? `${p.cashedOutAt.toFixed(2)}×` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <RecentBetsList records={myHistory} title="我的注單" />
        </div>
      </div>
    </div>
  );
}

export const CRASH_CONFIGS: Record<string, CrashGameConfig> = {
  rocket: { gameId: 'rocket', breadcrumb: 'ROCKET_10', section: '§ GAME 10', accent: 'acid', glyph: '▲', variant: 'rocket' },
  aviator: { gameId: 'aviator', breadcrumb: 'AVIATOR_11', section: '§ GAME 11', accent: 'ember', glyph: '◣', variant: 'aviator' },
  'space-fleet': { gameId: 'space-fleet', breadcrumb: 'FLEET_12', section: '§ GAME 12', accent: 'ice', glyph: '✺', variant: 'fleet' },
  jetx: { gameId: 'jetx', breadcrumb: 'JETX_13', section: '§ GAME 13', accent: 'acid', glyph: '◢', variant: 'jet' },
  balloon: { gameId: 'balloon', breadcrumb: 'BALLOON_14', section: '§ GAME 14', accent: 'ember', glyph: '◯', variant: 'balloon' },
  jetx3: { gameId: 'jetx3', breadcrumb: 'JETX3_15', section: '§ GAME 15', accent: 'toxic', glyph: '⧨', variant: 'jet' },
  'double-x': { gameId: 'double-x', breadcrumb: 'DOUBLEX_16', section: '§ GAME 16', accent: 'ice', glyph: '⊞', variant: 'default' },
  'plinko-x': { gameId: 'plinko-x', breadcrumb: 'PLINKOX_17', section: '§ GAME 17', accent: 'acid', glyph: '▼', variant: 'default' },
};
