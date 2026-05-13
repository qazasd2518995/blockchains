import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  MIN_BET_AMOUNT,
  type WheelBetRequest,
  type WheelBetResult,
  type WheelRisk,
  type WheelSegmentCount,
} from '@bg/shared';
import { wheelTable } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameActivityHeat } from '@/components/game/GameActivityHeat';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { WheelScene } from '@/games/wheel/WheelScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { useRequireLogin } from '@/hooks/useRequireLogin';

export function WheelPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState<WheelRisk>('medium');
  const [segments, setSegments] = useState<WheelSegmentCount>(10);
  const [result, setResult] = useState<WheelBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

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
        if (!cancelled) {
          scene?.setSegments(wheelTable('medium', 10));
          setSceneReady(true);
        }
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

  // 當 risk/segments 改變時重繪輪盤（需等 scene init 完）
  // 用後端共用的 wheelTable 確保預覽倍率與真實結算 100% 一致
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    sceneRef.current.setSegments(wheelTable(risk, segments));
  }, [risk, segments, sceneReady]);

  const spin = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount < MIN_BET_AMOUNT || amount > balance) return;
    setBusy(true);
    setError(null);
    setResult(null);
    // 樂觀動畫：輪盤立刻開始高速旋轉
    sceneRef.current?.startAnticipation();
    try {
      const payload: WheelBetRequest = { amount, risk, segments };
      const res = await api.post<WheelBetResult>('/games/wheel/bet', payload);
      await sceneRef.current?.playSpin(res.data.segmentIndex, res.data.multiplier);
      sceneRef.current?.playWinFx(res.data.multiplier, res.data.multiplier > 1);
      setResult(res.data);
      setBalance(res.data.newBalance);
      setHistory((prev) =>
        [
          {
            id: res.data.betId,
            timestamp: Date.now(),
            betAmount: amount,
            multiplier: res.data.multiplier,
            payout: amount * res.data.multiplier,
            won: res.data.multiplier > 1,
            detail: `${risk} · ${segments} 段`,
          },
          ...prev,
        ].slice(0, 30),
      );
    } catch (err) {
      sceneRef.current?.stopAnticipation();
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <GameHeader
        artwork="/game-art/wheel/background-v2.png"
        section="§ GAME 05"
        breadcrumb="WHEEL_05"
        title={t.games.wheel.title}
        titleSuffix={t.games.wheel.suffix}
        titleSuffixColor="ember"
        description={t.games.wheel.description}
        rtpLabel="RTP 96.5%"
        rtpAccent="ember"
      />

      <div className="game-play-grid game-play-grid--wheel grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel wheel-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">彩色轉輪</span>
              <span className="ml-2 text-white/40">·</span>
              <span className="ml-2 text-white/55 uppercase">Wheel</span>
              <GameActivityHeat gameId="wheel" />
              <span className="text-white/72">
                {segments} {t.games.wheel.segments} · {t.games.mines[risk]}
              </span>
            </div>

            <div
              className="game-canvas-shell game-canvas-tall wheel-canvas relative mx-auto aspect-square w-full max-w-[720px] p-2 sm:p-3"
              style={{ width: 'min(100%, 720px, 76svh)', maxHeight: 'none' }}
            >
              <canvas ref={canvasRef} className="h-full w-full" />
              <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 rounded-[16px] border border-white/10 bg-[#07131F]/52 px-3 py-2 text-[10px] tracking-[0.2em] text-white/62 backdrop-blur">
                <div>
                  SEG <span className="data-num ml-1 text-[#7DD3FC]">{segments}</span>
                </div>
                <div>
                  RISK <span className="data-num ml-1 text-[#7DD3FC]">{risk.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          {result && (
            <div
              className={`game-result-card wheel-result-card ${result.multiplier > 0 ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl text-white">
                    {formatMultiplier(result.multiplier)}
                  </div>
                  <div className="text-[11px] tracking-[0.25em] text-white/75">
                    第 {result.segmentIndex + 1} {t.games.wheel.segment}
                  </div>
                </div>
                <div className="num text-3xl text-[#7DD3FC]">
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
          <div
            className={`game-side-card wheel-control-card p-5 ${
              result ? 'wheel-control-card--result' : ''
            }`}
          >
            <BetControls
              amount={amount}
              onAmountChange={setAmount}
              maxBalance={balance}
              guestMode={!user}
              disabled={busy}
            />
            {result && (
              <div className="wheel-control-result">
                <span className="font-display text-white">
                  {formatMultiplier(result.multiplier)}
                </span>
                <span className="data-num text-[#7DD3FC]">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </span>
              </div>
            )}
            <div className="wheel-risk-control mt-6">
              <div className="label">{t.games.mines.risk}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as WheelRisk[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRisk(r)}
                    disabled={busy}
                    className={`game-choice-btn px-0 py-3 ${risk === r ? 'game-choice-btn-ember' : ''}`}
                  >
                    {t.games.mines[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className="wheel-segments-control mt-4">
              <div className="label">{t.games.wheel.segments}</div>
              <div className="wheel-segments-grid mt-2 grid grid-cols-5 gap-1">
                {([10, 20, 30, 40, 50] as WheelSegmentCount[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSegments(s)}
                    disabled={busy}
                    className={`game-choice-btn px-0 py-3 ${segments === s ? 'game-choice-btn-ember' : ''}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={spin}
              disabled={busy || (!!user && balance < amount)}
              className="btn-acid wheel-spin-button mt-6 w-full py-4"
            >
              → {t.games.wheel.spin} · {formatAmount(amount)}
            </button>
            <div className="game-balance-strip wheel-balance-strip mt-3">
              <span>
                {t.games.wheel.segments}{' '}
                <span className="data-num ml-1 text-[#FCA5A5]">{segments}</span>
              </span>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}
