import { hmacFloatStream } from './hmac.js';

// Mini Roulette: 0 + 1-12 = 13 slots
export const ROULETTE_SLOTS = 13;

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12]);
export const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11]);

export interface RouletteBet {
  type: 'straight' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'column';
  value?: number; // for straight and column
  amount: number;
}

export function rouletteSpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): { slot: number } {
  const stream = hmacFloatStream(serverSeed, clientSeed, nonce);
  const first = stream.next().value as number;
  return { slot: Math.floor(first * ROULETTE_SLOTS) };
}

export function rouletteEvaluate(
  slot: number,
  bets: RouletteBet[],
): { totalPayout: number; wins: { bet: RouletteBet; payout: number }[] } {
  const wins: { bet: RouletteBet; payout: number }[] = [];
  let totalPayout = 0;

  for (const bet of bets) {
    let payoutRatio = 0;

    if (slot === 0) {
      // La Partage: non-straight-0 bets get half back
      if (bet.type !== 'straight' || bet.value !== 0) {
        wins.push({ bet, payout: bet.amount * 0.5 });
        totalPayout += bet.amount * 0.5;
        continue;
      } else {
        payoutRatio = 12; // 12:1 for straight 0 with 13 slots
      }
    } else {
      switch (bet.type) {
        case 'straight':
          if (bet.value === slot) payoutRatio = 12; // 12:1
          break;
        case 'red':
          if (RED_NUMBERS.has(slot)) payoutRatio = 1;
          break;
        case 'black':
          if (BLACK_NUMBERS.has(slot)) payoutRatio = 1;
          break;
        case 'odd':
          if (slot % 2 === 1) payoutRatio = 1;
          break;
        case 'even':
          if (slot % 2 === 0) payoutRatio = 1;
          break;
        case 'low':
          if (slot >= 1 && slot <= 6) payoutRatio = 1;
          break;
        case 'high':
          if (slot >= 7 && slot <= 12) payoutRatio = 1;
          break;
        case 'column':
          if (bet.value !== undefined) {
            // column 1 = {1,4,7,10}, column 2 = {2,5,8,11}, column 3 = {3,6,9,12}
            const inCol = (slot - bet.value) % 3 === 0 && slot !== 0;
            if (inCol) payoutRatio = 2;
          }
          break;
      }
    }

    if (payoutRatio > 0) {
      const payout = bet.amount * (payoutRatio + 1); // ratio + stake back
      wins.push({ bet, payout });
      totalPayout += payout;
    }
  }

  return { totalPayout, wins };
}
