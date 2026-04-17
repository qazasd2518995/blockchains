import { useEffect, useRef, useState } from 'react';
import type { WheelBetRequest, WheelBetResult, WheelRisk, WheelSegmentCount } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

export function WheelPage() {
  const { user, setBalance } = useAuthStore();
  const { t } = useTranslation();
  const balance = Number.parseFloat(user?.balance ?? '0');
  const [amount, setAmount] = useState(10);
  const [risk, setRisk] = useState<WheelRisk>('medium');
  const [segments, setSegments] = useState<WheelSegmentCount>(10);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<WheelBetResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<number[]>([]);

  useEffect(() => {
    const preview: number[] = Array.from({ length: segments }, (_, i) => {
      if (risk === 'low') return i % 5 === 4 ? 0 : 1.2;
      if (risk === 'medium') return i % 5 === 2 ? 0 : i % 10 === 0 ? 3 : 1.7;
      return i === 0 ? segments * 0.99 : 0;
    });
    tableRef.current = preview;
  }, [risk, segments]);

  const spin = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      const payload: WheelBetRequest = { amount, risk, segments };
      const res = await api.post<WheelBetResult>('/games/wheel/bet', payload);
      const target = res.data.segmentIndex;
      const segmentAngle = 360 / segments;
      const finalRotation = 1800 + 360 - (target * segmentAngle + segmentAngle / 2);
      setRotation((r) => r + finalRotation);
      setTimeout(() => {
        setResult(res.data);
        setBalance(res.data.newBalance);
        tableRef.current = res.data.segmentMultipliers;
        setBusy(false);
      }, 3200);
    } catch (err) {
      setError(extractApiError(err).message);
      setBusy(false);
    }
  };

  const table = tableRef.current.length ? tableRef.current : Array.from({ length: segments }, () => 0);
  const segmentAngle = 360 / segments;

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="crt-panel scanlines relative overflow-hidden p-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://WHEEL</span>
              <span className="text-ink-400">
                {segments} {t.games.wheel.segments} · {t.games.mines[risk]}
              </span>
            </div>

            <div className="relative mx-auto mt-8 aspect-square w-full max-w-md">
              <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 border-x-[12px] border-b-0 border-t-[20px] border-x-transparent border-t-neon-acid" />
              <div
                className="absolute inset-0 rounded-full border-2 border-white/10 bg-ink-900 transition-transform duration-[3000ms]"
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transitionTimingFunction: 'cubic-bezier(0.17, 0.67, 0.24, 1)',
                }}
              >
                <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
                  {table.map((mult, i) => {
                    const startAngle = (i * segmentAngle * Math.PI) / 180;
                    const endAngle = ((i + 1) * segmentAngle * Math.PI) / 180;
                    const x1 = 100 + 95 * Math.cos(startAngle);
                    const y1 = 100 + 95 * Math.sin(startAngle);
                    const x2 = 100 + 95 * Math.cos(endAngle);
                    const y2 = 100 + 95 * Math.sin(endAngle);
                    const large = segmentAngle > 180 ? 1 : 0;
                    const fill =
                      mult === 0 ? '#252b3f' : mult < 2 ? '#d4ff3a' : mult < 5 ? '#ffb547' : '#ff4e50';
                    const stroke = '#05060a';
                    return (
                      <path
                        key={i}
                        d={`M 100 100 L ${x1} ${y1} A 95 95 0 ${large} 1 ${x2} ${y2} Z`}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="1"
                      />
                    );
                  })}
                </svg>
                <div className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-neon-acid bg-ink-950 font-display text-2xl text-neon-acid">
                  ✦
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
                  <div className="font-display text-4xl text-bone">
                    {formatMultiplier(result.multiplier)}
                  </div>
                  <div className="text-[11px] tracking-[0.25em] text-ink-400">
                    {t.games.wheel.segment}{result.segmentIndex}
                  </div>
                </div>
                <div className="big-num text-3xl text-neon-acid">
                  {Number.parseFloat(result.profit) >= 0 ? '+' : ''}
                  {formatAmount(result.profit)}
                </div>
              </div>
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
                {(['low', 'medium', 'high'] as WheelRisk[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRisk(r)}
                    disabled={busy}
                    className={`border py-2 font-mono text-[11px] tracking-[0.2em] transition ${
                      risk === r
                        ? 'border-neon-acid bg-neon-acid/10 text-neon-acid'
                        : 'border-white/10 bg-ink-950/50 text-ink-300'
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
                        : 'border-white/10 bg-ink-950/50 text-ink-300'
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
