import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((v) => v.trim())),
  BACCARAT_INTEGRATION_SECRET: z.string().default('dev-baccarat-integration-secret'),
  SIGNUP_BONUS: z.coerce.number().default(1000),
  MAX_SINGLE_BET: z.coerce.number().default(100000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const config = parsed.data;
export type AppConfig = typeof config;

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (config.CORS_ORIGIN.includes(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    return /^(bg-web|bg-admin)(-[a-z0-9]+)?\.onrender\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}
