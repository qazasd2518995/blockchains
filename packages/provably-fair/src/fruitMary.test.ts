import { describe, expect, it } from 'vitest';
import {
  type FruitMaryBetId,
  type FruitMaryBetSelection,
  fruitMaryGamble,
  fruitMaryOutcomeForPosition,
  fruitMarySpin,
  fruitMaryTheoreticalRtp,
} from './fruitMary.js';

const FRUIT_MARY_BET_IDS: FruitMaryBetId[] = [4, 16, 20, 8, 2, 19, 13, 5];

const ALL_BETS: FruitMaryBetSelection[] = FRUIT_MARY_BET_IDS.map((fruitId) => ({
  fruitId,
  units: 1,
}));

describe('Fruit Mary provably-fair engine', () => {
  it('is deterministic for the same seed bundle', () => {
    expect(fruitMarySpin('server', 'client', 17, ALL_BETS)).toEqual(
      fruitMarySpin('server', 'client', 17, ALL_BETS),
    );
  });

  it('keeps the exact visible cabinet position multipliers', () => {
    expect(fruitMaryOutcomeForPosition(4, [{ fruitId: 4, units: 3 }]).totalPayoutUnits).toBe(360);
    expect(fruitMaryOutcomeForPosition(16, [{ fruitId: 16, units: 2 }]).totalPayoutUnits).toBe(80);
    expect(fruitMaryOutcomeForPosition(14, [{ fruitId: 2, units: 2 }]).totalPayoutUnits).toBe(40);
    expect(fruitMaryOutcomeForPosition(7, [{ fruitId: 19, units: 2 }]).totalPayoutUnits).toBe(30);
    expect(fruitMaryOutcomeForPosition(20, [{ fruitId: 20, units: 1 }]).totalPayoutUnits).toBe(30);
    expect(fruitMaryOutcomeForPosition(21, [{ fruitId: 20, units: 1 }]).totalPayoutUnits).toBe(2);
    expect(fruitMaryOutcomeForPosition(10, ALL_BETS).totalPayoutUnits).toBe(0);
  });

  it('turns lucky landings into two or three result lights without adding hidden payout', () => {
    const orangeBet: FruitMaryBetSelection[] = [{ fruitId: 13, units: 1 }];
    const luckyResults = Array.from({ length: 1_000 }, (_, nonce) =>
      fruitMarySpin('lucky-server', 'lucky-client', nonce, orangeBet),
    ).filter((result) => [1, 2, 4, 5, 6, 7].includes(result.legacyType));

    expect(luckyResults.length).toBeGreaterThan(0);
    for (const result of luckyResults) {
      expect(result.positions.length).toBeGreaterThanOrEqual(3);
      expect(result.positions.length).toBeLessThanOrEqual(4);
      expect(result.payoutByPosition.slice(1, -1).every((payout) => payout === 0)).toBe(true);
      expect(result.totalPayoutUnits).toBe(result.payoutByPosition.at(-1));
    }
  });

  it.each(FRUIT_MARY_BET_IDS)('returns exactly 96%% theoretical RTP for fruit %s', (fruitId) => {
    expect(fruitMaryTheoreticalRtp(fruitId)).toBeCloseTo(0.96, 12);
  });

  it('produces fixed HMAC regression vectors', () => {
    expect(
      Array.from({ length: 8 }, (_, nonce) => {
        const result = fruitMarySpin('server-vector', 'client-vector', nonce, ALL_BETS);
        return [result.legacyType, result.positions, result.totalPayoutUnits];
      }),
    ).toEqual([
      [0, [13], 10],
      [0, [13], 10],
      [0, [13], 10],
      [0, [22], 0],
      [0, [10], 0],
      [0, [5], 5],
      [0, [10], 0],
      [0, [13], 10],
    ]);
  });

  it('makes the 1–7 and 8–14 gamble ranges complementary', () => {
    for (let nonce = 0; nonce < 50; nonce += 1) {
      const small = fruitMaryGamble('gamble-server', 'gamble-client', nonce, 1);
      const big = fruitMaryGamble('gamble-server', 'gamble-client', nonce, 2);
      expect(small.number).toBe(big.number);
      expect(small.won).toBe(!big.won);
    }
  });
});
