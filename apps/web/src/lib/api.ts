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

const DEFAULT_ERRORS: Record<string, string> = {
  UNAUTHORIZED: '身份未授权,请重新登录',
  NETWORK_ERROR: '連線異常，請稍後再試',
  INVALID_CREDENTIALS: '账号或密码错误',
  EMAIL_TAKEN: '此邮箱已被使用',
  USER_NOT_FOUND: '找不到该用户',
  INSUFFICIENT_FUNDS: '余额不足',
  INVALID_BET: '下注参数不合法',
  BET_OUT_OF_RANGE: '下注金额超出范围',
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
  const msg = (rawMessage ?? '').toLowerCase();
  if (msg.includes('invalid username or password')) return '账号或密码错误';
  if (msg.includes('invalid email or password')) return '账号或密码错误';
  if (msg.includes('user not found')) return '找不到该用户';
  if (msg.includes('round not accepting bets')) return '本局已不接受下注';
  if (msg.includes('insufficient')) return '余额不足';
  if (msg.includes('authentication required')) return '请先登录';
  if (msg.includes('invalid refresh token')) return 'Session 已过期,请重新登录';
  if (msg.includes('member accounts are created by agents only')) return '会员账号需由代理开通,无法公开注册';
  if (msg.includes('only player accounts can enter baccarat')) {
    return '当前账号不是玩家账号，只有玩家账号可以进入百家乐';
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
