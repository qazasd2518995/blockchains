import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { KenoBetRequest, KenoBetResult, KenoRisk } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { KenoScene } from '@/games/keno/KenoScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';

const POOL_SIZE = 40;
const MAX_PICKS = 10;

export function KenoPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [risk, setRisk] = useState<KenoRisk>('medium');
  const [result, setResult] = useState<KenoBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RecentBetRecord[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<KenoScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let scene: KenoScene | null = null;
    let rafId = 0;
    const tryInit = () => {
      if (cancelled) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w < 10 || h < 10) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
      scene = new KenoScene();
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

  const clearRoundResult = () => {
    setResult(null);
    sceneRef.current?.reset();
  };

  const toggle = (n: number) => {
    if (busy) return;
    if (result) clearRoundResult();
    const next = new Set(selected);
    if (next.has(n)) next.delete(n);
    else if (next.size < MAX_PICKS) next.add(n);
    setSelected(next);
  };

  const autoPick = () => {
    if (busy) return;
    if (result) clearRoundResult();
    const next = new Set<number>();
    while (next.size < 8) {
      next.add(Math.floor(Math.random() * POOL_SIZE) + 1);
    }
    setSelected(next);
  };

  const clearAll = () => {
    if (busy) return;
    if (result) clearRoundResult();
    setSelected(new Set());
  };

  const handleBet = async () => {
    if (busy || selected.size === 0 || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    clearRoundResult();
    try {
      const payload: KenoBetRequest = {
        amount,
        selected: Array.from(selected).sort((a, b) => a - b),
        risk,
      };
      const res = await api.post<KenoBetResult>('/games/keno/bet', payload);
      await sceneRef.current?.playDraw(
        res.data.drawn,
        res.data.selected,
        res.data.hits,
      );
      sceneRef.current?.playWinFx(res.data.multiplier, res.data.multiplier > 1);
      setResult(res.data);
      setBalance(res.data.newBalance);
      setHistory((prev) => [
        {
          id: res.data.betId,
          timestamp: Date.now(),
          betAmount: amount,
          multiplier: res.data.multiplier,
          payout: amount * res.data.multiplier,
          won: res.data.multiplier > 1,
          detail: `${res.data.hits.length}/${res.data.selected.length} 命中`,
        },
        ...prev,
      ].slice(0, 30));
    } catch (err) {
      setError(extractApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const drawn = new Set(result?.drawn ?? []);
  const hits = new Set(result?.hits ?? []);

  return (
    <div>
      <GameHeader
        artwork="/game-art/keno/background.png"
        section="§ GAME 04"
        breadcrumb="KENO_04"
        title={t.games.keno.title}
        titleSuffix={t.games.keno.suffix}
        titleSuffixColor="ice"
        description={t.games.keno.description}
        rtpLabel="RTP 97%"
        rtpAccent="ice"
      />

      <div className="game-play-grid game-play-grid--keno grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines p-4">
            <div className="game-stage-bar -mx-4 -mt-4 mb-4 rounded-t-[22px]">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">基諾</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">Keno</span>
              <span className="text-white/72">
                {t.games.keno.selected} {selected.size}/{MAX_PICKS}
              </span>
            </div>

            <div className="game-canvas-shell game-canvas-keno mt-3 aspect-[16/5] w-full">
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            <div className="keno-number-grid mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-8 sm:gap-2">
              {Array.from({ length: POOL_SIZE }, (_, i) => i + 1).map((n) => {
                const picked = selected.has(n);
                const isDrawn = drawn.has(n);
                const isHit = hits.has(n);
                let cls = 'border-white/12 bg-white/[0.06] text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]';
                if (isHit) cls = 'border-[#F3D67D] bg-[#F3D67D] text-[#0A0806] shadow-[0_0_18px_rgba(243,214,125,0.45),inset_0_1px_0_rgba(255,255,255,0.42)]';
                else if (isDrawn) cls = 'border-[#D4574A]/70 bg-[#D4574A]/16 text-[#FFD7D3] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]';
                else if (picked) cls = 'border-[#7DD3FC]/80 bg-[#266F85]/18 text-[#BAE6FD] shadow-[0_0_14px_rgba(125,211,252,0.22),inset_0_1px_0_rgba(255,255,255,0.16)]';
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggle(n)}
                    disabled={busy}
                    className={`aspect-square min-h-[46px] rounded-[12px] border-2 font-display text-lg font-black leading-none transition ${cls} hover:border-neon-ice/50 sm:rounded-[18px] sm:text-2xl`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>

            <div className="keno-stage-actions mt-4 grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={autoPick} disabled={busy} className="game-choice-btn game-choice-btn-ice">
                ⚂ {t.games.keno.autoPick}
              </button>
              <button type="button" onClick={clearAll} disabled={busy} className="game-choice-btn">
                ⨯ {t.games.keno.clear}
              </button>
            </div>
          </div>

          {result && (
            <div
              className={`game-result-card ${result.payout !== '0.00' ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-display text-4xl text-white">
                    {result.hitCount} / {result.selected.length} {t.games.keno.hits}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                    {formatMultiplier(result.multiplier)} {t.games.dice.payout}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/55">{t.history.net}</div>
                  <div
                    className={`num text-3xl ${
                      Number.parseFloat(result.profit) >= 0
                        ? 'text-[#7DD3FC]'
                        : 'text-[#FCA5A5]'
                    }`}
                  >
                    {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                    {formatAmount(result.profit)}
                  </div>
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
                {(['low', 'medium', 'high'] as KenoRisk[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRisk(r)}
                    disabled={busy}
                    className={`game-choice-btn px-0 py-3 ${risk === r ? 'game-choice-btn-ice' : ''}`}
                  >
                    {t.games.mines[r]}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleBet}
              disabled={busy || selected.size === 0 || balance < amount}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.keno.draw.toUpperCase()} · {formatAmount(amount)}
            </button>
            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance} <span className="data-num ml-1 text-white">{formatAmount(balance)}</span>
              </span>
              <span>
                {t.games.keno.selected}{' '}
                <span className="data-num ml-1 text-[#266F85]">{selected.size}</span>
              </span>
            </div>
          </div>

          <RecentBetsList records={history} />
        </div>
      </div>
    </div>
  );
}
