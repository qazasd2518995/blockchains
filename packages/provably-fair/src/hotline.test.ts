import { describe, it, expect } from 'vitest';
import {
  hotlineSpin,
  hotlineEvaluate,
  HOTLINE_REELS,
  HOTLINE_MINI_REELS,
  HOTLINE_ROWS,
  HOTLINE_MEGA_REELS,
  HOTLINE_MEGA_ROWS,
  HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER,
  HOTLINE_SYMBOLS,
  HOTLINE_MINI_SYMBOLS,
  HOTLINE_MEGA_SYMBOLS,
  getHotlineReelCount,
  getHotlineReelRowCounts,
  getHotlineRowCount,
  getHotlineSymbolsForGame,
  getHotlineEvaluationMode,
  getHotlineMaximumTotalMultiplier,
  getHotlinePaylinesForGame,
  hotlineBuyFreeSpins,
  hotlineSpinCascades,
  hotlineSelectBountyFreeMode,
  hotlineSelectLucky777FreeMode,
  hotlineSelectCaishenFreeGame,
  hotlineSpinSourceFeatureRound,
  isHotlineCascadeGame,
  isHotlineFeatureGame,
  isHotlineSourceFeatureGame,
  applyDragonHatchCollectionAction,
  getNineLinePullKingFreeSpinAward,
  getWaterMarginBonusGameAward,
  getCaishenFaFaFaFreeSpinAward,
  getFruitLittleMaryMiniGameAward,
  getDiamondStrikeJackpotTier,
  getStar97SevenMultiplier,
  type HotlineCascadeSourceAction,
} from './hotline.js';
import { getH5OriginalGameSpec } from './h5OriginalSpecs.js';

function megaScatterPayout(count: number): number {
  if (count >= 6) return 100;
  if (count === 5) return 5;
  if (count === 4) return 3;
  return 0;
}

function positionKey(position: { reel: number; row: number }): string {
  return `${position.reel}:${position.row}`;
}

function expectMegaFeatureUsesPaytable(
  features: NonNullable<ReturnType<typeof hotlineBuyFreeSpins>['features']>,
): void {
  let freeSpinWinMultiplier = 0;
  for (const round of features.freeSpinRounds) {
    const expectedLines = round.cascades.flatMap((step) => step.lines);
    expect(round.lines).toEqual(expectedLines);
    let symbolWinMultiplier = 0;

    for (const step of round.cascades) {
      const evaluated = hotlineEvaluate(step.grid);
      expect(step.lines).toEqual(evaluated.lines);
      expect(step.multiplier).toBeCloseTo(evaluated.totalMultiplier, 4);
      symbolWinMultiplier = roundTestMultiplier(symbolWinMultiplier + step.multiplier);
    }

    const scatterMultiplier = megaScatterPayout(round.scatterSymbols.length);
    expect(round.baseMultiplier).toBeCloseTo(
      roundTestMultiplier(symbolWinMultiplier + scatterMultiplier),
      4,
    );
    expect(round.totalMultiplier).toBeCloseTo(
      roundTestMultiplier(
        scatterMultiplier + symbolWinMultiplier * Math.max(1, round.appliedMultiplier),
      ),
      4,
    );
    freeSpinWinMultiplier = roundTestMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
  }
  expect(features.freeSpinWinMultiplier).toBeCloseTo(freeSpinWinMultiplier, 3);
}

function roundTestMultiplier(value: number): number {
  return Number(value.toFixed(4));
}

