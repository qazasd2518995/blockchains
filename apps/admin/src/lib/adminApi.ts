import axios, { AxiosError } from 'axios';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// One-time env dump so you can verify production build has the right API base.
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.info('[adminApi] VITE_API_BASE =', JSON.stringify(API_BASE), ' → baseURL =', `${API_BASE}/api/admin`);
}

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
  // eslint-disable-next-line no-console
  console.debug('[adminApi] →', (config.method ?? 'GET').toUpperCase(), (config.baseURL ?? '') + (config.url ?? ''), {
    hasToken: Boolean(token),
  });
  return config;
});

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string }> | null = null;

adminApi.interceptors.response.use(
  (res) => {
    // eslint-disable-next-line no-console
    console.debug('[adminApi] ←', res.status, (res.config.baseURL ?? '') + (res.config.url ?? ''));
    return res;
  },
  async (error: AxiosError) => {
    // eslint-disable-next-line no-console
    console.warn('[adminApi] ✗', error.response?.status ?? 'network', {
      url: (error.config?.baseURL ?? '') + (error.config?.url ?? ''),
      data: error.response?.data,
      message: error.message,
    });
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
