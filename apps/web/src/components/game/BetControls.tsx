import { useEffect, useState } from 'react';
import { Sfx } from '@bg/game-engine';
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
    Sfx.tick();
  };

  const clamp = (v: number) => Math.min(maxBalance, Math.max(min, v));

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] text-white/45">01</span>
          <span className="text-[11px] font-semibold tracking-[0.16em] text-white/85">
            {t.bet.stake}
          </span>
        </div>
        <span className="data-num text-[10px] text-white/55">
          {t.bet.max} {maxBalance.toFixed(2)}
        </span>
      </div>

      <div className="mt-4 rounded-[18px] border border-white/10 bg-white/[0.06] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
          className="w-full border-0 bg-transparent px-2 py-3 text-right font-display text-4xl tracking-tight text-white shadow-none outline-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:shadow-none"
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => syncText(clamp(amount / 2))}
            className="game-choice-btn"
          >
            ½
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => syncText(clamp(amount * 2))}
            className="game-choice-btn game-choice-btn-acid"
          >
            2×
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 gap-2">
        {[1, 10, 100, 1000].map((v) => (
          <button
            key={v}
            type="button"
            disabled={disabled || v > maxBalance}
            onClick={() => syncText(clamp(v))}
            className="game-choice-btn px-0 py-2.5"
          >
            {v}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => syncText(clamp(maxBalance))}
          className="game-choice-btn game-choice-btn-acid px-0 py-2.5"
        >
          {t.bet.max}
        </button>
      </div>
    </div>
  );
}
