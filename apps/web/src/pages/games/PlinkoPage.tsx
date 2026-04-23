import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { PlinkoBetRequest, PlinkoBetResult, PlinkoRisk } from '@bg/shared';
import { plinkoTable } from '@bg/provably-fair';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { PlinkoScene } from '@/games/plinko/PlinkoScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

export function PlinkoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [rows, setRows] = useState(12);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [results, setResults] = useState<PlinkoBetResult[]>([]);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);
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

  // rows/risk 改變時更新預覽（需等 scene init 完）。
  // 預覽必須使用後端同一份正式賠率表，避免下注後倍率槽突然改變。
  useEffect(() => {
    if (!sceneReady || !sceneRef.current) return;
    sceneRef.current.setBoard(rows, plinkoTable(risk, rows));
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
      // 後端回傳同一份正式倍率表；此處重繪只做同步，不應造成賠率跳動。
      sceneRef.current?.setBoard(res.data.rows, res.data.multipliers);
      await sceneRef.current?.dropBall(res.data.path, res.data.bucket, res.data.multiplier);
      sceneRef.current?.playWinFx(res.data.multiplier, res.data.multiplier > 1);
      setResults((prev) => [res.data, ...prev].slice(0, 8));
      setHistory((prev) => [
        {
          id: res.data.betId,
          timestamp: Date.now(),
          betAmount: amount,
          multiplier: res.data.multiplier,
          payout: amount * res.data.multiplier,
          won: res.data.multiplier >= 1,
          detail: `Bucket ${res.data.bucket}`,
        },
        ...prev,
      ].slice(0, 30));
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
        artwork="/games/plinko.jpg"
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
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">彈珠台</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">Plinko</span>
              <span className="text-white/72">
                {rows} {t.games.plinko.rows} · {t.games.mines[risk]}
              </span>
            </div>
            <div className="game-canvas-shell relative aspect-[16/11] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
              {/* 右上角 overlay */}
              <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1 rounded-[16px] border border-white/10 bg-[#07131F]/52 px-3 py-2 text-[10px] tracking-[0.2em] text-white/62 backdrop-blur">
                <div>
                  ROWS <span className="data-num ml-1 text-[#7DD3FC]">{rows}</span>
                </div>
                <div>
                  RISK <span className="data-num ml-1 text-[#7DD3FC]">{risk.toUpperCase()}</span>
                </div>
              </div>
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
                    className={`game-choice-btn px-0 py-3 ${risk === r ? 'game-choice-btn-acid' : ''}`}
                  >
                    {t.games.mines[r]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">{t.games.plinko.rows}</span>
                <span className="data-num text-[#7DD3FC]">{rows}</span>
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
            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
              </span>
              <span>
                {t.games.plinko.rows} <span className="data-num ml-1 text-[#7DD3FC]">{rows}</span>
              </span>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}
