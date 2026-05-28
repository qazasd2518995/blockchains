import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';

// prod: https://api.xxx.com；dev: 空字串讓 vite proxy 處理 /api
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
});

type RetriableRequestConfig = NonNullable<AxiosError['config']> & { _retry?: boolean };
type TokenPair = { accessToken: string; refreshToken: string };

const TOKEN_REFRESH_SKEW_MS = 30_000;

let refreshInFlight: Promise<TokenPair> | null = null;
let sessionReplacedNotified = false;

function isPublicAuthRequest(url?: string): boolean {
  const path = url?.split('?')[0] ?? '';
  return [
    '/auth/captcha',
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/register',
  ].includes(path);
}

function getJwtExpiresAtMs(token: string | null): number | null {
  if (!token) return null;
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = globalThis.atob(padded);
    const parsed = JSON.parse(decoded) as { exp?: unknown };
    return typeof parsed.exp === 'number' ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

function shouldRefreshBeforeRequest(token: string | null): boolean {
  const expiresAt = getJwtExpiresAtMs(token);
  if (!expiresAt) return false;
  return expiresAt - Date.now() <= TOKEN_REFRESH_SKEW_MS;
}

async function refreshUserTokens(refreshToken: string): Promise<TokenPair> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${API_BASE}/api/auth/refresh`, { refreshToken })
      .then((r) => r.data as TokenPair)
      .finally(() => {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      });
  }
  return refreshInFlight;
}

function getApiErrorCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const body = error.response?.data as ApiErrorBody | undefined;
  return body && typeof body === 'object' && 'code' in body ? body.code : null;
}

function handleSessionReplaced(): void {
  if (!sessionReplacedNotified) {
    sessionReplacedNotified = true;
    window.alert('您的帳號已在其他裝置登入，本裝置已被登出。');
  }
  useAuthStore.getState().logout();
}

api.interceptors.request.use(async (config) => {
  const { accessToken, refreshToken, setTokens, logout } = useAuthStore.getState();
  let token = accessToken;
  if (
    token &&
    refreshToken &&
    !isPublicAuthRequest(config.url) &&
    shouldRefreshBeforeRequest(token)
  ) {
    try {
      const data = await refreshUserTokens(refreshToken);
      setTokens(data.accessToken, data.refreshToken);
      token = data.accessToken;
    } catch (err) {
      if (getApiErrorCode(err) === 'SESSION_REPLACED') {
        handleSessionReplaced();
        throw err;
      }
      logout();
      throw err;
    }
  }
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalConfig = error.config as RetriableRequestConfig | undefined;
    const code = getApiErrorCode(error);
    if (error.response?.status === 401 && code === 'SESSION_REPLACED') {
      handleSessionReplaced();
      throw error;
    }
    if (error.response?.status === 401 && !originalConfig?._retry) {
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (refreshToken) {
        try {
          const data = await refreshUserTokens(refreshToken);
          setTokens(data.accessToken, data.refreshToken);
          if (originalConfig) {
            originalConfig._retry = true;
            originalConfig.headers = originalConfig.headers ?? {};
            (originalConfig.headers as Record<string, string>).Authorization =
              `Bearer ${data.accessToken}`;
            return api.request(originalConfig);
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

const DEFAULT_ERRORS: Record<string, string> = {
  UNAUTHORIZED: '身份未授权,请重新登录',
  SESSION_REPLACED: '您的帳號已在其他裝置登入，本裝置已被登出',
  NETWORK_ERROR: '連線異常，請稍後再試',
  INVALID_CREDENTIALS: '账号或密码错误',
  INVALID_CAPTCHA: '驗證碼錯誤，請重新輸入',
  EMAIL_TAKEN: '此邮箱已被使用',
  USER_NOT_FOUND: '找不到该用户',
  INSUFFICIENT_FUNDS: '余额不足',
  INVALID_BET: '下注設定不符合規則，請檢查金額或選項',
  BET_OUT_OF_RANGE: '下注金額超出限紅',
  GAME_DISABLED: '该游戏目前停用',
  ROUND_NOT_FOUND: '找不到本局数据',
  ROUND_NOT_ACTIVE: '本局已不接受操作',
  INVALID_ACTION: '此动作不允许',
  SEED_NOT_REVEALED: '会话尚未结束',
  RATE_LIMITED: '操作过于频繁,请稍候再试',
  INTERNAL: '系统内部错误,请稍后再试',
  USERNAME_TAKEN: '此账号已被使用',
  MEMBER_FROZEN: '您的账号已被冻结,请联系代理',
  FORBIDDEN: '此操作不被允许',
};

function translateMessage(code: string, rawMessage: string): string {
  const raw = rawMessage ?? '';
  const msg = (rawMessage ?? '').toLowerCase();
  if (msg.includes('invalid username or password')) return '账号或密码错误';
  if (msg.includes('invalid email or password')) return '账号或密码错误';
  if (msg.includes('invalid current password')) return '目前密碼錯誤';
  if (msg.includes('new password must be different')) return '新密碼不能與目前密碼相同';
  if (msg.includes('user not found')) return '找不到该用户';
  if (msg.includes('round not accepting bets')) return '本局已不接受下注';
  if (msg.includes('insufficient')) return '余额不足';
  if (msg.includes('invalid bet amount')) return '請輸入有效下注金額';
  if (msg.includes('minimum bet is')) return '下注金額低於最低限制';
  if (msg.includes('max single bet is')) return '下注金額超出單注上限';
  if (msg.includes('authentication required')) return '请先登录';
  if (msg.includes('invalid refresh token')) return 'Session 已过期,请重新登录';
  if (msg.includes('member accounts are created by agents only'))
    return '会员账号需由代理开通,无法公开注册';
  if (msg.includes('only player accounts can enter baccarat')) {
    return '当前账号不是玩家账号，只有玩家账号可以进入百家乐';
  }
  if (raw.trim() && raw.trim().toLowerCase() !== 'invalid request' && /[\u4e00-\u9fff]/.test(raw)) {
    return raw;
  }
  return DEFAULT_ERRORS[code] ?? rawMessage;
}

export function extractApiError(err: unknown): ApiErrorBody {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body && typeof body === 'object' && 'code' in body) {
      return { ...body, message: translateMessage(body.code, body.message) };
    }
    if (!err.response) {
      return { code: 'NETWORK_ERROR', message: DEFAULT_ERRORS.NETWORK_ERROR ?? err.message };
    }
    return { code: 'INTERNAL', message: DEFAULT_ERRORS.INTERNAL ?? err.message };
  }
  if (err instanceof Error) return { code: 'INTERNAL', message: err.message };
  return { code: 'INTERNAL', message: String(err) };
}
