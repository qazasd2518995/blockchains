import {
  seth2BuyFeatureEntry,
  seth2SpinForFactor,
  seth2SuperMainSpinForFactor,
} from '@bg/provably-fair';
import type { Seth2Cell, Seth2ReturnData } from '@bg/shared';
import { describe, expect, it } from 'vitest';
import {
  SETH2_SOURCE_DEFINITION,
  seth2SourceGameStates,
  seth2SourceInitialState,
  seth2SourcePlatform,
  type Seth2SourceGameState,
} from './seth2.source.js';

const SOURCE_OPTIONS = {
  action: 'freeSpin' as const,
  spinId: 'source-contract',
  totalStake: 2,
  freeGameCount: 10,
  featureWinningsBefore: 0,
  isGoldenFg: true,
};

function cell(type: number, mul = 0, mulType?: number, code?: number): Seth2Cell {
  return {
    type,
    mul,
    ...(mulType === undefined ? {} : { mul_type: mulType }),
    ...(code === undefined ? {} : { code }),
  };
}

function sourceFixture(overrides: Partial<Seth2ReturnData> = {}): Seth2ReturnData {
  return {
    list: [
      {
        start_data: Array.from({ length: 30 }, () => cell(2)),
        remove_type: [],
        round_data: [],
        scoreList: [],
        upgrade_mul_list: [],
        total_mul: 0,
        score: 0,
        total_gold: 0,
        remove_count: 0,
        is_over: 1,
      },
    ],
    featureMode: 'none',
    gameModelType: 1,
    is_sjc: 0,
    freeGameCount: 10,
    addGameCiShu: 0,
    type17_mul_list: [],
    type17_beishu: null,
    type18_start_mul_list: [],
    type18_mul_count: 0,
    JPtype: 0,
    JPGold: 0,
    score: 0,
    total_gold: 0,
    multiplierBankBefore: 0,
    multiplierBankAdded: 0,
    multiplierBankAfter: 0,
    ...overrides,
  };
}

// Replay the imported SymbolView contract: erase -> clone -> move survivors ->
// fill only EMPTY positions. Rebuilding the whole board from view would hide
// phantom multiplier nodes that the real client leaves visible and uncollected.
function expectSourceBoardReplay(states: Seth2SourceGameState[]) {
  const symbols = new Map<number, { symbol: number; times: number }>();
  for (let index = 0; index < states.length; index += 1) {
    const state = states[index]!;
    if (index === 0 || !states[index - 1]!.winSymbols.length) symbols.clear();
    const board = state.view.flat();
    board.forEach((symbol, position) => {
      if (!symbols.has(position)) {
        symbols.set(position, {
          symbol,
          times:
            state.newTimesSymbols.find((ball) => ball.symbolPos === position)?.times ??
            state.timesSymbols.find((ball) => ball.symbolPos === position)?.times ??
            0,
        });
      }
    });
    expect([...symbols].sort(([a], [b]) => a - b).map(([, cell]) => cell.symbol)).toEqual(board);
    const visibleBalls = [...symbols]
      .filter(([, cell]) => cell.symbol >= 10 && cell.symbol <= 13)
      .map(([symbolPos, cell]) => ({ symbolPos, symbol: cell.symbol, times: cell.times }))
      .sort((a, b) => a.symbolPos - b.symbolPos);
    expect(visibleBalls).toEqual(
      state.timesSymbols.map(({ symbolPos, symbol, times }) => ({ symbolPos, symbol, times })),
    );
    for (const win of state.winSymbols) {
      for (const position of win.symbolPos) {
        expect(symbols.get(position)?.symbol).toBe(win.symbol);
        symbols.delete(position);
      }
    }
    for (const split of state.splitList) {
      const source = symbols.get(split.from)!;
      expect(source.times).toBeGreaterThan(0);
      for (const target of split.to) {
        expect(symbols.has(target), 'a clone must never replace an un-erased survivor').toBe(false);
        symbols.set(target, { ...source });
      }
    }
    for (const move of state.posTransform) {
      expect(symbols.has(move.beforePos)).toBe(true);
      expect(symbols.has(move.afterPos), 'falling must not overwrite another node').toBe(false);
      symbols.set(move.afterPos, symbols.get(move.beforePos)!);
      symbols.delete(move.beforePos);
    }
    for (const upgrade of state.timesUpgrade) {
      const position =
        state.posTransform.find((move) => move.beforePos === upgrade.symbolPos)?.afterPos ??
        upgrade.symbolPos;
      symbols.set(position, { symbol: upgrade.afterSymbol, times: upgrade.afterTimes });
    }
  }
}

