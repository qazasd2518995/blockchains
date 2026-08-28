import {
  SETH2_RATIO_VALUES,
  SETH2_STAKE_VALUES,
  type Seth2ReturnData,
  type Seth2Cell,
} from '@bg/shared';

export const SETH2_SOURCE_DEFINITION = {
  autoConfirmTime: 0,
  autoSpinInterval: 0.15,
  smallPrizeDelay: 0.5,
  bigPrizeDelay: 1,
  digital: 2,
  oddsList: {
    1: { 8: 200, 9: 200, 10: 500, 11: 500, 12: 1_000 },
    2: { 8: 50, 9: 50, 10: 200, 11: 200, 12: 500 },
    3: { 8: 40, 9: 40, 10: 100, 11: 100, 12: 300 },
    4: { 8: 30, 9: 30, 10: 40, 11: 40, 12: 240 },
    5: { 8: 20, 9: 20, 10: 30, 11: 30, 12: 200 },
    6: { 8: 16, 9: 16, 10: 24, 11: 24, 12: 160 },
    7: { 8: 10, 9: 10, 10: 20, 11: 20, 12: 100 },
    8: { 8: 8, 9: 8, 10: 18, 11: 18, 12: 80 },
    9: { 8: 5, 9: 5, 10: 15, 11: 15, 12: 40 },
    15: { 4: 60, 5: 100, 6: 2_000 },
  },
  winOddsTypes: {
    legendaryWin: 1_000,
    win: 20,
    bigWin: 20,
    superWin: 50,
    megaWin: 100,
    ultraWin: 300,
  },
  prizeAutoNextDelay: 10,
  buyFeature: [
    { feature: 'freeGame', featureRate: 200, featureIndex: 0 },
    { feature: 'superFreeGame', featureRate: 500, featureIndex: 1 },
    { feature: 'superMainGame', featureRate: 2_000, featureIndex: 2 },
  ],
  isDemo: false,
  winlineDefs: Array.from({ length: 20 }, (_, order) => ({ order: String(order), line: [] })),
  extraFgRounds: 5,
  symbolDefs: [
    { symbol: 1, displayName: 'S1' },
    { symbol: 2, displayName: 'S2' },
    { symbol: 3, displayName: 'S3' },
    { symbol: 4, displayName: 'S4' },
    { symbol: 5, displayName: 'S5' },
    { symbol: 6, displayName: 'S6' },
    { symbol: 7, displayName: 'S7' },
    { symbol: 8, displayName: 'S8' },
    { symbol: 9, displayName: 'S9' },
    { symbol: 10, displayName: 'T1' },
    { symbol: 11, displayName: 'T2' },
    { symbol: 12, displayName: 'T3' },
    { symbol: 13, displayName: 'T4' },
    { symbol: 14, displayName: 'JP' },
    { symbol: 15, displayName: 'SCATTER' },
  ],
} as const;

export type Seth2SourceAction = 'spin' | 'freeSpin' | 'superSpin';

export interface Seth2SourceStateOptions {
  action: Seth2SourceAction;
  spinId: string;
  totalStake: number;
  freeGameCount: number;
  featureWinningsBefore: number;
  isGoldenFg: boolean;
}

interface SourceTimesSymbol {
  isRare: boolean;
  lock: number;
  symbol: number;
  symbolPos: number;
  times: number;
}

export interface Seth2SourceGameState {
  view: number[][];
  spinId: string;
  roundWinnings: number;
  maleTotemLevel: number;
  totalWinnings: number;
  totalViews: number;
  action: Seth2SourceAction;
  startFreeGame: boolean;
  currentTimes: number;
  currentView: number;
  splitList: Array<{ from: number; to: number[] }>;
  newTimesSymbols: SourceTimesSymbol[];
  timesUpgrade: Array<{
    beforeSymbol: number;
    beforeTimes: number;
    afterSymbol: number;
    afterTimes: number;
    symbolPos: number;
  }>;
  timesSymbols: SourceTimesSymbol[];
  isJp: string;
  noWinReward: number;
  winSymbols: Array<{ symbol: number; symbolPos: number[]; winnings: number }>;
  posTransform: Array<{ beforePos: number; afterPos: number }>;
  superMainGameCount: number;
  femaleTotemLevel: number;
  freeGameCount: number;
  isGoldenFg: boolean;
  totalStake: number;
}

