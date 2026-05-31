import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserPublic } from '@bg/shared';

interface AuthState {
  user: UserPublic | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (user: UserPublic, accessToken: string, refreshToken: string) => void;
  setUser: (user: UserPublic) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setBalance: (balance: string) => void;
  debitBalance: (amount: number) => string | null;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => set({ user, accessToken, refreshToken }),
      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setBalance: (balance) =>
        set((s) => (s.user ? { user: { ...s.user, balance } } : {})),
      debitBalance: (amount) => {
        let previousBalance: string | null = null;
        set((s) => {
          if (!s.user) return {};
          const current = Number.parseFloat(s.user.balance);
          if (!Number.isFinite(current)) return {};
          previousBalance = s.user.balance;
          return {
            user: {
              ...s.user,
              balance: Math.max(0, current - amount).toFixed(2),
            },
          };
        });
        return previousBalance;
      },
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'bg-auth' },
  ),
);
