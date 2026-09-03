import 'dotenv/config';
import { z } from 'zod';
import { MAX_BET_AMOUNT } from '@bg/shared';

const defaultLogLevel = process.env.NODE_ENV === 'test' ? 'warn' : 'info';
const agentAdminOrigins = [
  'https://www.yachiyo168.com',
  'https://yachiyo168.com',
  'https://www.yachiyo188.com',
  'https://yachiyo188.com',
] as const;
const gameWebOrigins = [
  'https://www.yachiyo666.com',
  'https://yachiyo666.com',
  'https://www.yachiyo777.com',
  'https://yachiyo777.com',
] as const;
const legacyBuiltInAllowedOrigins = [...agentAdminOrigins, ...gameWebOrigins] as const;
const legacyBuiltInAllowedOriginSet = new Set<string>(legacyBuiltInAllowedOrigins);
const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:5174',
  'http://localhost:4174',
  ...legacyBuiltInAllowedOrigins,
].join(',');
const booleanEnv = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', 'on', 'off'])
  .default('false')
  .transform((value) => ['true', '1', 'yes', 'on'].includes(value));

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  ADMIN_SESSION_TTL: z.string().default('10h'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PLATFORM_REALM: z.enum(['legacy', 'qmoney']).default('legacy'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default(defaultLogLevel),
  PRISMA_QUERY_LOG: booleanEnv,
  SLOW_REQUEST_MS: z.coerce.number().int().positive().default(1000),
  GAME_SLOW_REQUEST_MS: z.coerce.number().int().positive().default(300),
  CORS_ORIGIN: z
    .string()
    .default(defaultCorsOrigins)
    .transform((s) =>
      s
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  BACCARAT_INTEGRATION_SECRET: z.string().default('dev-baccarat-integration-secret'),
  SIGNUP_BONUS: z.coerce.number().default(1000),
  MAX_SINGLE_BET: z.coerce.number().default(MAX_BET_AMOUNT),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const config = parsed.data;
export type AppConfig = typeof config;

export function isAllowedOriginForRealm(
  origin: string | undefined,
  realm: AppConfig['PLATFORM_REALM'],
  configuredOrigins: readonly string[],
): boolean {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;
  if (realm === 'legacy' && legacyBuiltInAllowedOriginSet.has(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    if (realm === 'legacy') {
      if (legacyBuiltInAllowedOriginSet.has(url.origin)) return true;
      return /^(bg-web|bg-admin)(-[a-z0-9]+)?\.onrender\.com$/i.test(url.hostname);
    }
    return /^(bg-qmoney|bg-qmoney-admin)(-[a-z0-9]+)?\.onrender\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin?: string): boolean {
  return isAllowedOriginForRealm(origin, config.PLATFORM_REALM, config.CORS_ORIGIN);
}
