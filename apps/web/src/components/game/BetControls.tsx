import { useEffect, useState } from 'react';
import { useTranslation } from '@/i18n/useTranslation';

interface BetControlsProps {
  amount: number;
  onAmountChange: (v: number) => void;
  maxBalance: number;
  disabled?: boolean;
  min?: number;
}

export function BetControls({
  amount,
  onAmountChange,
  maxBalance,
  disabled,
  min = 0.01,
}: BetControlsProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(amount.toFixed(2));

  useEffect(() => {
    setText(amount.toFixed(2));
  }, [amount]);

  const syncText = (v: number) => {
    onAmountChange(v);
    setText(v.toFixed(2));
  };

  const clamp = (v: number) => Math.min(maxBalance, Math.max(min, v));

  return (
    <div>
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] text-ink-500">01</span>
          <span className="text-[11px] font-semibold tracking-[0.25em] text-ink-300">
            {t.bet.stake}
          </span>
        </div>
        <span className="data-num text-[10px] text-ink-500">
          {t.bet.max} {maxBalance.toFixed(2)}
        </span>
      </div>

      <div className="mt-3 flex items-stretch">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = Number.parseFloat(text);
            if (Number.isFinite(v)) syncText(clamp(v));
            else setText(amount.toFixed(2));
          }}
          disabled={disabled}
          className="term-input flex-1 text-right font-display text-3xl tracking-tight"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => syncText(clamp(amount / 2))}
          className="border-y border-r border-white/10 bg-ink-900/80 px-3 font-mono text-sm font-bold text-ink-300 transition hover:border-neon-acid hover:text-neon-acid disabled:opacity-40"
        >
          ½
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => syncText(clamp(amount * 2))}
          className="border-y border-r border-white/10 bg-ink-900/80 px-3 font-mono text-sm font-bold text-ink-300 transition hover:border-neon-acid hover:text-neon-acid disabled:opacity-40"
        >
          2×
        </button>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-1">
        {[1, 10, 100, 1000].map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled || v > maxBalance}
            onClick={() => syncText(clamp(v))}
            className="border border-white/10 bg-ink-950/50 py-1.5 font-mono text-[11px] text-ink-300 transition hover:border-neon-acid hover:bg-neon-acid/10 hover:text-neon-acid disabled:opacity-30"
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => syncText(clamp(maxBalance))}
          className="border border-neon-acid/50 bg-neon-acid/10 py-1.5 font-mono text-[11px] font-bold tracking-[0.2em] text-neon-acid transition hover:bg-neon-acid/20 disabled:opacity-30"
        >
          {t.bet.max}
        </button>
      </div>
    </div>
  );
}