describe('Seth 2 v1.1.5 source contract', () => {
  it("replays female upgrades after each cascade at the ball's current falling position", () => {
    let checked = 0;
    for (let nonce = 0; nonce < 1000 && checked < 25; nonce++) {
      const outcome = seth2SpinForFactor('every-tumble-source', 'client', nonce, 10, 20, 'base');
      if (
        outcome.returnData.list.length !== 2 ||
        !outcome.returnData.list[0]!.upgrade_mul_list.length
      )
        continue;
      const states = seth2SourceGameStates(outcome.returnData, SOURCE_OPTIONS);
      expectSourceBoardReplay(states);
      for (let i = 0; i < 2; i++) {
        const state = states[i]!;
        expect(state.timesUpgrade.length).toBeGreaterThan(0);
        for (const upgrade of state.timesUpgrade) {
          const nextPos =
            state.posTransform.find((move) => move.beforePos === upgrade.symbolPos)?.afterPos ??
            upgrade.symbolPos;
          expect(states[i + 1]!.timesSymbols).toContainEqual(
            expect.objectContaining({ symbolPos: nextPos, times: upgrade.afterTimes }),
          );
        }
      }
      expect(states.at(-1)!.totalWinnings).toBe(outcome.returnData.total_gold);
      checked++;
    }
    expect(checked).toBe(25);
  });

  it('does not leave a phantom uncollected 4x after a male split and refill', () => {
    const outcome = seth2SpinForFactor('clone-extra-4x', 'client', 0, 10, 20, 'awakening_free');
    expect(outcome.returnData.type17_beishu?.mul).toBe(4);
    expect(outcome.returnData.type17_mul_list).toHaveLength(3);
    const unchanged = structuredClone(outcome.returnData);
    const states = seth2SourceGameStates(outcome.returnData, SOURCE_OPTIONS);
    expectSourceBoardReplay(states);
    const final = states.at(-1)!;
    expect(final.timesSymbols.map((ball) => ball.times)).toEqual([4, 4, 4, 4]);
    expect(final.totalWinnings).toBe(outcome.returnData.total_gold);
    expect(outcome.returnData).toEqual(unchanged);
  });

  it('lets the newborn unlocked clone fall before the next refill instead of pinning it', () => {
    const outcome = seth2SpinForFactor(
      'male-gravity-audit',
      'client',
      0,
      10,
      100,
      'awakening_free',
    );
    const states = seth2SourceGameStates(outcome.returnData, SOURCE_OPTIONS);
    expect(states[0]!.splitList).toEqual([{ from: 15, to: [0] }]);
    expect(states[0]!.posTransform).toContainEqual({ beforePos: 0, afterPos: 12 });
    expect(states[1]!.timesSymbols).toContainEqual(
      expect.objectContaining({ symbolPos: 12, times: 50, lock: 0 }),
    );
    expect(states[1]!.newTimesSymbols).not.toContainEqual(
      expect.objectContaining({ symbolPos: 12 }),
    );
    expectSourceBoardReplay(states);
  });

  it('preserves the same split balls when legacy round_data already contains some or all copies', () => {
    const outcome = seth2SpinForFactor('clone-extra-4x', 'client', 0, 10, 20, 'awakening_free');
    const expected = seth2SourceGameStates(outcome.returnData, SOURCE_OPTIONS);
    for (const count of [1, 2, 3]) {
      const data = structuredClone(outcome.returnData);
      data.list[0]!.round_data.push(...data.type17_mul_list.slice(0, count));
      const actual = seth2SourceGameStates(data, SOURCE_OPTIONS);
      expect(actual).toEqual(expected);
      expectSourceBoardReplay(actual);
    }
  });

  it('collects a genuinely new 4x refill ball in addition to all equal-valued split copies', () => {
    const data = seth2SpinForFactor(
      'clone-extra-4x',
      'client',
      0,
      10,
      20,
      'awakening_free',
    ).returnData;
    // A real refill multiplier is within the ordinary refill budget, not an
    // extra embedded copy. Equality of multiplier values must not deduplicate it.
    data.list[0]!.round_data[0] = cell(10, 4, 1);
    data.list[0]!.total_mul += 4;
    data.total_gold = data.score * data.list[0]!.total_mul;
    data.list[0]!.total_gold = data.total_gold;
    for (const embedded of [false, true]) {
      const payload = structuredClone(data);
      if (embedded) payload.list[0]!.round_data.push(...payload.type17_mul_list);
      const states = seth2SourceGameStates(payload, SOURCE_OPTIONS);
      expectSourceBoardReplay(states);
      const final = states.at(-1)!;
      expect(final.timesSymbols.map((ball) => ball.times)).toEqual([4, 4, 4, 4, 4]);
      expect(final.newTimesSymbols).toHaveLength(1);
      expect(final.newTimesSymbols[0]!.times).toBe(4);
      expect(final.totalWinnings).toBe(250);
    }
  });

  it('keeps visible balls, collection totals and payouts consistent across generated male skills', () => {
    const levels = new Set<number>();
    for (let nonce = 0; nonce < 1000; nonce += 1) {
      const outcome = seth2SpinForFactor(
        'male-board-replay',
        'client',
        nonce,
        10,
        100,
        'awakening_free',
      );
      if (!outcome.returnData.type17_mul_list.length) continue;
      const states = seth2SourceGameStates(outcome.returnData, SOURCE_OPTIONS);
      levels.add(states[0]!.maleTotemLevel);
      expectSourceBoardReplay(states);
      const final = states.at(-1)!;
      expect(final.timesSymbols.reduce((sum, ball) => sum + ball.times, 0)).toBe(
        outcome.returnData.list.at(-1)!.total_mul,
      );
      expect(final.totalWinnings).toBe(outcome.returnData.total_gold);
    }
    expect([...levels].sort()).toEqual([1, 2, 3]);
  });

  it('replays split, upgrades and locked follow-up boards throughout Eternal Rise', () => {
    for (let nonce = 0; nonce < 100; nonce += 1) {
      const outcome = seth2SuperMainSpinForFactor('split-super-replay', 'client', nonce, 2, 5000);
      const states = seth2SourceGameStates(outcome.returnData, {
        ...SOURCE_OPTIONS,
        action: 'superSpin',
      });
      expectSourceBoardReplay(states);
      expect(states.at(-1)!.totalWinnings).toBe(outcome.returnData.total_gold);
    }
  });

  it('deep-merges persisted setting patches with all framework defaults', () => {
    const platform = seth2SourcePlatform(
      { id: 'player', username: 'player', displayName: null, balance: 100 },
      1,
      { advancedSettings: { turbo: true } },
    );
    expect(platform.player.settings).toMatchObject({
      advancedSettings: {
        turbo: true,
        notify: true,
        sounds: {
          background: true,
          backgroundVolume: 0.32,
          effect: true,
          effectVolume: 0.6,
        },
      },
      stakeIndex: 0,
      ratioIndex: 0,
    });
  });

  it('only publishes stake combinations inside the member betting limit', () => {
    const platform = seth2SourcePlatform(
      { id: 'player', username: 'player', displayName: null, balance: 100 },
      1,
      null,
      null,
      { min: 10, max: 5_000 },
    );
    const totals = platform.game.stakeValues.flatMap((stake) =>
      platform.game.ratioValues.map((ratio) => Number((stake * ratio * 20).toFixed(2))),
    );

    expect(platform.player.settings.stakeIndex).toBe(0);
    expect(platform.player.settings.ratioIndex).toBe(0);
    expect(Math.min(...totals)).toBe(10);
    expect(Math.max(...totals)).toBeLessThanOrEqual(5_000);
    expect(platform.game.stakeList).toEqual([...new Set(totals)].sort((a, b) => a - b));
  });

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
    const outcome = seth2BuyFeatureEntry('server', 'client', 1, 'awakening', 2);
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
    expect(states[0]).toMatchObject({ roundWinnings: 6, totalWinnings: 6 });
    expect(states).toHaveLength(1);
    expect(states[0]!.winSymbols).toEqual([]);
    expect(states[0]!.posTransform).toEqual([]);
  });

  it.each(['standard', 'awakening'] as const)(
    'keeps purchased %s scatters separated in the final 5-by-6 client view',
    (featureMode) => {
      for (let nonce = 0; nonce < 100; nonce += 1) {
        const outcome = seth2BuyFeatureEntry(
          'source-entry-layout',
          'client',
          nonce,
          featureMode,
          10,
        );
        const states = seth2SourceGameStates(outcome.returnData, {
          action: 'spin',
          spinId: `entry-${nonce}`,
          totalStake: 10,
          freeGameCount: 15,
          featureWinningsBefore: 0,
          isGoldenFg: featureMode === 'awakening',
        });
        const view = states[0]!.view as number[][];
        expect(view).toHaveLength(5);
        expect(view.every((row) => row.length === 6)).toBe(true);
        const scatters = view.flatMap((row, rowIndex) =>
          row.flatMap((symbol, columnIndex) =>
            symbol === 15 || symbol === 16 ? [{ rowIndex, columnIndex, symbol }] : [],
          ),
        );
        expect(scatters).toHaveLength(4);
        expect(new Set(scatters.map((symbol) => symbol.rowIndex)).size).toBe(4);
        expect(new Set(scatters.map((symbol) => symbol.columnIndex)).size).toBe(4);
        expect(scatters.filter((symbol) => symbol.symbol === 16)).toHaveLength(
          featureMode === 'awakening' ? 1 : 0,
        );
        expect(states).toHaveLength(1);
        expect(states[0]).toMatchObject({
          startFreeGame: true,
          freeGameCount: 15,
          roundWinnings: 30,
          totalWinnings: 30,
          winSymbols: [],
          posTransform: [],
        });
      }
    },
  );

  it.each([
    [14, 'jp-mini'],
    [13, 'jp-minor'],
    [12, 'jp-major'],
    [11, 'jp-grand'],
  ] as const)('maps internal JP tier %i to the source animation key %s', (tier, key) => {
    const states = seth2SourceGameStates(sourceFixture({ JPtype: tier }), {
      ...SOURCE_OPTIONS,
      action: 'spin',
    });
    expect(states[0]!.isJp).toBe(key);
  });

  it.each([
    [2, 13],
    [8, 13],
    [10, 12],
    [25, 12],
    [50, 11],
    [80, 11],
    [100, 10],
    [500, 10],
  ] as const)('maps a %ix multiplier to source ball symbol %i', (times, symbol) => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, times, 1);

    const states = seth2SourceGameStates(
      sourceFixture({
        list: [{ ...sourceFixture().list[0]!, start_data: start }],
      }),
      SOURCE_OPTIONS,
    );

    expect(states[0]!.timesSymbols).toEqual([
      expect.objectContaining({ symbol, symbolPos: 0, times }),
    ]);
    expect((states[0]!.view as number[][]).flat()[0]).toBe(symbol);
  });

  it('changes an upgraded 80x purple ball into a 100x red ball', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 80, 0, 0);
    start[1] = cell(1);
    const states = seth2SourceGameStates(
      sourceFixture({
        list: [
          {
            ...sourceFixture().list[0]!,
            start_data: start,
            remove_type: [1],
            round_data: [cell(3)],
            scoreList: [1],
            score: 1,
            total_gold: 1,
            upgrade_mul_list: [{ type: 10, mul: 80, new_mul: 100, mul_type: 0, code: 0 }],
          },
        ],
        score: 1,
        total_gold: 1,
      }),
      SOURCE_OPTIONS,
    );

    expect(states[0]!.timesUpgrade).toEqual([
      expect.objectContaining({
        beforeSymbol: 11,
        beforeTimes: 80,
        afterSymbol: 10,
        afterTimes: 100,
      }),
    ]);
    expect(states.at(-1)!.timesSymbols).toEqual([
      expect.objectContaining({ symbol: 10, times: 100 }),
    ]);
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

  it('shows the raw erase win before collecting the multiplier into the final payout', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    for (let position = 0; position < 8; position += 1) start[position] = cell(9);
    start[20] = cell(10, 10, 1);
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: start,
          remove_type: [9],
          round_data: Array.from({ length: 8 }, () => cell(3)),
          scoreList: [5],
          total_mul: 10,
          score: 5,
          total_gold: 50,
        },
      ],
      score: 5,
      total_gold: 50,
      multiplierBankAdded: 10,
      multiplierBankAfter: 10,
    });

    const states = seth2SourceGameStates(data, {
      ...SOURCE_OPTIONS,
      action: 'spin',
      freeGameCount: 0,
      isGoldenFg: false,
    });

    expect(states).toHaveLength(2);
    expect(states[0]).toMatchObject({ roundWinnings: 5, totalWinnings: 5 });
    expect(states[0]!.winSymbols).toEqual([expect.objectContaining({ symbol: 9, winnings: 5 })]);
    expect(states[1]).toMatchObject({ roundWinnings: 50, totalWinnings: 50, winSymbols: [] });
  });

  it('accumulates cascade wins before the separate multiplier settlement view', () => {
    const first = Array.from({ length: 30 }, () => cell(2));
    for (let position = 0; position < 8; position += 1) first[position] = cell(9);
    first[20] = cell(10, 4, 1);
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: first,
          remove_type: [9],
          round_data: Array.from({ length: 8 }, () => cell(8)),
          scoreList: [20],
          total_mul: 4,
          score: 20,
          total_gold: 80,
          is_over: 0,
        },
        {
          ...sourceFixture().list[0]!,
          start_data: [],
          remove_type: [8],
          round_data: Array.from({ length: 8 }, () => cell(3)),
          scoreList: [20],
          total_mul: 4,
          score: 20,
          total_gold: 160,
        },
      ],
      score: 40,
      total_gold: 160,
      multiplierBankAdded: 4,
      multiplierBankAfter: 4,
    });
    const states = seth2SourceGameStates(data, {
      ...SOURCE_OPTIONS,
      featureWinningsBefore: 6,
    });

    expect(states[0]).toMatchObject({ roundWinnings: 20, totalWinnings: 26 });
    expect(states[1]).toMatchObject({ roundWinnings: 40, totalWinnings: 46 });
    expect(states[2]).toMatchObject({ roundWinnings: 160, totalWinnings: 166, winSymbols: [] });
  });

  it('inserts a terminal collection view before any later complete board', () => {
    const first = Array.from({ length: 30 }, () => cell(2));
    for (let position = 0; position < 8; position += 1) first[position] = cell(9);
    first[20] = cell(10, 10, 1);
    const unrelatedNextBoard = Array.from({ length: 30 }, (_, position) =>
      cell((position % 8) + 1),
    );
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: first,
          remove_type: [9],
          round_data: Array.from({ length: 8 }, () => cell(3)),
          scoreList: [5],
          total_mul: 10,
          score: 5,
          total_gold: 50,
        },
        {
          ...sourceFixture().list[0]!,
          start_data: unrelatedNextBoard,
          total_gold: 50,
        },
      ],
      score: 5,
      total_gold: 50,
    });

    const states = seth2SourceGameStates(data, SOURCE_OPTIONS);
    expect(states).toHaveLength(3);
    expect(states[0]!.winSymbols.length).toBeGreaterThan(0);
    expect(states[1]).toMatchObject({
      winSymbols: [],
      roundWinnings: 50,
      totalWinnings: 50,
    });
    expect(states[2]).toMatchObject({
      winSymbols: [],
      roundWinnings: 0,
      totalWinnings: 50,
    });
    expect(states[2]!.view).not.toEqual(states[1]!.view);
  });

  it('renders controlled super-main outcomes as real tumble/collect cycles with a 500x object', () => {
    for (const factor of [0, 20, 500, 5_000]) {
      const outcome = seth2SuperMainSpinForFactor('source-super', 'client', factor, 2, factor);
      const states = seth2SourceGameStates(outcome.returnData, {
        ...SOURCE_OPTIONS,
        action: 'superSpin',
        freeGameCount: 0,
      });
      expect(states.length).toBeGreaterThanOrEqual(1);
      expect(states.length).toBeLessThanOrEqual(18);
      expect(states.every((state) => state.action === 'superSpin')).toBe(true);
      expect(
        states.some((state) => state.timesSymbols.some((symbol) => symbol.times === 500)),
      ).toBe(true);
      expect(states.at(-1)!.totalWinnings).toBe(outcome.returnData.total_gold);
      if (factor === 0) {
        expect(states).toHaveLength(1);
        expect(states[0]!.winSymbols).toEqual([]);
      } else {
        const segments = outcome.returnData.list.filter(
          (round) => round.collect_gold !== undefined,
        );
        expect(segments.length).toBeGreaterThan(0);
        expect(segments.every((round) => round.remove_type.length > 0)).toBe(true);
        expect(
          moneyForTest(segments.reduce((total, round) => total + Number(round.collect_gold), 0)),
        ).toBe(outcome.returnData.total_gold);
      }
    }
  });

  it('maps the single Eternal Rise skill and all five woman-lock follow-ups', () => {
    for (let nonce = 0; nonce < 2_000; nonce += 1) {
      const outcome = seth2SuperMainSpinForFactor('source-woman-lock', 'client', nonce, 2, 5_000);
      const expectedSkills = outcome.returnData.list.filter(
        (round) =>
          (round.male_mul_list?.length ?? 0) > 0 || (round.female_start_mul_list?.length ?? 0) > 0,
      );
      expect(expectedSkills.length).toBeLessThanOrEqual(1);
      if (!expectedSkills.some((round) => (round.female_start_mul_list?.length ?? 0) > 0)) continue;
      const states = seth2SourceGameStates(outcome.returnData, {
        ...SOURCE_OPTIONS,
        action: 'superSpin',
        freeGameCount: 0,
      });
      const animatedSkills = states.filter(
        (state) => state.maleTotemLevel > 0 || state.femaleTotemLevel > 0,
      );
      const lockCounts = states
        .map((state) => Math.max(0, ...state.timesSymbols.map((symbol) => symbol.lock)))
        .filter((count) => count > 0)
        .filter((count, index, counts) => index === 0 || count !== counts[index - 1]);
      expect(animatedSkills).toHaveLength(1);
      expect(lockCounts).toEqual([6, 5, 4, 3, 2, 1]);
      expect(states.at(-1)!.totalWinnings).toBe(outcome.returnData.total_gold);
      return;
    }
    throw new Error('Expected a deterministic woman-lock Eternal Rise fixture');
  });

  it('keeps every controlled factor visually identical to its authoritative payout', () => {
    const modes = ['base', 'standard_free', 'awakening_free', 'bought_standard_free'] as const;
    const factors = [0, 0.5, 1, 2, 5, 8, 10, 20, 45, 100, 205, 500, 2_015, 5_000, 81_000];

    for (const mode of modes) {
      for (const factor of factors) {
        for (let nonce = 0; nonce < 10; nonce += 1) {
          const outcome = seth2SpinForFactor(
            'source-payout-parity',
            'client',
            nonce,
            2,
            factor,
            mode,
          );
          const featureWinningsBefore = mode === 'base' ? 0 : 123.45;
          const states = seth2SourceGameStates(outcome.returnData, {
            action: mode === 'base' ? 'spin' : 'freeSpin',
            spinId: `${mode}-${factor}-${nonce}`,
            totalStake: 2,
            freeGameCount: mode === 'base' ? 0 : 7,
            featureWinningsBefore,
            isGoldenFg: mode === 'awakening_free',
          });
          const final = states.at(-1)!;

          expect(final.totalWinnings).toBe(
            moneyForTest(featureWinningsBefore + outcome.returnData.total_gold),
          );
          if (outcome.returnData.score > 0) {
            expect(final.winSymbols).toEqual([]);
            expect(final.roundWinnings).toBe(outcome.returnData.total_gold);
            let cumulativeBase = 0;
            outcome.returnData.list.forEach((round, roundIndex) => {
              cumulativeBase = moneyForTest(cumulativeBase + round.score);
              expect(states[roundIndex]!.roundWinnings).toBe(cumulativeBase);
            });
          } else {
            expect(states).toHaveLength(1);
            expect(final.roundWinnings).toBe(0);
          }
        }
      }
    }
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

  it('maps official multiplier colours from green low values to red/gold high values', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 2, 1);
    start[1] = cell(10, 10, 1);
    start[2] = cell(10, 50, 1);
    start[3] = cell(10, 500, 1);
    const state = seth2SourceGameStates(
      sourceFixture({ list: [{ ...sourceFixture().list[0]!, start_data: start }] }),
      SOURCE_OPTIONS,
    )[0]!;
    expect(state.view.flat().slice(0, 4)).toEqual([13, 12, 11, 10]);
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

  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
  ] as const)('maps %i male split targets to source animation level %i once', (copies, level) => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 25, 1);
    start[1] = cell(17);
    start[2] = cell(17);
    start[3] = cell(17);
    for (let position = 4; position < 10; position += 1) start[position] = cell(1);
    // The math result transports male clones separately in type17_mul_list;
    // round_data only contains the ordinary refill cells.
    const firstRefill = Array.from({ length: 9 - copies }, () => cell(4));
    const data = sourceFixture({
      list: [
        {
          start_data: start,
          remove_type: [1, 17],
          round_data: firstRefill,
          scoreList: [2, 1],
          upgrade_mul_list: [],
          total_mul: 25 * (copies + 1),
          score: 3,
          total_gold: 3,
          remove_count: 0,
          is_over: 0,
        },
        {
          start_data: [],
          remove_type: [2],
          round_data: Array.from({ length: 26 }, () => cell(3)),
          scoreList: [1],
          upgrade_mul_list: [],
          total_mul: 25 * (copies + 1),
          score: 1,
          total_gold: 4,
          remove_count: 1,
          is_over: 1,
        },
      ],
      type17_beishu: cell(10, 25, 1, 0),
      type17_mul_list: Array.from({ length: copies }, () => cell(10, 25, 1)),
      score: 4,
      total_gold: 4,
    });
    const states = seth2SourceGameStates(data, SOURCE_OPTIONS);
    expect(states[0]!.maleTotemLevel).toBe(level);
    expect(states[0]!.splitList[0]?.from).toBe(0);
    expect(states[0]!.splitList[0]?.to).toHaveLength(copies);
    expect(states[0]!.splitList[0]!.to.every((position) => start[position]?.type !== 10)).toBe(
      true,
    );
    expect(states[1]!.timesSymbols.filter((entry) => entry.times === 25)).toHaveLength(copies + 1);
    expect(states[1]!.maleTotemLevel).toBe(0);
    expect(states[1]!.splitList).toEqual([]);
    expectSourceBoardReplay(states);
  });

  it.each([1, 2, 3] as const)(
    'maps %i selected woman-lock balls to the matching animation level',
    (selectedCount) => {
      const start = Array.from({ length: 30 }, () => cell(2));
      const locked = [cell(10, 10, 1, 0), cell(10, 15, 1, 1), cell(10, 25, 1, 2)].slice(
        0,
        selectedCount,
      );
      locked.forEach((current, index) => {
        start[index] = cell(10, current.mul, 1);
      });
      start[10] = cell(18);
      start[11] = cell(18);
      start[12] = cell(18);
      const data = sourceFixture({
        list: [
          {
            ...sourceFixture().list[0]!,
            start_data: start,
            remove_type: [18],
            round_data: [cell(4), cell(5), cell(6)],
            scoreList: [1],
            total_mul: 10,
            score: 1,
            total_gold: 1,
          },
        ],
        type18_start_mul_list: locked,
        type18_mul_count: 6,
        score: 1,
        total_gold: 1,
      });
      const first = seth2SourceGameStates(data, SOURCE_OPTIONS)[0]!;
      expect(first.femaleTotemLevel).toBe(selectedCount);
      expect(first.timesSymbols.filter((entry) => entry.lock === 6)).toHaveLength(selectedCount);
    },
  );

  it('fires male and female skills on their actual cascade instead of forcing the first view', () => {
    const maleStart = Array.from({ length: 30 }, () => cell(2));
    maleStart[0] = cell(10, 25, 1);
    maleStart[1] = cell(17);
    maleStart[2] = cell(17);
    maleStart[3] = cell(17);
    for (let position = 4; position < 12; position += 1) maleStart[position] = cell(1);
    const maleData = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: maleStart,
          remove_type: [1],
          round_data: Array.from({ length: 8 }, () => cell(4)),
          scoreList: [2],
          score: 2,
          total_gold: 2,
          is_over: 0,
        },
        {
          ...sourceFixture().list[0]!,
          start_data: [],
          remove_type: [17],
          round_data: [cell(4), cell(4)],
          scoreList: [1],
          score: 1,
          total_gold: 3,
        },
      ],
      type17_beishu: cell(10, 25, 1, 0),
      type17_mul_list: [cell(10, 25, 1)],
      score: 3,
      total_gold: 3,
    });
    const maleStates = seth2SourceGameStates(maleData, SOURCE_OPTIONS);
    expect(maleStates[0]).toMatchObject({ maleTotemLevel: 0, splitList: [] });
    expect(maleStates[1]!.maleTotemLevel).toBe(1);
    expect(maleStates[1]!.splitList[0]?.to).toHaveLength(1);

    const femaleStart = maleStart.map((current) => ({ ...current }));
    femaleStart[1] = cell(18);
    femaleStart[2] = cell(18);
    femaleStart[3] = cell(18);
    const femaleData = sourceFixture({
      list: [
        { ...maleData.list[0]!, start_data: femaleStart },
        { ...maleData.list[1]!, remove_type: [18], round_data: [cell(4), cell(4), cell(4)] },
      ],
      type18_start_mul_list: [cell(10, 25, 1, 0)],
      type18_mul_count: 6,
      score: 3,
      total_gold: 3,
    });
    const femaleStates = seth2SourceGameStates(femaleData, SOURCE_OPTIONS);
    expect(femaleStates[0]!.femaleTotemLevel).toBe(0);
    expect(femaleStates[0]!.timesSymbols[0]!.lock).toBe(0);
    expect(femaleStates[1]!.femaleTotemLevel).toBe(1);
    expect(femaleStates[1]!.timesSymbols[0]!.lock).toBe(6);
  });

  it('locks only the selected female balls and does not replay the woman on carry-over games', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[4] = cell(10, 25, 1);
    start[5] = cell(10, 50, 1);
    const data = sourceFixture({
      list: [{ ...sourceFixture().list[0]!, start_data: start }],
      type18_start_mul_list: [cell(10, 25, 1, 4)],
      type18_mul_count: 3,
      multiplierBankBefore: 10,
      multiplierBankAfter: 10,
    });
    const first = seth2SourceGameStates(data, SOURCE_OPTIONS)[0]!;
    expect(first.femaleTotemLevel).toBe(0);
    expect(first.timesSymbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbolPos: 4, times: 25, lock: 3 }),
        expect.objectContaining({ symbolPos: 5, times: 50, lock: 0 }),
      ]),
    );
    expect(first.newTimesSymbols.map((entry) => entry.symbolPos)).toEqual([5]);
  });

  it('keeps a female-locked multiplier fixed without creating a duplicate after the board falls', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 25, 1);
    start[6] = cell(1);
    start[12] = cell(1);
    start[18] = cell(1);
    start[1] = cell(18);
    start[2] = cell(18);
    start[3] = cell(18);
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: start,
          remove_type: [1, 18],
          round_data: Array.from({ length: 6 }, () => cell(4)),
          scoreList: [1, 1],
          total_mul: 25,
          score: 2,
          total_gold: 50,
        },
      ],
      type18_start_mul_list: [cell(10, 25, 1, 0)],
      type18_mul_count: 4,
      score: 2,
      total_gold: 50,
    });
    const states = seth2SourceGameStates(data, SOURCE_OPTIONS);
    expect(states[0]!.timesSymbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbolPos: 0, times: 25, lock: 4 })]),
    );
    expect(states.at(-1)!.timesSymbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbolPos: 0, times: 25, lock: 4 })]),
    );
    expect(states[0]!.posTransform).not.toContainEqual(expect.objectContaining({ beforePos: 0 }));
    expect(states.at(-1)!.timesSymbols.filter((entry) => entry.times === 25)).toHaveLength(1);
    expectSourceBoardReplay(states);
  });

  it('keeps upgrade positions pre-fall so the Cocos client transforms them exactly once', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 6, 0);
    start[5] = cell(4);
    start[6] = cell(1);
    start[12] = cell(1);
    start[18] = cell(2);
    start[24] = cell(1);
    const upgrade = { type: 10, mul: 6, new_mul: 8, mul_type: 0, code: 0 };
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: start,
          remove_type: [1],
          round_data: [cell(3), cell(3), cell(3)],
          scoreList: [2],
          score: 2,
          total_gold: 2,
          upgrade_mul_list: [upgrade],
        },
      ],
      score: 2,
      total_gold: 2,
    });
    const states = seth2SourceGameStates(data, SOURCE_OPTIONS);
    expect(states[0]!.posTransform).toEqual(
      expect.arrayContaining([
        { beforePos: 0, afterPos: 18 },
        { beforePos: 18, afterPos: 24 },
      ]),
    );
    expect(states[0]!.timesUpgrade[0]).toMatchObject({
      symbolPos: 0,
      beforeTimes: 6,
      afterTimes: 8,
    });
    expect(states.at(-1)!.timesSymbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbolPos: 18, times: 8, isRare: true })]),
    );
  });

  it('tracks an original multiplier into a later cascade before upgrading it', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 6, 0);
    start[5] = cell(4);
    start[6] = cell(1);
    start[12] = cell(1);
    start[24] = cell(1);
    const upgrade = { type: 10, mul: 6, new_mul: 8, mul_type: 0, code: 0 };
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: start,
          remove_type: [1],
          round_data: [cell(3), cell(3), cell(3)],
          scoreList: [2],
          score: 2,
          total_gold: 2,
          is_over: 0,
        },
        {
          ...sourceFixture().list[0]!,
          start_data: [],
          remove_type: [4],
          round_data: [cell(5)],
          scoreList: [1],
          score: 1,
          total_gold: 3,
          upgrade_mul_list: [upgrade],
        },
      ],
      score: 3,
      total_gold: 3,
    });
    const states = seth2SourceGameStates(data, SOURCE_OPTIONS);
    expect(states[1]!.timesUpgrade[0]).toMatchObject({ symbolPos: 18, afterTimes: 8 });
    expect(states.at(-1)!.timesSymbols).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbolPos: 18, times: 8 })]),
    );
  });

  it('sends the saved multiplier bank before the client collects current balls', () => {
    const start = Array.from({ length: 30 }, () => cell(2));
    start[0] = cell(10, 10, 1);
    start[1] = cell(1);
    const data = sourceFixture({
      list: [
        {
          ...sourceFixture().list[0]!,
          start_data: start,
          remove_type: [1],
          round_data: [cell(3)],
          scoreList: [2],
          total_mul: 35,
          score: 2,
          total_gold: 70,
        },
      ],
      score: 2,
      total_gold: 70,
      multiplierBankBefore: 25,
      multiplierBankAdded: 10,
      multiplierBankAfter: 35,
    });
    const states = seth2SourceGameStates(data, SOURCE_OPTIONS);
    expect(states.every((state) => state.currentTimes === 25)).toBe(true);
  });

  it('uses captured currentTimes and super-main counters for active and final views', () => {
    const freeLoss = seth2SourceGameStates(sourceFixture(), SOURCE_OPTIONS);
    expect(freeLoss[0]!.currentTimes).toBe(0);

    const baseOutcome = seth2SpinForFactor('current-times', 'client', 0, 2, 10, 'base');
    const baseStates = seth2SourceGameStates(baseOutcome.returnData, {
      ...SOURCE_OPTIONS,
      action: 'spin',
      isGoldenFg: false,
      freeGameCount: 0,
    });
    expect(baseStates[0]!.currentTimes).toBe(0);
    expect(baseStates.at(-1)!.currentTimes).toBe(-1);

    const superStates = seth2SourceGameStates(baseOutcome.returnData, {
      ...SOURCE_OPTIONS,
      action: 'superSpin',
      freeGameCount: 0,
    });
    expect(superStates.every((state) => state.superMainGameCount === 0)).toBe(true);
  });
});

function moneyForTest(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
