import axios, { AxiosError } from 'axios';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export const adminApi = axios.create({
  baseURL: `${API_BASE}/api/admin`,
  timeout: 15000,
});

adminApi.interceptors.request.use((config) => {
  const token = useAdminAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string }> | null = null;

adminApi.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const { refreshToken, setTokens, logout } = useAdminAuthStore.getState();
      if (refreshToken) {
        try {
          if (!refreshInFlight) {
            refreshInFlight = axios
              .post(`${API_BASE}/api/admin/auth/refresh`, { refreshToken })
              .then((r) => r.data as { accessToken: string; refreshToken: string })
              .finally(() => {
                setTimeout(() => (refreshInFlight = null), 0);
              });
          }
          const data = await refreshInFlight;
          setTokens(data.accessToken, data.refreshToken);
          if (error.config) {
            error.config.headers = error.config.headers ?? {};
            (error.config.headers as Record<string, string>).Authorization = `Bearer ${data.accessToken}`;
            return axios.request(error.config);
          }
        } catch {
          logout();
        }
      } else {
        logout();
      }
    }
    throw error;
  },
);

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export function extractApiError(err: unknown): ApiErrorBody {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body && typeof body === 'object' && 'code' in body) return body;
    return { code: 'INTERNAL', message: err.message };
  }
  if (err instanceof Error) return { code: 'INTERNAL', message: err.message };
  return { code: 'INTERNAL', message: String(err) };
}
