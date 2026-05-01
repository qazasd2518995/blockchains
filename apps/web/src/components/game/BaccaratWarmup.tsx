import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { BACCARAT_WARMUP_REFRESH_MS, warmBaccaratInBackground } from '@/lib/baccaratWarmup';

export function BaccaratWarmup() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user?.id || user.role !== 'PLAYER') return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    let intervalId: number | null = null;
    const run = () => {
      if (cancelled) return;
      void warmBaccaratInBackground({ userId: user.id, username: user.username });
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 800 });
    } else {
      timeoutId = globalThis.setTimeout(run, 350);
    }
    intervalId = globalThis.setInterval(run, BACCARAT_WARMUP_REFRESH_MS);

    return () => {
      cancelled = true;
      if (idleId !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      if (intervalId !== null) globalThis.clearInterval(intervalId);
    };
  }, [user?.id, user?.role, user?.username]);

  return null;
}
