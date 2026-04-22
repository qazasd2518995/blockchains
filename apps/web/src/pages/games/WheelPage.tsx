import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { WheelBetRequest, WheelBetResult, WheelRisk, WheelSegmentCount } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { WheelScene } from '@/games/wheel/WheelScene';

export function WheelPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState<WheelRisk>('medium');
  const [segments, setSegments] = useState<WheelSegmentCount>(10);
  const [result, setResult] = useState<WheelBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<WheelScene | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: WheelScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new WheelScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h).then(() => {
        if (!cancelled) setSceneReady(true);
      });
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
      setSceneReady(false);
    };
  }, []);

  // 當 risk/segments 改變時重繪轮盘（需等 scene init 完）
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    const preview: number[] = Array.from({ length: segments }, (_, i) => {
      if (risk === 'low') return i % 5 === 4 ? 0 : 1.2;
      if (risk === 'medium') return i % 5 === 2 ? 0 : i % 10 === 0 ? 3 : 1.7;
      return i === 0 ? segments * 0.99 : 0;
    });
    sceneRef.current.setSegments(preview);
  }, [risk, segments, sceneReady]);

  const spin = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    // 乐观动画：轮盘立刻开始高速旋转
    sceneRef.current?.startAnticipation();
    try {
      const payload: WheelBetRequest = { amount, risk, segments };
      const res = await api.post<WheelBetResult>('/games/wheel/bet', payload);
      // 用真實的倍率表重繪轮盘
      sceneRef.current?.setSegments(res.data.segmentMultipliers);
      await sceneRef.current?.playSpin(res.data.segmentIndex, res.data.multiplier);
      setResult(res.data);
      setBalance(res.data.newBalance);
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        section="§ GAME 05"
        breadcrumb="WHEEL_05"
        title={t.games.wheel.title}
        titleSuffix={t.games.wheel.suffix}
        titleSuffixColor="ember"
        description={t.games.wheel.description}
        rtpLabel="RTP 96%"
        rtpAccent="ember"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://WHEEL</span>
              <span className="text-ink-600">
                {segments} {t.games.wheel.segments} · {t.games.mines[risk]}
              </span>
            </div>

            <div className="relative mx-auto aspect-square w-full max-w-md p-3">
              <canvas ref={canvasRef} className="h-full w-full" />
              <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 text-[10px] tracking-[0.2em] text-ink-500">
                <div>
                  SEG <span className="data-num ml-1 text-neon-acid">{segments}</span>
                </div>
                <div>
                  RISK <span className="data-num ml-1 text-neon-acid">{risk.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          {result && (
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
                    {formatMultiplier(result.multiplier)}
                  </div>
                  <div className="text-[11px] tracking-[0.25em] text-ink-600">
                    {t.games.wheel.segment}{result.segmentIndex}
                  </div>
                </div>
                <div className="num text-3xl text-neon-acid">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
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
            <div className="mt-6">
              <div className="label">{t.games.mines.risk}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as WheelRisk[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRisk(r)}
                    disabled={busy}
                    className={`border py-2 font-mono text-[11px] tracking-[0.2em] transition ${
                      risk === r
                        ? 'border-neon-acid bg-neon-acid/10 text-neon-acid'
                        : 'border-ink-200 bg-ink-50/50 text-ink-700'
                    }`}
                  >
                    {t.games.mines[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <div className="label">{t.games.wheel.segments}</div>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {([10, 20, 30, 40, 50] as WheelSegmentCount[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSegments(s)}
                    disabled={busy}
                    className={`border py-2 font-mono text-[11px] transition ${
                      segments === s
                        ? 'border-neon-acid bg-neon-acid/10 text-neon-acid'
                        : 'border-ink-200 bg-ink-50/50 text-ink-700'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={spin}
              disabled={busy || balance < amount}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.wheel.spin} · {formatAmount(amount)}
            </button>
            <div className="mt-2 text-center text-[10px] tracking-[0.25em] text-ink-500">
              {t.bet.balance} {formatAmount(balance)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
