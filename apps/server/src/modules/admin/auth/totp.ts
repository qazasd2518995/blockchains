import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '../../../config.js';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const ISSUER = 'Yachiyo Admin';

export type TotpVerifyResult = {
  valid: boolean;
  replayed?: boolean;
  step?: bigint;
};

export function generateTotpSecret(byteLength = 20): string {
  const bytes = randomBytes(byteLength);
  let bits = '';
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, '0');
  }

  let secret = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    secret += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return secret;
}

export function createOtpAuthUrl(username: string, secret: string): string {
  return `otpauth://totp/${encodeURIComponent(ISSUER)}:${encodeURIComponent(username)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
}

export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(value: string): string {
  if (!value.startsWith('enc:v1:')) return value;
  const [, , ivHex, tagHex, encryptedHex] = value.split(':');
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Malformed TOTP secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function verifyTotp(
  secret: string,
  token: string | undefined,
  lastUsedStep?: bigint | null,
): TotpVerifyResult {
  const normalizedToken = String(token ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedToken)) return { valid: false };

  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
  for (let step = currentStep - 1; step <= currentStep + 1; step += 1) {
    const expected = generateTotpCode(secret, step);
    const expectedBuffer = Buffer.from(expected);
    const tokenBuffer = Buffer.from(normalizedToken);
    const matches =
      expectedBuffer.length === tokenBuffer.length && timingSafeEqual(expectedBuffer, tokenBuffer);
    if (!matches) continue;

    const stepBigInt = BigInt(step);
    if (lastUsedStep !== null && lastUsedStep !== undefined && lastUsedStep === stepBigInt) {
      return { valid: false, replayed: true, step: stepBigInt };
    }
    return { valid: true, step: stepBigInt };
  }

  return { valid: false };
}

function encryptionKey(): Buffer {
  return createHash('sha256').update(config.JWT_SECRET).digest();
}

function base32ToBuffer(secret: string): Buffer {
  const normalized = secret.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of normalized) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error('Invalid base32 secret');
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotpCode(secret: string, step: number): string {
  const key = base32ToBuffer(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(TOTP_DIGITS, '0');
}
