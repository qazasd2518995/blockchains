import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { warmBaccaratInBackground } from '@/lib/baccaratWarmup';

export function BaccaratWarmup() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user?.id || user.role !== 'PLAYER') return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;
    const run = () => {
      if (cancelled) return;
      void warmBaccaratInBackground({ userId: user.id, username: user.username });
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      timeoutId = globalThis.setTimeout(run, 900);
    }

    return () => {
      cancelled = true;
      if (idleId !== null && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    };
  }, [user?.id, user?.role, user?.username]);

  return null;
}
