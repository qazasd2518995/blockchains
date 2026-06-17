import axios, { AxiosError } from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { isLocale, type Locale } from '@/i18n/types';

// prod: https://api.xxx.com；dev: 空字串讓 vite proxy 處理 /api
const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const LOCALE_STORAGE_KEY = 'bg.locale';

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
    window.alert(localizedApiError('SESSION_REPLACED'));
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
  SESSION_EXPIRED: '登入已超過 10 小時，請重新登入',
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

const LOCALIZED_ERRORS: Partial<Record<Locale, Record<string, string>>> = {
  en: {
    UNAUTHORIZED: 'Unauthorized. Please log in again',
    SESSION_REPLACED: 'Your account has logged in on another device. This device has been logged out.',
    SESSION_EXPIRED: 'Login has exceeded 10 hours. Please log in again',
    NETWORK_ERROR: 'Network error. Please try again later',
    INVALID_CREDENTIALS: 'Incorrect account or password',
    INVALID_CAPTCHA: 'Incorrect captcha. Please try again',
    EMAIL_TAKEN: 'This email is already in use',
    USER_NOT_FOUND: 'User not found',
    INSUFFICIENT_FUNDS: 'Insufficient balance',
    INVALID_BET: 'Bet settings are invalid. Check the amount or option',
    BET_OUT_OF_RANGE: 'Bet amount exceeds the limit',
    GAME_DISABLED: 'This game is currently disabled',
    ROUND_NOT_FOUND: 'Round data not found',
    ROUND_NOT_ACTIVE: 'This round no longer accepts actions',
    INVALID_ACTION: 'This action is not allowed',
    SEED_NOT_REVEALED: 'Session has not ended yet',
    RATE_LIMITED: 'Too many actions. Please wait',
    INTERNAL: 'Internal system error. Please try again later',
    USERNAME_TAKEN: 'This account is already in use',
    MEMBER_FROZEN: 'Your account has been frozen. Please contact your agent',
    FORBIDDEN: 'This action is not allowed',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect',
    PASSWORD_SAME: 'New password must be different from the current password',
    INVALID_BET_AMOUNT: 'Please enter a valid bet amount',
    MIN_BET: 'Bet amount is below the minimum limit',
    MAX_SINGLE_BET: 'Bet amount exceeds the single-bet limit',
    AUTH_REQUIRED: 'Please log in first',
    INVALID_REFRESH_TOKEN: 'Session expired. Please log in again',
    AGENT_CREATED_ONLY: 'Member accounts are created by agents only and cannot be publicly registered',
    BACCARAT_PLAYER_ONLY: 'This account is not a player account. Only player accounts can enter Baccarat',
  },
  th: {
    UNAUTHORIZED: 'ไม่มีสิทธิ์ โปรดเข้าสู่ระบบอีกครั้ง',
    SESSION_REPLACED: 'บัญชีของคุณเข้าสู่ระบบบนอุปกรณ์อื่นแล้ว อุปกรณ์นี้ถูกออกจากระบบ',
    SESSION_EXPIRED: 'เข้าสู่ระบบเกิน 10 ชั่วโมง โปรดเข้าสู่ระบบอีกครั้ง',
    NETWORK_ERROR: 'เครือข่ายผิดพลาด โปรดลองอีกครั้งภายหลัง',
    INVALID_CREDENTIALS: 'บัญชีหรือรหัสผ่านไม่ถูกต้อง',
    INVALID_CAPTCHA: 'แคปช่าไม่ถูกต้อง โปรดลองอีกครั้ง',
    EMAIL_TAKEN: 'อีเมลนี้ถูกใช้แล้ว',
    USER_NOT_FOUND: 'ไม่พบผู้ใช้',
    INSUFFICIENT_FUNDS: 'ยอดคงเหลือไม่พอ',
    INVALID_BET: 'การตั้งค่าเดิมพันไม่ถูกต้อง โปรดตรวจจำนวนหรือทางเลือก',
    BET_OUT_OF_RANGE: 'จำนวนเดิมพันเกินขีดจำกัด',
    GAME_DISABLED: 'เกมนี้ถูกปิดใช้งานชั่วคราว',
    ROUND_NOT_FOUND: 'ไม่พบข้อมูลรอบนี้',
    ROUND_NOT_ACTIVE: 'รอบนี้ไม่รับการดำเนินการแล้ว',
    INVALID_ACTION: 'ไม่อนุญาตให้ทำรายการนี้',
    SEED_NOT_REVEALED: 'เซสชันยังไม่สิ้นสุด',
    RATE_LIMITED: 'ทำรายการถี่เกินไป โปรดรอสักครู่',
    INTERNAL: 'ระบบผิดพลาด โปรดลองอีกครั้งภายหลัง',
    USERNAME_TAKEN: 'บัญชีนี้ถูกใช้แล้ว',
    MEMBER_FROZEN: 'บัญชีของคุณถูกระงับ โปรดติดต่อเอเจนต์',
    FORBIDDEN: 'ไม่อนุญาตให้ทำรายการนี้',
    INVALID_CURRENT_PASSWORD: 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
    PASSWORD_SAME: 'รหัสผ่านใหม่ต้องต่างจากรหัสผ่านปัจจุบัน',
    INVALID_BET_AMOUNT: 'โปรดกรอกจำนวนเดิมพันที่ถูกต้อง',
    MIN_BET: 'จำนวนเดิมพันต่ำกว่าขั้นต่ำ',
    MAX_SINGLE_BET: 'จำนวนเดิมพันเกินขีดจำกัดต่อครั้ง',
    AUTH_REQUIRED: 'โปรดเข้าสู่ระบบก่อน',
    INVALID_REFRESH_TOKEN: 'เซสชันหมดอายุ โปรดเข้าสู่ระบบอีกครั้ง',
    AGENT_CREATED_ONLY: 'บัญชีสมาชิกต้องเปิดโดยเอเจนต์เท่านั้น ไม่สามารถสมัครสาธารณะได้',
    BACCARAT_PLAYER_ONLY: 'บัญชีนี้ไม่ใช่บัญชีผู้เล่น เฉพาะบัญชีผู้เล่นเท่านั้นที่เข้า Baccarat ได้',
  },
  vi: {
    UNAUTHORIZED: 'Chưa được ủy quyền, vui lòng đăng nhập lại',
    SESSION_REPLACED: 'Tài khoản của bạn đã đăng nhập trên thiết bị khác. Thiết bị này đã bị đăng xuất.',
    SESSION_EXPIRED: 'Phiên đăng nhập đã quá 10 giờ. Vui lòng đăng nhập lại',
    NETWORK_ERROR: 'Lỗi kết nối. Vui lòng thử lại sau',
    INVALID_CREDENTIALS: 'Tài khoản hoặc mật khẩu không đúng',
    INVALID_CAPTCHA: 'Captcha không đúng. Vui lòng nhập lại',
    EMAIL_TAKEN: 'Email này đã được sử dụng',
    USER_NOT_FOUND: 'Không tìm thấy người dùng',
    INSUFFICIENT_FUNDS: 'Số dư không đủ',
    INVALID_BET: 'Thiết lập cược không hợp lệ. Vui lòng kiểm tra số tiền hoặc lựa chọn',
    BET_OUT_OF_RANGE: 'Số tiền cược vượt giới hạn',
    GAME_DISABLED: 'Trò chơi này hiện đang bị tắt',
    ROUND_NOT_FOUND: 'Không tìm thấy dữ liệu ván',
    ROUND_NOT_ACTIVE: 'Ván này không còn nhận thao tác',
    INVALID_ACTION: 'Thao tác này không được phép',
    SEED_NOT_REVEALED: 'Phiên chưa kết thúc',
    RATE_LIMITED: 'Thao tác quá thường xuyên, vui lòng chờ',
    INTERNAL: 'Lỗi hệ thống. Vui lòng thử lại sau',
    USERNAME_TAKEN: 'Tài khoản này đã được sử dụng',
    MEMBER_FROZEN: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ đại lý',
    FORBIDDEN: 'Thao tác này không được phép',
    INVALID_CURRENT_PASSWORD: 'Mật khẩu hiện tại không đúng',
    PASSWORD_SAME: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    INVALID_BET_AMOUNT: 'Vui lòng nhập số tiền cược hợp lệ',
    MIN_BET: 'Số tiền cược thấp hơn mức tối thiểu',
    MAX_SINGLE_BET: 'Số tiền cược vượt giới hạn một cược',
    AUTH_REQUIRED: 'Vui lòng đăng nhập trước',
    INVALID_REFRESH_TOKEN: 'Phiên đã hết hạn, vui lòng đăng nhập lại',
    AGENT_CREATED_ONLY: 'Tài khoản thành viên chỉ được tạo bởi đại lý, không thể đăng ký công khai',
    BACCARAT_PLAYER_ONLY: 'Tài khoản hiện tại không phải tài khoản người chơi. Chỉ tài khoản người chơi mới vào được Baccarat',
  },
};

