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
      logout: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'bg-auth' },
  ),
);
