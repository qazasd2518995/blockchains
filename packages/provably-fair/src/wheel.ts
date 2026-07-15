import { hmacFloatStream } from './hmac.js';

export type WheelRisk = 'low' | 'medium' | 'high';
export type WheelSegmentCount = 10 | 20 | 30 | 40 | 50;
export const WHEEL_TARGET_RTP = 0.965;

// 每個 (risk, segments) 的倍率表——每個 index 對應一段
// 數字 0 表示該段為 0x (輸)
type WheelTable = Record<WheelRisk, Record<WheelSegmentCount, number[]>>;

const LOW_PATTERN = [1.7, 1.4, 1.15, 0.85, 1.1, 1.15, 0.3, 1.1, 0.9, 0];
const MEDIUM_PATTERN = [2.5, 1.6, 1.4, 0, 1.2, 0.3, 1.15, 0.65, 0.85, 0];
const HIGH_LOSS_PATTERN = [0, 0, 0.15, 0, 0.35, 0, 0.65, 0, 0.85, 0];
const SEGMENT_COUNTS: WheelSegmentCount[] = [10, 20, 30, 40, 50];

function repeatPattern(pattern: number[], segments: WheelSegmentCount): number[] {
  return Array.from({ length: segments }, (_, index) => pattern[index % pattern.length] ?? 0);
}

function highRiskTable(segments: WheelSegmentCount): number[] {
  const losses = Array.from(
    { length: segments - 1 },
    (_, index) => HIGH_LOSS_PATTERN[index % HIGH_LOSS_PATTERN.length] ?? 0,
  );
  const targetTotal = segments * WHEEL_TARGET_RTP;
  const lossTotal = losses.reduce((sum, multiplier) => sum + multiplier, 0);
  return [Number((targetTotal - lossTotal).toFixed(4)), ...losses];
}

const TABLE = Object.fromEntries(
  (['low', 'medium', 'high'] as const).map((risk) => [
    risk,
    Object.fromEntries(
      SEGMENT_COUNTS.map((segments) => [
        segments,
        risk === 'high'
          ? highRiskTable(segments)
          : repeatPattern(risk === 'low' ? LOW_PATTERN : MEDIUM_PATTERN, segments),
      ]),
    ),
  ]),
) as WheelTable;

export function wheelTable(risk: WheelRisk, segments: WheelSegmentCount): number[] {
  return [...TABLE[risk][segments]];
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
  return TABLE[risk][segments][segmentIndex] ?? 0;
}
