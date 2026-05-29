import { getBettingLimitForGame } from '@bg/shared';
import { useAuthStore } from '@/stores/authStore';

interface BettingLimitBadgeProps {
  gameId?: string;
  className?: string;
}

function formatLimitAmount(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

export function BettingLimitBadge({ gameId, className = '' }: BettingLimitBadgeProps) {
  const user = useAuthStore((state) => state.user);
  const limit = getBettingLimitForGame(user?.bettingLimits, gameId, user?.bettingLimitLevel);

  return (
    <div className={`betting-limit-badge ${className}`} aria-label="本遊戲單注限紅">
      <span>限紅</span>
      <strong>
        {formatLimitAmount(limit.min)}-{formatLimitAmount(limit.max)}
      </strong>
    </div>
  );
}