interface BoardTransition {
  board: Seth2Cell[];
  posTransform: Array<{ beforePos: number; afterPos: number }>;
  newPositions: Set<number>;
  beforeToAfter: Map<number, number>;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function multiplierSymbol(value: number): 10 | 11 | 12 | 13 {
  // The imported game's captured states use T1/T2/T3/T4 for
  // red/purple/blue/green balls respectively. 100x already belongs to T1.
  if (value >= 100) return 10;
  if (value >= 50) return 11;
  if (value >= 10) return 12;
  return 13;
}

function sourceSymbol(cell: Seth2Cell): number {
  return cell.type === 10 ? multiplierSymbol(cell.mul) : cell.type;
}

function sourceView(board: Seth2Cell[]): number[][] {
  return Array.from({ length: 5 }, (_, row) => board.slice(row * 6, row * 6 + 6).map(sourceSymbol));
}

function lockedPositions(
  cells: readonly Seth2Cell[],
  originalToCurrent: ReadonlyMap<number, number>,
): Set<number> {
  return new Set(
    cells.flatMap((cell) => {
      const originalPosition = Number(cell.code);
      const position = originalToCurrent.get(originalPosition) ?? originalPosition;
      return Number.isInteger(position) && position >= 0 && position < 30 ? [position] : [];
    }),
  );
}

function timesSymbols(
  board: Seth2Cell[],
  lockCount: number,
  lockedCells: readonly Seth2Cell[],
  originalToCurrent: ReadonlyMap<number, number>,
): SourceTimesSymbol[] {
  const locked = lockedPositions(lockedCells, originalToCurrent);
  return board.flatMap((cell, symbolPos) =>
    cell.type === 10
      ? [
          {
            isRare: Number(cell.mul_type ?? 0) === 0,
            lock: lockCount > 0 && locked.has(symbolPos) ? lockCount : 0,
            symbol: multiplierSymbol(cell.mul),
            symbolPos,
            times: cell.mul,
          },
        ]
      : [],
  );
}

function collapseBoard(
  board: Seth2Cell[],
  removeTypes: readonly number[],
  refill: readonly Seth2Cell[],
  fixedPositions: ReadonlySet<number> = new Set<number>(),
): BoardTransition {
  const removed = new Set(removeTypes);
  const next = Array<Seth2Cell>(30);
  const posTransform: Array<{ beforePos: number; afterPos: number }> = [];
  const beforeToAfter = new Map<number, number>();
  const newPositions = new Set<number>();
  let refillCursor = 0;

  for (let column = 0; column < 6; column += 1) {
    const survivors: Array<{ cell: Seth2Cell; beforePos: number }> = [];
    const availableRows: number[] = [];
    for (let row = 0; row < 5; row += 1) {
      const beforePos = row * 6 + column;
      const cell = board[beforePos]!;
      if (fixedPositions.has(beforePos) && cell.type === 10) {
        next[beforePos] = { ...cell };
        beforeToAfter.set(beforePos, beforePos);
        continue;
      }
      availableRows.push(row);
      if (!removed.has(cell.type)) survivors.push({ cell, beforePos });
    }
    const missing = availableRows.length - survivors.length;
    for (let index = 0; index < missing; index += 1) {
      const afterPos = availableRows[index]! * 6 + column;
      next[afterPos] = refill[refillCursor++] ?? { type: ((afterPos + column) % 9) + 1, mul: 0 };
      newPositions.add(afterPos);
    }
    survivors.forEach((survivor, index) => {
      const afterPos = availableRows[missing + index]! * 6 + column;
      next[afterPos] = { ...survivor.cell };
      beforeToAfter.set(survivor.beforePos, afterPos);
      if (survivor.beforePos !== afterPos) {
        posTransform.push({ beforePos: survivor.beforePos, afterPos });
      }
    });
  }
  // The Cocos client mutates its symbol map in the order provided here.  Move
  // lower symbols first so an upper symbol never overwrites a node that still
  // has to be moved further down in the same column.
  posTransform.sort((left, right) => right.beforePos - left.beforePos);
  return { board: next, posTransform, newPositions, beforeToAfter };
}

function sourceWinSymbols(
  board: Seth2Cell[],
  removeTypes: readonly number[],
  scoreList: readonly number[],
) {
  return removeTypes.flatMap((symbol, index) => {
    const symbolPos = board.flatMap((cell, position) => (cell.type === symbol ? [position] : []));
    return symbolPos.length > 0
      ? [{ symbol, symbolPos, winnings: money(Number(scoreList[index] ?? 0)) }]
      : [];
  });
}

function resolveUpgradePositions(
  board: readonly Seth2Cell[],
  upgrades: Seth2ReturnData['list'][number]['upgrade_mul_list'],
  originalToCurrent: ReadonlyMap<number, number>,
) {
  const used = new Set<number>();
  return upgrades.flatMap((upgrade) => {
    const originalPosition = Number(upgrade.code);
    const mappedPosition = originalToCurrent.get(originalPosition);
    const exactPosition =
      mappedPosition !== undefined &&
      board[mappedPosition]?.type === 10 &&
      board[mappedPosition]?.mul === upgrade.mul
        ? mappedPosition
        : undefined;
    const fallbackPosition = board.findIndex(
      (cell, position) =>
        !used.has(position) &&
        cell.type === 10 &&
        cell.mul === upgrade.mul &&
        Number(cell.mul_type ?? 0) === Number(upgrade.mul_type ?? 0),
    );
    const symbolPos = exactPosition ?? (fallbackPosition >= 0 ? fallbackPosition : undefined);
    if (symbolPos === undefined || used.has(symbolPos)) return [];
    used.add(symbolPos);
    return [
      {
        upgrade,
        beforeSymbol: multiplierSymbol(upgrade.mul),
        beforeTimes: upgrade.mul,
        afterSymbol: multiplierSymbol(upgrade.new_mul),
        afterTimes: upgrade.new_mul,
        symbolPos,
      },
    ];
  });
}

function applyUpgrades(
  board: Seth2Cell[],
  upgrades: ReturnType<typeof resolveUpgradePositions>,
  transition: BoardTransition,
) {
  for (const resolved of upgrades) {
    const position = transition.beforeToAfter.get(resolved.symbolPos) ?? resolved.symbolPos;
    if (position >= board.length) continue;
    const cell = board[position];
    if (cell?.type === 10) {
      board[position] = {
        ...cell,
        mul: resolved.upgrade.new_mul,
        // Rare balls remain rare after upgrading and may upgrade again in a
        // later cascade. Converting them to regular stops the source animation.
        mul_type: resolved.upgrade.mul_type ?? cell.mul_type ?? 0,
      };
    }
  }
}

function skillTriggerRound(data: Seth2ReturnData, symbol: 17 | 18): number {
  return data.list.findIndex((round) => round.remove_type.includes(symbol));
}

function splitList(
  source: Seth2Cell | null,
  copies: readonly Seth2Cell[],
  transition: BoardTransition | null,
  originalToCurrent: ReadonlyMap<number, number>,
  currentBoard: readonly Seth2Cell[],
) {
  if (!source || copies.length === 0) return [];
  const originalFrom = Number(source.code);
  const from = originalToCurrent.get(originalFrom) ?? originalFrom;
  const candidatePositions = transition
    ? [...transition.newPositions].filter((position) => {
        const cell = transition.board[position];
        // The source animation clones before the ordinary fall. Cloning onto
        // a multiplier that is still visible at the destination deletes that
        // existing ball, which looked like the split collided with it.
        return (
          currentBoard[position]?.type !== 10 &&
          position !== from &&
          cell?.type === 10 &&
          cell.mul === source.mul &&
          Number(cell.mul_type ?? 0) === Number(source.mul_type ?? 0)
        );
      })
    : [];
  const targets = candidatePositions.slice(0, copies.length);
  return targets.length > 0 ? [{ from, to: targets }] : [];
}

function roundRefill(
  maleCopies: readonly Seth2Cell[],
  round: Seth2ReturnData['list'][number],
  board: readonly Seth2Cell[],
  fixedPositions: ReadonlySet<number> = new Set<number>(),
) {
  if (maleCopies.length === 0) return round.round_data;
  const removed = new Set(round.remove_type);
  const refillPositions: number[] = [];
  for (let column = 0; column < 6; column += 1) {
    const movableSurvivors: Seth2Cell[] = [];
    const availableRows: number[] = [];
    for (let row = 0; row < 5; row += 1) {
      const position = row * 6 + column;
      const current = board[position]!;
      if (fixedPositions.has(position) && current.type === 10) continue;
      availableRows.push(row);
      if (!removed.has(current.type)) movableSurvivors.push(current);
    }
    const missing = availableRows.length - movableSurvivors.length;
    for (let index = 0; index < missing; index += 1) {
      refillPositions.push(availableRows[index]! * 6 + column);
    }
  }
  // The authoritative math payload keeps the man's cloned multiplier balls in
  // type17_mul_list and deliberately omits them from round_data.  The source
  // client, however, needs those balls in the collapsed board so splitList can
  // animate to real target nodes.  Captured upstream responses may already put
  // them in round_data, so only supply the exact missing number here.
  const missing = Math.max(0, refillPositions.length - round.round_data.length);
  const ordinaryRefill = [...round.round_data];
  const copies =
    missing > 0
      ? maleCopies.slice(0, missing)
      : maleCopies.flatMap((copy) => {
          const existingIndex = ordinaryRefill.findIndex(
            (current) =>
              current.type === 10 &&
              current.mul === copy.mul &&
              Number(current.mul_type ?? 0) === Number(copy.mul_type ?? 0),
          );
          return existingIndex >= 0 ? [ordinaryRefill.splice(existingIndex, 1)[0]!] : [];
        });
  if (copies.length === 0) return round.round_data;
  const result = Array<Seth2Cell | undefined>(refillPositions.length);
  const safeIndexes = refillPositions.flatMap((position, index) =>
    board[position]?.type === 10 ? [] : [index],
  );
  const fallbackIndexes = refillPositions.flatMap((position, index) =>
    board[position]?.type === 10 ? [index] : [],
  );
  const copyIndexes = [...safeIndexes, ...fallbackIndexes];
  copies.forEach((copy, index) => {
    const targetIndex = copyIndexes[index];
    if (targetIndex !== undefined) result[targetIndex] = { ...copy };
  });
  let ordinaryCursor = 0;
  for (let index = 0; index < result.length; index += 1) {
    if (result[index]) continue;
    result[index] = ordinaryRefill[ordinaryCursor++];
  }
  return result.filter((current): current is Seth2Cell => current !== undefined);
}

function totemLevel(count: number): number {
  if (count >= 5) return 3;
  if (count >= 3) return 2;
  return count > 0 ? 1 : 0;
}

function sourceCurrentTimes(
  data: Seth2ReturnData,
  action: Seth2SourceAction,
  finalView = false,
): number {
  if (data.is_sjc === 1) return -1;
  if (finalView && action !== 'freeSpin') return -1;
  return data.multiplierBankBefore;
}

function sourceJackpotType(tier: number): string {
  if (tier === 11) return 'jp-grand';
  if (tier === 12) return 'jp-major';
  if (tier === 13) return 'jp-minor';
  if (tier === 14) return 'jp-mini';
  return '';
}

export function seth2SourceGameStates(
  data: Seth2ReturnData,
  options: Seth2SourceStateOptions,
): Seth2SourceGameState[] {
  let board = data.list[0]?.start_data.map((cell) => ({ ...cell })) ?? [];
  if (board.length !== 30) {
    board = Array.from({ length: 30 }, (_, index) => ({ type: (index % 9) + 1, mul: 0 }));
  }
  const states: Seth2SourceGameState[] = [];
  let transitionFromPrevious: BoardTransition | null = null;
  let originalToCurrent = new Map(
    Array.from({ length: 30 }, (_, position) => [position, position]),
  );
  let accumulatedBaseWinnings = 0;
  let settledSuperWinnings = 0;
  let settledEmbeddedWinnings = 0;
  let superGameIndex = 0;
  const maleTriggerRound = skillTriggerRound(data, 17);
  const femaleTriggerRound = skillTriggerRound(data, 18);

  for (let roundIndex = 0; roundIndex < data.list.length; roundIndex += 1) {
    const round = data.list[roundIndex]!;
    const maleCopies =
      round.male_mul_list ?? (roundIndex === maleTriggerRound ? data.type17_mul_list : []);
    const maleSource =
      round.male_source ?? (roundIndex === maleTriggerRound ? data.type17_beishu : null);
    const femaleStartCells =
      round.female_start_mul_list ??
      (roundIndex === femaleTriggerRound ? data.type18_start_mul_list : []);
    const femaleDuration =
      round.female_mul_count ?? (roundIndex === femaleTriggerRound ? data.type18_mul_count : 0);
    const isMaleTrigger = maleCopies.length > 0 && round.remove_type.includes(17);
    const isFemaleTrigger = femaleStartCells.length > 0 && round.remove_type.includes(18);
    if (round.start_data.length === 30 && states.at(-1)?.winSymbols.length) {
      // A complete board starts a new game, never another tumble. If malformed
      // or legacy data places it directly after a winning view, finish the old
      // multiplier collection first. Without this boundary v1.1.5 removes
      // nodes from one board and waits for those same nodes on an unrelated
      // board, leaving the spin flow permanently open.
      const previousRound = data.list[roundIndex - 1]!;
      const previousFemaleActive = femaleTriggerRound >= 0 && femaleTriggerRound < roundIndex;
      const previousLockedCells =
        previousRound.locked_mul_list ?? (previousFemaleActive ? data.type18_start_mul_list : []);
      const previousLockCount =
        previousRound.locked_mul_count ?? (previousFemaleActive ? data.type18_mul_count : 0);
      const boundaryTimes = timesSymbols(
        board,
        previousLockCount,
        previousLockedCells,
        originalToCurrent,
      );
      const collected = money(previousRound.total_gold);
      settledEmbeddedWinnings = collected;
      states.push({
        view: sourceView(board),
        spinId: options.spinId,
        roundWinnings: collected,
        maleTotemLevel: 0,
        totalWinnings: money(
          options.featureWinningsBefore + settledSuperWinnings + settledEmbeddedWinnings,
        ),
        totalViews: 0,
        action: options.action,
        startFreeGame: false,
        currentTimes: sourceCurrentTimes(data, options.action, true),
        currentView: states.length,
        splitList: [],
        newTimesSymbols: boundaryTimes.filter((entry) =>
          transitionFromPrevious ? transitionFromPrevious.newPositions.has(entry.symbolPos) : true,
        ),
        timesUpgrade: [],
        timesSymbols: boundaryTimes,
        isJp: sourceJackpotType(data.JPtype),
        noWinReward: 0,
        winSymbols: [],
        posTransform: [],
        superMainGameCount: 0,
        femaleTotemLevel: 0,
        freeGameCount: options.freeGameCount,
        isGoldenFg: options.isGoldenFg,
        totalStake: options.totalStake,
      });
      accumulatedBaseWinnings = 0;
    }
    if (round.start_data.length === 30) {
      if (options.action === 'superSpin') accumulatedBaseWinnings = 0;
      board = round.start_data.map((cell) => ({ ...cell }));
      transitionFromPrevious = null;
      originalToCurrent = new Map(
        Array.from({ length: 30 }, (_, position) => [position, position]),
      );
    }
    // The v1.1.5 client first counts each raw erase win, then collects the
    // multiplier balls on the following no-win view.  Multiplying a winning
    // cascade here makes the client skip (or double-count) that collection.
    accumulatedBaseWinnings = money(accumulatedBaseWinnings + round.score);
    const roundWinnings = accumulatedBaseWinnings;
    const displayedTotalWinnings = money(
      options.featureWinningsBefore +
        (options.action === 'superSpin' ? settledSuperWinnings : 0) +
        settledEmbeddedWinnings +
        accumulatedBaseWinnings,
    );
    const roundLockedCells = isFemaleTrigger
      ? femaleStartCells
      : (round.locked_mul_list ?? data.type18_start_mul_list);
    const roundLockCount = isFemaleTrigger
      ? femaleDuration
      : (round.locked_mul_count ?? data.type18_mul_count);
    const femaleLockActive =
      isFemaleTrigger ||
      round.locked_mul_list !== undefined ||
      femaleTriggerRound < 0 ||
      roundIndex >= femaleTriggerRound;
    const currentTimes = timesSymbols(
      board,
      femaleLockActive ? roundLockCount : 0,
      roundLockedCells,
      originalToCurrent,
    );
    const fixedMultiplierPositions =
      femaleLockActive && roundLockCount > 0
        ? lockedPositions(roundLockedCells, originalToCurrent)
        : new Set<number>();
    // Scatter triggers remain on the board while the dedicated free-game intro
    // animates them.  Treating them as an ordinary erase win removes their
    // nodes before playScatterWin runs and crashes the source client.
    const isFeatureEntry = data.is_sjc === 1 && roundIndex === 0;
    const transition = isFeatureEntry
      ? {
          board: board.map((cell) => ({ ...cell })),
          posTransform: [],
          newPositions: new Set<number>(),
          beforeToAfter: new Map<number, number>(),
        }
      : collapseBoard(
          board,
          round.remove_type,
          roundRefill(isMaleTrigger ? maleCopies : [], round, board, fixedMultiplierPositions),
          fixedMultiplierPositions,
        );
    // The source client maps timesUpgrade.symbolPos through this state's
    // posTransform itself.  Keep the pre-fall position here; sending the
    // already-transformed position can map it a second time onto another ball.
    const resolvedUpgrades = resolveUpgradePositions(
      board,
      round.upgrade_mul_list,
      originalToCurrent,
    );
    const upgrades = resolvedUpgrades.map(
      ({ upgrade: _upgrade, ...sourceUpgrade }) => sourceUpgrade,
    );
    const maleLevel = isMaleTrigger ? totemLevel(maleCopies.length) : 0;
    // Female level is the number of selected balls (1 / 2 / 3), not the lock
    // lifetime. Every level now shares the same five-game follow-up countdown.
    const femaleLevel = isFemaleTrigger ? Math.min(3, femaleStartCells.length) : 0;
    states.push({
      view: sourceView(board),
      spinId: options.spinId,
      roundWinnings,
      maleTotemLevel: maleLevel,
      totalWinnings: displayedTotalWinnings,
      totalViews: 0,
      action: options.action,
      startFreeGame: data.is_sjc === 1,
      // showTimesMoving first renders this saved bank and then adds every ball
      // in timesSymbols.  Supplying multiplierBankAfter here double-counts the
      // current board during the original collection animation.
      currentTimes:
        options.action === 'superSpin' && superGameIndex > 0
          ? -1
          : sourceCurrentTimes(data, options.action),
      currentView: states.length,
      splitList: splitList(maleSource, maleCopies, transition, originalToCurrent, board),
      newTimesSymbols: currentTimes.filter((entry) =>
        transitionFromPrevious
          ? transitionFromPrevious.newPositions.has(entry.symbolPos) || isFemaleTrigger
          : entry.lock === 0 || isFemaleTrigger,
      ),
      timesUpgrade: upgrades,
      timesSymbols: currentTimes,
      isJp: sourceJackpotType(data.JPtype),
      noWinReward: 0,
      winSymbols: isFeatureEntry ? [] : sourceWinSymbols(board, round.remove_type, round.scoreList),
      // Falling is part of the current winning view.  The following state only
      // supplies the freshly entered symbols after this transform completes.
      posTransform: transition.posTransform,
      superMainGameCount: 0,
      femaleTotemLevel: femaleLevel,
      freeGameCount: options.freeGameCount,
      isGoldenFg: options.isGoldenFg,
      totalStake: options.totalStake,
    });
    applyUpgrades(transition.board, resolvedUpgrades, transition);
    const nextOriginalToCurrent = new Map<number, number>();
    for (const [originalPosition, currentPosition] of originalToCurrent) {
      const nextPosition = transition.beforeToAfter.get(currentPosition);
      if (nextPosition !== undefined) nextOriginalToCurrent.set(originalPosition, nextPosition);
      else if (!round.remove_type.includes(board[currentPosition]?.type ?? -1)) {
        nextOriginalToCurrent.set(originalPosition, currentPosition);
      }
    }
    originalToCurrent = nextOriginalToCurrent;
    board = transition.board;
    transitionFromPrevious = transition;

    if (options.action === 'superSpin' && round.collect_gold !== undefined) {
      const collected = money(round.collect_gold);
      const finalTimes = timesSymbols(board, roundLockCount, roundLockedCells, originalToCurrent);
      states.push({
        view: sourceView(board),
        spinId: options.spinId,
        roundWinnings: collected,
        maleTotemLevel: 0,
        totalWinnings: money(
          options.featureWinningsBefore +
            settledSuperWinnings +
            settledEmbeddedWinnings +
            collected,
        ),
        totalViews: 0,
        action: options.action,
        startFreeGame: false,
        currentTimes: superGameIndex > 0 ? -1 : sourceCurrentTimes(data, options.action),
        currentView: states.length,
        splitList: [],
        newTimesSymbols: finalTimes.filter((entry) =>
          transitionFromPrevious ? transitionFromPrevious.newPositions.has(entry.symbolPos) : true,
        ),
        timesUpgrade: [],
        timesSymbols: finalTimes,
        isJp: sourceJackpotType(data.JPtype),
        noWinReward: 0,
        winSymbols: [],
        posTransform: [],
        superMainGameCount: 0,
        femaleTotemLevel: 0,
        freeGameCount: options.freeGameCount,
        isGoldenFg: options.isGoldenFg,
        totalStake: options.totalStake,
      });
      settledSuperWinnings = money(settledSuperWinnings + collected);
      accumulatedBaseWinnings = 0;
      superGameIndex += 1;
    } else if (
      options.action === 'superSpin' &&
      round.start_data.length === 30 &&
      round.remove_type.length === 0
    ) {
      // A guaranteed 500x object is allowed to land without an elimination.
      // It is one completed super-main game and must not be multiplied.
      superGameIndex += 1;
    }
  }

  // A losing result is already complete in its first view.  Only append a
  // post-collapse view when the previous state actually removed symbols;
  // otherwise the client interprets the duplicate board as a second spin.
  if (states.at(-1)?.winSymbols.length) {
    const finalTimes = timesSymbols(
      board,
      data.type18_mul_count,
      data.type18_start_mul_list,
      originalToCurrent,
    );
    states.push({
      view: sourceView(board),
      spinId: options.spinId,
      roundWinnings: money(data.total_gold),
      maleTotemLevel: 0,
      totalWinnings: money(options.featureWinningsBefore + data.total_gold),
      totalViews: 0,
      action: options.action,
      startFreeGame: data.is_sjc === 1,
      currentTimes: sourceCurrentTimes(data, options.action, true),
      currentView: states.length,
      splitList: [],
      newTimesSymbols: finalTimes.filter((entry) =>
        transitionFromPrevious ? transitionFromPrevious.newPositions.has(entry.symbolPos) : true,
      ),
      timesUpgrade: [],
      timesSymbols: finalTimes,
      isJp: sourceJackpotType(data.JPtype),
      noWinReward: 0,
      winSymbols: [],
      posTransform: [],
      superMainGameCount: 0,
      femaleTotemLevel: 0,
      freeGameCount: options.freeGameCount,
      isGoldenFg: options.isGoldenFg,
      totalStake: options.totalStake,
    });
  }

  return states.map((state) => ({ ...state, totalViews: states.length }));
}

export function seth2SourceInitialState(totalStake = 2) {
  const board = Array.from({ length: 30 }, (_, index) => ({ type: (index % 9) + 1, mul: 0 }));
  return {
    view: sourceView(board),
    spinId: '',
    roundWinnings: 0,
    maleTotemLevel: 0,
    totalWinnings: 0,
    totalViews: 1,
    action: 'spin',
    startFreeGame: false,
    currentTimes: -1,
    currentView: 0,
    splitList: [],
    newTimesSymbols: [],
    timesUpgrade: [],
    timesSymbols: [],
    isJp: '',
    noWinReward: 0,
    winSymbols: [],
    posTransform: [],
    superMainGameCount: 0,
    femaleTotemLevel: 0,
    freeGameCount: 0,
    isGoldenFg: false,
    totalStake,
  };
}

interface Seth2SourceBettingLimit {
  min: number;
  max: number;
}

export function seth2SourceBetOptions(limit?: Seth2SourceBettingLimit) {
  const allStakes = [...SETH2_STAKE_VALUES];
  const allRatios = [...SETH2_RATIO_VALUES];
  if (
    !limit ||
    !Number.isFinite(limit.min) ||
    !Number.isFinite(limit.max) ||
    limit.min <= 0 ||
    limit.max < limit.min
  ) {
    return { stakeValues: allStakes, ratioValues: allRatios, stakeList: [] };
  }

  let best:
    | {
        stakeValues: number[];
        ratioValues: number[];
        minGap: number;
        maxGap: number;
        combinations: number;
      }
    | undefined;
  for (let stakeStart = 0; stakeStart < allStakes.length; stakeStart += 1) {
    for (let stakeEnd = stakeStart; stakeEnd < allStakes.length; stakeEnd += 1) {
      for (let ratioStart = 0; ratioStart < allRatios.length; ratioStart += 1) {
        for (let ratioEnd = ratioStart; ratioEnd < allRatios.length; ratioEnd += 1) {
          const minimum = money(allStakes[stakeStart]! * allRatios[ratioStart]! * 20);
          const maximum = money(allStakes[stakeEnd]! * allRatios[ratioEnd]! * 20);
          if (minimum < limit.min || maximum > limit.max) continue;
          const candidate = {
            stakeValues: allStakes.slice(stakeStart, stakeEnd + 1),
            ratioValues: allRatios.slice(ratioStart, ratioEnd + 1),
            minGap: minimum - limit.min,
            maxGap: limit.max - maximum,
            combinations: (stakeEnd - stakeStart + 1) * (ratioEnd - ratioStart + 1),
          };
          if (
            !best ||
            candidate.minGap < best.minGap ||
            (candidate.minGap === best.minGap && candidate.maxGap < best.maxGap) ||
            (candidate.minGap === best.minGap &&
              candidate.maxGap === best.maxGap &&
              candidate.combinations > best.combinations)
          ) {
            best = candidate;
          }
        }
      }
    }
  }

  if (!best) return { stakeValues: allStakes, ratioValues: allRatios, stakeList: [] };
  const stakeList = Array.from(
    new Set(
      best.stakeValues.flatMap((stake) =>
        best.ratioValues.map((ratio) => money(stake * ratio * 20)),
      ),
    ),
  ).sort((left, right) => left - right);
  return {
    stakeValues: best.stakeValues,
    ratioValues: best.ratioValues,
    stakeList,
  };
}

function sourceSettingIndex(value: unknown, length: number): number {
  const index = Number(value);
  if (!Number.isInteger(index)) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function seth2SourcePlatform(
  player: { id: string; username: string; displayName: string | null; balance: number },
  machineId = 1,
  savedSettings: Record<string, unknown> | null = null,
  jackpotPools: Record<string, number> | null = null,
  bettingLimit?: Seth2SourceBettingLimit,
) {
  const betOptions = seth2SourceBetOptions(bettingLimit);
  const defaultSettings = {
    advancedSettings: {
      sounds: { background: true, backgroundVolume: 0.32, effect: true, effectVolume: 0.6 },
      notify: true,
      turbo: false,
    },
    autoPlay: {
      numberOfPlays: [10, 25, 50, 100, -1],
      stopOnWinMultiplier: 0,
      stopOnBalance: 0,
      stopOnFreeSpin: false,
      stopOnJackpot: false,
    },
    stakeIndex: 0,
    ratioIndex: 0,
  };
  const savedAdvanced = objectValue(savedSettings?.advancedSettings);
  const savedSounds = objectValue(savedAdvanced?.sounds);
  const savedAutoPlay = objectValue(savedSettings?.autoPlay);
  const mergedSettings = savedSettings
    ? {
        ...defaultSettings,
        ...savedSettings,
        advancedSettings: {
          ...defaultSettings.advancedSettings,
          ...savedAdvanced,
          sounds: {
            ...defaultSettings.advancedSettings.sounds,
            ...savedSounds,
          },
        },
        autoPlay: {
          ...defaultSettings.autoPlay,
          ...savedAutoPlay,
        },
      }
    : defaultSettings;
  const settings = {
    ...mergedSettings,
    stakeIndex: sourceSettingIndex(mergedSettings.stakeIndex, betOptions.stakeValues.length),
    ratioIndex: sourceSettingIndex(mergedSettings.ratioIndex, betOptions.ratioValues.length),
  };
  return {
    game: {
      stakeValues: betOptions.stakeValues,
      ratioValues: betOptions.ratioValues,
      stakeList: betOptions.stakeList,
      superMgRealStakeLimit: 10_000_000,
    },
    player: {
      name: player.username,
      id: player.id,
      uid: player.id,
      avatar: 0,
      avatarUrl: '',
      balance: { currency: 'POINT', amount: player.balance, gemAmount: 0, betAmount: 0 },
      settings,
      nameDisplayOn: false,
      displayName: player.displayName ?? player.username,
      displayNameBlockTime: 0,
    },
    gemSystem: null,
    table: {
      roomId: machineId,
      number: machineId,
      status: 'Full',
      detail: null,
      lock: {
        roomId: machineId,
        number: machineId,
        time: 0,
        resetDef: 0,
        expiredDef: 0,
      },
    },
    slotTablesOn: true,
    // The source framework otherwise cross-promotes Elder God Baphomet inside
    // Seth 2, including above the table selector. This product keeps only the
    // current game's own UI and artwork.
    disablePromotions: 1,
    tables: [],
    slotTableUpdated: 0,
    jackpotOn: true,
    jackpotPools,
    avatars: [],
    theme: null,
    isInstantClose: false,
    betRecordUrl: '',
    slotRankOn: false,
    tableMeta: { currentPage: 1, tablePerPage: 500, totalPages: 8, totalTableCount: 4_000 },
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
