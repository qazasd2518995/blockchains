import { useEffect, useRef } from 'react';
import { ADMIN_LIVE_REFRESH_EVENT } from '@/lib/adminRefreshEvents';

export function useAdminLiveRefresh(refresh: () => void): void {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    const run = () => refreshRef.current();
    const runWhenVisible = () => {
      if (document.visibilityState === 'visible') run();
    };

    window.addEventListener('focus', run);
    window.addEventListener(ADMIN_LIVE_REFRESH_EVENT, run);
    document.addEventListener('visibilitychange', runWhenVisible);
    return () => {
      window.removeEventListener('focus', run);
      window.removeEventListener(ADMIN_LIVE_REFRESH_EVENT, run);
      document.removeEventListener('visibilitychange', runWhenVisible);
    };
  }, []);
}
