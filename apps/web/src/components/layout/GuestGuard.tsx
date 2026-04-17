import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function GuestGuard({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuthStore();
  if (accessToken && user) return <Navigate to="/lobby" replace />;
  return <>{children}</>;
}
