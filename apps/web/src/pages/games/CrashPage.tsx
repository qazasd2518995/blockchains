import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { CrashPlayerBet, CrashRoundSnapshot } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { getCrashSocket, disconnectCrashSocket } from '@/lib/socket';
import { useTranslation } from '@/i18n/useTranslation';
import { CrashScene, type CrashVariant } from '@/games/crash/CrashScene';

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

export function CrashPage({ config }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [autoCashOut, setAutoCashOut] = useState('2.00');
  const [multiplier, setMultiplier] = useState(1.0);
  const [status, setStatus] = useState<'BETTING' | 'RUNNING' | 'CRASHED'>('BETTING');
  const [snapshot, setSnapshot] = useState<CrashRoundSnapshot | null>(null);
  const [crashPoint, setCrashPoint] = useState<number | null>(null);
  const [myBet, setMyBet] = useState<{ amount: number; cashed: boolean; payout?: string } | null>(null);
  const [players, setPlayers] = useState<CrashPlayerBet[]>([]);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bettingCountdown, setBettingCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CrashScene | null>(null);

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
    };

    const onBetsUpdate = (payload: { players: CrashPlayerBet[] }) => {
      setPlayers(payload.players);
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
  }, [config.gameId]);

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
        setMyBet({ amount, cashed: false });
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
      (res: { ok: boolean; error?: string; payout?: string; newBalance?: string }) => {
        if (!res.ok) {
          setError(res.error ?? 'CASHOUT FAILED');
          return;
        }
        setMyBet((b) => (b ? { ...b, cashed: true, payout: res.payout } : b));
        if (res.newBalance) setBalance(res.newBalance);
        // L4：cashout 成功觸發 tier 慶祝
        sceneRef.current?.celebrateCashout(multiplier);
      },
    );
  };

  return (
    <div>
      <GameHeader
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
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://{config.gameId.toUpperCase()}</span>
              <div className="flex items-center gap-3 text-ink-600">
                {status === 'BETTING' && (
                  <span className="text-neon-acid">
                    <span className="dot-online dot-online" />
                    {t.games.crash.betting} · {bettingCountdown}
                    {t.games.crash.seconds}
                  </span>
                )}
                {status === 'RUNNING' && (
                  <span className="text-neon-toxic">
                    <span className="dot-online dot-online" />
                    {t.games.crash.running}
                  </span>
                )}
                {status === 'CRASHED' && (
                  <span className="text-neon-ember">{t.games.crash.crashed}</span>
                )}
                <span className="hidden text-ink-500 md:inline">
                  #{snapshot?.roundNumber ?? '—'}
                </span>
              </div>
            </div>

            <div className="relative aspect-[16/7] w-full overflow-hidden">
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            </div>
          </div>

          <div className="crt-panel p-4">
            <div className="flex items-center justify-between">
              <span className="label">{t.games.crash.recentCrashes}</span>
              <span className="data-num text-[10px] text-ink-500">{history.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {history.length === 0 && (
                <span className="text-[10px] tracking-[0.3em] text-ink-400">
                  {t.games.crash.noHistory}
                </span>
              )}
              {history.map((m, i) => (
                <span
                  key={i}
                  className={`border px-2 py-1 font-mono text-[11px] ${
                    m >= 10
                      ? 'border-neon-acid/40 bg-neon-acid/10 text-neon-acid'
                      : m >= 2
                      ? 'border-neon-toxic/30 bg-neon-toxic/5 text-neon-toxic'
                      : 'border-neon-ember/30 bg-neon-ember/5 text-neon-ember'
                  }`}
                >
                  {m.toFixed(2)}×
                </span>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="crt-panel p-5">
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              disabled={status !== 'BETTING' || !!myBet}
            />

            <div className="mt-5">
              <div className="label">{t.games.crash.autoCashout}</div>
              <input
                type="text"
                value={autoCashOut}
                onChange={(e) => setAutoCashOut(e.target.value)}
                disabled={status !== 'BETTING' || !!myBet}
                placeholder={t.games.crash.autoCashoutPlaceholder}
                className="term-input mt-2 text-center font-display text-2xl"
              />
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
                <div className="border-2 border-neon-acid bg-neon-acid/5 p-3 text-center">
                  <div className="font-display text-xl text-neon-acid">
                    {t.games.crash.secured}
                  </div>
                  <div className="data-num text-[11px] text-ink-600">+{myBet.payout}</div>
                </div>
              )}
              {status === 'CRASHED' && myBet && !myBet.cashed && (
                <div className="border-2 border-neon-ember bg-neon-ember/5 p-3 text-center">
                  <div className="font-display text-xl text-neon-ember">
                    {t.games.crash.busted}
                  </div>
                </div>
              )}
              {status === 'BETTING' && myBet && (
                <div className="border border-ink-200 bg-ink-100 p-3 text-center">
                  <div className="text-[10px] tracking-[0.3em] text-ink-500">
                    {t.games.crash.betPlaced}
                  </div>
                  <div className="data-num text-lg text-neon-acid">
                    {formatAmount(myBet.amount)}
                  </div>
                </div>
              )}
              <div className="mt-2 text-center text-[10px] tracking-[0.25em] text-ink-500">
                {t.bet.balance} {formatAmount(balance)}
              </div>
            </div>
          </div>

          <div className="crt-panel p-5">
            <div className="flex items-center justify-between border-b border-ink-200 pb-2">
              <span className="label">{t.games.crash.liveBets}</span>
              <span className="data-num text-[10px] text-ink-500">{players.length}</span>
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto text-[11px]">
              {players.length === 0 && <div className="py-3 text-center text-ink-400">—</div>}
              {players.slice(0, 30).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border border-ink-200 bg-ink-50/40 px-2 py-1"
                >
                  <span className="font-mono text-ink-600">
                    0x{p.userId.slice(-6).toUpperCase()}
                  </span>
                  <span className="data-num text-ink-700">{p.amount}</span>
                  <span
                    className={`data-num ${p.cashedOutAt ? 'text-neon-acid' : 'text-ink-500'}`}
                  >
                    {p.cashedOutAt ? `${p.cashedOutAt.toFixed(2)}×` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
