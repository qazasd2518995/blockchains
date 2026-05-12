import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  ROULETTE_MAX_BET_LINES,
  type RouletteBetRequest,
  type RouletteBetResult,
  type RouletteLineBet,
} from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { RouletteScene } from '@/games/roulette/RouletteScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';

const RED = new Set([1, 3, 5, 7, 9, 12]);
const BLACK = new Set([2, 4, 6, 8, 10, 11]);
const ROULETTE_STRAIGHT_ODDS = '12x';
const ROULETTE_EVEN_ODDS = '2x';
const ROULETTE_COLUMN_ODDS = '3x';

function formatBetLimit(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

interface Props {
  variant: 'mini-roulette' | 'carnival';
}

export function RoulettePage({ variant }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [chip, setChip] = useState(MIN_BET_AMOUNT);
  const [bets, setBets] = useState<RouletteLineBet[]>([]);
  const [result, setResult] = useState<RouletteBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

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
      void scene.init(canvas, w, h, { statusText: t.games.roulette.placeYourBets, skin: variant });
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [t.games.roulette.placeYourBets, variant]);

  const totalBet = bets.reduce((s, b) => s + b.amount, 0);
  const getBetAmount = (type: RouletteLineBet['type'], value?: number) =>
    bets.find((b) => b.type === type && b.value === value)?.amount ?? 0;

  const addBet = (bet: Omit<RouletteLineBet, 'amount'>) => {
    if (busy) return;
    if (chip < MIN_BET_AMOUNT) {
      setError(`最低下注為 ${formatBetLimit(MIN_BET_AMOUNT)}。`);
      return;
    }
    if (chip > MAX_BET_AMOUNT) {
      setError(`單注上限為 ${formatBetLimit(MAX_BET_AMOUNT)}。`);
      return;
    }

    const existing = bets.find((b) => b.type === bet.type && b.value === bet.value);
    if (existing) {
      const nextAmount = existing.amount + chip;
      if (nextAmount > MAX_BET_AMOUNT) {
        setError(`單一投注項目上限為 ${formatBetLimit(MAX_BET_AMOUNT)}。`);
        return;
      }
      const projectedTotal = totalBet + chip;
      if (projectedTotal > MAX_BET_AMOUNT) {
        setError(`本次下注總額上限為 ${formatBetLimit(MAX_BET_AMOUNT)}。`);
        return;
      }
      setBets(bets.map((b) => (b === existing ? { ...b, amount: nextAmount } : b)));
      setError(null);
      setResult(null);
      return;
    }

    if (bets.length >= ROULETTE_MAX_BET_LINES) {
      setError(`輪盤一次最多可選 ${ROULETTE_MAX_BET_LINES} 個投注項目。`);
      return;
    }

    if (totalBet + chip > MAX_BET_AMOUNT) {
      setError(`本次下注總額上限為 ${formatBetLimit(MAX_BET_AMOUNT)}。`);
      return;
    }

    setBets([...bets, { ...bet, amount: chip }]);
    setError(null);
    setResult(null);
  };

  const handleSpin = async () => {
    if (busy || bets.length === 0) return;
    if (!requireLogin()) return;
    if (bets.length > ROULETTE_MAX_BET_LINES) {
      setError(`輪盤一次最多可選 ${ROULETTE_MAX_BET_LINES} 個投注項目。`);
      return;
    }
    if (bets.some((bet) => bet.amount > MAX_BET_AMOUNT)) {
      setError(`單一投注項目上限為 ${formatBetLimit(MAX_BET_AMOUNT)}。`);
      return;
    }
    if (totalBet > MAX_BET_AMOUNT) {
      setError(`本次下注總額上限為 ${formatBetLimit(MAX_BET_AMOUNT)}。`);
      return;
    }
    if (totalBet > balance) {
      setError(`餘額不足，目前可用 ${formatBetLimit(balance)}。`);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    sceneRef.current?.reset();
    // 樂觀動畫
    sceneRef.current?.startAnticipation();
    try {
      const payload: RouletteBetRequest = { bets };
      const endpoint =
        variant === 'mini-roulette' ? '/games/mini-roulette/bet' : '/games/carnival/bet';
      const res = await api.post<RouletteBetResult>(endpoint, payload);
      await sceneRef.current?.playSpin(res.data.slot);
      const stake = Number.parseFloat(res.data.totalAmount);
      const payout = Number.parseFloat(res.data.totalPayout);
      const profit = Number.parseFloat(res.data.profit);
      const fxMult = stake > 0 ? payout / stake : 0;
      sceneRef.current?.playWinFx(fxMult, profit > 0);
      setResult(res.data);
      setBalance(res.data.newBalance);
      setBets([]);
      setHistory((prev) =>
        [
          {
            id: res.data.betId,
            timestamp: Date.now(),
            betAmount: stake,
            multiplier: fxMult,
            payout,
            won: profit > 0,
            detail: `號碼 ${res.data.slot}`,
          },
          ...prev,
        ].slice(0, 30),
      );
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
        artwork={
          isMini
            ? '/game-art/mini-roulette/background-v2.png'
            : '/game-art/carnival/background-v2.png'
        }
        section={isMini ? '§ GAME 06' : '§ GAME 18'}
        breadcrumb={isMini ? 'ROULETTE_06' : 'CARNIVAL_18'}
        title={isMini ? t.games.roulette.title : t.games.roulette.titleCarnival}
        titleSuffix={t.games.roulette.suffix}
        titleSuffixColor="ember"
        description={t.games.roulette.description}
        rtpLabel="RTP 96.15%"
        rtpAccent="ember"
      />

      <div className="game-play-grid game-play-grid--roulette grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel roulette-stage-panel scanlines p-3">
            <div className="game-stage-bar -mx-3 -mt-3 mb-3 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">
                {isMini ? '迷你輪盤' : '狂歡節'}
              </span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Roulette</span>
              <GameActivityHeat gameId={variant} />
              <span className="text-white/72">
                {t.games.roulette.total}: {formatAmount(totalBet)}
              </span>
            </div>

            <div
              className="game-canvas-shell game-canvas-tall roulette-canvas relative mx-auto mt-3 aspect-square w-full max-w-[720px] p-2 sm:p-3"
              style={{ width: 'min(100%, 720px, 76svh)', maxHeight: 'none' }}
            >
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            <div className="roulette-board mt-4 space-y-2">
              <div className="roulette-number-grid grid grid-cols-7 gap-1">
                <NumberBtn
                  n={0}
                  onClick={() => addBet({ type: 'straight', value: 0 })}
                  placedAmount={getBetAmount('straight', 0)}
                  variant="green"
                />
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <NumberBtn
                    key={n}
                    n={n}
                    onClick={() => addBet({ type: 'straight', value: n })}
                    placedAmount={getBetAmount('straight', n)}
                    variant={RED.has(n) ? 'red' : BLACK.has(n) ? 'black' : 'black'}
                  />
                ))}
              </div>

              <div className="roulette-outside-grid grid grid-cols-3 gap-1">
                <OutsideBtn
                  label={t.games.roulette.low}
                  odds={ROULETTE_EVEN_ODDS}
                  placedAmount={getBetAmount('low')}
                  onClick={() => addBet({ type: 'low' })}
                />
                <OutsideBtn
                  label={t.games.roulette.even}
                  odds={ROULETTE_EVEN_ODDS}
                  placedAmount={getBetAmount('even')}
                  onClick={() => addBet({ type: 'even' })}
                />
                <OutsideBtn
                  label={t.games.roulette.red}
                  odds={ROULETTE_EVEN_ODDS}
                  placedAmount={getBetAmount('red')}
                  onClick={() => addBet({ type: 'red' })}
                  color="red"
                />
                <OutsideBtn
                  label={t.games.roulette.black}
                  odds={ROULETTE_EVEN_ODDS}
                  placedAmount={getBetAmount('black')}
                  onClick={() => addBet({ type: 'black' })}
                  color="black"
                />
                <OutsideBtn
                  label={t.games.roulette.odd}
                  odds={ROULETTE_EVEN_ODDS}
                  placedAmount={getBetAmount('odd')}
                  onClick={() => addBet({ type: 'odd' })}
                />
                <OutsideBtn
                  label={t.games.roulette.high}
                  odds={ROULETTE_EVEN_ODDS}
                  placedAmount={getBetAmount('high')}
                  onClick={() => addBet({ type: 'high' })}
                />
              </div>

              <div className="roulette-column-grid grid grid-cols-3 gap-1">
                {[1, 2, 3].map((col) => (
                  <OutsideBtn
                    key={col}
                    label={`${t.games.roulette.col} ${col}`}
                    odds={ROULETTE_COLUMN_ODDS}
                    placedAmount={getBetAmount('column', col)}
                    onClick={() => addBet({ type: 'column', value: col })}
                  />
                ))}
              </div>
            </div>
          </div>

          {result && (
            <div
              key={result.betId}
              className={`game-result-card roulette-result-card animate-reveal ${
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
                  <div className="mt-2 text-[11px] tracking-[0.25em] text-white/75">
                    {result.winningBets.length} {t.games.roulette.winningBets}
                  </div>
                </div>
                <div
                  className={`num text-4xl ${
                    Number.parseFloat(result.profit) >= 0 ? 'num-win' : 'text-[#FCA5A5]'
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

        <div className="game-control-stack space-y-4">
          <div className="game-side-card roulette-control-card p-5">
            <div className="roulette-chip-panel">
              <div className="roulette-chip-title label">{t.games.roulette.chipSize}</div>
              <BetControls
                amount={chip}
                onAmountChange={setChip}
                maxBalance={balance}
                guestMode={!user}
                disabled={busy}
                label={t.games.roulette.chipSize}
                max={MAX_BET_AMOUNT}
                showPresets={false}
              />
            </div>

            <div className="roulette-active-bets mt-4 space-y-1">
              <div className="label">
                {t.games.roulette.activeBets} ({bets.length})
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto text-[11px]">
                {bets.length === 0 && (
                  <div className="py-3 text-center text-white/40">
                    {t.games.roulette.noBetsPlaced}
                  </div>
                )}
                {bets.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-[14px] border border-white/10 bg-white/[0.05] px-2 py-1.5"
                  >
                    <span className="font-mono text-white/85">
                      {b.type.toUpperCase()}
                      {b.value !== undefined ? ` ${b.value}` : ''}
                    </span>
                    <span className="data-num text-[#7DD3FC]">{formatAmount(b.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="roulette-action-panel">
              <button
                type="button"
                onClick={handleSpin}
                disabled={
                  busy ||
                  bets.length === 0 ||
                  totalBet > MAX_BET_AMOUNT ||
                  (!!user && totalBet > balance)
                }
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
                  {t.games.roulette.total}{' '}
                  <span className="data-num ml-1 text-[#FCA5A5]">{formatAmount(totalBet)}</span>
                </span>
              </div>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}

function NumberBtn({
  n,
  onClick,
  placedAmount,
  variant,
}: {
  n: number;
  onClick: () => void;
  placedAmount: number;
  variant: 'red' | 'black' | 'green';
}) {
  const bg = { red: 'bg-[#D4574A]', black: 'bg-[#10263A]', green: 'bg-[#1F8B5F]' }[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`roulette-number-btn relative aspect-square min-h-[42px] rounded-[12px] border border-white/8 ${bg} font-display text-lg text-white transition hover:border-[#C9A247] hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.55)] sm:rounded-[16px] sm:text-2xl ${placedAmount > 0 ? 'ring-2 ring-[#F3D67D]/70' : ''}`}
    >
      <span className="roulette-bet-main">{n}</span>
      <span className="roulette-bet-odds">{ROULETTE_STRAIGHT_ODDS}</span>
      {placedAmount > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full border border-ink-50 bg-neon-acid px-1.5 font-mono text-[9px] text-ink-50">
          {formatAmount(placedAmount)}
        </span>
      )}
    </button>
  );
}

function OutsideBtn({
  label,
  odds,
  placedAmount = 0,
  onClick,
  color,
}: {
  label: string;
  odds: string;
  placedAmount?: number;
  onClick: () => void;
  color?: 'red' | 'black';
}) {
  const bg =
    color === 'red' ? 'bg-[#D4574A]/16' : color === 'black' ? 'bg-[#10263A]' : 'bg-white/[0.08]';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`roulette-outside-btn relative min-h-[42px] rounded-[12px] border border-white/10 ${bg} px-1 py-2 font-mono text-[10px] tracking-[0.08em] ${color === 'black' ? 'text-white' : 'text-white/85'} transition hover:border-[#C9A247] hover:text-[#186073] sm:rounded-[14px] sm:text-[11px] sm:tracking-[0.2em] ${placedAmount > 0 ? 'border-[#F3D67D]/70 text-[#F3D67D]' : ''}`}
    >
      <span className="roulette-bet-main">{label}</span>
      <span className="roulette-bet-odds">{odds}</span>
      {placedAmount > 0 && (
        <span className="absolute -right-1 -top-1 rounded-full border border-ink-50 bg-neon-acid px-1.5 font-mono text-[9px] text-ink-50">
          {formatAmount(placedAmount)}
        </span>
      )}
    </button>
  );
}
