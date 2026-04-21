import { useEffect, useRef, useState } from 'react';
import type { PlinkoBetRequest, PlinkoBetResult, PlinkoRisk } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { PlinkoScene } from '@/games/plinko/PlinkoScene';

export function PlinkoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [results, setResults] = useState<PlinkoBetResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PlinkoScene | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  // 初始化 Pixi scene — 等 layout 稳定再 init（避免 StrictMode 双次 + clientWidth=0 race）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: PlinkoScene | null = null;

    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        requestAnimationFrame(tryInit);
        return;
      }
      scene = new PlinkoScene();
      sceneRef.current = scene;
      void scene.init(canvas, w, h).then(() => {
        if (!cancelled) setSceneReady(true);
      });
    };
    tryInit();

    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
      setSceneReady(false);
    };
  }, []);

  // rows/risk 改變時更新預覽（需等 scene init 完）
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    const buckets = rows + 1;
    const preview: number[] = Array.from({ length: buckets }, (_, i) => {
      const dist = Math.abs(i - rows / 2) / (rows / 2);
      if (risk === 'low') return Number((0.5 + dist * 4).toFixed(1));
      if (risk === 'medium') return Number((0.3 + dist * 12).toFixed(1));
      return Number((0.2 + dist * 40).toFixed(1));
    });
    sceneRef.current.setBoard(rows, preview);
  }, [rows, risk, sceneReady]);

  const drop = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    // 乐观动画：立刻浮现预告球
    sceneRef.current?.startAnticipation();
    try {
      const payload: PlinkoBetRequest = { amount, rows, risk };
      const res = await api.post<PlinkoBetResult>('/games/plinko/bet', payload);
      // 用真實倍率表重繪 board
      sceneRef.current?.setBoard(rows, res.data.multipliers);
      await sceneRef.current?.dropBall(res.data.path, res.data.bucket, res.data.multiplier);
      setResults((prev) => [res.data, ...prev].slice(0, 8));
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
        section="§ GAME 07"
        breadcrumb="PLINKO_07"
        title={t.games.plinko.title}
        titleSuffix={t.games.plinko.suffix}
        titleSuffixColor="acid"
        description={t.games.plinko.description}
        rtpLabel="RTP 99%"
        rtpAccent="acid"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="crt-panel scanlines relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 px-4 py-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://PLINKO</span>
              <span className="text-ink-600">
                {rows} {t.games.plinko.rows} · {t.games.mines[risk]}
              </span>
            </div>
            <div className="relative aspect-[16/11] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
              {/* 右上角 overlay */}
              <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 text-[10px] tracking-[0.2em] text-ink-500">
                <div>
                  ROWS <span className="data-num ml-1 text-neon-acid">{rows}</span>
                </div>
                <div>
                  RISK <span className="data-num ml-1 text-neon-acid">{risk.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </div>

          {results.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {results.slice(0, 4).map((r, i) => (
                <div
                  key={r.betId + i}
                  className={`border p-3 text-center ${
                    r.multiplier >= 1
                      ? 'border-neon-acid/30 bg-neon-acid/5'
                      : 'border-neon-ember/30 bg-neon-ember/5'
                  }`}
                >
                  <div className="text-[9px] text-ink-500">B{r.bucket}</div>
                  <div
                    className={`num text-xl ${
                      r.multiplier >= 1 ? 'text-neon-acid' : 'text-neon-ember'
                    }`}
                  >
                    {formatMultiplier(r.multiplier)}
                  </div>
                </div>
              ))}
            </div>
          )}

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
              disabled={busy}
            />

            <div className="mt-6">
              <div className="label">{t.games.mines.risk}</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as PlinkoRisk[]).map((r) => (
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
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">{t.games.plinko.rows}</span>
                <span className="data-num text-neon-acid">{rows}</span>
              </div>
              <input
                type="range"
                min={8}
                max={16}
                value={rows}
                onChange={(e) => setRows(Number.parseInt(e.target.value, 10))}
                disabled={busy}
                className="term-range w-full"
              />
            </div>

            <button
              type="button"
              onClick={drop}
              disabled={busy || balance < amount}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.plinko.drop} · {formatAmount(amount)}
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
