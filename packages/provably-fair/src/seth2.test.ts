import { describe, expect, it } from 'vitest';
import { SETH2_GRID_SIZE, SETH2_MATH, SETH2_PAYTABLE, seth2Spin } from './seth2.js';

const VECTOR_SEED = 'seth2-vector-server';
const VECTOR_CLIENT = 'seth2-vector-client';
const VECTORS = [
  { nonce: 0, factor: 0.5, total: 9, remove: [7], types: [7, 1, 4, 1, 2, 6, 5, 8] },
  { nonce: 1, factor: 1, total: 18, remove: [5], types: [5, 5, 6, 6, 1, 9, 2, 7] },
  { nonce: 2, factor: 0, total: 0, remove: [], types: [9, 9, 5, 2, 8, 6, 5, 3] },
  { nonce: 3, factor: 0, total: 0, remove: [], types: [9, 5, 4, 6, 1, 4, 2, 6] },
  { nonce: 4, factor: 1, total: 18, remove: [5], types: [8, 4, 7, 3, 2, 2, 5, 2] },
  { nonce: 5, factor: 0.5, total: 9, remove: [7], types: [4, 4, 8, 3, 7, 2, 5, 7] },
  { nonce: 6, factor: 0, total: 0, remove: [], types: [7, 2, 5, 4, 9, 6, 7, 3] },
  { nonce: 7, factor: 0, total: 0, remove: [], types: [4, 3, 3, 3, 8, 1, 2, 1] },
  { nonce: 8, factor: 0, total: 0, remove: [], types: [5, 4, 5, 8, 6, 3, 3, 8] },
  { nonce: 9, factor: 0.5, total: 9, remove: [7], types: [2, 6, 6, 3, 8, 3, 2, 2] },
] as const;

describe('Storm of Seth 2 provably-fair engine', () => {
  it.each(VECTORS)('matches HMAC test vector nonce $nonce', (vector) => {
    const result = seth2Spin(VECTOR_SEED, VECTOR_CLIENT, vector.nonce, 18, 'base');
    const round = result.returnData.list[0]!;
    expect(result.payoutFactor).toBe(vector.factor);
    expect(result.returnData.total_gold).toBe(vector.total);
    expect(round.remove_type).toEqual(vector.remove);
    expect(round.start_data.slice(0, 8).map((cell) => cell.type)).toEqual(vector.types);
    expect(round.start_data).toHaveLength(SETH2_GRID_SIZE);
  });

  it('is deterministic for all three modes', () => {
    for (const mode of ['base', 'standard_free', 'awakening_free'] as const) {
      expect(seth2Spin('server', 'client', 77, 18, mode)).toEqual(
        seth2Spin('server', 'client', 77, 18, mode),
      );
    }
  });

  it('implements the source paytable and target RTP math', () => {
    expect(SETH2_PAYTABLE[1]).toEqual({ eight: 200, ten: 500, twelve: 1000 });
    expect(SETH2_PAYTABLE[9]).toEqual({ eight: 5, ten: 15, twelve: 40 });
    expect(SETH2_MATH.standardFree).toBeCloseTo(1.06, 8);
    expect(SETH2_MATH.theoreticalRtp).toBeCloseTo(0.9689, 8);
    expect(SETH2_MATH.buyFeatureRtp).toBeCloseTo(0.9689, 8);
  });

  it('emits a four-scatter trigger with fifteen free games', () => {
    const result = Array.from({ length: 500 }, (_, nonce) =>
      seth2Spin('scatter-search', 'client', nonce, 18, 'base'),
    ).find((outcome) => outcome.triggeredFreeSpins);
    expect(result).toBeDefined();
    expect(result!.payoutFactor).toBe(3);
    expect(result!.returnData.freeGameCount).toBe(15);
    expect(result!.returnData.list[0]!.start_data.filter((cell) => cell.type === 15)).toHaveLength(4);
  });
});
