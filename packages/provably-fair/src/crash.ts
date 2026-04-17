import { hmacSha256 } from './hmac.js';

export const CRASH_INSTANT_BUST_RATE = 33;

export function crashPoint(serverSeed: string, salt: string): number {
  const hex = hmacSha256(serverSeed, salt);
  const prefix = hex.slice(0, 13);
  const int = Number.parseInt(prefix, 16);
  const e = 2 ** 52;
  if (int % CRASH_INSTANT_BUST_RATE === 0) return 1.0;
  const raw = Math.floor((100 * e - int) / (e - int)) / 100;
  return Math.max(1.0, raw);
}
