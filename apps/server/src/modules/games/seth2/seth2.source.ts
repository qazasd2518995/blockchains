import type { Seth2ReturnData, Seth2Cell } from '@bg/shared';

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
  if (value >= 200) return 13;
  if (value >= 50) return 12;
  if (value >= 10) return 11;
  return 10;
}

function sourceSymbol(cell: Seth2Cell): number {
  return cell.type === 10 ? multiplierSymbol(cell.mul) : cell.type;
}

function sourceView(board: Seth2Cell[]): number[][] {
  return Array.from({ length: 5 }, (_, row) =>
    board.slice(row * 6, row * 6 + 6).map(sourceSymbol),
  );
}

function timesSymbols(board: Seth2Cell[], lockCount: number): SourceTimesSymbol[] {
  return board.flatMap((cell, symbolPos) =>
    cell.type === 10
      ? [
          {
            isRare: Number(cell.mul_type ?? 0) === 0,
            lock: lockCount > 0 ? lockCount : 0,
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
): BoardTransition {
  const removed = new Set(removeTypes);
  const next = Array<Seth2Cell>(30);
  const posTransform: Array<{ beforePos: number; afterPos: number }> = [];
  const beforeToAfter = new Map<number, number>();
  const newPositions = new Set<number>();
  let refillCursor = 0;

  for (let column = 0; column < 6; column += 1) {
    const survivors: Array<{ cell: Seth2Cell; beforePos: number }> = [];
    for (let row = 0; row < 5; row += 1) {
      const beforePos = row * 6 + column;
      const cell = board[beforePos]!;
      if (!removed.has(cell.type)) survivors.push({ cell, beforePos });
    }
    const missing = 5 - survivors.length;
    for (let row = 0; row < missing; row += 1) {
      const afterPos = row * 6 + column;
      next[afterPos] = refill[refillCursor++] ?? { type: ((afterPos + column) % 9) + 1, mul: 0 };
      newPositions.add(afterPos);
    }
    survivors.forEach((survivor, index) => {
      const afterPos = (missing + index) * 6 + column;
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

function upgradeList(
  data: Seth2ReturnData,
  roundIndex: number,
  transition: BoardTransition | null,
) {
  return data.list[roundIndex]!.upgrade_mul_list.flatMap((upgrade) => {
    const beforePos = Number(upgrade.code);
    if (!Number.isInteger(beforePos) || beforePos < 0) return [];
    const symbolPos = transition?.beforeToAfter.get(beforePos) ?? beforePos;
    return [
      {
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
  upgrades: Seth2ReturnData['list'][number]['upgrade_mul_list'],
  transition: BoardTransition,
) {
  for (const upgrade of upgrades) {
    const beforePosition = Number(upgrade.code);
    if (!Number.isInteger(beforePosition) || beforePosition < 0) continue;
    const position = transition.beforeToAfter.get(beforePosition) ?? beforePosition;
    if (position >= board.length) continue;
    const cell = board[position];
    if (cell?.type === 10) board[position] = { ...cell, mul: upgrade.new_mul, mul_type: 1 };
  }
}

function splitList(data: Seth2ReturnData, transition: BoardTransition | null) {
  const source = data.type17_beishu;
  if (!source || data.type17_mul_list.length === 0) return [];
  const from = Number(source.code);
  const candidatePositions = transition
    ? [...transition.newPositions].filter((position) => {
        const cell = transition.board[position];
        return cell?.type === 10 && cell.mul === source.mul;
      })
    : [];
  return [{ from, to: candidatePositions.slice(0, data.type17_mul_list.length) }];
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
  let roundWinnings = 0;

  for (let roundIndex = 0; roundIndex < data.list.length; roundIndex += 1) {
    const round = data.list[roundIndex]!;
    if (round.start_data.length === 30) board = round.start_data.map((cell) => ({ ...cell }));
    roundWinnings = money(roundWinnings + round.score * Math.max(1, round.total_mul || 1));
    const currentTimes = timesSymbols(board, data.type18_mul_count);
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
      : collapseBoard(board, round.remove_type, round.round_data);
    const upgrades = upgradeList(data, roundIndex, transition);
    states.push({
      view: sourceView(board),
      spinId: options.spinId,
      roundWinnings: money(roundWinnings),
      maleTotemLevel: data.type17_mul_list.length > 0 ? 2 : 0,
      totalWinnings: money(options.featureWinningsBefore + roundWinnings),
      totalViews: 0,
      action: options.action,
      startFreeGame: data.is_sjc === 1,
      currentTimes: data.multiplierBankBefore + data.multiplierBankAdded || -1,
      currentView: states.length,
      splitList: splitList(data, transition),
      newTimesSymbols: currentTimes.filter((entry) =>
        transitionFromPrevious ? transitionFromPrevious.newPositions.has(entry.symbolPos) : true,
      ),
      timesUpgrade: upgrades,
      timesSymbols: currentTimes,
      isJp: data.JPtype ? String(data.JPtype) : '',
      noWinReward: 0,
      winSymbols: isFeatureEntry ? [] : sourceWinSymbols(board, round.remove_type, round.scoreList),
      // Falling is part of the current winning view.  The following state only
      // supplies the freshly entered symbols after this transform completes.
      posTransform: transition.posTransform,
      superMainGameCount: options.action === 'superSpin' ? 1 : 0,
      femaleTotemLevel: data.type18_start_mul_list.length > 0 ? 2 : 0,
      freeGameCount: options.freeGameCount,
      isGoldenFg: options.isGoldenFg,
      totalStake: options.totalStake,
    });
    applyUpgrades(transition.board, round.upgrade_mul_list, transition);
    board = transition.board;
    transitionFromPrevious = transition;
  }

  // A losing result is already complete in its first view.  Only append a
  // post-collapse view when the previous state actually removed symbols;
  // otherwise the client interprets the duplicate board as a second spin.
  if (states.at(-1)?.winSymbols.length) {
    const finalTimes = timesSymbols(board, data.type18_mul_count);
    states.push({
      view: sourceView(board),
      spinId: options.spinId,
      roundWinnings: money(data.total_gold),
      maleTotemLevel: 0,
      totalWinnings: money(options.featureWinningsBefore + data.total_gold),
      totalViews: 0,
      action: options.action,
      startFreeGame: data.is_sjc === 1,
      currentTimes: data.multiplierBankAfter || -1,
      currentView: states.length,
      splitList: [],
      newTimesSymbols: finalTimes.filter((entry) =>
        transitionFromPrevious ? transitionFromPrevious.newPositions.has(entry.symbolPos) : true,
      ),
      timesUpgrade: [],
      timesSymbols: finalTimes,
      isJp: data.JPtype ? String(data.JPtype) : '',
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

export function seth2SourcePlatform(
  player: { id: string; username: string; displayName: string | null; balance: number },
  machineId = 1,
) {
  return {
    game: {
      stakeValues: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      ratioValues: [0.1, 0.2, 0.4, 1, 3, 4, 5, 6, 7, 8, 10, 15],
      stakeList: [],
      superMgRealStakeLimit: 10_000_000,
    },
    player: {
      name: player.username,
      id: player.id,
      uid: player.id,
      avatar: 0,
      avatarUrl: '',
      balance: { currency: 'POINT', amount: player.balance, gemAmount: 0, betAmount: 0 },
      settings: {
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
      },
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
      lock: { roomId: 0, number: 0, time: 0, resetDef: 0, expiredDef: 0 },
    },
    slotTablesOn: true,
    tables: [],
    slotTableUpdated: 0,
    jackpotOn: true,
    avatars: [],
    theme: null,
    isInstantClose: false,
    betRecordUrl: '',
    slotRankOn: false,
    tableMeta: { currentPage: 1, tablePerPage: 500, totalPages: 8, totalTableCount: 4_000 },
  };
}
