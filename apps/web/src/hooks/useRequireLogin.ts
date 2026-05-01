import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

function currentPathWithSearch(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function buildLoginPath(from: string, reason = 'bet'): string {
  return `/login?from=${encodeURIComponent(from)}&reason=${encodeURIComponent(reason)}`;
}

export function useRequireLogin(reason = 'bet'): () => boolean {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

  return useCallback(() => {
    if (accessToken && user) return true;
    navigate(buildLoginPath(currentPathWithSearch(location.pathname, location.search), reason));
    return false;
  }, [accessToken, location.pathname, location.search, navigate, reason, user]);
}
