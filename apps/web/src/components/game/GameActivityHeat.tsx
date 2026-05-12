import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

interface GameActivityHeatProps {
  gameId: string;
}

export function GameActivityHeat({ gameId }: GameActivityHeatProps) {
  const { t } = useTranslation();
  const [count, setCount] = useState(() => getInitialActivityHeat(gameId));

  useEffect(() => {
    setCount(getInitialActivityHeat(gameId));
    const timer = window.setInterval(
      () => {
        setCount((current) => {
          const delta = Math.floor(Math.random() * 7) - 3;
          const nextDelta = delta === 0 ? 1 : delta;
          return clampActivityHeat(current + nextDelta);
        });
      },
      2600 + (hashString(gameId) % 1100),
    );
    return () => window.clearInterval(timer);
  }, [gameId]);

  return (
    <div className="game-activity-heat" aria-label={`${t.common.activityHeatLabel} ${count}`}>
      <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{t.common.activityHeat}</span>
      <strong className="data-num">{count}</strong>
    </div>
  );
}

function getInitialActivityHeat(gameId: string): number {
  return 10 + (hashString(gameId) % 51);
}

function clampActivityHeat(value: number): number {
  return Math.max(10, Math.min(60, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}
