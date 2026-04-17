import { useState } from 'react';
import type { PlinkoBetRequest, PlinkoBetResult, PlinkoRisk } from '@bg/shared';
import { api, extractApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { BetControls } from '@/components/game/BetControls';
import { GameHeader } from '@/components/game/GameHeader';
import { formatAmount, formatMultiplier } from '@/lib/utils';
import { useTranslation } from '@/i18n/useTranslation';

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
  const [ballPath, setBallPath] = useState<('left' | 'right')[] | null>(null);
  const [animStep, setAnimStep] = useState(0);

  const drop = async () => {
    if (busy || amount <= 0 || amount > balance) return;
    setBusy(true);
    setError(null);
    try {
      const payload: PlinkoBetRequest = { amount, rows, risk };
      const res = await api.post<PlinkoBetResult>('/games/plinko/bet', payload);
      setBallPath(res.data.path);
      setAnimStep(0);
      const stepMs = 90;
      for (let i = 0; i <= res.data.path.length; i += 1) {
        setTimeout(() => setAnimStep(i), i * stepMs);
      }
      setTimeout(() => {
        setResults((prev) => [res.data, ...prev].slice(0, 8));
        setBalance(res.data.newBalance);
        setBusy(false);
      }, res.data.path.length * stepMs + 300);
    } catch (err) {
      setError(extractApiError(err).message);
      setBusy(false);
    }
  };

  const previewTable = (() => {
    if (results[0]) return results[0].multipliers;
    const buckets = rows + 1;
    return Array.from({ length: buckets }, (_, i) => {
      const dist = Math.abs(i - rows / 2) / (rows / 2);
      if (risk === 'low') return 0.5 + dist * 4;
      if (risk === 'medium') return 0.3 + dist * 12;
      return 0.2 + dist * 40;
    });
  })();

  const boardWidth = 600;
  const boardHeight = 500;
  const peg = (row: number, col: number) => {
    const spacing = boardWidth / (rows + 2);
    const rowSpacing = boardHeight / (rows + 2);
    const x = boardWidth / 2 + (col - row / 2) * spacing;
    const y = 40 + row * rowSpacing;
    return { x, y };
  };

  const ballPos = (() => {
    if (!ballPath) return null;
    let col = 0;
    for (let i = 0; i < Math.min(animStep, ballPath.length); i += 1) {
      if (ballPath[i] === 'right') col += 1;
    }
    if (animStep === 0) return { x: boardWidth / 2, y: 20 };
    if (animStep <= ballPath.length) return peg(animStep, col);
    const bucketWidth = boardWidth / (rows + 1);
    return { x: bucketWidth / 2 + col * bucketWidth, y: boardHeight - 20 };
  })();

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="crt-panel scanlines p-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 text-[10px] tracking-[0.25em]">
              <span className="text-ink-500">TERMINAL://PLINKO</span>
              <span className="text-ink-400">
                {rows} {t.games.plinko.rows} · {t.games.mines[risk]}
              </span>
            </div>
            <svg
              viewBox={`0 0 ${boardWidth} ${boardHeight + 40}`}
              className="mt-4 w-full"
            >
              {Array.from({ length: rows }, (_, r) =>
                Array.from({ length: r + 1 }, (_, c) => {
                  const { x, y } = peg(r + 1, c);
                  return (
                    <circle key={`${r}-${c}`} cx={x} cy={y} r={3} fill="#d4ff3a" opacity={0.5} />
                  );
                }),
              )}

              {ballPos && (
                <circle cx={ballPos.x} cy={ballPos.y} r={7} fill="#ff4e50">
                  <animate attributeName="r" values="7;9;7" dur="0.3s" repeatCount="indefinite" />
                </circle>
              )}

              {previewTable.map((m, i) => {
                const bucketWidth = boardWidth / (rows + 1);
                const x = bucketWidth / 2 + i * bucketWidth;
                const y = boardHeight + 10;
                const big = m >= 10;
                const fill = m === 0 ? '#252b3f' : big ? '#ff4e50' : m < 1 ? '#384057' : '#d4ff3a';
                return (
                  <g key={i}>
                    <rect
                      x={x - bucketWidth / 2 + 2}
                      y={boardHeight - 24}
                      width={bucketWidth - 4}
                      height={40}
                      fill={fill}
                      opacity={0.2}
                      stroke={fill}
                    />
                    <text
                      x={x}
                      y={y + 8}
                      textAnchor="middle"
                      fontSize={big ? 12 : 10}
                      fill={fill}
                      fontFamily="IBM Plex Mono"
                      fontWeight="bold"
                    >
                      {m < 1 ? m.toFixed(1) : m.toFixed(0)}x
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

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
                  className={`big-num text-xl ${
                    r.multiplier >= 1 ? 'text-neon-acid' : 'text-neon-ember'
                  }`}
                >
                  {formatMultiplier(r.multiplier)}
                </div>
              </div>
            ))}
          </div>

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
                        : 'border-white/10 bg-ink-950/50 text-ink-300'
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
