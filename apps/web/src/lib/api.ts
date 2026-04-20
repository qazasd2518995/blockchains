import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// prod: https://api.xxx.com；dev: 空字串讓 vite proxy 處理 /api
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE}/api/auth/refresh`, { refreshToken });
          const data = response.data as { accessToken: string; refreshToken: string };
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
