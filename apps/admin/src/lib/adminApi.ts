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

/** 預設（簡體中文）錯誤碼字典,extractApiError 內建翻譯用 */
const DEFAULT_ERRORS: Record<string, string> = {
  UNAUTHORIZED: '身份未授权,请重新登录',
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
  const msg = (rawMessage ?? '').toLowerCase();
  if (msg.includes('agent balance insufficient') || msg.includes('from agent insufficient')) return '代理余额不足';
  if (msg.includes('member balance') && msg.includes('insufficient')) return '会员余额不足';
  if (msg.includes('amount must be > 0') || msg.includes('amount must be positive')) return '金额必须大于 0';
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
  if (msg.includes('cannot modify rebate')) return '无权修改退水';
  if (msg.includes('cannot change status')) return '无权变更状态';
  if (msg.includes('cannot reset password')) return '无权重设密码';
  if (msg.includes('frozen account has read-only access')) return '此账号已冻结，只能查看，无法执行操作';
  if (msg.includes('cannot update this agent')) return '无权修改该代理';
  if (msg.includes('cannot access this agent')) return '无权访问该代理';
  if (msg.includes('rebatepercentage exceeds parent')) return '退水比例超过上级上限';
  if (msg.includes('commissionrate exceeds parent')) return '占成比例超过上级上限';
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
