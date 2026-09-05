import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

/** Unknown writes are reconciled with the server, never assumed rolled back. */
export function useRoundRecovery<T>(game: 'mines' | 'tower', restore: (state: T | null) => void) {
  const userId = useAuthStore((s) => s.user?.id);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const revision = useRef(0);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sync = useCallback(async () => {
    const current = ++revision.current;
    readyRef.current = false;
    setReady(false);
    setSyncing(true);
    setError(null);
    if (!userId) {
      setSyncing(false);
      return false;
    }
    try {
      const result = await api.get<{ state: T | null }>(`/games/${game}/active`);
      // Read wallet after the round so an already committed start cannot be
      // paired with a pre-start balance from a concurrently completed GET.
      const wallet = await api.get<{ balance: string }>('/wallet/balance');
      if (current !== revision.current || useAuthStore.getState().user?.id !== userId) return false;
      restoreRef.current(result.data.state);
      useAuthStore.getState().setBalance(wallet.data.balance);
      readyRef.current = true;
      setReady(true);
      return true;
    } catch {
      if (current === revision.current) setError('無法確認牌局與餘額，請重新同步後再操作。');
      return false;
    } finally {
      if (current === revision.current) setSyncing(false);
    }
  }, [game, userId]);
  useEffect(() => {
    void sync();
    return () => {
      ++revision.current;
      readyRef.current = false;
    };
  }, [sync]);
  return { ready, readyRef, syncing, error, sync };
}
