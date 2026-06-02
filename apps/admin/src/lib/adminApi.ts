import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAdminAuthStore } from '@/stores/adminAuthStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const ADMIN_API_DEBUG = String(import.meta.env.VITE_ADMIN_API_DEBUG ?? '').toLowerCase() === 'true';
const SENSITIVE_KEY_RE = /(authorization|cookie|password|token|secret|seed|signature|credential|key)/i;

export const adminApi = axios.create({
  baseURL: `${API_BASE}/api/admin`,
  timeout: 15000,
});

type RetriableRequestConfig = NonNullable<AxiosError['config']> & { _retry?: boolean };
type DebugRequestConfig = InternalAxiosRequestConfig & { _debugStartedAt?: number };
type AdminTokenPair = { accessToken: string; refreshToken: string };

const TOKEN_REFRESH_SKEW_MS = 30_000;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function sanitizeForDebug(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth >= 4) return '[MaxDepth]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForDebug(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? '[Redacted]' : sanitizeForDebug(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

function debugAdminApi(message: string, payload: Record<string, unknown>): void {
  if (!ADMIN_API_DEBUG) return;
  console.debug(`[admin-api] ${message}`, sanitizeForDebug(payload));
}

let refreshInFlight: Promise<AdminTokenPair> | null = null;
let sessionReplacedNotified = false;