function getActiveLocale(): Locale {
  if (typeof window === 'undefined') return 'zh-Hant';
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : 'zh-Hant';
}

function localizedApiError(code: string): string {
  const locale = getActiveLocale();
  return LOCALIZED_ERRORS[locale]?.[code] ?? DEFAULT_ERRORS[code] ?? DEFAULT_ERRORS.INTERNAL ?? '系統內部錯誤,請稍後再試';
}

function translateMessage(code: string, rawMessage: string): string {
  const raw = rawMessage ?? '';
  const msg = (rawMessage ?? '').toLowerCase();
  if (msg.includes('invalid username or password')) return localizedApiError('INVALID_CREDENTIALS');
  if (msg.includes('invalid email or password')) return localizedApiError('INVALID_CREDENTIALS');
  if (msg.includes('invalid current password')) return localizedApiError('INVALID_CURRENT_PASSWORD');
  if (msg.includes('new password must be different')) return localizedApiError('PASSWORD_SAME');
  if (msg.includes('user not found')) return localizedApiError('USER_NOT_FOUND');
  if (msg.includes('round not accepting bets')) return localizedApiError('ROUND_NOT_ACTIVE');
  if (msg.includes('insufficient')) return localizedApiError('INSUFFICIENT_FUNDS');
  if (msg.includes('invalid bet amount')) return localizedApiError('INVALID_BET_AMOUNT');
  if (msg.includes('minimum bet is')) return localizedApiError('MIN_BET');
  if (msg.includes('max single bet is')) return localizedApiError('MAX_SINGLE_BET');
  if (msg.includes('authentication required')) return localizedApiError('AUTH_REQUIRED');
  if (msg.includes('invalid refresh token')) return localizedApiError('INVALID_REFRESH_TOKEN');
  if (msg.includes('member accounts are created by agents only'))
    return localizedApiError('AGENT_CREATED_ONLY');
  if (msg.includes('only player accounts can enter baccarat')) {
    return localizedApiError('BACCARAT_PLAYER_ONLY');
  }
  if (raw.trim() && raw.trim().toLowerCase() !== 'invalid request' && /[\u4e00-\u9fff]/.test(raw)) {
    return localizedApiError(code) ?? raw;
  }
  return localizedApiError(code) ?? rawMessage;
}

export function extractApiError(err: unknown): ApiErrorBody {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    if (body && typeof body === 'object' && 'code' in body) {
      return { ...body, message: translateMessage(body.code, body.message) };
    }
    if (!err.response) {
      return { code: 'NETWORK_ERROR', message: localizedApiError('NETWORK_ERROR') ?? err.message };
    }
    return { code: 'INTERNAL', message: localizedApiError('INTERNAL') ?? err.message };
  }
  if (err instanceof Error) return { code: 'INTERNAL', message: err.message };
  return { code: 'INTERNAL', message: String(err) };
}
