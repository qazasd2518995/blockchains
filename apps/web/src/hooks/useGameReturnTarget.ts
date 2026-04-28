import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getHallByGameId } from '@/data/halls';

interface GameRouteState {
  returnTo?: unknown;
  returnLabel?: unknown;
}

function internalPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

function currentGameId(pathname: string): string {
  return pathname.replace(/^\/games\//, '').split('/')[0] ?? '';
}

export function useGameReturnTarget(): { to: string; label: string } {
  const location = useLocation();

  return useMemo(() => {
    const state = (location.state ?? null) as GameRouteState | null;
    const stateReturnTo = internalPath(state?.returnTo);
    if (stateReturnTo) {
      return {
        to: stateReturnTo,
        label: typeof state?.returnLabel === 'string' ? state.returnLabel : '館別',
      };
    }

    const hall = getHallByGameId(currentGameId(location.pathname));
    if (hall) return { to: `/hall/${hall.id}`, label: hall.nameZh };

    return { to: '/lobby', label: '大廳' };
  }, [location.pathname, location.state]);
}