function isPublicAuthRequest(url?: string): boolean {
  const path = url?.split('?')[0] ?? '';
  return ['/auth/captcha', '/auth/login', '/auth/refresh', '/auth/logout'].includes(path);
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

async function refreshAdminTokens(refreshToken: string): Promise<AdminTokenPair> {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${API_BASE}/api/admin/auth/refresh`, { refreshToken })
      .then((r) => r.data as AdminTokenPair)
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
    window.alert('此代理帳號已在其他裝置登入，本裝置已被登出。');
  }
  useAdminAuthStore.getState().logout();
}

function handleSessionExpired(): void {
  window.alert('總後台登入已超過 10 小時，請重新登入。');
  useAdminAuthStore.getState().logout();
}

adminApi.interceptors.request.use(async (config) => {
  (config as DebugRequestConfig)._debugStartedAt = nowMs();
  const { accessToken, refreshToken, setTokens, logout } = useAdminAuthStore.getState();
  let token = accessToken;
  if (token && refreshToken && !isPublicAuthRequest(config.url) && shouldRefreshBeforeRequest(token)) {
    try {
      const data = await refreshAdminTokens(refreshToken);
      setTokens(data.accessToken, data.refreshToken);
      token = data.accessToken;
    } catch (err) {
      if (getApiErrorCode(err) === 'SESSION_REPLACED') {
        handleSessionReplaced();
        throw err;
      }
      if (getApiErrorCode(err) === 'SESSION_EXPIRED') {
        handleSessionExpired();
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
  debugAdminApi('request', {
    method: config.method?.toUpperCase(),
    url: config.url,
    params: config.params,
    data: config.data,
  });
  return config;
});

adminApi.interceptors.response.use(
  (res) => {
    const startedAt = (res.config as DebugRequestConfig)._debugStartedAt;
    debugAdminApi('response', {
      method: res.config.method?.toUpperCase(),
      url: res.config.url,
      status: res.status,
      requestId: res.headers['x-request-id'],
      durationMs: startedAt ? Number((nowMs() - startedAt).toFixed(1)) : undefined,
    });
    return res;
  },
  async (error: AxiosError) => {
    const originalConfig = error.config as RetriableRequestConfig | undefined;
    const code = getApiErrorCode(error);
    if (error.response?.status === 401 && code === 'SESSION_REPLACED') {
      handleSessionReplaced();
      throw error;
    }
    if (error.response?.status === 401 && code === 'SESSION_EXPIRED') {
      handleSessionExpired();
      throw error;
    }
    if (error.response?.status === 401 && !originalConfig?._retry) {
      const { refreshToken, setTokens, logout } = useAdminAuthStore.getState();
      if (refreshToken) {
        try {
          const data = await refreshAdminTokens(refreshToken);
          setTokens(data.accessToken, data.refreshToken);
          if (originalConfig) {
            originalConfig._retry = true;
            originalConfig.headers = originalConfig.headers ?? {};
            (originalConfig.headers as Record<string, string>).Authorization =
              `Bearer ${data.accessToken}`;
            return adminApi.request(originalConfig);
          }
        } catch {
          logout();
        }
      } else {
        logout();
      }
    }
    const startedAt = error.config ? (error.config as DebugRequestConfig)._debugStartedAt : undefined;
    debugAdminApi('error', {
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: error.response?.status,
      requestId: error.response?.headers?.['x-request-id'],
      durationMs: startedAt ? Number((nowMs() - startedAt).toFixed(1)) : undefined,
      response: error.response?.data,
      message: error.message,
    });
    throw error;
  },
);

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/** 預設（簡體中文）錯誤碼字典,extractApiError 內建翻譯用 */
const DEFAULT_ERRORS: Record<string, string> = {
  UNAUTHORIZED: '身份未授权,请重新登录',
  SESSION_REPLACED: '此代理帳號已在其他裝置登入，本裝置已被登出',
  INVALID_CREDENTIALS: '账号或密码错误',
  INVALID_CAPTCHA: '验证码错误或已过期',
  EMAIL_TAKEN: '此邮箱已被使用',
  USER_NOT_FOUND: '找不到该用户',
  INSUFFICIENT_FUNDS: '余额不足',
  INVALID_BET: '下注设定不符合规则，请检查金额或选项',
  BET_OUT_OF_RANGE: '下注金额超出限红',
  GAME_DISABLED: '该游戏目前停用',
  ROUND_NOT_FOUND: '找不到本局数据',
  ROUND_NOT_ACTIVE: '本局已不接受操作',
  INVALID_ACTION: '此动作不允许',
  SEED_NOT_REVEALED: '会话尚未结束',
  RATE_LIMITED: '操作过于频繁,请稍候再试',
  INTERNAL: '系统内部错误,请联系管理员',
  USERNAME_TAKEN: '此账号已被使用',
  AGENT_NOT_FOUND: '找不到该代理',
  MEMBER_NOT_FOUND: '找不到该会员',
  AGENT_FROZEN: '代理已冻结,无法操作',
  MEMBER_FROZEN: '会员已冻结,无法操作',
  HIERARCHY_VIOLATION: '违反层级规则',
  REBATE_VIOLATION: '退水比例超过上级上限',
  INVALID_TRANSFER: '转账参数不合法',
  FORBIDDEN: '权限不足,无法执行此操作',
};

function translateMessage(code: string, rawMessage: string): string {
  const raw = rawMessage ?? '';
  const msg = (rawMessage ?? '').toLowerCase();
  if (msg.includes('agent balance insufficient') || msg.includes('from agent insufficient'))
    return '代理余额不足';
  if (msg.includes('member balance') && msg.includes('insufficient')) return '会员余额不足';
  if (msg.includes('amount must be > 0') || msg.includes('amount must be positive'))
    return '金额必须大于 0';
  if (msg.includes('amount cannot be zero')) return '金额不能为 0';
  if (msg.includes('adjustment would go negative')) return '此调整会让余额变成负数';
  if (msg.includes('cannot freeze super admin')) return '超级管理员无法被冻结';
  if (msg.includes('cannot transfer between these agents')) return '无法在这两个代理间转账';
  if (msg.includes('cannot create agent under this parent')) return '无法在此上级下创建代理';
  if (msg.includes('cannot create member under this agent')) return '无法在此代理下创建会员';
  if (msg.includes('cannot view this member')) return '无权查看该会员';
  if (msg.includes('cannot update this member')) return '无权修改该会员';
  if (msg.includes('cannot freeze this member')) return '无权冻结该会员';
  if (msg.includes('cannot adjust this member')) return '无权调整该会员';
  if (msg.includes('cannot reset this member')) return '无权重设该会员密码';
  if (msg.includes('cannot view bets of this member')) return '无权查看该会员下注纪录';
  if (msg.includes('cannot list members of this agent')) return '无权查看该代理的会员';
  if (msg.includes('member does not belong to this agent line'))
    return '会员不在此代理线下，无法转账';
  if (msg.includes('cannot transfer between these accounts')) return '无法在这两个账号间转账';
  if (msg.includes('cannot modify rebate')) return '无权修改退水';
  if (msg.includes('cannot change status')) return '无权变更状态';
  if (msg.includes('cannot reset password')) return '无权重设密码';
  if (msg.includes('frozen account has read-only access'))
    return '此账号已冻结，只能查看，无法执行操作';
  if (msg.includes('cannot update this agent')) return '无权修改该代理';
  if (msg.includes('cannot access this agent')) return '无权访问该代理';
  if (msg.includes('rebatepercentage exceeds parent')) return '退水比例超过上级上限';
  if (msg.includes('commissionrate exceeds parent')) return '占成比例超过上级上限';
  if (msg.includes('at most') && msg.includes('sub-accounts'))
    return '每个代理最多可以创建 5 个子账号';
  if (msg.includes('parent is not active')) return '上级代理未启用';
  if (msg.includes('target agent is not active')) return '目标代理未启用';
  if (msg.includes('admin authentication required')) return '请先登录管理员账号';
  if (msg.includes('invalid admin token')) return '登录凭证无效,请重新登录';
  if (msg.includes('super admin permission required')) return '需要超级管理员权限';
  if (msg.includes('authentication required')) return '请先登录';
  if (msg.includes('invalid refresh token')) return 'Session 已过期,请重新登录';
  if (msg.includes('invalid username or password')) return '账号或密码错误';
  if (msg.includes('agent account is not active')) return '此代理账号未启用';
  if (msg.includes('member account is disabled')) return '此会员账号已停用';
  if (msg.includes('member account is frozen')) return '此会员账号已冻结，只能登入查看，无法操作';
  if (raw.trim() && raw.trim().toLowerCase() !== 'invalid request' && /[\u4e00-\u9fff]/.test(raw)) {
    return raw;
  }
  return DEFAULT_ERRORS[code] ?? rawMessage;
}

/**
 * 取出 API 錯誤並把 message 翻成中文。
 * 若後端回 { code, message },依 code 字典 + message 關鍵字翻譯;
 * 若非 HTTP 錯誤,保留原 error.message。
 */
export function extractApiError(err: unknown): ApiErrorBody {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body && typeof body === 'object' && 'code' in body) {
      return { ...body, message: translateMessage(body.code, body.message) };
    }
    return { code: 'INTERNAL', message: DEFAULT_ERRORS.INTERNAL ?? err.message };
  }
  if (err instanceof Error) return { code: 'INTERNAL', message: err.message };
  return { code: 'INTERNAL', message: String(err) };
}
