import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

export function AdminGuard({ children }: { children: ReactNode }): JSX.Element {
  const { agent, accessToken } = useAdminAuthStore();
  const location = useLocation();
  if (!agent || !accessToken) {
    const from = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?from=${from}`} replace />;
  }
  return <>{children}</>;
}

export function AdminGuestGuard({ children }: { children: ReactNode }): JSX.Element {
  const { agent, accessToken } = useAdminAuthStore();
  if (agent && accessToken) {
    return <Navigate to="/admin/dashboard" replace />;
  }
  return <>{children}</>;
}
