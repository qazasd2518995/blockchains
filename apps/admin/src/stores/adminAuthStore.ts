import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AgentPublic } from '@bg/shared';

interface AdminAuthState {
  agent: AgentPublic | null;
  accessToken: string | null;
  refreshToken: string | null;
  setAuth: (agent: AgentPublic, accessToken: string, refreshToken: string) => void;
  setAgent: (agent: AgentPublic) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      agent: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (agent, accessToken, refreshToken) => set({ agent, accessToken, refreshToken }),
      setAgent: (agent) => set({ agent }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      logout: () => set({ agent: null, accessToken: null, refreshToken: null }),
    }),
    { name: 'bg-admin-auth' },
  ),
);
