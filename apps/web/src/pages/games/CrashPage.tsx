import { useEffect, useRef, useState } from 'react';
import type { CrashPlayerBet, CrashRoundSnapshot } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { getCrashSocket, disconnectCrashSocket } from '@/lib/socket';
import { useTranslation } from '@/i18n/useTranslation';

interface CrashGameConfig {
  gameId: string;
  breadcrumb: string;
  section: string;
  accent: 'acid' | 'ember' | 'toxic' | 'ice';
  glyph: string;
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
      setError('ROUND NOT ACCEPTING BETS');
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
      },
    );
  };

  const accentColor = {
    acid: 'text-neon-acid border-neon-acid',
    ember: 'text-neon-ember border-neon-ember',
    toxic: 'text-neon-toxic border-neon-toxic',
    ice: 'text-neon-ice border-neon-ice',
  }[config.accent];

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://{config.gameId.toUpperCase()}</span>
              <div className="flex items-center gap-3 text-ink-400">
                {status === 'BETTING' && (
                  <span className="text-neon-acid">
                    <span className="status-dot status-dot-live" />
                    {t.games.crash.betting} · {bettingCountdown}
                    {t.games.crash.seconds}
                  </span>
                )}
                {status === 'RUNNING' && (
                  <span className="text-neon-toxic">
                    <span className="status-dot status-dot-live" />
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

            <div className="relative flex aspect-[16/10] items-center justify-center p-8">
              <div
                className="pointer-events-none absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(212,255,58,0.15) 1px, transparent 1.5px)',
                  backgroundSize: '32px 32px',
                }}
              />

              <svg
                viewBox="0 0 600 350"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {status !== 'BETTING' &&
                  (() => {
                    const maxM = Math.max(multiplier, 2);
                    const points: string[] = [];
                    const steps = 40;
                    for (let i = 0; i <= steps; i += 1) {
                      const tt = i / steps;
                      const m = 1 + (multiplier - 1) * (tt * tt);
                      const x = 30 + tt * 540;
                      const y = 320 - ((m - 1) / (maxM - 1)) * 280;
                      points.push(`${x},${y}`);
                    }
                    return (
                      <polyline
                        points={points.join(' ')}
                        fill="none"
                        stroke={status === 'CRASHED' ? '#ff4e50' : '#d4ff3a'}
                        strokeWidth="3"
                        opacity="0.9"
                      />
                    );
                  })()}
              </svg>

              <div className="relative flex flex-col items-center">
                <div
                  className={`font-display text-[12rem] leading-none tracking-tight ${accentColor} ${
                    status === 'CRASHED' ? 'text-neon-ember' : ''
                  }`}
                >
                  {status === 'BETTING' ? config.glyph : `${multiplier.toFixed(2)}×`}
                </div>
                <div className="mt-2 text-[12px] tracking-[0.3em] text-ink-500">
                  {status === 'BETTING'
                    ? `${t.games.crash.nextIn} ${bettingCountdown}${t.games.crash.seconds}`
                    : status === 'CRASHED'
                    ? `${t.games.crash.crashedAt} ${crashPoint?.toFixed(2)}×`
                    : `${t.games.crash.provable} ${snapshot?.serverSeedHash.slice(0, 16) ?? ''}...`}
                </div>
              </div>
            </div>
          </div>

          <div className="crt-panel p-4">
            <div className="flex items-center justify-between">
              <span className="label">{t.games.crash.recentCrashes}</span>
              <span className="data-num text-[10px] text-ink-500">{history.length}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {history.length === 0 && (
                <span className="text-[10px] tracking-[0.3em] text-ink-600">
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
            <div className="border border-neon-ember/40 bg-neon-ember/5 p-3 text-[12px] text-neon-ember">
              ⚠ {error.toUpperCase()}
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
                placeholder="2.00"
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
                  <div className="data-num text-[11px] text-ink-400">+{myBet.payout}</div>
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
                <div className="border border-white/10 bg-ink-900 p-3 text-center">
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
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="label">{t.games.crash.liveBets}</span>
              <span className="data-num text-[10px] text-ink-500">{players.length}</span>
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto text-[11px]">
              {players.length === 0 && <div className="py-3 text-center text-ink-600">—</div>}
              {players.slice(0, 30).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border border-white/5 bg-ink-950/40 px-2 py-1"
                >
                  <span className="font-mono text-ink-400">
                    0x{p.userId.slice(-6).toUpperCase()}
                  </span>
                  <span className="data-num text-ink-300">{p.amount}</span>
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
  rocket: { gameId: 'rocket', breadcrumb: 'ROCKET_10', section: '§ GAME 10', accent: 'acid', glyph: '▲' },
  aviator: { gameId: 'aviator', breadcrumb: 'AVIATOR_11', section: '§ GAME 11', accent: 'ember', glyph: '◣' },
  'space-fleet': { gameId: 'space-fleet', breadcrumb: 'FLEET_12', section: '§ GAME 12', accent: 'ice', glyph: '✺' },
  jetx: { gameId: 'jetx', breadcrumb: 'JETX_13', section: '§ GAME 13', accent: 'acid', glyph: '◢' },
  balloon: { gameId: 'balloon', breadcrumb: 'BALLOON_14', section: '§ GAME 14', accent: 'ember', glyph: '◯' },
  jetx3: { gameId: 'jetx3', breadcrumb: 'JETX3_15', section: '§ GAME 15', accent: 'toxic', glyph: '⧨' },
  'double-x': { gameId: 'double-x', breadcrumb: 'DOUBLEX_16', section: '§ GAME 16', accent: 'ice', glyph: '⊞' },
  'plinko-x': { gameId: 'plinko-x', breadcrumb: 'PLINKOX_17', section: '§ GAME 17', accent: 'acid', glyph: '▼' },
};
