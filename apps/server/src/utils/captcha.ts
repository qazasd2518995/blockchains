import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { CaptchaResponse } from '@bg/shared';
import { config } from '../config.js';
import { ApiError } from './errors.js';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_MAX_USED_NONCES = 10_000;

interface CaptchaTokenPayload {
  codeHash: string;
  exp: number;
  nonce: string;
}

export class CaptchaService {
  private readonly usedNonces = new Map<string, number>();

  issue(): CaptchaResponse {
    const captchaCode = randomInt(0, 10_000).toString().padStart(4, '0');
    const exp = Date.now() + CAPTCHA_TTL_MS;
    const payload: CaptchaTokenPayload = {
      codeHash: hashCaptchaCode(captchaCode),
      exp,
      nonce: randomBytes(16).toString('hex'),
    };
    return {
      captchaCode,
      captchaToken: signCaptchaPayload(payload),
      expiresAt: new Date(exp).toISOString(),
    };
  }

  verify(captchaCode: string, captchaToken: string): void {
    if (!/^\d{4}$/.test(captchaCode)) {
      throw new ApiError('INVALID_CAPTCHA', 'Invalid verification code');
    }

    const payload = verifyCaptchaToken(captchaToken);
    const now = Date.now();
    this.cleanupNonces(now);

    if (payload.exp < now) {
      throw new ApiError('INVALID_CAPTCHA', 'Verification code expired');
    }
    if (this.usedNonces.has(payload.nonce)) {
      throw new ApiError('INVALID_CAPTCHA', 'Verification code already used');
    }
    if (!safeEqual(hashCaptchaCode(captchaCode), payload.codeHash)) {
      throw new ApiError('INVALID_CAPTCHA', 'Invalid verification code');
    }

    this.usedNonces.set(payload.nonce, payload.exp);
  }

  private cleanupNonces(now: number): void {
    if (this.usedNonces.size > CAPTCHA_MAX_USED_NONCES) {
      this.usedNonces.clear();
      return;
    }
    for (const [nonce, exp] of this.usedNonces) {
      if (exp < now) this.usedNonces.delete(nonce);
    }
  }
}

function signCaptchaPayload(payload: CaptchaTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', config.JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyCaptchaToken(token: string): CaptchaTokenPayload {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new ApiError('INVALID_CAPTCHA', 'Invalid verification token');

  const expectedSig = createHmac('sha256', config.JWT_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expectedSig)) {
    throw new ApiError('INVALID_CAPTCHA', 'Invalid verification token');
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<CaptchaTokenPayload>;
    if (
      typeof parsed.codeHash !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      throw new Error('Malformed captcha payload');
    }
    return { codeHash: parsed.codeHash, exp: parsed.exp, nonce: parsed.nonce };
  } catch {
    throw new ApiError('INVALID_CAPTCHA', 'Invalid verification token');
  }
}

function hashCaptchaCode(code: string): string {
  return createHash('sha256').update(`${config.JWT_SECRET}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
