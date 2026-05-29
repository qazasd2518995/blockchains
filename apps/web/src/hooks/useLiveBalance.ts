import { useEffect, useRef } from 'react';
import type { UserPublic } from '@bg/shared';
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
  const hasBettingLimits = useAuthStore((s) => Boolean(s.user?.bettingLimits));
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const setBalance = useAuthStore((s) => s.setBalance);
  const inFlight = useRef(false);
  const profileRefreshInFlight = useRef(false);

  useEffect(() => {
    if (!userId || !accessToken) return;
    let active = true;

    const refreshProfileIfNeeded = async () => {
      if (hasBettingLimits || profileRefreshInFlight.current) return;
      profileRefreshInFlight.current = true;
      try {
        const res = await api.get<UserPublic>('/auth/me');
        if (active) setUser(res.data);
      } catch {
        // Keep profile hydration silent. Auth interceptor handles expired sessions.
      } finally {
        profileRefreshInFlight.current = false;
      }
    };

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

    void refreshProfileIfNeeded();
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
  }, [accessToken, hasBettingLimits, intervalMs, setBalance, setUser, userId]);
}