describe('hotlineSpin', () => {
  it('returns grid of HOTLINE_REELS cols × HOTLINE_ROWS rows', () => {
    const grid = hotlineSpin('s', 'c', 1);
    expect(grid.length).toBe(HOTLINE_REELS);
    for (const col of grid) {
      expect(col.length).toBe(HOTLINE_ROWS);
      for (const sym of col) {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(HOTLINE_SYMBOLS.length);
      }
    }
  });

  it('is deterministic', () => {
    expect(hotlineSpin('s', 'c', 1)).toEqual(hotlineSpin('s', 'c', 1));
  });

  it('supports 3x3 slot variants', () => {
    const grid = hotlineSpin('s', 'c', 1, HOTLINE_MINI_REELS);
    expect(grid.length).toBe(HOTLINE_MINI_REELS);
    for (const col of grid) {
      expect(col.length).toBe(HOTLINE_ROWS);
      for (const sym of col) {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(HOTLINE_MINI_SYMBOLS.length);
      }
    }
    expect(HOTLINE_MINI_SYMBOLS.length).toBe(HOTLINE_SYMBOLS.length);
    expect(getHotlineReelCount('temple-slot')).toBe(HOTLINE_MINI_REELS);
  });

  it('uses separate 8-symbol paytables for fixed-line variants', () => {
    expect(HOTLINE_MINI_SYMBOLS.map((symbol) => symbol.payout3)).toEqual([
      0.92, 1.6, 3.2, 6, 12, 20, 40, 80,
    ]);
    expect(
      HOTLINE_SYMBOLS.map((symbol) => [symbol.payout3, symbol.payout4, symbol.payout5]),
    ).toEqual([
      [0.92, 2.3, 4.8],
      [1.2, 3.2, 6.8],
      [1.7, 5.2, 13],
      [2.8, 8.5, 26],
      [5, 16, 60],
      [8, 35, 120],
      [15, 80, 250],
      [25, 160, 450],
    ]);
  });

  it('keeps 5x3 slot variants on a small-hit profile', () => {
    const total = 20_000;
    let payout = 0;
    let hit = 0;
    let netWin = 0;
    let smallHit = 0;
    let highHit = 0;

    for (let nonce = 0; nonce < total; nonce += 1) {
      const grid = hotlineSpin('classic-regression', 'client', nonce, HOTLINE_REELS);
      const multiplier = hotlineEvaluate(grid).totalMultiplier;
      payout += multiplier;
      if (multiplier > 0) hit += 1;
      if (multiplier > 1) netWin += 1;
      if (multiplier > 0 && multiplier <= 1.4) smallHit += 1;
      if (multiplier >= 3) highHit += 1;
    }

    expect(payout / total).toBeGreaterThan(0.85);
    expect(payout / total).toBeLessThan(1.05);
    expect(hit / total).toBeGreaterThan(0.35);
    expect(netWin / total).toBeLessThan(0.35);
    expect(smallHit / total).toBeGreaterThan(0.15);
    expect(highHit / total).toBeLessThan(0.12);
  });

  it('keeps 3x3 slot variants on a small-hit profile', () => {
    const total = 20_000;
    let payout = 0;
    let hit = 0;
    let netWin = 0;
    let smallHit = 0;
    let highHit = 0;

    for (let nonce = 0; nonce < total; nonce += 1) {
      const grid = hotlineSpin('mini-regression', 'client', nonce, HOTLINE_MINI_REELS);
      const multiplier = hotlineEvaluate(grid).totalMultiplier;
      payout += multiplier;
      if (multiplier > 0) hit += 1;
      if (multiplier > 1) netWin += 1;
      if (multiplier > 0 && multiplier <= 1.4) smallHit += 1;
      if (multiplier >= 3) highHit += 1;
    }

    expect(payout / total).toBeGreaterThan(0.85);
    expect(payout / total).toBeLessThan(1.05);
    expect(hit / total).toBeGreaterThan(0.5);
    expect(netWin / total).toBeLessThan(0.35);
    expect(smallHit / total).toBeGreaterThan(0.25);
    expect(highHit / total).toBeLessThan(0.05);
  });

  it('supports 6x5 mega slot variants', () => {
    const grid = hotlineSpin('s', 'c', 1, HOTLINE_MEGA_REELS, HOTLINE_MEGA_ROWS);
    expect(grid.length).toBe(HOTLINE_MEGA_REELS);
    for (const col of grid) {
      expect(col.length).toBe(HOTLINE_MEGA_ROWS);
      for (const sym of col) {
        expect(sym).toBeGreaterThanOrEqual(0);
        expect(sym).toBeLessThan(HOTLINE_MEGA_SYMBOLS.length);
      }
    }
    expect(HOTLINE_MEGA_SYMBOLS.length).toBe(8);
    expect(getHotlineReelCount('thunder-slot')).toBe(HOTLINE_MEGA_REELS);
    expect(getHotlineRowCount('thunder-slot')).toBe(HOTLINE_MEGA_ROWS);
  });

  it('uses each imported Cocos slot layout and mechanic instead of one shared 5x3 board', () => {
    const layouts: Record<string, [number, number]> = {
      'h5-nine-line-pull-king': [5, 3],
      'h5-water-margin': [5, 3],
      'h5-diamond-strike': [5, 3],
      'h5-yu-pu-tuan': [5, 4],
      'h5-fruit-little-mary': [5, 3],
      'h5-aztec-treasure': [3, 3],
      'h5-fire-88': [3, 3],
      'h5-lucky-777': [3, 3],
      'h5-caishen-fa-fa-fa': [5, 3],
      'h5-flying-together': [5, 3],
      'h5-star-97': [3, 3],
      'h5-fortune-ox': [3, 4],
      'h5-mahjong-ways': [5, 4],
      'h5-mahjong-ways-2': [5, 5],
      'h5-dragon-hatch': [5, 5],
      'h5-captains-bounty': [5, 3],
      'h5-caishen-wins': [6, 5],
      'h5-queen-of-bounty': [5, 3],
      'h5-golden-empire': [6, 5],
      'h5-fortune-gems': [3, 3],
      'h5-gates-of-olympus': [6, 5],
    };
    for (const [gameId, expected] of Object.entries(layouts)) {
      expect([getHotlineReelCount(gameId), getHotlineRowCount(gameId)]).toEqual(expected);
    }
    expect(isHotlineCascadeGame('h5-captains-bounty')).toBe(true);
    expect(isHotlineCascadeGame('h5-nine-line-pull-king')).toBe(false);
    expect(isHotlineFeatureGame('h5-dragon-hatch')).toBe(false);
    expect(isHotlineFeatureGame('h5-fortune-ox')).toBe(false);
    expect(isHotlineSourceFeatureGame('h5-fortune-ox')).toBe(true);
    expect(isHotlineFeatureGame('h5-fortune-gems')).toBe(false);
    expect(isHotlineSourceFeatureGame('h5-fortune-gems')).toBe(true);
    expect(isHotlineFeatureGame('h5-star-97')).toBe(false);
    expect(isHotlineSourceFeatureGame('h5-star-97')).toBe(true);
    expect(getHotlineReelRowCounts('h5-mahjong-ways-2')).toEqual([4, 5, 5, 5, 4]);
  });

  it('uses the original Mahjong scatter/Wild IDs and turns winning gold tiles into Wilds', () => {
    expect(getH5OriginalGameSpec('h5-mahjong-ways')).toMatchObject({
      sourceMainModule: 'majianghulePGMain',
      standardSymbolCount: 8,
      specialSymbols: { scatter: 9, wild: 10 },
      totalBetUnits: 20,
      settleWithSourcePaytable: true,
    });
    expect(getH5OriginalGameSpec('h5-mahjong-ways-2')).toMatchObject({
      sourceMainModule: 'majianghule2PGMain',
      standardSymbolCount: 9,
      specialSymbols: { scatter: 10, wild: 11, blank: 12 },
      totalBetUnits: 20,
      settleWithSourcePaytable: true,
    });
    expect(getHotlineSymbolsForGame('h5-mahjong-ways')).toHaveLength(8);
    expect(getHotlineSymbolsForGame('h5-mahjong-ways-2')).toHaveLength(9);
    expect(
      getHotlineSymbolsForGame('h5-mahjong-ways').map(({ payout3, payout4, payout5 }) => [
        payout3,
        payout4,
        payout5,
      ]),
    ).toEqual([
      [0.1, 0.25, 0.5],
      [0.1, 0.25, 0.5],
      [0.2, 0.5, 1],
      [0.2, 0.5, 1],
      [0.3, 0.75, 2],
      [0.4, 1, 3],
      [0.5, 2, 4],
      [0.75, 3, 5],
    ]);
    expect(
      getHotlineSymbolsForGame('h5-mahjong-ways-2').map(({ payout3, payout4, payout5 }) => [
        payout3,
        payout4,
        payout5,
      ]),
    ).toEqual([
      [0.05, 0.15, 0.3],
      [0.05, 0.15, 0.3],
      [0.1, 0.2, 0.5],
      [0.15, 0.25, 0.6],
      [0.15, 0.25, 0.6],
      [0.25, 0.5, 0.75],
      [0.3, 0.75, 1.5],
      [0.4, 1, 2],
      [0.5, 1.25, 2.5],
    ]);

    const wildAssisted = [
      [0, 1, 2, 3],
      [9, 2, 3, 4],
      [0, 3, 4, 5],
      [1, 4, 5, 6],
      [2, 5, 6, 7],
    ];
    expect(hotlineEvaluate(wildAssisted, 'h5-mahjong-ways').lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 0, count: 3 })]),
    );

    let observedGold = false;
    let observedTransformedWild = false;
    for (let nonce = 0; nonce < 500; nonce += 1) {
      const round = hotlineSpinCascades(
        'mahjong-gold-server',
        'mahjong-gold-client',
        nonce,
        5,
        5,
        20,
        false,
        'h5-mahjong-ways-2',
      );
      expect(round.initialGrid.map((column) => column.length)).toEqual([4, 5, 5, 5, 4]);
      for (const step of round.cascades) {
        const raw = hotlineEvaluate(step.grid, 'h5-mahjong-ways-2');
        const expectedCascadeMultiplier = [1, 2, 3, 5][Math.min(step.index, 3)]!;
        expect(step.multiplier).toBeCloseTo(raw.totalMultiplier * expectedCascadeMultiplier, 4);
        for (const position of step.goldPositions ?? []) {
          observedGold = true;
          expect(position.reel).toBeGreaterThanOrEqual(1);
          expect(position.reel).toBeLessThanOrEqual(3);
        }
      }
      observedTransformedWild ||=
        round.finalGrid.flat().includes(10) ||
        round.cascades.slice(1).some((step) => step.grid.flat().includes(10));
      if (observedGold && observedTransformedWild) break;
    }
    expect(observedGold).toBe(true);
    expect(observedTransformedWild).toBe(true);
  });

  it('uses each Mahjong game original free-spin award and cascade multiplier ladder', () => {
    for (const [gameId, baseAward, reelRows] of [
      ['h5-mahjong-ways', 12, [4, 4, 4, 4, 4]],
      ['h5-mahjong-ways-2', 10, [4, 5, 5, 5, 4]],
    ] as const) {
      let triggered: ReturnType<typeof hotlineSpinCascades> | undefined;
      for (let nonce = 0; nonce < 4_000; nonce += 1) {
        const candidate = hotlineSpinCascades(
          'mahjong-free-server',
          `mahjong-free-client-${gameId}`,
          nonce,
          5,
          gameId === 'h5-mahjong-ways' ? 4 : 5,
          20,
          true,
          gameId,
        );
        if ((candidate.features?.freeSpinsAwarded ?? 0) > 0) {
          triggered = candidate;
          break;
        }
      }

      expect(triggered, `${gameId}/trigger`).toBeDefined();
      const features = triggered!.features!;
      expect(features.freeSpinsAwarded).toBe(
        baseAward + Math.max(0, features.scatterCount - 3) * 2,
      );
      expect(features.baseMultiplierSymbols).toEqual([]);
      expect(features.freeSpinMultiplierBank).toBe(0);
      for (const round of features.freeSpinRounds) {
        expect(round.initialGrid.map((column) => column.length)).toEqual(reelRows);
        expect(round.multiplierSymbols).toEqual([]);
        expect(round.appliedMultiplier).toBe(1);
        for (const step of round.cascades) {
          const raw = hotlineEvaluate(step.grid, gameId);
          const expectedMultiplier = [2, 4, 6, 10][Math.min(step.index, 3)]!;
          expect(step.multiplier).toBeCloseTo(raw.totalMultiplier * expectedMultiplier, 4);
          if (gameId === 'h5-mahjong-ways-2') {
            const gold = new Set(
              (step.goldPositions ?? []).map((position) => positionKey(position)),
            );
            for (let row = 0; row < step.grid[2]!.length; row += 1) {
              if (step.grid[2]![row] !== 10) expect(gold.has(`2:${row}`)).toBe(true);
            }
          }
        }
      }
      expect(features.totalMultiplier).toBeCloseTo(
        roundTestMultiplier(
          features.baseTotalMultiplier +
            features.freeSpinRounds.reduce((sum, round) => sum + round.totalMultiplier, 0),
        ),
        4,
      );
    }
  });

  it('uses Dragon Hatch original 5x5 connected-cluster rules and paytable', () => {
    expect(getH5OriginalGameSpec('h5-dragon-hatch')).toMatchObject({
      sourceMainModule: 'dragonhatchMain',
      sourceDetailModule: 'dragonhatchDetail',
      standardSymbolCount: 8,
      generatedSymbolCount: 9,
      specialSymbols: { wild: 9, feature: 10 },
      clusterMinimum: 4,
      collectionThresholds: [10, 30, 50, 70],
      totalBetUnits: 10,
      settleWithSourcePaytable: true,
    });
    expect(getHotlineSymbolsForGame('h5-dragon-hatch')).toHaveLength(9);
    expect(getH5OriginalGameSpec('h5-dragon-hatch')?.clusterPaytable?.[7]).toEqual([
      30, 40, 70, 100, 200, 300, 500, 1_000, 2_000, 5_000, 10_000, 20_000,
    ]);
    expect(getHotlineReelRowCounts('h5-dragon-hatch')).toEqual([5, 5, 5, 5, 5]);

    const disconnected = [
      [7, 0, 1, 2, 7],
      [0, 1, 2, 3, 4],
      [1, 2, 7, 4, 5],
      [2, 3, 4, 5, 6],
      [7, 4, 5, 6, 0],
    ];
    expect(hotlineEvaluate(disconnected, 'h5-dragon-hatch')).toEqual({
      lines: [],
      totalMultiplier: 0,
    });

    const connected = disconnected.map((column) => [...column]);
    connected[0]![0] = 7;
    connected[0]![1] = 7;
    connected[1]![0] = 7;
    connected[1]![1] = 7;
    const win = hotlineEvaluate(connected, 'h5-dragon-hatch');
    expect(win.totalMultiplier).toBe(3);
    expect(win.lines).toEqual([expect.objectContaining({ symbol: 7, count: 4, payout: 3 })]);

    const wildAssisted = disconnected.map((column) => [...column]);
    wildAssisted[0]![0] = 7;
    wildAssisted[0]![1] = 8;
    wildAssisted[1]![0] = 7;
    wildAssisted[1]![1] = 7;
    expect(hotlineEvaluate(wildAssisted, 'h5-dragon-hatch').lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 7, count: 4, payout: 3 })]),
    );

    let sawNaturalWild = false;
    for (let nonce = 0; nonce < 100 && !sawNaturalWild; nonce += 1) {
      sawNaturalWild = hotlineSpin(
        'dragon-natural-wild-server',
        'dragon-natural-wild-client',
        nonce,
        5,
        5,
        'h5-dragon-hatch',
      )
        .flat()
        .includes(8);
    }
    expect(sawNaturalWild).toBe(true);
  });

  it('applies all four Dragon Hatch collection thresholds to the authoritative grid', () => {
    const grid = Array.from({ length: 5 }, (_, reel) =>
      Array.from({ length: 5 }, (_, row) => (reel * 5 + row) % 8),
    );
    const applied = (...types: HotlineCascadeSourceAction['type'][]) => new Set(types);

    const earth = applyDragonHatchCollectionAction(
      grid,
      10,
      applied(),
      () => 7,
      () => 0.5,
    )!;
    expect(earth.action.type).toBe('dragon-earth');
    expect(earth.action.positions.length).toBeGreaterThan(0);
    expect(earth.grid.flat().every((symbol) => symbol >= 4)).toBe(true);

    const water = applyDragonHatchCollectionAction(
      grid,
      30,
      applied('dragon-earth'),
      () => 7,
      () => 0.5,
    )!;
    expect(water.action.type).toBe('dragon-water');
    expect(water.action.positions).toHaveLength(4);
    expect(water.grid.flat().filter((symbol) => symbol === 8)).toHaveLength(4);

    const fire = applyDragonHatchCollectionAction(
      grid,
      50,
      applied('dragon-earth', 'dragon-water'),
      () => 7,
      () => 0.5,
    )!;
    expect(fire.action).toMatchObject({ type: 'dragon-fire', symbol: 4 });
    expect(fire.action.positions).toHaveLength(13);
    for (const position of fire.action.positions) {
      expect(fire.grid[position.reel]![position.row]).toBe(4);
    }

    const queen = applyDragonHatchCollectionAction(
      grid,
      70,
      applied('dragon-earth', 'dragon-water', 'dragon-fire'),
      () => 7,
      () => 0.5,
    )!;
    expect(queen.action.type).toBe('dragon-queen');
    for (const position of queen.action.positions) {
      expect(queen.grid[position.reel]![position.row]).toBe(
        grid[position.reel]![position.row]! + 4,
      );
    }
  });

  it('carries Dragon Hatch collection/action state through a natural cascade sequence', () => {
    let round: ReturnType<typeof hotlineSpinCascades> | undefined;
    for (let nonce = 0; nonce < 100; nonce += 1) {
      const candidate = hotlineSpinCascades(
        'dragon-action-server',
        'dragon-action-client',
        nonce,
        5,
        5,
        20,
        false,
        'h5-dragon-hatch',
      );
      if (candidate.cascades.some((step) => step.sourceAction?.type === 'dragon-earth')) {
        round = candidate;
        break;
      }
    }
    expect(round).toBeDefined();
    const earthIndex = round!.cascades.findIndex(
      (step) => step.sourceAction?.type === 'dragon-earth',
    );
    expect(earthIndex).toBeGreaterThan(0);
    expect(round!.cascades[earthIndex - 1]!.collectedSymbols).toBeGreaterThanOrEqual(10);
    expect(round!.cascades[earthIndex]).toMatchObject({
      sourceAction: { type: 'dragon-earth' },
      collectedThisStep: 0,
      multiplier: 0,
      lines: [],
    });
    expect(round!.cascades[earthIndex]!.sourceGrid).toHaveLength(5);
  });

  it('uses the original Fortune Ox 3/4/3 board, lines, Wild rules and x10 full screen', () => {
    expect(getHotlineReelRowCounts('h5-fortune-ox')).toEqual([3, 4, 3]);
    expect(getHotlinePaylinesForGame('h5-fortune-ox').map((line) => line.path)).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 0],
      [1, 1, 1],
      [1, 2, 1],
      [1, 2, 2],
      [2, 2, 1],
      [2, 2, 2],
      [2, 3, 2],
    ]);
    expect(getHotlineSymbolsForGame('h5-fortune-ox').map((symbol) => symbol.payout3)).toEqual([
      0.3, 0.5, 1, 2, 5, 10, 20,
    ]);

    for (let nonce = 0; nonce < 30; nonce += 1) {
      expect(
        hotlineSpin('fortune-ox-server', 'fortune-ox-client', nonce, 3, 4, 'h5-fortune-ox').map(
          (column) => column.length,
        ),
      ).toEqual([3, 4, 3]);
    }

    const ordinaryLine = [
      [0, 1, 2],
      [3, 0, 4, 5],
      [0, 2, 3],
    ];
    expect(hotlineEvaluate(ordinaryLine, 'h5-fortune-ox')).toMatchObject({
      totalMultiplier: 0.3,
      lines: [{ lineIndex: 1, symbol: 0, payout: 0.3 }],
    });

    const wildLine = ordinaryLine.map((column) => [...column]);
    wildLine[1]![1] = 6;
    expect(hotlineEvaluate(wildLine, 'h5-fortune-ox')).toMatchObject({
      totalMultiplier: 0.3,
      lines: [{ lineIndex: 1, symbol: 0, payout: 0.3 }],
    });

    const fullWild = [Array(3).fill(6), Array(4).fill(6), Array(3).fill(6)];
    const maxWin = hotlineEvaluate(fullWild, 'h5-fortune-ox');
    expect(maxWin.lines).toHaveLength(10);
    expect(maxWin.totalMultiplier).toBe(2_000);
  });

  it('settles a deterministic Fortune Ox respin feature on a winning shared-outer board', () => {
    const nonce = Array.from({ length: 20_000 }, (_, index) => index).find(
      (candidate) =>
        hotlineSpinSourceFeatureRound(
          'fortune-ox-feature-server',
          'fortune-ox-feature-client',
          candidate,
          'h5-fortune-ox',
        ).sourceFeature?.triggered,
    );
    expect(nonce).toBeDefined();
    const round = hotlineSpinSourceFeatureRound(
      'fortune-ox-feature-server',
      'fortune-ox-feature-client',
      nonce!,
      'h5-fortune-ox',
    );
    expect(round.sourceFeature).toMatchObject({
      type: 'fortune-ox-respin',
      triggered: true,
    });
    expect(round.sourceFeature!.respins).toBeGreaterThan(0);
    expect(round.initialGrid[0]).toEqual(round.initialGrid[2]);
    expect(round.totalMultiplier).toBeGreaterThan(0);
    expect(hotlineEvaluate(round.initialGrid, 'h5-fortune-ox').totalMultiplier).toBe(
      round.totalMultiplier,
    );
  });

  it('uses Fortune Gems fourth-reel multipliers and removes 1x in 50% Extra Bet mode', () => {
    expect(getHotlineSymbolsForGame('h5-fortune-gems')).toHaveLength(8);
    expect(getH5OriginalGameSpec('h5-fortune-gems')).toMatchObject({
      sourceMainModule: 'fortunegemsMain',
      standardSymbolCount: 8,
      generatedSymbolCount: 8,
      specialSymbols: { wild: 8, multiplierStart: 9, multiplierEnd: 14 },
      totalBetUnits: 5,
      settleWithSourcePaytable: true,
    });
    expect(
      getH5OriginalGameSpec('h5-fortune-gems')?.paytable.map((entry) => entry.payout3),
    ).toEqual([2, 5, 8, 10, 12, 15, 20, 25]);

    const wild = 7;
    const mixedWildLine = [
      [0, 1, 2],
      [wild, 3, 4],
      [0, 5, 6],
    ];
    const mixedWildWin = hotlineEvaluate(mixedWildLine, 'h5-fortune-gems');
    expect(mixedWildWin.lines).toHaveLength(1);
    expect(mixedWildWin.lines[0]).toMatchObject({
      lineIndex: 1,
      symbol: 0,
      payout: 0.4,
      positions: [
        { reel: 0, row: 0 },
        { reel: 1, row: 0 },
        { reel: 2, row: 0 },
      ],
    });

    const allWild = Array.from({ length: 3 }, () => [wild, wild, wild]);
    const allWildWin = hotlineEvaluate(allWild, 'h5-fortune-gems');
    expect(allWildWin.lines).toHaveLength(5);
    expect(allWildWin.totalMultiplier).toBe(25);
    const normalIndexes = new Set<number>();
    const enhancedIndexes = new Set<number>();
    for (let nonce = 0; nonce < 300; nonce += 1) {
      const normal = hotlineSpinSourceFeatureRound(
        'fortune-gems-server',
        'fortune-gems-client',
        nonce,
        'h5-fortune-gems',
      );
      const enhanced = hotlineSpinSourceFeatureRound(
        'fortune-gems-server',
        'fortune-gems-client',
        nonce,
        'h5-fortune-gems',
        3,
        3,
        'fortune-gems-extra-bet',
      );
      expect(normal.sourceFeature?.type).toBe('fortune-gems-multiplier');
      expect(enhanced.sourceFeature?.type).toBe('fortune-gems-multiplier');
      if (normal.sourceFeature?.type === 'fortune-gems-multiplier') {
        normalIndexes.add(normal.sourceFeature.multiplierIndex);
        const base = hotlineEvaluate(normal.initialGrid, 'h5-fortune-gems');
        expect(normal.totalMultiplier).toBeCloseTo(
          base.totalMultiplier * normal.sourceFeature.multiplier,
          4,
        );
      }
      if (enhanced.sourceFeature?.type === 'fortune-gems-multiplier') {
        enhancedIndexes.add(enhanced.sourceFeature.multiplierIndex);
        expect(enhanced.sourceFeature.enhancedBet).toBe(true);
        expect(enhanced.sourceFeature.multiplier).toBeGreaterThanOrEqual(2);
      }
    }
    expect(normalIndexes.has(0)).toBe(true);
    expect(normalIndexes.size).toBeGreaterThan(3);
    expect(enhancedIndexes.has(0)).toBe(false);
    expect(enhancedIndexes.size).toBeGreaterThan(3);

    const maximum = hotlineSpinSourceFeatureRound(
      'fortune-gems-server',
      'fortune-gems-client',
      0,
      'h5-fortune-gems',
    );
    const maximumLines = allWildWin.lines.map((line) => ({ ...line, payout: line.payout * 15 }));
    expect(maximumLines.reduce((sum, line) => sum + line.payout, 0)).toBe(375);
    expect(maximum.sourceFeature?.type).toBe('fortune-gems-multiplier');
  });

  it('keeps Bounty Scatter out of the paying pool and restricts Wilds to reels 2-4', () => {
    for (const gameId of ['h5-captains-bounty', 'h5-queen-of-bounty']) {
      expect(getHotlineSymbolsForGame(gameId)).toHaveLength(7);
      let observedWild = false;
      for (let nonce = 0; nonce < 100; nonce += 1) {
        const round = hotlineSpinCascades(
          'source-symbol-server',
          'source-symbol-client',
          nonce,
          5,
          3,
          20,
          false,
          gameId,
        );
        round.initialGrid.forEach((column, reel) => {
          expect(
            column.every((symbol) => symbol >= 0 && symbol <= 8),
            gameId,
          ).toBe(true);
          if (column.includes(8)) {
            observedWild = true;
            expect(reel).toBeGreaterThanOrEqual(1);
            expect(reel).toBeLessThanOrEqual(3);
          }
        });
      }
      expect(observedWild, gameId).toBe(true);

      const scatterOnlyGrid = Array.from({ length: 5 }, () => [7, 7, 7]);
      expect(hotlineEvaluate(scatterOnlyGrid, gameId)).toEqual({ lines: [], totalMultiplier: 0 });
    }
  });

  it('preserves the original bounty paytable and Queen free-mode contract', () => {
    const fortuneOx = getH5OriginalGameSpec('h5-fortune-ox');
    const captain = getH5OriginalGameSpec('h5-captains-bounty');
    const queen = getH5OriginalGameSpec('h5-queen-of-bounty');

    expect(fortuneOx).toMatchObject({
      standardSymbolCount: 6,
      generatedSymbolCount: 7,
      specialSymbols: { wild: 7, blank: 8 },
      totalBetUnits: 10,
      settleWithSourcePaytable: true,
    });
    expect(fortuneOx?.paytable.map((entry) => entry.payout3)).toEqual([3, 5, 10, 20, 50, 100, 200]);
    expect(captain?.specialSymbols).toEqual({ scatter: 8, wild: 9 });
    expect(captain?.totalBetUnits).toBe(20);
    expect(captain?.settleWithSourcePaytable).toBe(true);
    expect(
      captain?.paytable.map(({ payout3, payout4, payout5 }) => [payout3, payout4, payout5]),
    ).toEqual([
      [3, 10, 50],
      [4, 15, 75],
      [5, 20, 100],
      [10, 25, 200],
      [15, 50, 500],
      [20, 100, 1_000],
      [50, 250, 2_500],
    ]);
    expect(captain?.freeModes).toEqual([{ type: 1, spins: 10, cascadeMultipliers: [3, 6, 9, 15] }]);
    expect(queen?.freeModes).toEqual([
      { type: 1, spins: 20, cascadeMultipliers: [1, 2, 3, 5] },
      { type: 2, spins: 10, cascadeMultipliers: [3, 6, 9, 20] },
      { type: 3, spins: 5, cascadeMultipliers: [6, 12, 18, 40] },
    ]);
  });

  it('uses each imported fixed-line count instead of the shared five-line fallback', () => {
    const lineCounts: Record<string, number> = {
      'h5-nine-line-pull-king': 9,
      'h5-water-margin': 9,
      'h5-diamond-strike': 15,
      'h5-yu-pu-tuan': 50,
      'h5-fruit-little-mary': 9,
      'h5-aztec-treasure': 5,
      'h5-fire-88': 7,
      'h5-lucky-777': 3,
      'h5-caishen-fa-fa-fa': 9,
      'h5-star-97': 8,
      'h5-fortune-ox': 10,
      'h5-captains-bounty': 20,
      'h5-queen-of-bounty': 20,
      'h5-fortune-gems': 5,
    };

    for (const [gameId, expectedCount] of Object.entries(lineCounts)) {
      const paylines = getHotlinePaylinesForGame(gameId);
      expect(paylines, gameId).toHaveLength(expectedCount);
      expect(
        paylines.every(
          (payline) =>
            payline.path.length === getHotlineReelCount(gameId) &&
            payline.path.every((row) => row >= 0 && row < getHotlineRowCount(gameId)),
        ),
        gameId,
      ).toBe(true);
    }
  });

  it('restores Caishen Fa Fa Fa paylines, dual Wild rules and full-screen awards', () => {
    const gameId = 'h5-caishen-fa-fa-fa';
    const spec = getH5OriginalGameSpec(gameId);
    expect(spec).toMatchObject({
      sourceMainModule: 'caishenfafafaBMain',
      standardSymbolCount: 11,
      generatedSymbolCount: 11,
      specialSymbols: { scatter: 9, blueWild: 10, redWild: 11 },
      totalBetUnits: 9,
      settleWithSourcePaytable: true,
      freeModes: [
        { type: 3, spins: 10, cascadeMultipliers: [1] },
        { type: 4, spins: 20, cascadeMultipliers: [1] },
        { type: 5, spins: 50, cascadeMultipliers: [1] },
      ],
    });
    expect(
      spec?.paytable.map(({ sourceSymbolId, payout3, payout4, payout5 }) => [
        sourceSymbolId,
        payout3,
        payout4,
        payout5,
      ]),
    ).toEqual([
      [1, 2, 5, 20],
      [2, 3, 10, 40],
      [3, 5, 15, 60],
      [4, 7, 20, 100],
      [5, 10, 30, 160],
      [6, 15, 40, 200],
      [7, 20, 80, 400],
      [8, 50, 200, 1_000],
      [10, 0, 0, 5_000],
      [11, 0, 0, 5_000],
    ]);
    expect(getHotlinePaylinesForGame(gameId).map((line) => line.path)).toEqual([
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [2, 2, 2, 2, 2],
      [0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2],
      [0, 0, 1, 2, 2],
      [2, 2, 1, 0, 0],
      [1, 0, 0, 0, 1],
      [1, 2, 2, 2, 1],
    ]);

    const wildAssisted = [0, 9, 0, 10, 0].map((symbol) => [8, symbol, 8]);
    const wildAssistedResult = hotlineEvaluate(wildAssisted, gameId);
    expect(wildAssistedResult.lines).toEqual([
      expect.objectContaining({ lineId: 'line-1', symbol: 0, count: 5 }),
    ]);
    expect(wildAssistedResult.totalMultiplier).toBeCloseTo(20 / 9, 4);
    const mixedWildOnly = [9, 10, 9, 10, 9].map((symbol) => [8, symbol, 8]);
    expect(hotlineEvaluate(mixedWildOnly, gameId)).toEqual({ lines: [], totalMultiplier: 0 });

    const fullScreenRedDeity = Array.from({ length: 5 }, () => Array(3).fill(7));
    expect(hotlineEvaluate(fullScreenRedDeity, gameId)).toMatchObject({
      lines: [
        expect.objectContaining({ lineId: 'full-screen', symbol: 7, count: 15, payout: 2_500 }),
      ],
      totalMultiplier: 2_500,
    });
    expect([2, 3, 4, 5, 7].map(getCaishenFaFaFaFreeSpinAward)).toEqual([0, 10, 20, 50, 50]);
  });

  it('evaluates every Caishen Fa Fa Fa free round from its visible expanded-Wild board', () => {
    const gameId = 'h5-caishen-fa-fa-fa';
    let triggered: ReturnType<typeof hotlineSpinCascades> | undefined;
    for (let nonce = 0; nonce < 12_000; nonce += 1) {
      const candidate = hotlineSpinCascades(
        'caishen-fa-server',
        'caishen-fa-client',
        nonce,
        5,
        3,
        1,
        true,
        gameId,
      );
      if ((candidate.features?.freeSpinsAwarded ?? 0) > 0) {
        triggered = candidate;
        break;
      }
    }
    expect(triggered).toBeDefined();
    const features = triggered!.features!;
    expect(features.freeSpinsAwarded).toBeGreaterThanOrEqual(10);
    expect(features.sourceFreeWinMultiplier).toBe(1);
    for (const round of features.freeSpinRounds) {
      const expandedColumns = round.initialGrid.filter((column) =>
        column.every((symbol) => symbol === 10),
      );
      expect(expandedColumns.length).toBeGreaterThanOrEqual(1);
      expect(expandedColumns.length).toBeLessThanOrEqual(3);
      expect(round.finalGrid).toEqual(round.initialGrid);
      expect(round.cascades).toEqual([]);
      expect(round.multiplierSymbols).toEqual([]);
      const evaluated = hotlineEvaluate(round.initialGrid, gameId);
      expect(round.lines).toEqual(evaluated.lines);
      expect(round.totalMultiplier).toBe(evaluated.totalMultiplier);
    }
  });

  it('restores Flying Together 243 ways, source paytable and middle-reel Wild', () => {
    const gameId = 'h5-flying-together';
    const spec = getH5OriginalGameSpec(gameId);
    expect(spec).toMatchObject({
      sourceMainModule: 'biyishuangfeiMain',
      standardSymbolCount: 13,
      generatedSymbolCount: 13,
      specialSymbols: { wild: 13 },
      totalBetUnits: 25,
      settleWithSourcePaytable: true,
    });
    expect(
      spec?.paytable.map(({ sourceSymbolId, payout3, payout4, payout5 }) => [
        sourceSymbolId,
        payout3,
        payout4,
        payout5,
      ]),
    ).toEqual([
      [1, 3, 15, 40],
      [2, 3, 15, 40],
      [3, 3, 15, 40],
      [4, 3, 15, 40],
      [5, 3, 15, 40],
      [6, 10, 75, 250],
      [7, 10, 75, 250],
      [8, 10, 75, 250],
      [9, 20, 100, 400],
      [10, 30, 150, 600],
      [11, 40, 200, 800],
      [12, 50, 400, 2_000],
    ]);
    expect(getHotlineSymbolsForGame(gameId)).toHaveLength(13);
    expect(isHotlineFeatureGame(gameId)).toBe(false);

    const wild = 12;
    const couple = 11;
    const grid = [
      [couple, couple, couple],
      [couple, wild, 1],
      [wild, couple, 2],
      [couple, 3, 4],
      [couple, couple, 5],
    ];
    const evaluated = hotlineEvaluate(grid, gameId);
    expect(evaluated.lines).toEqual([
      expect.objectContaining({
        lineId: 'ways-11',
        symbol: couple,
        count: 5,
        ways: 24,
        payout: 1_920,
      }),
    ]);
    expect(evaluated.totalMultiplier).toBe(1_920);

    const illegalOuterWild = [
      [wild, wild, wild],
      [couple, couple, couple],
      [couple, couple, couple],
      [couple, couple, couple],
      [couple, couple, couple],
    ];
    expect(hotlineEvaluate(illegalOuterWild, gameId)).toEqual({ lines: [], totalMultiplier: 0 });

    for (let nonce = 0; nonce < 200; nonce += 1) {
      const natural = hotlineSpin('flying-server', 'flying-client', nonce, 5, 3, gameId);
      expect(natural[0]).not.toContain(wild);
      expect(natural[4]).not.toContain(wild);
    }
  });

  it('restores Star 97 vertical lines, mixed BAR, red-seven multiplier and full-board awards', () => {
    const gameId = 'h5-star-97';
    expect(getH5OriginalGameSpec(gameId)).toMatchObject({
      sourceMainModule: 'mingxing972023Main',
      standardSymbolCount: 9,
      generatedSymbolCount: 9,
      specialSymbols: {
        cherry: 1,
        bell: 4,
        goldBar: 6,
        redBar: 7,
        blueBar: 8,
        seven: 9,
      },
      totalBetUnits: 8,
      settleWithSourcePaytable: true,
    });
    expect(getHotlineSymbolsForGame(gameId)).toHaveLength(9);
    expect(getHotlineSymbolsForGame(gameId).map((symbol) => symbol.payout3)).toEqual([
      10 / 8,
      10 / 8,
      14 / 8,
      18 / 8,
      20 / 8,
      30 / 8,
      50 / 8,
      70 / 8,
      80 / 8,
    ]);

    const verticalBell = [
      [3, 3, 3],
      [1, 2, 4],
      [4, 1, 2],
    ];
    expect(hotlineEvaluate(verticalBell, gameId)).toEqual({
      lines: [
        expect.objectContaining({
          lineId: 'line-4',
          lineIndex: 3,
          symbol: 3,
          count: 3,
          payout: 2.25,
          positions: [
            { reel: 0, row: 0 },
            { reel: 0, row: 1 },
            { reel: 0, row: 2 },
          ],
        }),
      ],
      totalMultiplier: 2.25,
    });

    const mixedBar = [
      [5, 1, 2],
      [6, 2, 3],
      [7, 3, 4],
    ];
    expect(hotlineEvaluate(mixedBar, gameId)).toEqual({
      lines: [expect.objectContaining({ lineIndex: 0, count: 3, payout: 1.25 })],
      totalMultiplier: 1.25,
    });

    const threeSevens = [
      [8, 1, 2],
      [8, 2, 3],
      [8, 3, 4],
    ];
    expect(getStar97SevenMultiplier(threeSevens)).toBe(5);
    expect(hotlineEvaluate(threeSevens, gameId)).toEqual({
      lines: [expect.objectContaining({ lineIndex: 0, symbol: 8, payout: 50 })],
      totalMultiplier: 50,
    });

    expect(
      hotlineEvaluate(
        Array.from({ length: 3 }, () => [7, 7, 7]),
        gameId,
      ),
    ).toEqual({
      lines: [expect.objectContaining({ lineId: 'full-screen', count: 9, payout: 80 })],
      totalMultiplier: 80,
    });
    expect(
      hotlineEvaluate(
        [
          [0, 1, 2],
          [4, 0, 1],
          [2, 4, 0],
        ],
        gameId,
      ),
    ).toEqual({
      lines: [expect.objectContaining({ lineId: 'full-screen', count: 9, payout: 15 })],
      totalMultiplier: 15,
    });

    const natural = hotlineSpinSourceFeatureRound(
      'star-97-server',
      'star-97-client',
      97,
      gameId,
      3,
      3,
    );
    expect(natural.initialGrid.flat().every((symbol) => symbol >= 0 && symbol <= 8)).toBe(true);
    expect(natural.lines).toEqual(hotlineEvaluate(natural.initialGrid, gameId).lines);
    expect(natural.sourceFeature).toEqual({
      type: 'star-97-seven-multiplier',
      sevenCount: natural.initialGrid.flat().filter((symbol) => symbol === 8).length,
      multiplier: getStar97SevenMultiplier(natural.initialGrid),
    });
  });

  it('uses the official Bounty 20-line order, left-to-right wins, and Wild substitution', () => {
    expect(getHotlinePaylinesForGame('h5-captains-bounty').map((line) => line.path)).toEqual([
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [2, 2, 2, 2, 2],
      [0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2],
      [0, 0, 1, 0, 0],
      [2, 2, 1, 2, 2],
      [1, 2, 2, 2, 1],
      [1, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
      [2, 1, 1, 1, 2],
      [1, 1, 0, 1, 1],
      [1, 1, 2, 1, 1],
      [1, 0, 1, 0, 1],
      [1, 2, 1, 2, 1],
      [0, 1, 0, 1, 0],
      [2, 1, 2, 1, 2],
      [0, 0, 1, 2, 2],
      [2, 2, 1, 0, 0],
      [0, 2, 0, 2, 0],
    ]);

    const reverseOnly = [
      [0, 0, 0],
      [1, 1, 1],
      [6, 6, 6],
      [6, 6, 6],
      [6, 6, 6],
    ];
    expect(hotlineEvaluate(reverseOnly, 'h5-captains-bounty')).toEqual({
      lines: [],
      totalMultiplier: 0,
    });

    const wildLine = [
      [0, 6, 1],
      [1, 8, 2],
      [2, 8, 3],
      [3, 8, 4],
      [4, 6, 5],
    ];
    const evaluated = hotlineEvaluate(wildLine, 'h5-captains-bounty');
    expect(evaluated.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineIndex: 0,
          symbol: 6,
          count: 5,
          payout: 125,
          direction: 'ltr',
        }),
      ]),
    );
    expect(evaluated.lines.every((line) => line.direction === 'ltr')).toBe(true);
  });

  it('scales Bounty cascades with each game mode instead of a generic 1x tumble', () => {
    for (const [gameId, freeAward, freeLadder] of [
      ['h5-captains-bounty', 10, [3, 6, 9, 15]],
      ['h5-queen-of-bounty', 20, [1, 2, 3, 5]],
    ] as const) {
      let triggered: ReturnType<typeof hotlineSpinCascades> | undefined;
      for (let nonce = 0; nonce < 4_000; nonce += 1) {
        const candidate = hotlineSpinCascades(
          'bounty-feature-server',
          `bounty-feature-client-${gameId}`,
          nonce,
          5,
          3,
          20,
          true,
          gameId,
        );
        for (const step of candidate.cascades) {
          const raw = hotlineEvaluate(step.grid, gameId);
          expect(step.multiplier).toBeCloseTo(
            raw.totalMultiplier * [1, 2, 3, 5][Math.min(step.index, 3)]!,
            4,
          );
        }
        if ((candidate.features?.freeSpinsAwarded ?? 0) > 0) {
          triggered = candidate;
          break;
        }
      }
      expect(triggered, gameId).toBeDefined();
      const features = triggered!.features!;
      expect(features.sourceFreeModeType).toBe(1);
      expect(features.freeSpinsAwarded).toBeGreaterThanOrEqual(freeAward);
      expect(features.baseMultiplierSymbols).toEqual([]);
      expect(features.freeSpinMultiplierBank).toBe(0);
      for (const round of features.freeSpinRounds) {
        expect(round.multiplierSymbols).toEqual([]);
        for (const step of round.cascades) {
          const raw = hotlineEvaluate(step.grid, gameId);
          expect(step.multiplier).toBeCloseTo(
            raw.totalMultiplier * freeLadder[Math.min(step.index, 3)]!,
            4,
          );
        }
      }
    }
  });

  it('generates each Queen of Bounty selection with its exact spin count and ladder', () => {
    for (const [modeType, spinCount, ladder] of [
      [1, 20, [1, 2, 3, 5]],
      [2, 10, [3, 6, 9, 20]],
      [3, 5, [6, 12, 18, 40]],
    ] as const) {
      const features = hotlineSelectBountyFreeMode(
        'queen-select-server',
        'queen-select-client',
        31,
        'h5-queen-of-bounty',
        modeType,
      );
      expect(features.sourceFreeModeType).toBe(modeType);
      expect(features.freeSpinsAwarded).toBeGreaterThanOrEqual(spinCount);
      expect(features.freeSpinsPlayed).toBe(features.freeSpinRounds.length);
      expect(features.freeSpinRounds.length).toBeGreaterThanOrEqual(spinCount);
      expect(features.baseTotalMultiplier).toBe(0);
      expect(features.freeSpinMultiplierBank).toBe(0);
      for (const round of features.freeSpinRounds) {
        expect(round.multiplierSymbols).toEqual([]);
        for (const step of round.cascades) {
          const raw = hotlineEvaluate(step.grid, 'h5-queen-of-bounty');
          expect(step.multiplier).toBeCloseTo(
            raw.totalMultiplier * ladder[Math.min(step.index, ladder.length - 1)]!,
            4,
          );
        }
      }
    }
  });

  it('restores the Caishen Wins source paytable, Wild and Scatter symbol contract', () => {
    const spec = getH5OriginalGameSpec('h5-caishen-wins');
    expect(spec).toMatchObject({
      sourceMainModule: 'caishenwinsMain',
      sourceDetailModule: 'caishenwinsDetail',
      standardSymbolCount: 7,
      specialSymbols: { successCaishen: 10, wild: 11, scatter: 12, blank: 13 },
      totalBetUnits: 20,
      settleWithSourcePaytable: true,
      freeModes: [{ type: 1, spins: 8, cascadeMultipliers: [8, 8, 8, 8] }],
    });
    expect(
      spec?.paytable.map(({ payout3, payout4, payout5 }) => [payout3, payout4, payout5]),
    ).toEqual([
      [5, 8, 40],
      [5, 8, 50],
      [6, 10, 60],
      [8, 20, 80],
      [10, 30, 100],
      [30, 60, 300],
      [100, 300, 1_000],
    ]);
    expect(
      getHotlineSymbolsForGame('h5-caishen-wins').map(({ payout3, payout4, payout5 }) => [
        payout3,
        payout4,
        payout5,
      ]),
    ).toEqual([
      [0.25, 0.4, 2],
      [0.25, 0.4, 2.5],
      [0.3, 0.5, 3],
      [0.4, 1, 4],
      [0.5, 1.5, 5],
      [1.5, 3, 15],
      [5, 15, 50],
    ]);

    const wildAssisted = [
      [6, 0, 1, 2, 3],
      [10, 1, 2, 3, 4],
      [10, 2, 3, 4, 5],
      [10, 3, 4, 5, 0],
      [10, 4, 5, 0, 1],
      [6, 5, 0, 1, 2],
    ];
    expect(hotlineEvaluate(wildAssisted, 'h5-caishen-wins').lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 6, count: 6, ways: 1, payout: 50 }),
      ]),
    );
    const scatterOnly = Array.from({ length: 6 }, () => Array(5).fill(11));
    expect(hotlineEvaluate(scatterOnly, 'h5-caishen-wins')).toEqual({
      lines: [],
      totalMultiplier: 0,
    });

    let observedWild = false;
    for (let nonce = 0; nonce < 160; nonce += 1) {
      const round = hotlineSpinCascades(
        'caishen-symbol-server',
        'caishen-symbol-client',
        nonce,
        6,
        5,
        20,
        false,
        'h5-caishen-wins',
      );
      round.initialGrid.forEach((column, reel) => {
        if (!column.includes(10)) return;
        observedWild = true;
        expect(reel).toBeGreaterThanOrEqual(1);
        expect(reel).toBeLessThanOrEqual(4);
      });
    }
    expect(observedWild).toBe(true);
  });

  it('uses four Caishen Scatter for 8 free spins and applies x8 without multiplier balls', () => {
    const bought = hotlineBuyFreeSpins(
      'caishen-buy-server',
      'caishen-buy-client',
      19,
      6,
      5,
      20,
      'h5-caishen-wins',
    );
    expect(bought.features).toMatchObject({
      scatterCount: 4,
      sourceFreeWinMultiplier: 8,
      baseTotalMultiplier: 0,
      freeSpinMultiplierBank: 0,
    });
    expect(bought.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(8);
    expect(bought.features!.freeSpinRounds).toHaveLength(bought.features!.freeSpinsPlayed);
    for (const round of bought.features!.freeSpinRounds) {
      expect(round.multiplierSymbols).toEqual([]);
      expect(round.multiplierTotal).toBe(0);
      for (const step of round.cascades) {
        const raw = hotlineEvaluate(step.grid, 'h5-caishen-wins');
        expect(step.multiplier).toBeCloseTo(raw.totalMultiplier * 8, 4);
        expect(step.lines).toEqual(
          raw.lines.map((line) => ({ ...line, payout: roundTestMultiplier(line.payout * 8) })),
        );
      }
    }

    let natural: ReturnType<typeof hotlineSpinCascades> | undefined;
    for (let nonce = 0; nonce < 4_000; nonce += 1) {
      const candidate = hotlineSpinCascades(
        'caishen-feature-server',
        'caishen-feature-client',
        nonce,
        6,
        5,
        20,
        true,
        'h5-caishen-wins',
      );
      if ((candidate.features?.scatterCount ?? 0) >= 4) {
        natural = candidate;
        break;
      }
    }
    expect(natural).toBeDefined();
    expect(natural!.features).toMatchObject({
      scatterCount: 4,
      sourceFreeWinMultiplier: 8,
      freeSpinsAwarded: expect.any(Number),
      freeSpinMultiplierBank: 0,
    });
    expect(natural!.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(8);
  });

  it('keeps Caishen gamble-selected spin counts and multipliers in the authoritative math', () => {
    for (const [spinCount, multiplier] of [
      [8, 8],
      [10, 8],
      [10, 10],
      [20, 20],
    ] as const) {
      const features = hotlineSelectCaishenFreeGame(
        'caishen-gamble-server',
        'caishen-gamble-client',
        71,
        spinCount,
        multiplier,
      );
      expect(features.freeSpinsAwarded).toBeGreaterThanOrEqual(spinCount);
      expect(features.freeSpinsPlayed).toBe(features.freeSpinRounds.length);
      expect(features.sourceFreeWinMultiplier).toBe(multiplier);
      expect(features.freeSpinMultiplierBank).toBe(0);
      for (const round of features.freeSpinRounds) {
        expect(round.multiplierSymbols).toEqual([]);
        for (const step of round.cascades) {
          const raw = hotlineEvaluate(step.grid, 'h5-caishen-wins');
          expect(step.multiplier).toBeCloseTo(raw.totalMultiplier * multiplier, 4);
          expect(step.lines).toEqual(
            raw.lines.map((line) => ({
              ...line,
              payout: roundTestMultiplier(line.payout * multiplier),
            })),
          );
        }
      }
    }
  });

  it('restores Golden Empire large symbols, four-Scatter free games and cumulative multipliers', () => {
    expect(getH5OriginalGameSpec('h5-golden-empire')).toMatchObject({
      sourceMainModule: 'goldenempireMain',
      standardSymbolCount: 10,
      specialSymbols: { scatter: 11, wild: 12 },
      totalBetUnits: 1,
      maximumWinMultiplier: 2_000,
      settleWithSourcePaytable: true,
      freeModes: [{ type: 1, spins: 8, cascadeMultipliers: [1] }],
    });
    expect(getHotlineMaximumTotalMultiplier('h5-golden-empire')).toBe(2_000);
    const goldenSymbols = getHotlineSymbolsForGame('h5-golden-empire');
    expect(goldenSymbols).toHaveLength(10);
    expect(
      goldenSymbols.map(({ payout3, payout4, payout5, payout6 }) => [
        payout3,
        payout4,
        payout5,
        payout6,
      ]),
    ).toEqual([
      [0.05, 0.1, 0.15, 0.2],
      [0.05, 0.1, 0.15, 0.2],
      [0.1, 0.2, 0.3, 0.4],
      [0.1, 0.2, 0.3, 0.4],
      [0.15, 0.3, 0.45, 0.6],
      [0.2, 0.4, 0.6, 0.8],
      [0.25, 0.5, 0.75, 1],
      [0.3, 0.6, 0.9, 1.2],
      [0.4, 0.8, 1.2, 1.6],
      [0.5, 1, 1.5, 2],
    ]);

    const sixReelPremiumWay = hotlineEvaluate(
      Array.from({ length: 6 }, () => [9, 0, 1, 2, 3]),
      'h5-golden-empire',
    );
    expect(sixReelPremiumWay.lines).toContainEqual(
      expect.objectContaining({ symbol: 9, count: 6, ways: 1, payout: 2 }),
    );

    const bought = hotlineBuyFreeSpins(
      'golden-empire-server',
      'golden-empire-client',
      37,
      6,
      5,
      20,
      'h5-golden-empire',
    );
    expect(bought.features).toMatchObject({
      scatterCount: 4,
      baseMultiplierSymbols: [],
      baseTotalMultiplier: 0,
    });
    expect(bought.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(8);
    expect(bought.finalSourceStacks?.some((stack) => stack.positions.length > 1)).toBe(true);

    let expectedFreeMultiplier = 1;
    for (const round of bought.features!.freeSpinRounds) {
      expect(round.multiplierSymbols).toEqual([]);
      expect(round.multiplierTotal).toBe(0);
      for (const step of round.cascades) {
        const raw = hotlineEvaluate(step.grid, 'h5-golden-empire', step.sourceStacks);
        expect(step.multiplier).toBeCloseTo(raw.totalMultiplier * expectedFreeMultiplier, 4);
        expect(step.lines).toEqual(
          raw.lines.map((line) => ({
            ...line,
            payout: roundTestMultiplier(line.payout * expectedFreeMultiplier),
          })),
        );
        expectedFreeMultiplier += 1;
      }
    }
    expect(bought.features!.freeSpinMultiplierBank).toBe(expectedFreeMultiplier);
  });

  it('keeps a winning Golden Empire gold stack as a finite Wild instead of deleting it', () => {
    let observedTransformation = false;
    for (let nonce = 0; nonce < 600 && !observedTransformation; nonce += 1) {
      const round = hotlineSpinCascades(
        'golden-stack-server',
        'golden-stack-client',
        nonce,
        6,
        5,
        20,
        false,
        'h5-golden-empire',
      );
      const states = [
        ...round.cascades.map((step) => step.sourceStacks ?? []),
        round.finalSourceStacks ?? [],
      ];
      for (let index = 0; index < states.length - 1; index += 1) {
        for (const gold of states[index]!.filter((stack) => stack.state === 'gold')) {
          const next = states[index + 1]!.find((stack) => stack.id === gold.id);
          if (next?.state !== 'wild') continue;
          expect(next.symbol).toBe(11);
          expect(next.remaining).toBe(gold.positions.length);
          observedTransformation = true;
          break;
        }
      }
    }
    expect(observedTransformation).toBe(true);
  });

  it('uses the packaged Gates 6x5, three-Scatter, ten-spin tumble ladder', () => {
    expect(getH5OriginalGameSpec('h5-gates-of-olympus')).toMatchObject({
      sourceMainModule: 'gatesofolympushbMain',
      standardSymbolCount: 9,
      specialSymbols: { scatter: 10 },
      totalBetUnits: 1,
      scatterTrigger: 3,
      buyFeatureCostMultiplier: 75,
      cascadeMultiplierStep: 1,
      persistentFreeCascadeMultiplier: true,
      freeModes: [{ type: 1, spins: 10, cascadeMultipliers: [1] }],
    });
    expect(getHotlineEvaluationMode('h5-gates-of-olympus')).toBe('cluster');

    const bought = hotlineBuyFreeSpins(
      'gates-server',
      'gates-client',
      91,
      6,
      5,
      20,
      'h5-gates-of-olympus',
    );
    expect(bought.features).toMatchObject({
      scatterCount: 3,
      baseTotalMultiplier: 0,
    });
    expect(bought.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(10);
    expect(bought.features!.freeSpinsPlayed).toBe(bought.features!.freeSpinsAwarded);

    let expectedMultiplier = 1;
    for (const round of bought.features!.freeSpinRounds) {
      expect(round.multiplierSymbols).toEqual([]);
      expect(round.multiplierTotal).toBe(0);
      expect(round.appliedMultiplier).toBe(1);
      for (const cascade of round.cascades) {
        expect(cascade.sourceAppliedMultiplier).toBe(expectedMultiplier);
        if (cascade.multiplier > 0) expectedMultiplier += 1;
      }
      expect(round.sourceMultiplierBank).toBe(expectedMultiplier);
    }
    expect(bought.features!.freeSpinMultiplierBank).toBe(expectedMultiplier);

    const naturalMultiTumble = Array.from({ length: 2_000 }, (_, nonce) =>
      hotlineSpinCascades(
        'gates-natural-server',
        'gates-natural-client',
        nonce,
        6,
        5,
        20,
        false,
        'h5-gates-of-olympus',
      ),
    ).find((round) => round.cascades.length >= 2);
    expect(naturalMultiTumble).toBeDefined();
    naturalMultiTumble!.cascades.forEach((cascade, index) => {
      expect(cascade.sourceAppliedMultiplier).toBe(index + 1);
    });
  });

  it('can attach free-game results to fixed-line imported layouts without changing dimensions', () => {
    const result = hotlineSpinCascades('h5-server', 'h5-client', 9, 3, 3, 1, true);

    expect(result.initialGrid).toHaveLength(3);
    expect(result.initialGrid.every((column) => column.length === 3)).toBe(true);
    expect(result.features).toBeDefined();
    expect(result.features!.freeSpinRounds.every((round) => round.initialGrid.length === 3)).toBe(
      true,
    );
  });

  it('uses the 8-symbol soft-hit mega paytable', () => {
    expect(
      HOTLINE_MEGA_SYMBOLS.map((symbol) => [symbol.payout3, symbol.payout4, symbol.payout5]),
    ).toEqual([
      [0.345, 0.688, 1.376],
      [0.516, 1.033, 1.721],
      [0.688, 1.376, 2.237],
      [0.861, 1.721, 2.754],
      [1.205, 2.409, 4.13],
      [1.548, 3.097, 4.818],
      [1.893, 3.785, 5.506],
      [2.237, 4.473, 6.194],
    ]);
  });

  it('supports deterministic 6x5 cascade drops after cluster wins', () => {
    const nonce = Array.from({ length: 200 }, (_, i) => i).find(
      (i) =>
        hotlineSpinCascades('server', 'client', i, HOTLINE_MEGA_REELS, HOTLINE_MEGA_ROWS).cascades
          .length > 0,
    );
    expect(nonce).toBeDefined();
    const result = hotlineSpinCascades(
      'server',
      'client',
      nonce!,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );
    const firstGrid = hotlineSpin(
      'server',
      'client',
      nonce!,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );

    expect(result.initialGrid).toEqual(firstGrid);
    expect(result.cascades.length).toBeGreaterThan(0);
    expect(result.cascades[0]!.removed.length).toBeGreaterThan(0);
    expect(result.cascades[0]!.lines[0]!.positions?.length).toBeGreaterThanOrEqual(8);
    expect(result.finalGrid.length).toBe(HOTLINE_MEGA_REELS);
    for (const col of result.finalGrid) {
      expect(col.length).toBe(HOTLINE_MEGA_ROWS);
    }
    const stepTotal = result.cascades.reduce((sum, step) => sum + step.multiplier, 0);
    expect(result.features).toBeDefined();
    expect(result.features!.baseWinMultiplier).toBeGreaterThanOrEqual(Number(stepTotal.toFixed(4)));
    expect(result.totalMultiplier).toBe(result.features!.totalMultiplier);
  });

  it('adds deterministic mega multiplier symbols to winning cascades', () => {
    const result = Array.from({ length: 1200 }, (_, nonce) =>
      hotlineSpinCascades('server', 'client', nonce, HOTLINE_MEGA_REELS, HOTLINE_MEGA_ROWS),
    ).find((item) => (item.features?.baseMultiplierSymbols.length ?? 0) > 0);

    expect(result).toBeDefined();
    expect(result!.features!.baseMultiplierTotal).toBeGreaterThanOrEqual(2);
    expect(result!.features!.baseAppliedMultiplier).toBe(result!.features!.baseMultiplierTotal);
    expect(result!.totalMultiplier).toBeGreaterThanOrEqual(result!.features!.baseWinMultiplier);

    const symbolWinMultiplier = Number(
      result!.cascades.reduce((sum, step) => sum + step.multiplier, 0).toFixed(4),
    );
    const scatterMultiplier = megaScatterPayout(result!.features!.scatterCount);
    expect(symbolWinMultiplier).toBeGreaterThan(0);
    expect(result!.features!.baseTotalMultiplier).toBe(
      Number(
        (scatterMultiplier + symbolWinMultiplier * result!.features!.baseAppliedMultiplier).toFixed(
          4,
        ),
      ),
    );

    const scatterPositions = new Set(result!.features!.scatterSymbols.map(positionKey));
    for (const multiplier of result!.features!.baseMultiplierSymbols) {
      expect(scatterPositions.has(positionKey(multiplier))).toBe(false);
    }
  });

  it('does not create mega multiplier symbols without normal symbol clears', () => {
    const results = Array.from({ length: 900 }, (_, nonce) =>
      hotlineSpinCascades(
        'scatter-server',
        'scatter-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      ),
    );

    for (const result of results) {
      const features = result.features;
      if (!features) continue;
      if (features.baseMultiplierSymbols.length > 0) {
        expect(result.cascades.length).toBeGreaterThan(0);
        expect(result.cascades.reduce((sum, step) => sum + step.multiplier, 0)).toBeGreaterThan(0);
      }
      const scatterPositions = new Set(features.scatterSymbols.map(positionKey));
      for (const multiplier of features.baseMultiplierSymbols) {
        expect(scatterPositions.has(positionKey(multiplier))).toBe(false);
      }

      for (const round of features.freeSpinRounds) {
        if (round.multiplierSymbols.length > 0) {
          expect(round.cascades.length).toBeGreaterThan(0);
          expect(round.cascades.reduce((sum, step) => sum + step.multiplier, 0)).toBeGreaterThan(0);
        }
        const roundScatterPositions = new Set(round.scatterSymbols.map(positionKey));
        for (const multiplier of round.multiplierSymbols) {
          expect(roundScatterPositions.has(positionKey(multiplier))).toBe(false);
        }
      }
    }
  });

  it('triggers and accounts for mega free spins from scatter symbols', () => {
    const result = Array.from({ length: 1500 }, (_, nonce) =>
      hotlineSpinCascades(
        'bonus-server',
        'bonus-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      ),
    ).find((item) => (item.features?.freeSpinsAwarded ?? 0) > 0);

    expect(result).toBeDefined();
    expect(result!.features!.scatterCount).toBeGreaterThanOrEqual(4);
    expect(result!.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(15);
    expect(result!.features!.freeSpinsAwarded).toBeLessThanOrEqual(100);
    expect(result!.features!.freeSpinsPlayed).toBeGreaterThan(0);
    expect(result!.features!.freeSpinsPlayed).toBeLessThanOrEqual(
      result!.features!.freeSpinsAwarded,
    );
    expect(result!.features!.freeSpinRounds.length).toBe(result!.features!.freeSpinsPlayed);
  });

  it('buys deterministic mega free spins with a 15-spin trigger', () => {
    const result = hotlineBuyFreeSpins(
      'buy-server',
      'buy-client',
      7,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );
    const repeat = hotlineBuyFreeSpins(
      'buy-server',
      'buy-client',
      7,
      HOTLINE_MEGA_REELS,
      HOTLINE_MEGA_ROWS,
    );

    expect(result).toEqual(repeat);
    expect(result.cascades).toEqual([]);
    expect(result.lines).toEqual([]);
    expect(result.features).toBeDefined();
    expect(result.features!.scatterCount).toBe(4);
    expect(result.features!.scatterSymbols.length).toBe(4);
    expect(result.features!.freeSpinsAwarded).toBeGreaterThanOrEqual(15);
    expect(result.features!.freeSpinsAwarded).toBeLessThanOrEqual(100);
    expect(result.features!.freeSpinsPlayed).toBe(result.features!.freeSpinRounds.length);
    expect(result.totalMultiplier).toBe(result.features!.totalMultiplier);
    expect(result.totalMultiplier).toBeLessThanOrEqual(
      HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER,
    );
  });

  it('produces varied mega buy-feature payouts across 30 rounds', () => {
    const baseAmount = 20;
    const stakeAmount = baseAmount * 100;
    const payouts = Array.from({ length: 30 }, (_, nonce) => {
      const result = hotlineBuyFreeSpins(
        'variation-server',
        'variation-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      );
      return Number((baseAmount * result.totalMultiplier).toFixed(2));
    });

    expect(new Set(payouts).size).toBeGreaterThanOrEqual(28);
    expect(Math.max(...payouts)).toBeLessThanOrEqual(stakeAmount * 2);
  });

  it('keeps mega buy-feature free-spin line payouts on the paytable', () => {
    for (let nonce = 0; nonce < 40; nonce += 1) {
      const result = hotlineBuyFreeSpins(
        'paytable-server',
        'paytable-client',
        nonce,
        HOTLINE_MEGA_REELS,
        HOTLINE_MEGA_ROWS,
      );

      expect(result.totalMultiplier).toBeLessThanOrEqual(
        HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER,
      );
      expectMegaFeatureUsesPaytable(result.features!);
    }
  });
});

describe('hotlineEvaluate', () => {
  it('restores Diamond Strike source symbols, left-to-right substitution and fixed jackpot tiers', () => {
    const spec = getH5OriginalGameSpec('h5-diamond-strike');
    expect(spec).toMatchObject({
      sourceMainModule: 'DiamondMain',
      standardSymbolCount: 9,
      specialSymbols: { seven: 6, scatter: 7, wild: 8, goldenSeven: 9 },
      totalBetUnits: 15,
      settleWithSourcePaytable: true,
      freeModes: [{ type: 1, spins: 8, cascadeMultipliers: [1] }],
    });
    expect(getHotlineSymbolsForGame('h5-diamond-strike')).toHaveLength(9);
    expect(
      spec?.paytable.map(({ sourceSymbolId, payout3, payout4, payout5 }) => [
        sourceSymbolId,
        payout3,
        payout4,
        payout5,
      ]),
    ).toEqual([
      [1, 0.5, 1, 4],
      [2, 0.5, 1, 4],
      [3, 0.5, 1, 4],
      [4, 0.5, 1, 4],
      [5, 1, 2, 10],
      [6, 1, 2, 20],
      [8, 2, 6, 30],
      [9, 1, 2, 20],
    ]);

    const substitutedSeven = [
      [5, 0, 1],
      [8, 1, 2],
      [7, 2, 3],
      [4, 3, 0],
      [3, 4, 1],
    ];
    expect(hotlineEvaluate(substitutedSeven, 'h5-diamond-strike').lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineIndex: 1,
          symbol: 5,
          count: 3,
          direction: 'ltr',
          payout: 0.0667,
        }),
      ]),
    );

    const rightOnly = [
      [0, 1, 2],
      [1, 2, 3],
      [2, 3, 5],
      [3, 4, 8],
      [4, 0, 7],
    ];
    expect(
      hotlineEvaluate(rightOnly, 'h5-diamond-strike').lines.some(
        (line) => line.symbol === 5 && line.direction === 'rtl',
      ),
    ).toBe(false);
    expect(getDiamondStrikeJackpotTier(0)).toBe(1000);
    expect(getDiamondStrikeJackpotTier(0.001)).toBe(100);
    expect(getDiamondStrikeJackpotTier(0.021)).toBe(30);
    expect(getDiamondStrikeJackpotTier(0.171)).toBe(10);
  });

  it('drives Diamond Strike Scatter/free reels and getOpenBox jackpot from the same result', () => {
    const freeResult = hotlineSpinCascades(
      'diamond-source-seed',
      'diamond-client',
      860,
      5,
      3,
      1,
      true,
      'h5-diamond-strike',
    );
    expect(freeResult.features).toMatchObject({
      scatterCount: 3,
      freeSpinsAwarded: 8,
      freeSpinsPlayed: 8,
      baseMultiplierSymbols: [],
      baseAppliedMultiplier: 1,
    });
    expect(freeResult.features!.scatterSymbols.map((symbol) => symbol.reel).sort()).toEqual([
      0, 2, 4,
    ]);
    expect(
      freeResult.features!.freeSpinRounds.every((round) => !round.initialGrid.flat().includes(5)),
    ).toBe(true);
    expect(
      freeResult.features!.freeSpinRounds.every((round) =>
        round.initialGrid.every((column, reel) =>
          reel === 0 || reel === 2 || reel === 4 ? true : !column.includes(6),
        ),
      ),
    ).toBe(true);

    const jackpotResult = hotlineSpinCascades(
      'diamond-source-seed',
      'diamond-client',
      4_263,
      5,
      3,
      1,
      true,
      'h5-diamond-strike',
    );
    expect(jackpotResult.initialGrid.flat().filter((symbol) => symbol === 8)).toHaveLength(3);
    expect(jackpotResult.features?.sourceJackpot).toEqual({
      type: 'diamond-strike-jackpot',
      tierMultiplier: 10,
      picks: [10, 10, 10],
      payoutMultiplier: 10,
    });
    expect(jackpotResult.totalMultiplier).toBe(10);
  });

  it('restores Water Margin source symbols, paytable, paylines and both-edge wins', () => {
    const spec = getH5OriginalGameSpec('h5-water-margin');
    expect(spec).toMatchObject({
      sourceMainModule: 'SHZMain',
      standardSymbolCount: 9,
      specialSymbols: { bonusDragon: 9 },
      totalBetUnits: 9,
      settleWithSourcePaytable: true,
    });
    expect(
      spec?.paytable.map(({ payout3, payout4, payout5 }) => [payout3, payout4, payout5]),
    ).toEqual([
      [2, 5, 20],
      [3, 10, 40],
      [5, 15, 60],
      [7, 20, 100],
      [10, 30, 160],
      [15, 40, 200],
      [20, 80, 400],
      [50, 200, 1_000],
      [0, 0, 2_000],
    ]);
    expect(getHotlineSymbolsForGame('h5-water-margin')).toHaveLength(9);
    expect(getHotlinePaylinesForGame('h5-water-margin').map((line) => line.path)).toEqual([
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [2, 2, 2, 2, 2],
      [0, 0, 2, 0, 0],
      [2, 2, 0, 2, 2],
      [0, 0, 1, 0, 0],
      [2, 2, 1, 2, 2],
      [1, 2, 2, 2, 1],
      [2, 0, 0, 0, 2],
    ]);

    const rightOnly = [
      [1, 2, 3],
      [2, 3, 4],
      [3, 4, 7],
      [4, 5, 7],
      [5, 6, 7],
    ];
    const rightWin = hotlineEvaluate(rightOnly, 'h5-water-margin').lines.find(
      (line) => line.symbol === 7 && line.direction === 'rtl',
    );
    expect(rightWin).toMatchObject({ lineIndex: 2, count: 3, payout: 5.5556 });

    const dragonTrigger = [
      [0, 8, 1],
      [1, 8, 2],
      [2, 8, 3],
      [3, 4, 5],
      [4, 5, 6],
    ];
    expect(hotlineEvaluate(dragonTrigger, 'h5-water-margin').lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lineIndex: 0,
          symbol: 8,
          count: 3,
          direction: 'ltr',
          payout: 0,
        }),
      ]),
    );
    expect(getWaterMarginBonusGameAward(3)).toBe(1);
    expect(getWaterMarginBonusGameAward(4)).toBe(2);
    expect(getWaterMarginBonusGameAward(5)).toBe(3);
    expect(getWaterMarginBonusGameAward(15)).toBe(27);
  });

  it('uses Water Margin total-bet full-screen awards instead of stacking line prizes', () => {
    expect(
      hotlineEvaluate(
        Array.from({ length: 5 }, () => [0, 0, 0]),
        'h5-water-margin',
      ).totalMultiplier,
    ).toBe(50);
    expect(
      hotlineEvaluate(
        [
          [0, 1, 2],
          [1, 2, 0],
          [2, 0, 1],
          [0, 2, 1],
          [2, 1, 0],
        ],
        'h5-water-margin',
      ).totalMultiplier,
    ).toBe(15);
    expect(
      hotlineEvaluate(
        [
          [3, 4, 5],
          [4, 5, 3],
          [5, 3, 4],
          [3, 5, 4],
          [5, 4, 3],
        ],
        'h5-water-margin',
      ).totalMultiplier,
    ).toBe(50);
    const allDragon = hotlineEvaluate(
      Array.from({ length: 5 }, () => [8, 8, 8]),
      'h5-water-margin',
    );
    expect(allDragon.totalMultiplier).toBe(5_000);
    expect(allDragon.lines).toEqual([
      expect.objectContaining({ lineId: 'full-screen', symbol: 8, count: 15, payout: 5_000 }),
    ]);
  });

  it('settles Water Margin Dragon triggers and suppresses Dragon during the bonus game', () => {
    const result = hotlineSpinCascades(
      'water-source-seed',
      'water-client',
      66_127,
      5,
      3,
      1,
      true,
      'h5-water-margin',
    );

    expect(result.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 8, count: 3, direction: 'rtl', payout: 0 }),
      ]),
    );
    expect(result.features).toMatchObject({
      freeSpinsAwarded: 1,
      freeSpinsPlayed: 1,
      baseAppliedMultiplier: 1,
      baseMultiplierSymbols: [],
    });
    expect(
      result.features!.freeSpinRounds.every((round) => !round.initialGrid.flat().includes(8)),
    ).toBe(true);
    expect(result.totalMultiplier).toBeCloseTo(
      result.features!.baseTotalMultiplier + result.features!.freeSpinWinMultiplier,
      4,
    );
  });

  it('matches all nine original Cocos overlays and preserves the overlay index', () => {
    expect(getHotlinePaylinesForGame('h5-nine-line-pull-king').map((line) => line.path)).toEqual([
      [1, 1, 1, 1, 1],
      [0, 0, 0, 0, 0],
      [2, 2, 2, 2, 2],
      [0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2],
      [1, 0, 0, 0, 1],
      [1, 2, 2, 2, 1],
      [0, 0, 1, 2, 2],
      [2, 2, 1, 0, 0],
    ]);
    const grid = [
      [1, 7, 2],
      [7, 4, 5],
      [7, 6, 1],
      [7, 3, 4],
      [0, 7, 6],
    ];
    const { lines } = hotlineEvaluate(grid, 'h5-nine-line-pull-king');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      lineId: 'line-6',
      lineIndex: 5,
      path: [1, 0, 0, 0, 1],
      symbol: 7,
      count: 5,
    });
  });

  it('restores Nine-Line Pull King source symbols, one-way awards and special prizes', () => {
    expect(getH5OriginalGameSpec('h5-nine-line-pull-king')).toMatchObject({
      sourceMainModule: 'JXLWMain',
      standardSymbolCount: 14,
      specialSymbols: { seven: 11, jackpotChest: 12, freeDiamond: 13, bar: 14 },
      totalBetUnits: 9,
      settleWithSourcePaytable: true,
    });
    expect(getHotlineSymbolsForGame('h5-nine-line-pull-king')).toHaveLength(14);

    const barGrid = [
      [0, 13, 1],
      [2, 13, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];
    const bar = hotlineEvaluate(barGrid, 'h5-nine-line-pull-king').lines.find(
      (line) => line.symbol === 13,
    );
    expect(bar).toMatchObject({ count: 2, direction: 'ltr', payout: 0.5556 });

    const rightOnlyGrid = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 10],
      [8, 9, 10],
      [11, 12, 10],
    ];
    expect(hotlineEvaluate(rightOnlyGrid, 'h5-nine-line-pull-king').lines).toEqual([]);

    const sevenGrid = [
      [10, 1, 2],
      [10, 3, 4],
      [10, 5, 6],
      [7, 8, 9],
      [11, 12, 13],
    ];
    const seven = hotlineEvaluate(
      sevenGrid,
      'h5-nine-line-pull-king',
      undefined,
      () => 0,
    ).lines.find((line) => line.symbol === 10);
    expect(seven?.payout).toBeCloseTo(1_001 / 9, 4);

    const chestGrid = sevenGrid.map((column) => [...column]);
    chestGrid[0]![0] = 11;
    chestGrid[1]![0] = 11;
    chestGrid[2]![0] = 11;
    const chest = hotlineEvaluate(chestGrid, 'h5-nine-line-pull-king').lines.find(
      (line) => line.symbol === 11,
    );
    expect(chest).toMatchObject({ count: 3, payout: 0, jackpotShare: 0.1 });
    expect(getNineLinePullKingFreeSpinAward(3, 0)).toBe(1);
    expect(getNineLinePullKingFreeSpinAward(3, 0.999)).toBe(5);
    expect(getNineLinePullKingFreeSpinAward(4, 0.999)).toBe(10);
    expect(getNineLinePullKingFreeSpinAward(5, 0.999)).toBe(20);
  });

  it('settles a Nine-Line diamond trigger through the original free-game sequence', () => {
    const result = hotlineSpinCascades(
      'nine-source-seed',
      'nine-client',
      5758,
      5,
      3,
      1,
      true,
      'h5-nine-line-pull-king',
    );

    expect(result.features).toMatchObject({
      scatterCount: 3,
      freeSpinsAwarded: 5,
      freeSpinsPlayed: 5,
      baseAppliedMultiplier: 1,
      baseMultiplierSymbols: [],
    });
    expect(result.lines.some((line) => line.symbol === 12 && line.count === 3)).toBe(true);
    expect(result.features!.freeSpinRounds).toHaveLength(5);
    expect(result.features!.freeSpinRounds.every((round) => round.appliedMultiplier === 1)).toBe(
      true,
    );
    expect(result.totalMultiplier).toBeCloseTo(
      result.features!.baseTotalMultiplier + result.features!.freeSpinWinMultiplier,
      4,
    );
  });

  it('evaluates the fourth row on imported 5x4 fixed-line games', () => {
    expect(getHotlinePaylinesForGame('h5-yu-pu-tuan')).toHaveLength(50);
    const grid = [
      [0, 1, 2, 7],
      [4, 5, 6, 7],
      [1, 2, 3, 7],
      [5, 6, 0, 7],
      [2, 3, 4, 7],
    ];
    const { lines } = hotlineEvaluate(grid, 'h5-yu-pu-tuan');
    const bottom = lines.find((line) => line.lineIndex === 3);

    expect(bottom).toMatchObject({ lineId: 'line-4', path: [3, 3, 3, 3, 3], count: 5 });
  });

  it('restores Yu Pu Tuan source symbols, exact 50 lines and two-symbol premium awards', () => {
    const spec = getH5OriginalGameSpec('h5-yu-pu-tuan');
    expect(spec).toMatchObject({
      sourceMainModule: 'YPTMain',
      standardSymbolCount: 13,
      specialSymbols: { wild: 9, scatter: 10, dress: 11, shoes: 12, lady: 13 },
      totalBetUnits: 50,
      settleWithSourcePaytable: true,
      freeModes: [{ type: 1, spins: 10, cascadeMultipliers: [1] }],
    });
    expect(getHotlineSymbolsForGame('h5-yu-pu-tuan')).toHaveLength(13);
    expect(getHotlineSymbolsForGame('h5-yu-pu-tuan')[12]).toMatchObject({
      payout2: 0.05,
      payout3: 0.15,
      payout4: 0.5,
      payout5: 1,
    });

    const paths = getHotlinePaylinesForGame('h5-yu-pu-tuan').map((line) => line.path);
    expect(paths).toHaveLength(50);
    expect(new Set(paths.map((path) => path.join(','))).size).toBe(50);
    expect(paths.slice(0, 4)).toEqual([
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2],
      [3, 3, 3, 3, 3],
    ]);
    expect(paths.slice(28, 32)).toEqual([
      [0, 1, 2, 1, 0],
      [1, 2, 3, 2, 1],
      [2, 3, 0, 3, 2],
      [3, 0, 1, 0, 3],
    ]);
    expect(paths.slice(44)).toEqual([
      [0, 0, 0, 1, 1],
      [1, 1, 1, 2, 2],
      [2, 2, 2, 3, 3],
      [3, 3, 3, 0, 0],
      [0, 0, 0, 0, 1],
      [1, 1, 1, 1, 2],
    ]);

    const premiumGrid = Array.from({ length: 5 }, () => [9, 9, 9, 9]);
    premiumGrid[0]![0] = 12;
    premiumGrid[1]![0] = 8;
    premiumGrid[2]![0] = 0;
    const premium = hotlineEvaluate(premiumGrid, 'h5-yu-pu-tuan').lines.find(
      (line) => line.lineIndex === 0,
    );
    expect(premium).toMatchObject({
      symbol: 12,
      count: 2,
      direction: 'ltr',
      payout: 0.05,
    });

    const rightOnlyGrid = Array.from({ length: 5 }, () => [9, 9, 9, 9]);
    rightOnlyGrid[2]![0] = 12;
    rightOnlyGrid[3]![0] = 12;
    rightOnlyGrid[4]![0] = 12;
    expect(hotlineEvaluate(rightOnlyGrid, 'h5-yu-pu-tuan')).toEqual({
      lines: [],
      totalMultiplier: 0,
    });
  });

  it('runs Yu Pu Tuan as ten sticky-Wild free games from the visible Scatter trigger', () => {
    const result = hotlineSpinCascades(
      'ypt-source-seed',
      'ypt-client',
      23_602,
      5,
      4,
      1,
      true,
      'h5-yu-pu-tuan',
    );
    const features = result.features!;

    expect(features.scatterSymbols.map((symbol) => symbol.reel)).toEqual([0, 1, 2]);
    expect(features.freeSpinsAwarded).toBe(10);
    expect(features.freeSpinsPlayed).toBe(10);
    expect(features.freeSpinRounds).toHaveLength(10);
    expect(result.initialGrid[0]).not.toContain(8);
    expect(result.initialGrid[3]).not.toContain(9);
    expect(result.initialGrid[4]).not.toContain(9);

    const stickyWilds = new Set<string>();
    let observedStickyWild = false;
    let displayedFreeTotal = 0;
    for (const round of features.freeSpinRounds) {
      for (const key of stickyWilds) {
        const [reel = -1, row = -1] = key.split(':').map(Number);
        expect(round.initialGrid[reel]?.[row]).toBe(8);
      }
      round.initialGrid.forEach((column, reel) =>
        column.forEach((symbol, row) => {
          if (symbol === 8) {
            expect(reel).toBeGreaterThanOrEqual(1);
            stickyWilds.add(`${reel}:${row}`);
            observedStickyWild = true;
          }
          if (symbol === 9) expect(reel).toBeLessThanOrEqual(2);
          // YPTWheel upgrades source id 6 (zero-based 5) to shoes (11).
          expect(symbol).not.toBe(5);
        }),
      );
      const evaluated = hotlineEvaluate(round.initialGrid, 'h5-yu-pu-tuan');
      expect(round.lines).toEqual(evaluated.lines);
      expect(round.totalMultiplier).toBe(evaluated.totalMultiplier);
      displayedFreeTotal = roundTestMultiplier(displayedFreeTotal + evaluated.totalMultiplier);
    }
    expect(observedStickyWild).toBe(true);
    expect(features.freeSpinWinMultiplier).toBe(displayedFreeTotal);
    expect(result.totalMultiplier).toBe(
      roundTestMultiplier(features.baseTotalMultiplier + displayedFreeTotal),
    );
  });

  it('restores Fruit Little Mary symbols, paytable, exact nine lines and Wild rules', () => {
    const spec = getH5OriginalGameSpec('h5-fruit-little-mary');
    expect(spec).toMatchObject({
      sourceMainModule: 'SGXMLMain',
      standardSymbolCount: 11,
      specialSymbols: { bonus: 9, scatter: 10, wild: 11 },
      totalBetUnits: 9,
      settleWithSourcePaytable: true,
      freeModes: [{ type: 1, spins: 1, cascadeMultipliers: [1] }],
    });
    expect(getHotlineSymbolsForGame('h5-fruit-little-mary')).toHaveLength(11);
    expect(getHotlineSymbolsForGame('h5-fruit-little-mary')[0]).toMatchObject({
      payout2: 1 / 9,
      payout3: 3 / 9,
      payout4: 10 / 9,
      payout5: 75 / 9,
    });
    expect(getHotlinePaylinesForGame('h5-fruit-little-mary').map((line) => line.path)).toEqual([
      [0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1],
      [2, 2, 2, 2, 2],
      [0, 1, 2, 1, 0],
      [2, 1, 0, 1, 2],
      [0, 0, 1, 2, 2],
      [2, 2, 1, 0, 0],
      [1, 0, 1, 2, 1],
      [1, 2, 1, 0, 1],
    ]);

    const bananaWithWild = [
      [0, 2, 3],
      [10, 3, 4],
      [0, 4, 5],
      [2, 5, 6],
      [3, 6, 7],
    ];
    expect(hotlineEvaluate(bananaWithWild, 'h5-fruit-little-mary').lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lineIndex: 0, symbol: 0, count: 3, payout: 0.3333 }),
      ]),
    );
    expect(getFruitLittleMaryMiniGameAward(2)).toBe(0);
    expect(getFruitLittleMaryMiniGameAward(3)).toBe(1);
    expect(getFruitLittleMaryMiniGameAward(4)).toBe(2);
    expect(getFruitLittleMaryMiniGameAward(5)).toBe(3);
  });

  it('drives Fruit Little Mary free draws and its 24-cell mini game from visible symbols', () => {
    const miniResult = hotlineSpinCascades(
      'fruit-source-seed',
      'fruit-client',
      406_329,
      5,
      3,
      1,
      true,
      'h5-fruit-little-mary',
    );
    const mini = miniResult.features?.sourceMiniGame;
    expect(mini).toMatchObject({ type: 'fruit-little-mary', attempts: 1 });
    expect(miniResult.lines).toEqual(
      expect.arrayContaining([expect.objectContaining({ symbol: 10, count: 3, payout: 0 })]),
    );
    expect([3, 9, 15, 21]).toContain(mini?.rounds.at(-1)?.stopIndex);
    expect(mini?.rounds.at(-1)?.lineBetMultiplier).toBe(0);
    expect(miniResult.totalMultiplier).toBe(
      roundTestMultiplier(
        miniResult.features!.baseWinMultiplier + Number(mini?.payoutMultiplier || 0),
      ),
    );

    const freeResult = hotlineSpinCascades(
      'fruit-source-seed',
      'fruit-client',
      158_303,
      5,
      3,
      1,
      true,
      'h5-fruit-little-mary',
    );
    const feature = freeResult.features!;
    expect(feature.scatterSymbols.map((symbol) => symbol.reel)).toEqual([1, 2, 3]);
    expect(feature.freeSpinsAwarded).toBe(1);
    expect(feature.freeSpinsPlayed).toBe(1);
    expect(feature.freeSpinRounds).toHaveLength(1);
    const freeRound = feature.freeSpinRounds[0]!;
    expect(freeRound.lines).toEqual(
      hotlineEvaluate(freeRound.initialGrid, 'h5-fruit-little-mary').lines,
    );
    expect(
      freeRound.lines.some(
        (line) => line.symbol === 10 && getFruitLittleMaryMiniGameAward(line.count) > 0,
      ),
    ).toBe(false);
  });

  it('restores Aztec Gems five lines, Wild substitution and the separate multiplier reel', () => {
    const gameId = 'h5-aztec-treasure';
    expect(getH5OriginalGameSpec(gameId)).toMatchObject({
      sourceMainModule: 'AZTKMain',
      standardSymbolCount: 8,
      specialSymbols: { wild: 8 },
      totalBetUnits: 5,
      settleWithSourcePaytable: true,
    });
    expect(isHotlineSourceFeatureGame(gameId)).toBe(true);
    expect(getHotlineSymbolsForGame(gameId)).toHaveLength(8);
    expect(getHotlineSymbolsForGame(gameId)[0]?.payout3).toBe(0.2);
    expect(getHotlinePaylinesForGame(gameId).map((line) => line.path)).toEqual([
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
      [0, 1, 2],
      [2, 1, 0],
    ]);

    const grid = [
      [0, 1, 2],
      [7, 3, 4],
      [0, 5, 6],
    ];
    expect(hotlineEvaluate(grid, gameId).lines).toEqual([
      expect.objectContaining({ lineIndex: 1, symbol: 0, count: 3, payout: 0.2 }),
    ]);

    let sourceRound: ReturnType<typeof hotlineSpinSourceFeatureRound> | undefined;
    for (let nonce = 0; nonce < 2_000; nonce += 1) {
      const candidate = hotlineSpinSourceFeatureRound(
        'aztec-source-seed',
        'aztec-client',
        nonce,
        gameId,
      );
      if (candidate.lines.length > 0) {
        sourceRound = candidate;
        break;
      }
    }
    expect(sourceRound).toBeDefined();
    expect(sourceRound?.sourceFeature).toMatchObject({ type: 'aztec-gems-multiplier' });
    const wheel = Number(
      sourceRound?.sourceFeature?.type === 'aztec-gems-multiplier'
        ? sourceRound.sourceFeature.multiplier
        : 0,
    );
    expect([1, 2, 3, 5, 10, 15]).toContain(wheel);
    const base = hotlineEvaluate(sourceRound!.initialGrid, gameId);
    expect(sourceRound!.lines.map((line) => line.payout)).toEqual(
      base.lines.map((line) => roundTestMultiplier(line.payout * wheel)),
    );
    expect(sourceRound!.totalMultiplier).toBe(roundTestMultiplier(base.totalMultiplier * wheel));
  });

  it('restores Fire 88 seven lines, bannered 88 substitution and Wild respin rules', () => {
    const gameId = 'h5-fire-88';
    expect(getH5OriginalGameSpec(gameId)).toMatchObject({
      sourceMainModule: 'Fire88Main',
      standardSymbolCount: 8,
      specialSymbols: { wild: 7, jackpot88: 8 },
      totalBetUnits: 7,
      settleWithSourcePaytable: true,
      freeModes: [{ type: 1, spins: 1, cascadeMultipliers: [1] }],
    });
    expect(getHotlinePaylinesForGame(gameId).map((line) => line.path)).toEqual([
      [1, 1, 1],
      [0, 0, 0],
      [2, 2, 2],
      [2, 1, 0],
      [0, 1, 2],
      [1, 0, 1],
      [1, 2, 1],
    ]);
    expect(getHotlineSymbolsForGame(gameId)).toHaveLength(8);
    expect(getHotlineSymbolsForGame(gameId).map((symbol) => symbol.payout3)).toEqual([
      3 / 7,
      6 / 7,
      15 / 7,
      30 / 7,
      60 / 7,
      100 / 7,
      250 / 7,
      100 / 7,
    ]);

    const lineSix = [
      [1, 0, 2],
      [0, 3, 4],
      [5, 0, 1],
    ];
    expect(hotlineEvaluate(lineSix, gameId).lines).toEqual([
      expect.objectContaining({ lineIndex: 5, symbol: 0, payout: 0.4286 }),
    ]);
    const bannered88WithWild = [
      [5, 1, 2],
      [7, 3, 4],
      [6, 5, 0],
    ];
    expect(hotlineEvaluate(bannered88WithWild, gameId).lines).toEqual([
      expect.objectContaining({ lineIndex: 1, symbol: 5, payout: 14.2857 }),
    ]);

    let respin: ReturnType<typeof hotlineSpinCascades> | undefined;
    for (let nonce = 0; nonce < 20_000; nonce += 1) {
      const candidate = hotlineSpinCascades(
        'fire-88-source-seed',
        'fire-88-client',
        nonce,
        3,
        3,
        1,
        true,
        gameId,
      );
      if (candidate.features?.freeSpinsAwarded === 1) {
        respin = candidate;
        break;
      }
    }
    expect(respin).toBeDefined();
    expect(respin?.initialGrid.flat().filter((symbol) => symbol === 6)).toHaveLength(2);
    expect(respin?.features?.freeSpinRounds).toHaveLength(1);
    expect(respin?.features?.freeSpinRounds[0]?.initialGrid.flat()).not.toContain(6);
  });

  it('restores Lucky 777 three horizontal lines and each Gold Cup free mode', () => {
    const gameId = 'h5-lucky-777';
    expect(getH5OriginalGameSpec(gameId)).toMatchObject({
      sourceMainModule: 'lucky777Main',
      standardSymbolCount: 9,
      specialSymbols: { wild: 9 },
      totalBetUnits: 3,
      settleWithSourcePaytable: true,
      freeModes: [
        { type: 1, spins: 28, cascadeMultipliers: [1] },
        { type: 2, spins: 14, cascadeMultipliers: [2] },
        { type: 3, spins: 7, cascadeMultipliers: [4] },
      ],
    });
    expect(getHotlinePaylinesForGame(gameId).map((line) => line.path)).toEqual([
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
    ]);
    expect(getHotlineSymbolsForGame(gameId).map((symbol) => symbol.payout3)).toEqual([
      0.5 / 3,
      1 / 3,
      1,
      5 / 3,
      10 / 3,
      20 / 3,
      50 / 3,
      100 / 3,
      0,
    ]);

    const wildSubstitution = [
      [7, 0, 1],
      [8, 2, 3],
      [7, 4, 5],
    ];
    expect(hotlineEvaluate(wildSubstitution, gameId).lines).toEqual([
      expect.objectContaining({ lineIndex: 0, symbol: 7, count: 3, payout: 33.3333 }),
    ]);
    expect(
      hotlineEvaluate(
        [
          [8, 0, 1],
          [8, 2, 3],
          [8, 4, 5],
        ],
        gameId,
      ),
    ).toEqual({ lines: [], totalMultiplier: 0 });

    for (const [type, spins, multiplier] of [
      [1, 28, 1],
      [2, 14, 2],
      [3, 7, 4],
    ] as const) {
      const feature = hotlineSelectLucky777FreeMode(
        'lucky-777-source-seed',
        'lucky-777-client',
        91,
        type,
      );
      expect(feature).toMatchObject({
        sourceFreeModeType: type,
        sourceFreeWinMultiplier: multiplier,
        freeSpinsAwarded: spins,
        freeSpinsPlayed: spins,
      });
      expect(feature.freeSpinRounds).toHaveLength(spins);
      let total = 0;
      for (const round of feature.freeSpinRounds) {
        const raw = hotlineEvaluate(round.initialGrid, gameId);
        expect(round.appliedMultiplier).toBe(multiplier);
        expect(round.lines.map((line) => line.payout)).toEqual(
          raw.lines.map((line) => roundTestMultiplier(line.payout * multiplier)),
        );
        expect(round.totalMultiplier).toBe(roundTestMultiplier(raw.totalMultiplier * multiplier));
        total = roundTestMultiplier(total + round.totalMultiplier);
      }
      expect(feature.totalMultiplier).toBe(total);
    }
  });

  it('uses adjacent-reel ways instead of fixed lines or anywhere clusters', () => {
    expect(getHotlineEvaluationMode('h5-flying-together')).toBe('ways');
    const grid = [
      [7, 7, 0],
      [7, 1, 2],
      [7, 7, 3],
      [0, 1, 2],
      [3, 4, 5],
    ];
    const { lines } = hotlineEvaluate(grid, 'h5-flying-together');
    const win = lines.find((line) => line.symbol === 7);

    expect(win).toMatchObject({ lineId: 'ways-7', count: 3, ways: 4, direction: 'ltr' });
    expect(win?.positions).toHaveLength(5);
  });

  it('detects a 3-of-a-kind line', () => {
    const grid = [
      [0, 1, 2],
      [0, 3, 4],
      [0, 5, 0],
      [5, 2, 1],
      [3, 4, 2],
    ];
    const { lines } = hotlineEvaluate(grid);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]!.symbol).toBe(0);
    expect(lines[0]!.count).toBe(3);
    expect(lines[0]!.lineId).toBe('top');
    expect(lines[0]!.startReel).toBe(0);
    expect(lines[0]!.direction).toBe('ltr');
    expect(lines[0]!.path).toEqual([0, 0, 0, 0, 0]);
  });

  it('detects a V-shaped diagonal payline', () => {
    const grid = [
      [5, 1, 2],
      [1, 5, 3],
      [2, 2, 5],
      [3, 5, 4],
      [5, 2, 4],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const line = lines.find((l) => l.lineId === 'v-down');

    expect(line).toBeDefined();
    expect(line!.symbol).toBe(5);
    expect(line!.count).toBe(5);
    expect(line!.startReel).toBe(0);
    expect(line!.direction).toBe('ltr');
    expect(line!.path).toEqual([0, 1, 2, 1, 0]);
    expect(totalMultiplier).toBe(HOTLINE_SYMBOLS[5]!.payout5);
  });

  it('does not count matching symbols unless they follow a payline from either edge', () => {
    const grid = [
      [3, 5, 0],
      [2, 5, 3],
      [2, 3, 4],
      [0, 4, 0],
      [5, 0, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);

    expect(lines).toEqual([]);
    expect(totalMultiplier).toBe(0);
  });

  it('detects a 3-symbol run from the right edge', () => {
    const grid = [
      [3, 1, 0],
      [2, 0, 1],
      [1, 2, 0],
      [1, 1, 1],
      [1, 0, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const line = lines.find((l) => l.lineId === 'top' && l.startReel === 2);

    expect(line).toBeDefined();
    expect(line!.symbol).toBe(1);
    expect(line!.count).toBe(3);
    expect(line!.row).toBe(0);
    expect(line!.direction).toBe('rtl');
    expect(totalMultiplier).toBeGreaterThanOrEqual(HOTLINE_SYMBOLS[1]!.payout3);
  });

  it('does not pay a middle-only run on a fixed payline', () => {
    const grid = [
      [3, 0, 4],
      [1, 2, 5],
      [1, 3, 0],
      [1, 4, 2],
      [2, 5, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);

    expect(lines).toEqual([]);
    expect(totalMultiplier).toBe(0);
  });

  it('evaluates 3x3 diagonal paylines', () => {
    const grid = [
      [1, 0, 5],
      [0, 5, 2],
      [5, 4, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const line = lines.find((l) => l.lineId === 'diag-up');

    expect(line).toBeDefined();
    expect(line!.path).toEqual([2, 1, 0]);
    expect(line!.symbol).toBe(5);
    expect(line!.count).toBe(3);
    expect(line!.startReel).toBe(0);
    expect(line!.direction).toBe('ltr');
    expect(totalMultiplier).toBe(HOTLINE_MINI_SYMBOLS[5]!.payout3);
  });

  it('does not pay 6x5 mega clusters below eight matching symbols', () => {
    const grid = [
      [0, 1, 2, 3, 4],
      [5, 0, 1, 2, 3],
      [4, 5, 0, 1, 2],
      [3, 4, 5, 0, 1],
      [2, 3, 4, 5, 0],
      [1, 2, 3, 4, 5],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);

    expect(lines.find((line) => line.symbol === 0)).toBeUndefined();
    expect(totalMultiplier).toBe(0);
  });

  it('evaluates 6x5 mega clusters by total matching positions', () => {
    const grid = [
      [5, 5, 0, 1, 2],
      [5, 1, 5, 2, 3],
      [5, 2, 3, 5, 4],
      [5, 3, 4, 0, 1],
      [5, 4, 0, 1, 2],
      [5, 0, 1, 2, 3],
    ];
    const { lines, totalMultiplier } = hotlineEvaluate(grid);
    const premium = lines.find((line) => line.symbol === 5 && line.direction === 'ltr');

    expect(premium).toBeDefined();
    expect(premium!.lineId).toBe('cluster-5');
    expect(premium!.count).toBe(9);
    expect(premium!.positions?.length).toBe(9);
    expect(premium!.payout).toBe(HOTLINE_MEGA_SYMBOLS[5]!.payout3);
    expect(totalMultiplier).toBeGreaterThanOrEqual(HOTLINE_MEGA_SYMBOLS[5]!.payout3);
  });
});
