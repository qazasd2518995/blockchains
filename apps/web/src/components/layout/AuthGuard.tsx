import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { accessToken, user } = useAuthStore();
  const location = useLocation();
  if (!accessToken || !user) {
    return <Navigate to={`/login?from=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
