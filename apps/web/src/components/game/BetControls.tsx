import { useEffect, useState } from 'react';
import { Sfx } from '@bg/game-engine';
import { getBettingLimitForGame, MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';
import { useTranslation } from '@/i18n/useTranslation';
import { useAuthStore } from '@/stores/authStore';

interface BetControlsProps {
  amount: number;
  onAmountChange: (v: number) => void;
  maxBalance: number;
  disabled?: boolean;
  min?: number;
  max?: number;
  guestMode?: boolean;
  gameId?: string;
  label?: string;
  limitLabel?: string;
  showPresets?: boolean;
}

export function BetControls({
  amount,
  onAmountChange,
  maxBalance,
  disabled,
  min = MIN_BET_AMOUNT,
  max = MAX_BET_AMOUNT,
  guestMode = false,
  gameId,
  label,
  limitLabel,
  showPresets = true,
}: BetControlsProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const configuredLimit =
    user && gameId
      ? getBettingLimitForGame(user.bettingLimits, gameId, user.bettingLimitLevel)
      : null;
  const minLimit = Math.max(min, configuredLimit?.min ?? min);
  const maxLimit = Math.min(max, configuredLimit?.max ?? max);
  const [text, setText] = useState(amount.toFixed(2));
  const [localError, setLocalError] = useState<string | null>(null);

  const formatLimit = (value: number) =>
    value.toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });

  const availableBalance = Number.isFinite(maxBalance) ? Math.max(0, maxBalance) : 0;
  const stakeMax = Math.max(minLimit, maxLimit);
  const effectiveMax = guestMode
    ? stakeMax
    : Math.min(stakeMax, Math.max(minLimit, availableBalance));

  const validateAmount = (raw: string): string | null => {
    if (!raw.trim()) return null;
    const v = Number(raw);
    if (!Number.isFinite(v)) return t.bet.invalidAmount;
    if (v < minLimit) return `${t.bet.minBetPrefix}${formatLimit(minLimit)}。`;
    if (v > stakeMax) return `${t.bet.maxBetPrefix}${formatLimit(stakeMax)}。`;
    if (!guestMode && v > availableBalance) {
      return `${t.bet.insufficientAvailablePrefix}${formatLimit(availableBalance)}。`;
    }
    return null;
  };

  useEffect(() => {
    setText(amount.toFixed(2));
    setLocalError(validateAmount(amount.toFixed(2)));
  }, [amount, maxBalance, maxLimit, minLimit]);

  useEffect(() => {
    if (disabled) return;
    if (amount < minLimit) {
      onAmountChange(minLimit);
      return;
    }
    if (amount > effectiveMax) {
      onAmountChange(effectiveMax);
    }
  }, [amount, disabled, effectiveMax, minLimit, onAmountChange]);

  const syncText = (v: number) => {
    onAmountChange(v);
    setText(v.toFixed(2));
    setLocalError(null);
    Sfx.tick();
  };

  const clamp = (v: number) => Math.max(minLimit, Math.min(effectiveMax, v));

  return (
    <div className="bet-controls rounded-[16px] border border-white/10 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-[20px] sm:p-4">
      <div className="bet-controls__header flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[9px] text-white/45">01</span>
          <span className="text-[11px] font-semibold tracking-[0.16em] text-white/85">
            {label ?? t.bet.stake}
          </span>
        </div>
        <span className="data-num text-[10px] text-white/55">
          {guestMode ? t.bet.loginToBet : `${limitLabel ?? t.bet.stakeLimit} ${formatLimit(stakeMax)}`}
        </span>
      </div>

      <div className="bet-controls__entry mt-3 rounded-[16px] border border-white/10 bg-white/[0.06] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:mt-4 sm:rounded-[18px]">
        <input
          type="text"
          name="bet-amount"
          inputMode="decimal"
          autoComplete="off"
          aria-label={label ?? t.bet.stake}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setLocalError(validateAmount(e.target.value));
          }}
          onBlur={() => {
            const v = Number(text);
            if (Number.isFinite(v)) syncText(clamp(v));
            else {
              setText(amount.toFixed(2));
              setLocalError(null);
            }
          }}
          disabled={disabled}
          className="bet-controls__input w-full border-0 bg-transparent px-2 py-2 text-right font-display text-[30px] tracking-tight text-white shadow-none focus-visible:border-transparent focus-visible:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F3D67D]/60 focus-visible:outline-offset-2 focus-visible:shadow-none sm:py-3 sm:text-4xl"
        />
        <div className="bet-controls__adjusters mt-2 grid grid-cols-2 gap-2">
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
      <div
        className={`bet-controls__limit-hint ${
          localError ? 'bet-controls__limit-hint--error' : ''
        }`}
      >
        {localError ?? `${limitLabel ?? t.bet.stakeLimit} ${formatLimit(stakeMax)}`}
      </div>

      {showPresets ? (
        <div className="bet-controls__presets mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
          {[10, 100, 1000, 10000].map((v) => (
            <button
              key={v}
              type="button"
              disabled={disabled || (!guestMode && v > availableBalance)}
              onClick={() => syncText(clamp(v))}
              className="game-choice-btn px-0 py-2.5"
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled || guestMode}
            onClick={() => syncText(clamp(availableBalance))}
            className="game-choice-btn game-choice-btn-acid px-0 py-2.5"
          >
            {t.bet.max}
          </button>
        </div>
      ) : null}
    </div>
  );
}
