import { useEffect, useRef, useState } from 'react';
import { AlertCircle, RotateCw } from 'lucide-react';
import type { HotlineBetRequest, HotlineBetResult } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';
import { HotlineScene } from '@/games/hotline/HotlineScene';
import { RecentBetsList, type RecentBetRecord } from '@/components/game/RecentBetsList';
import { getSlotTheme, type SlotThemeConfig, type SlotThemeId } from '@/lib/slotThemes';
import { useRequireLogin } from '@/hooks/useRequireLogin';

interface Props {
  theme?: SlotThemeId;
}

const SYMBOL_POSITIONS = [
  '0% 0%',
  '50% 0%',
  '100% 0%',
  '0% 100%',
  '50% 100%',
  '100% 100%',
];

const MEGA_SYMBOL_PAYOUTS = [
  '3軸 0.03x · 4軸 0.12x · 5軸 0.45x',
  '3軸 0.04x · 4軸 0.18x · 5軸 0.70x',
  '3軸 0.06x · 4軸 0.30x · 5軸 1.20x',
  '3軸 0.10x · 4軸 0.55x · 5軸 2.50x',
  '3軸 0.18x · 4軸 1.20x · 5軸 7.00x',
  '3軸 0.45x · 4軸 4.00x · 5軸 25.00x',
];
const BIG_WIN_MULTIPLIER = 2;

