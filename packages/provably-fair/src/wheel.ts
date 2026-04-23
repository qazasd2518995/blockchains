import { hmacFloatStream } from './hmac.js';

export type WheelRisk = 'low' | 'medium' | 'high';
export type WheelSegmentCount = 10 | 20 | 30 | 40 | 50;
export const WHEEL_TARGET_RTP = 0.99;

// 每個 (risk, segments) 的倍率表——每個 index 對應一段
// 數字 0 表示該段為 0x (輸)
type WheelTable = Record<WheelRisk, Record<WheelSegmentCount, number[]>>;

// Simplified Stake-style tables. Segments 多則 0 變多。
const TABLE: WheelTable = {
  low: {
    10: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0],
    20: [1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0,
         1.5, 1.2, 1.2, 1.2, 0, 1.2, 1.2, 1.2, 1.2, 0],
    30: Array.from({ length: 30 }, (_, i) => (i % 5 === 4 ? 0 : i % 5 === 0 ? 1.5 : 1.2)),
    40: Array.from({ length: 40 }, (_, i) => (i % 4 === 3 ? 0 : 1.2)),
    50: Array.from({ length: 50 }, (_, i) => (i % 5 === 4 ? 0 : 1.2)),
  },
  medium: {
    10: [1.9, 3, 1.5, 0, 1.5, 0, 2, 1.5, 2, 0],
    20: Array.from({ length: 20 }, (_, i) => {
      if (i === 0) return 3;
      if (i === 10) return 3;
      if (i % 4 === 2) return 0;
      return 1.7;
    }),
    30: Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? 3 : i % 3 === 2 ? 0 : 1.7)),
    40: Array.from({ length: 40 }, (_, i) => (i % 8 === 0 ? 3 : i % 4 === 2 ? 0 : 1.7)),
    50: Array.from({ length: 50 }, (_, i) => (i % 10 === 0 ? 3 : i % 5 === 2 ? 0 : 1.7)),
  },
  high: {
    10: [9.9, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    20: [19.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    30: Array.from({ length: 30 }, (_, i) => (i === 0 ? 29.7 : 0)),
    40: Array.from({ length: 40 }, (_, i) => (i === 0 ? 39.6 : 0)),
    50: Array.from({ length: 50 }, (_, i) => (i === 0 ? 49.5 : 0)),
  },
};

function applyTargetRtp(table: number[]): number[] {
  const currentRtp = table.reduce((sum, multiplier) => sum + multiplier, 0) / table.length;
  if (currentRtp <= 0) return table;
  const scale = WHEEL_TARGET_RTP / currentRtp;
  return table.map((multiplier) => {
    if (multiplier <= 0) return 0;
    return Math.floor(multiplier * scale * 10000) / 10000;
  });
}

export function wheelTable(risk: WheelRisk, segments: WheelSegmentCount): number[] {
  const rows = TABLE[risk][segments];
  return applyTargetRtp(rows);
}

export function wheelSpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  segments: WheelSegmentCount,
): { segmentIndex: number } {
  const stream = hmacFloatStream(serverSeed, clientSeed, nonce);
  const first = stream.next().value as number;
  return { segmentIndex: Math.floor(first * segments) };
}

export function wheelMultiplier(
  risk: WheelRisk,
  segments: WheelSegmentCount,
  segmentIndex: number,
): number {
  const table = TABLE[risk][segments];
  return applyTargetRtp(table)[segmentIndex] ?? 0;
}
