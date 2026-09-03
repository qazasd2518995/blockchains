import { useEffect } from 'react';

import {
  getAccessTokenRefreshDelayMs,
  refreshAccessTokenProactively,
} from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export function useProactiveGameTokenRefresh(): void {
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    const refreshDelay = getAccessTokenRefreshDelayMs(accessToken);
    if (refreshDelay === null) return;

    const refresh = () => {
      void refreshAccessTokenProactively().catch(() => undefined);
    };
    const timer = window.setTimeout(refresh, refreshDelay);
    const refreshWhenVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        getAccessTokenRefreshDelayMs(useAuthStore.getState().accessToken) === 0
      ) {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [accessToken]);
}
