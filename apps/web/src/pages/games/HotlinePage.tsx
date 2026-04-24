import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { HotlineBetRequest, HotlineBetResult } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { HotlineSymbolBadge } from '@/components/game/HotlineSymbolIcon';
import { HOTLINE_SYMBOLS } from '@/lib/hotlineSymbols';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { HotlineScene } from '@/games/hotline/HotlineScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

export function HotlinePage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [result, setResult] = useState<HotlineBetResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HotlineScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: HotlineScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new HotlineScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h);
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const spin = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setSpinning(true);
    setResult(null);
    setError(null);

    sceneRef.current?.resetWinLines();
    // 乐观动画：转轴立刻开始滚
    sceneRef.current?.startAnticipation();

    try {
      const payload: HotlineBetRequest = { amount };
      const res = await api.post<HotlineBetResult>('/games/hotline/bet', payload);
      await sceneRef.current?.playSpin(res.data.grid, res.data.lines);
      const mult = res.data.multiplier ?? 0;
      sceneRef.current?.playWinFx(mult, mult > 0);
      setResult(res.data);
      setBalance(res.data.newBalance);
      setHistory((prev) => [
        {
          id: res.data.betId,
          timestamp: Date.now(),
          betAmount: amount,
          multiplier: mult,
          payout: amount * mult,
          won: mult > 0,
          detail: `${res.data.lines.length} 連線`,
        },
        ...prev,
      ].slice(0, 30));
    } catch (err) {
      sceneRef.current?.stopAnticipation();
      sceneRef.current?.resetWinLines();
      setError(extractApiError(err).message);
    } finally {
      setSpinning(false);
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        artwork="/games/hotline.jpg"
        section="§ GAME 08"
        breadcrumb="HOTLINE_08"
        title={t.games.hotline.title}
        titleSuffix={t.games.hotline.suffix}
        titleSuffixColor="ember"
        description={t.games.hotline.description}
        rtpLabel="RTP 96%"
        rtpAccent="ember"
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">霓虹熱線</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">Hotline</span>
              <span className="text-white/72">
                {spinning ? t.games.hotline.spinning : t.games.hotline.ready}
              </span>
            </div>

            <div className="game-canvas-shell game-canvas-wide aspect-[16/7] w-full p-2">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>
          </div>

          {result && !spinning && (
            <div
              className={`game-result-card ${result.multiplier > 0 ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl text-white">
                    {result.lines.length}{' '}
                    {result.lines.length !== 1 ? t.games.hotline.lines : t.games.hotline.line}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                    {t.games.hotline.totalMult} {formatMultiplier(result.multiplier)}
                  </div>
                </div>
                <div className="num text-3xl text-[#7DD3FC]">
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
                          {t.games.hotline.row} {l.row} · {l.count}×
                        </span>
                        <HotlineSymbolBadge symbol={l.symbol} showLabel useShortLabel />
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
              disabled={busy}
            />

            <button
              type="button"
              onClick={spin}
              disabled={busy || balance < amount}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.hotline.spin} · {formatAmount(amount)}
            </button>
            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
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
              {HOTLINE_SYMBOLS.map((symbol, index) => (
                <div
                  key={symbol.key}
                  className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-0 last:pb-0"
                >
                  <HotlineSymbolBadge symbol={index} showLabel />
                  <span className="data-num text-white/85">3x · 4x · 5x</span>
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
