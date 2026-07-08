import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getHallByGameId } from '@/data/halls';
import { getLocalizedHallName } from '@/i18n/hallLabels';
import { useTranslation } from '@/i18n/useTranslation';
import { isMobileLobbyViewport } from '@/lib/mobileViewport';
import { useAuthStore } from '@/stores/authStore';

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
  const { locale, t } = useTranslation();
  const username = useAuthStore((state) => state.user?.username ?? null);

  return useMemo(() => {
    const state = (location.state ?? null) as GameRouteState | null;
    const stateReturnTo = internalPath(state?.returnTo);
    if (stateReturnTo) {
      return {
        to: stateReturnTo,
        label: typeof state?.returnLabel === 'string' ? state.returnLabel : t.common.hall,
      };
    }

    if (isMobileLobbyViewport()) {
      return { to: '/lobby', label: t.common.lobby };
    }

    const hall = getHallByGameId(currentGameId(location.pathname), username);
    if (hall) return { to: `/hall/${hall.id}`, label: getLocalizedHallName(hall, locale) };

    return { to: '/lobby', label: t.common.lobby };
  }, [locale, location.pathname, location.state, t.common.hall, t.common.lobby, username]);
}
