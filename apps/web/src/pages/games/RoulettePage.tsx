import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { RouletteBetRequest, RouletteBetResult, RouletteLineBet } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { RouletteScene } from '@/games/roulette/RouletteScene';

const RED = new Set([1, 3, 5, 7, 9, 12]);
const BLACK = new Set([2, 4, 6, 8, 10, 11]);

interface Props {
  variant: 'mini-roulette' | 'carnival';
}

export function RoulettePage({ variant }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<RouletteLineBet[]>([]);
  const [result, setResult] = useState<RouletteBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RouletteScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: RouletteScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new RouletteScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h, { statusText: t.games.roulette.placeYourBets });
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [t.games.roulette.placeYourBets]);

  const addBet = (bet: Omit<RouletteLineBet, 'amount'>) => {
    setBets((prev) => {
      const existing = prev.find((b) => b.type === bet.type && b.value === bet.value);
      if (existing) {
        return prev.map((b) => (b === existing ? { ...b, amount: b.amount + chip } : b));
      }
      return [...prev, { ...bet, amount: chip }];
    });
  };

  const totalBet = bets.reduce((s, b) => s + b.amount, 0);

  const handleSpin = async () => {
    if (busy || bets.length === 0 || totalBet > balance) return;
    setBusy(true);
    setError(null);
    setResult(null);
    sceneRef.current?.reset();
    // 乐观动画
    sceneRef.current?.startAnticipation();
    try {
      const payload: RouletteBetRequest = { bets };
      const endpoint =
        variant === 'mini-roulette'
          ? '/games/mini-roulette/bet'
          : '/games/carnival/bet';
      const res = await api.post<RouletteBetResult>(endpoint, payload);
      await sceneRef.current?.playSpin(res.data.slot);
      setResult(res.data);
      setBalance(res.data.newBalance);
      setBets([]);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setBets([]);

  const isMini = variant === 'mini-roulette';

  return (
    <div>
      <GameHeader
        artwork={isMini ? '/games/mini-roulette.jpg' : '/games/carnival.jpg'}
        section={isMini ? '§ GAME 06' : '§ GAME 18'}
        breadcrumb={isMini ? 'ROULETTE_06' : 'CARNIVAL_18'}
        title={isMini ? t.games.roulette.title : t.games.roulette.titleCarnival}
        titleSuffix={t.games.roulette.suffix}
        titleSuffixColor="ember"
        description={t.games.roulette.description}
        rtpLabel="RTP 96.15%"
        rtpAccent="ember"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="game-stage-panel scanlines p-3">
            <div className="game-stage-bar -mx-3 -mt-3 mb-3 rounded-t-[22px]">
              <span className="text-white/62">TERMINAL://ROULETTE</span>
              <span className="text-white/72">
                {t.games.roulette.total}: {formatAmount(totalBet)}
              </span>
            </div>

            <div className="game-canvas-shell relative mx-auto mt-3 aspect-square w-full max-w-[360px]">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            <div className="mt-4 space-y-2">
              <div className="grid grid-cols-7 gap-1">
                <NumberBtn
                  n={0}
                  onClick={() => addBet({ type: 'straight', value: 0 })}
                  bets={bets}
                  variant="green"
                />
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <NumberBtn
                    key={n}
                    n={n}
                    onClick={() => addBet({ type: 'straight', value: n })}
                    bets={bets}
                    variant={RED.has(n) ? 'red' : BLACK.has(n) ? 'black' : 'black'}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1">
                <OutsideBtn
                  label={t.games.roulette.low}
                  onClick={() => addBet({ type: 'low' })}
                />
                <OutsideBtn
                  label={t.games.roulette.even}
                  onClick={() => addBet({ type: 'even' })}
                />
                <OutsideBtn
                  label={t.games.roulette.red}
                  onClick={() => addBet({ type: 'red' })}
                  color="red"
                />
                <OutsideBtn
                  label={t.games.roulette.black}
                  onClick={() => addBet({ type: 'black' })}
                  color="black"
                />
                <OutsideBtn
                  label={t.games.roulette.odd}
                  onClick={() => addBet({ type: 'odd' })}
                />
                <OutsideBtn
                  label={t.games.roulette.high}
                  onClick={() => addBet({ type: 'high' })}
                />
              </div>

              <div className="grid grid-cols-3 gap-1">
                {[1, 2, 3].map((col) => (
                  <OutsideBtn
                    key={col}
                    label={`${t.games.roulette.col} ${col} (2:1)`}
                    onClick={() => addBet({ type: 'column', value: col })}
                  />
                ))}
              </div>
            </div>
          </div>

          {result && (
            <div
              key={result.betId}
              className={`game-result-card animate-reveal ${
                Number.parseFloat(result.profit) >= 0
                  ? 'game-result-card-win'
                  : 'game-result-card-loss'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="num num-grad text-6xl">
                    {t.games.roulette.slot} {result.slot}
                  </div>
                  <div className="mt-2 text-[11px] tracking-[0.25em] text-ink-600">
                    {result.winningBets.length} {t.games.roulette.winningBets}
                  </div>
                </div>
                <div
                  className={`num text-4xl ${
                    Number.parseFloat(result.profit) >= 0
                      ? 'num-win'
                      : 'text-neon-ember'
                  }`}
                >
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="game-alert text-[12px]">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{error.toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="game-side-card p-5">
            <div className="label">{t.games.roulette.chipSize}</div>
            <div className="mt-2 grid grid-cols-4 gap-1">
              {[1, 5, 10, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChip(v)}
                  className={`game-choice-btn px-0 py-3 ${chip === v ? 'game-choice-btn-ember' : ''}`}
                >
                  {v}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-1">
              <div className="label">
                {t.games.roulette.activeBets} ({bets.length})
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto text-[11px]">
                {bets.length === 0 && (
                  <div className="py-3 text-center text-ink-400">{t.games.roulette.noBetsPlaced}</div>
                )}
                {bets.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-[14px] border border-ink-200 bg-ink-50/50 px-2 py-1.5"
                  >
                    <span className="font-mono text-ink-700">
                      {b.type.toUpperCase()}
                      {b.value !== undefined ? ` ${b.value}` : ''}
                    </span>
                    <span className="data-num text-neon-acid">{formatAmount(b.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSpin}
              disabled={busy || bets.length === 0 || totalBet > balance}
              className="btn-acid mt-4 w-full py-4"
            >
              → {t.games.roulette.spin} · {formatAmount(totalBet)}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={busy || bets.length === 0}
              className="game-choice-btn mt-2 w-full justify-center py-2 text-[11px]"
            >
              ⨯ {t.games.roulette.clearBets}
            </button>

            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance} <span className="data-num ml-1 text-ink-900">{formatAmount(balance)}</span>
              </span>
              <span>
                {t.games.roulette.total} <span className="data-num ml-1 text-neon-ember">{formatAmount(totalBet)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberBtn({
  n,
  onClick,
  bets,
  variant,
}: {
  n: number;
  onClick: () => void;
  bets: RouletteLineBet[];
  variant: 'red' | 'black' | 'green';
}) {
  const placed = bets.find((b) => b.type === 'straight' && b.value === n);
  const bg = { red: 'bg-[#D4574A]', black: 'bg-[#10263A]', green: 'bg-[#1F8B5F]' }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative aspect-square rounded-[16px] border border-white/8 ${bg} font-display text-2xl text-white transition hover:border-[#C9A247] hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.55)]`}
    >
      {n}
      {placed && (
        <span className="absolute -right-1 -top-1 rounded-full border border-ink-50 bg-neon-acid px-1.5 font-mono text-[9px] text-ink-50">
          {placed.amount}
        </span>
      )}
    </button>
  );
}

function OutsideBtn({
  label,
  onClick,
  color,
}: {
  label: string;
  onClick: () => void;
  color?: 'red' | 'black';
}) {
  const bg =
    color === 'red' ? 'bg-[#D4574A]/16' : color === 'black' ? 'bg-[#10263A]' : 'bg-ink-100/70';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[14px] border border-[#16324A]/12 ${bg} py-2 font-mono text-[11px] tracking-[0.2em] ${color === 'black' ? 'text-white' : 'text-ink-700'} transition hover:border-[#C9A247] hover:text-[#186073]`}
    >
      {label}
    </button>
  );
}
