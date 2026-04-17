import { hmacIntStream } from './hmac.js';

export const HILO_HOUSE_EDGE = 0.02;

// 1..13 對應 A,2,3,...,J,Q,K
export interface HiLoDraw {
  rank: number;
  suit: number;
}

export function hiloDraw(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cardIndex: number,
): HiLoDraw {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  // 跳過前面 cardIndex 對整數（每張牌 2 個整數：一個 rank、一個 suit）
  for (let i = 0; i < cardIndex * 2; i += 1) stream.next();
  const rankInt = stream.next().value as number;
  const suitInt = stream.next().value as number;
  const rank = (rankInt % 13) + 1;
  const suit = suitInt % 4;
  return { rank, suit };
}

export function hiloProbHigherOrEqual(current: number): number {
  const higherOrEqualCount = 13 - current + 1;
  return higherOrEqualCount / 13;
}

export function hiloProbLowerOrEqual(current: number): number {
  return current / 13;
}

export function hiloMultiplier(winChance: number): number {
  if (winChance <= 0 || winChance > 1) return 0;
  const raw = (1 - HILO_HOUSE_EDGE) / winChance;
  return Math.floor(raw * 10000) / 10000;
}