export function HotlinePage({ theme = 'cyber' }: Props) {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const requireLogin = useRequireLogin();
  const slotTheme = getSlotTheme(theme);
  const isMegaSlot = slotTheme.rows > 3;
  const canvasAspectClass = isMegaSlot ? 'aspect-[16/10]' : 'aspect-[16/7]';
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
      void scene.init(canvas, w, h, slotTheme);
    };
    tryInit();
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [slotTheme]);

  const spin = async () => {
    if (busy) return;
    if (!requireLogin()) return;
    if (amount <= 0 || amount > balance) return;
    setBusy(true);
    setSpinning(true);
    setResult(null);
    setError(null);

    sceneRef.current?.resetWinLines();
    // 乐观动画：转轴立刻开始滚
    sceneRef.current?.startAnticipation();

    try {
      const payload: HotlineBetRequest = { amount, gameId: slotTheme.gameId };
      const res = await api.post<HotlineBetResult>('/games/hotline/bet', payload);
      const cascades = res.data.cascades ?? [];
      if (cascades.length > 0) {
        await sceneRef.current?.playCascadeSpin(cascades, res.data.grid);
      } else {
        await sceneRef.current?.playSpin(res.data.grid, res.data.lines);
      }
      const mult = res.data.multiplier ?? 0;
      const profitValue = Number.parseFloat(res.data.profit);
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
          won: profitValue >= 0,
          detail: cascades.length > 0
            ? `${cascades.length} 次消除 · ${res.data.lines.length} 方式`
            : `${res.data.lines.length} 連線`,
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

  const resultAmount = result ? Number.parseFloat(result.amount) : 0;
  const resultPayout = result ? Number.parseFloat(result.payout) : 0;
  const resultProfit = result ? Number.parseFloat(result.profit) : 0;
  const resultMultiplier = result?.multiplier ?? 0;
  const cascadeCount = result?.cascades?.length ?? 0;
  const isBigWinResult = resultProfit > 0 && resultMultiplier >= BIG_WIN_MULTIPLIER;
  const resultTitle = isBigWinResult
    ? '恭喜爆分'
    : resultPayout > resultAmount
      ? '恭喜中獎'
      : resultPayout > 0
        ? '小中獎派彩'
        : '本局未中';

  return (
    <div>
      {isMegaSlot && (
        <div className="slot-landscape-gate" role="status" aria-live="polite">
          <div className="slot-landscape-gate__panel">
            <RotateCw className="h-9 w-9 text-[#F3D67D]" aria-hidden="true" />
            <div className="text-center">
              <div className="text-sm font-black tracking-[0.18em] text-white">請將手機轉為橫向</div>
              <div className="mt-1 text-xs font-semibold text-white/65">5x6 盤面需要更寬的遊玩空間</div>
            </div>
          </div>
        </div>
      )}

      <GameHeader
        artwork={slotTheme.cover}
        section={slotTheme.section}
        breadcrumb={slotTheme.breadcrumb}
        title={slotTheme.title}
        titleSuffix={slotTheme.suffix}
        titleSuffixColor={slotTheme.rtpAccent}
        description={slotTheme.description}
        rtpLabel={slotTheme.rtpLabel}
        rtpAccent={slotTheme.rtpAccent}
      />

      <div className="game-play-grid grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="game-main-stack space-y-4">
          <div className="game-stage-panel scanlines relative overflow-hidden">
            <div className="game-stage-bar">
              <span className="font-semibold tracking-[0.12em] text-[#E8D48A]">{slotTheme.stageLabel}</span><span className="ml-2 text-white/40">·</span><span className="ml-2 text-white/55 uppercase">{slotTheme.suffix}</span>
              <span className="text-white/72">
                {spinning ? slotTheme.spinningLabel : slotTheme.readyLabel}
              </span>
            </div>

            <div className={`game-canvas-shell game-canvas-wide ${canvasAspectClass} w-full p-2`}>
              <canvas ref={canvasRef} className="h-full w-full" />
            </div>

            {result && !spinning && isBigWinResult && (
              <div
                className="slot-bigwin-stage"
                style={slotTheme.bigWin ? { backgroundImage: `linear-gradient(90deg, rgba(5, 10, 19, 0.72), rgba(5, 10, 19, 0.32)), url(${slotTheme.bigWin})` } : undefined}
              >
                <div className="slot-bigwin-stage__content">
                  <div className="slot-bigwin-stage__eyebrow">連鎖消除</div>
                  <div className="slot-bigwin-stage__title">恭喜爆分</div>
                  <div className="slot-bigwin-stage__amount">
                    +{formatAmount(result.profit)}
                  </div>
                  <div className="slot-bigwin-stage__meta">
                    {formatMultiplier(result.multiplier)}
                    {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          {result && !spinning && (
            <div
              className={`game-result-card slot-result-card ${isBigWinResult ? 'slot-result-card-bigwin' : ''} ${resultProfit >= 0 ? 'game-result-card-win' : 'game-result-card-loss'}`}
            >
              <div className="slot-result-summary flex flex-col items-center justify-center gap-1 text-center">
                <div>
                  <div className="mb-1 text-[12px] font-black tracking-[0.22em] text-[#F3D67D]">
                    {resultTitle}
                  </div>
                  <div className="font-display text-4xl text-white">
                    {result.lines.length}{' '}
                    {result.lines.length !== 1 ? t.games.hotline.lines : t.games.hotline.line}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.25em] text-white/75">
                    {t.games.hotline.totalMult} {formatMultiplier(result.multiplier)}
                    {cascadeCount > 0 ? ` · ${cascadeCount} 次消除` : ''}
                  </div>
                </div>
                <div className="slot-result-payout num text-2xl text-[#F3D67D]">
                  派彩 {formatAmount(result.payout)}
                </div>
                <div className="slot-result-profit num text-3xl text-[#7DD3FC]">
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
                          {l.ways
                            ? `方式 ${i + 1} · ${l.count} 軸 · ${l.ways} 組`
                            : `${l.lineId ? `${t.games.hotline.line} ${i + 1}` : `${t.games.hotline.row} ${l.row + 1}`} · ${l.count}×`}
                        </span>
                        <SlotSymbolBadge theme={slotTheme} symbol={l.symbol} showLabel useShortLabel />
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
              guestMode={!user}
              disabled={busy}
            />

            <button
              type="button"
              onClick={spin}
              disabled={busy || (!!user && balance < amount)}
              className="btn-acid mt-6 w-full py-4"
            >
              → {t.games.hotline.spin} · {formatAmount(amount)}
            </button>
            <div className="game-balance-strip mt-3">
              <span>
                {t.bet.balance} <span className="data-num ml-1 text-white">{user ? formatAmount(balance) : '登入後顯示'}</span>
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
              {slotTheme.symbols.map((symbol, index) => (
                <div
                  key={`${slotTheme.id}-${symbol.label}`}
                  className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 last:border-0 last:pb-0"
                >
                  <SlotSymbolBadge theme={slotTheme} symbol={index} showLabel />
                  <span className="data-num text-right text-white/85">
                    {isMegaSlot ? MEGA_SYMBOL_PAYOUTS[index] : '3x · 4x · 5x'}
                  </span>
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

function SlotSymbolBadge({
  theme,
  symbol,
  showLabel = false,
  useShortLabel = false,
}: {
  theme: SlotThemeConfig;
  symbol: number;
  showLabel?: boolean;
  useShortLabel?: boolean;
}) {
  const meta = theme.symbols[symbol] ?? theme.symbols[0]!;
  const label = useShortLabel ? meta.shortLabel : meta.label;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
      style={{
        borderColor: `${meta.accentHex}33`,
        backgroundColor: `${meta.accentHex}14`,
        color: meta.accentHex,
      }}
    >
      <span
        className="block h-7 w-7 shrink-0 rounded-full border bg-cover bg-center shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)]"
        style={{
          borderColor: `${meta.accentHex}40`,
          backgroundImage: `url(${theme.symbolSheet})`,
          backgroundSize: '300% 200%',
          backgroundPosition: SYMBOL_POSITIONS[symbol] ?? '0% 0%',
        }}
        aria-hidden="true"
      />
      {showLabel ? <span className="tracking-[0.18em]">{label}</span> : null}
    </span>
  );
}
