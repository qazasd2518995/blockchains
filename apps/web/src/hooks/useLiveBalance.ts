import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export const WALLET_BALANCE_REFRESH_EVENT = 'bg-wallet-balance-refresh';

let walletBalanceRefreshHoldCount = 0;

export function requestWalletBalanceRefresh(): void {
  window.dispatchEvent(new Event(WALLET_BALANCE_REFRESH_EVENT));
}

export function holdWalletBalanceRefresh(): () => void {
  walletBalanceRefreshHoldCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    walletBalanceRefreshHoldCount = Math.max(0, walletBalanceRefreshHoldCount - 1);
  };
}

export function useLiveBalance(intervalMs = 5_000): void {
  const userId = useAuthStore((s) => s.user?.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setBalance = useAuthStore((s) => s.setBalance);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!userId || !accessToken) return;
    let active = true;

    const refresh = async () => {
      if (!active || inFlight.current || walletBalanceRefreshHoldCount > 0) return;
      inFlight.current = true;
      try {
        const res = await api.get<{ balance: string }>('/wallet/balance');
        if (active && walletBalanceRefreshHoldCount === 0) setBalance(res.data.balance);
      } catch {
        // Keep balance refresh silent. Auth interceptor handles expired sessions.
      } finally {
        inFlight.current = false;
      }
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener('focus', refresh);
    window.addEventListener(WALLET_BALANCE_REFRESH_EVENT, refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(WALLET_BALANCE_REFRESH_EVENT, refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [accessToken, intervalMs, setBalance, userId]);
}
