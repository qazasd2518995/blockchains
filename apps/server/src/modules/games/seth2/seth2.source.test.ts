import { seth2BuyFeatureEntry, seth2SpinForFactor } from '@bg/provably-fair';
import { describe, expect, it } from 'vitest';
import {
  SETH2_SOURCE_DEFINITION,
  seth2SourceGameStates,
  seth2SourceInitialState,
} from './seth2.source.js';

describe('Seth 2 v1.1.5 source contract', () => {
  it('matches the captured paytable, 15-game award and all three purchase modes', () => {
    expect(SETH2_SOURCE_DEFINITION.oddsList[15]).toEqual({ 4: 60, 5: 100, 6: 2_000 });
    expect(SETH2_SOURCE_DEFINITION.extraFgRounds).toBe(5);
    expect(SETH2_SOURCE_DEFINITION.buyFeature).toEqual([
      { feature: 'freeGame', featureRate: 200, featureIndex: 0 },
      { feature: 'superFreeGame', featureRate: 500, featureIndex: 1 },
      { feature: 'superMainGame', featureRate: 2_000, featureIndex: 2 },
    ]);
  });

  it('renders a purchased awakening entry as three normal plus one golden scatter', () => {
    const outcome = seth2BuyFeatureEntry('server', 'client', 1, 'awakening');
    const states = seth2SourceGameStates(outcome.returnData, {
      action: 'spin',
      spinId: 'spin-1',
      totalStake: 2,
      freeGameCount: 15,
      featureWinningsBefore: 0,
      isGoldenFg: true,
    });
    const firstView = states[0]!.view as number[][];
    const flat = firstView.flat();
    expect(flat.filter((symbol) => symbol === 15)).toHaveLength(3);
    expect(flat.filter((symbol) => symbol === 16)).toHaveLength(1);
    expect(states[0]).toMatchObject({ startFreeGame: true, freeGameCount: 15, isGoldenFg: true });
    expect(states).toHaveLength(1);
    expect(states[0]!.winSymbols).toEqual([]);
    expect(states[0]!.posTransform).toEqual([]);
  });

  it('keeps the final visual total equal to the settled payout and ends on a no-win view', () => {
    const outcome = seth2SpinForFactor('server', 'client', 2, 2, 400, 'awakening_free');
    const states = seth2SourceGameStates(outcome.returnData, {
      action: 'freeSpin',
      spinId: 'spin-2',
      totalStake: 2,
      freeGameCount: 14,
      featureWinningsBefore: 10,
      isGoldenFg: true,
    });
    const final = states.at(-1)!;
    expect(final.winSymbols).toEqual([]);
    expect(final.currentView).toBe(states.length - 1);
    expect(final.totalViews).toBe(states.length);
    expect(final.roundWinnings).toBe(outcome.returnData.total_gold);
    expect(final.totalWinnings).toBe(10 + outcome.returnData.total_gold);
    expect(outcome.returnData.total_gold).toBe(800);
  });

  it('always emits a complete 5x6 board in both initial and result states', () => {
    const initial = seth2SourceInitialState();
    expect(initial.view).toHaveLength(5);
    expect(initial.view.every((row) => row.length === 6)).toBe(true);
    const outcome = seth2SpinForFactor('server', 'client', 3, 2, 0, 'base');
    const states = seth2SourceGameStates(outcome.returnData, {
      action: 'spin',
      spinId: 'spin-3',
      totalStake: 2,
      freeGameCount: 0,
      featureWinningsBefore: 0,
      isGoldenFg: false,
    });
    for (const state of states) {
      const view = state.view as number[][];
      expect(view).toHaveLength(5);
      expect(view.every((row) => row.length === 6)).toBe(true);
    }
    expect(states).toHaveLength(1);
  });

  it('attaches falling transforms to the winning view in collision-safe order', () => {
    const outcome = seth2SpinForFactor('server', 'client', 3, 2, 10, 'base');
    const states = seth2SourceGameStates(outcome.returnData, {
      action: 'spin',
      spinId: 'spin-4',
      totalStake: 2,
      freeGameCount: 0,
      featureWinningsBefore: 0,
      isGoldenFg: false,
    });
    const winning = states[0]!;
    const final = states.at(-1)!;
    expect(winning.winSymbols.length).toBeGreaterThan(0);
    expect(winning.posTransform.length).toBeGreaterThan(0);
    expect(final.posTransform).toEqual([]);

    const symbols = new Set(Array.from({ length: 30 }, (_, position) => position));
    for (const win of winning.winSymbols) {
      for (const position of win.symbolPos) symbols.delete(position);
    }
    for (const transform of winning.posTransform) {
      expect(symbols.has(transform.beforePos)).toBe(true);
      symbols.delete(transform.beforePos);
      symbols.add(transform.afterPos);
    }
  });
});
