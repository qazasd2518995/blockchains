import { hmacFloatStream } from './hmac.js';

export const DICE_HOUSE_EDGE = 0.01;
export const DICE_MIN_TARGET = 0.01;
export const DICE_MAX_TARGET = 99.99;

export interface DiceRollResult {
  roll: number;
}

export interface DiceDetermination {
  roll: number;
  won: boolean;
  winChance: number;
  multiplier: number;
}

export function diceRoll(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): DiceRollResult {
  const stream = hmacFloatStream(serverSeed, clientSeed, nonce);
  const first = stream.next();
  if (first.done) throw new Error('Dice HMAC stream exhausted');
  const rollRaw = first.value * 100;
  const roll = Math.floor(rollRaw * 100) / 100;
  return { roll };
}

export function diceWinChance(target: number, direction: 'under' | 'over'): number {
  if (direction === 'under') return target;
  return 100 - target;
}

export function diceMultiplier(winChance: number): number {
  if (winChance <= 0) return 0;
  const raw = ((1 - DICE_HOUSE_EDGE) * 100) / winChance;
  return Math.floor(raw * 10000) / 10000;
}

export function diceDetermine(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  target: number,
  direction: 'under' | 'over',
): DiceDetermination {
  if (target < DICE_MIN_TARGET || target > DICE_MAX_TARGET) {
    throw new Error(`Target ${target} out of range [${DICE_MIN_TARGET}, ${DICE_MAX_TARGET}]`);
  }
  const { roll } = diceRoll(serverSeed, clientSeed, nonce);
  const winChance = diceWinChance(target, direction);
  const won =
    direction === 'under' ? roll < target : roll > target;
  const multiplier = won ? diceMultiplier(winChance) : 0;
  return { roll, won, winChance, multiplier };
}
