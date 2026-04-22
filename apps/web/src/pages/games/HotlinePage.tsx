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

export function HotlinePage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [result, setResult] = useState<HotlineBetResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setResult(res.data);
      setBalance(res.data.newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setSpinning(false);
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        section="§ GAME 08"
        breadcrumb="HOTLINE_08"
        title={t.games.hotline.title}
        titleSuffix={t.games.hotline.suffix}
        titleSuffixColor="ember"
        description={t.games.hotline.description}
        rtpLabel="RTP 96%"
        rtpAccent="ember"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://HOTLINE</span>
              <span className="text-ink-600">
                {spinning ? t.games.hotline.spinning : t.games.hotline.ready}
              </span>
            </div>

            <div className="aspect-[16/7] w-full p-2">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>
          </div>

          {result && !spinning && (
            <div
              className={`border-2 p-5 ${
                result.multiplier > 0
                  ? 'border-neon-acid bg-neon-acid/5'
                  : 'border-neon-ember/60 bg-neon-ember/5'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl text-ink-900">
                    {result.lines.length}{' '}
                    {result.lines.length !== 1 ? t.games.hotline.lines : t.games.hotline.line}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-ink-600">
                    {t.games.hotline.totalMult} {formatMultiplier(result.multiplier)}
                  </div>
                </div>
                <div className="num text-3xl text-neon-acid">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
              {result.lines.length > 0 && (
                <div className="mt-3 space-y-1">
                  {result.lines.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 border border-ink-200 bg-ink-50/50 px-3 py-2 text-[11px]"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="font-mono text-ink-700">
                          {t.games.hotline.row} {l.row} · {l.count}×
                        </span>
                        <HotlineSymbolBadge symbol={l.symbol} showLabel useShortLabel />
                      </div>
                      <span className="data-num text-neon-acid">{l.payout}×</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
            <div className="mt-2 text-center text-[10px] tracking-[0.25em] text-ink-500">
              {t.bet.balance} {formatAmount(balance)}
            </div>
          </div>

          <div className="crt-panel p-5">
            <div className="label">{t.games.hotline.payoutTable}</div>
            <div className="mt-3 space-y-2 text-[11px]">
              {HOTLINE_SYMBOLS.map((symbol, index) => (
                <div
                  key={symbol.key}
                  className="flex items-center justify-between gap-3 border-b border-ink-200 pb-2 last:border-0 last:pb-0"
                >
                  <HotlineSymbolBadge symbol={index} showLabel />
                  <span className="data-num text-ink-700">3x · 4x · 5x</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
