export const HOTLINE_JACKPOT_RESET_VALUE = '1000';

export const HOTLINE_JACKPOT_SIMULATION_EPOCH = '2026-01-01T00:00:00.000Z';

export const HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND = {
  grand: '42',
  major: '28',
  minor: '7.5',
  mini: '2.2',
} as const;

export const HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS = {
  grand: '21600',
  major: '7200',
  minor: '2700',
  mini: '900',
} as const;

export const HOTLINE_JACKPOT_RESET_OFFSET_SECONDS = {
  grand: '1370',
  major: '611',
  minor: '233',
  mini: '97',
} as const;

export interface HotlineBetRequest {
  amount: number;
  clientSeed?: string;
  gameId?: string;
  buyFeature?: boolean;
}

export interface HotlineJackpotSnapshot {
  gameId: string;
  grand: string;
  major: string;
  minor: string;
  mini: string;
  updatedAt: string;
  asOf?: string;
}

export interface HotlineWinLine {
  lineId?: string;
  lineIndex?: number;
  path?: number[];
  positions?: HotlineWinPosition[];
  startReel?: number;
  direction?: 'ltr' | 'rtl';
  row: number;
  symbol: number;
  count: number;
  payout: number;
  ways?: number;
  jackpotShare?: number;
}

export interface HotlineWinPosition {
  reel: number;
  row: number;
}

export interface HotlineCascadeStep {
  index: number;
  grid: number[][];
  lines: HotlineWinLine[];
  multiplier: number;
  removed: HotlineWinPosition[];
  goldPositions?: HotlineWinPosition[];
  sourceAction?: HotlineCascadeSourceAction;
  sourceGrid?: number[][];
  collectedSymbols?: number;
  collectedThisStep?: number;
  sourceStacks?: HotlineSourceStack[];
  sourceAppliedMultiplier?: number;
}

export interface HotlineSourceStack {
  id: number;
  symbol: number;
  positions: HotlineWinPosition[];
  state: 'ordinary' | 'gold' | 'wild';
  remaining?: number;
}

export interface HotlineCascadeSourceAction {
  type: 'dragon-earth' | 'dragon-water' | 'dragon-fire' | 'dragon-queen';
  positions: HotlineWinPosition[];
  symbol?: number;
}

export interface HotlineSpecialSymbol extends HotlineWinPosition {
  type: 'scatter' | 'multiplier';
  value?: number;
}

export interface HotlineFreeSpinRound {
  index: number;
  initialGrid: number[][];
  finalGrid: number[][];
  cascades: HotlineCascadeStep[];
  lines: HotlineWinLine[];
  baseMultiplier: number;
  scatterSymbols: HotlineSpecialSymbol[];
  multiplierSymbols: HotlineSpecialSymbol[];
  multiplierTotal: number;
  appliedMultiplier: number;
  sourceMultiplierBank?: number;
  totalMultiplier: number;
  extraFreeSpinsAwarded: number;
  sourceJackpot?: HotlineSourceJackpotResult;
  sourceMiniGame?: HotlineFruitLittleMaryMiniGameResult;
  sourceFeature?: HotlineSourceFeatureResult;
  finalGoldPositions?: HotlineWinPosition[];
  finalSourceStacks?: HotlineSourceStack[];
}

export type HotlineSourceJackpotResult =
  | {
      type: 'diamond-strike-jackpot';
      tierMultiplier: 10 | 30 | 100 | 1000;
      picks: number[];
      payoutMultiplier: number;
    }
  | {
      type: 'fruit-little-mary-jackpot';
      positions: HotlineWinPosition[];
      payoutMultiplier: number;
    }
  | {
      type: 'fire-88-jackpot';
      tierMultiplier: 38 | 88 | 888;
      picks: number[];
      payoutMultiplier: number;
    };

export interface HotlineFruitLittleMaryMiniRound {
  reelSymbols: number[];
  stopIndex: number;
  lineBetMultiplier: number;
}

export interface HotlineFruitLittleMaryMiniGameResult {
  type: 'fruit-little-mary';
  attempts: number;
  rounds: HotlineFruitLittleMaryMiniRound[];
  lineBetMultiplier: number;
  payoutMultiplier: number;
}

export interface HotlineMegaFeatureResult {
  scatterSymbols: HotlineSpecialSymbol[];
  scatterCount: number;
  freeSpinsAwarded: number;
  freeSpinsPlayed: number;
  baseWinMultiplier: number;
  baseMultiplierSymbols: HotlineSpecialSymbol[];
  baseMultiplierTotal: number;
  baseAppliedMultiplier: number;
  baseTotalMultiplier: number;
  freeSpinRounds: HotlineFreeSpinRound[];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
  totalMultiplier: number;
  sourceFreeModeType?: number;
  sourceFreeWinMultiplier?: number;
  sourceJackpot?: HotlineSourceJackpotResult;
  sourceMiniGame?: HotlineFruitLittleMaryMiniGameResult;
}

export type HotlineSourceFeatureResult =
  | {
      type: 'fortune-ox-respin';
      triggered: boolean;
      respins: number;
      fullScreenMultiplier: number;
    }
  | {
      type: 'fortune-gems-multiplier';
      multiplierIndex: number;
      multiplier: number;
      enhancedBet: boolean;
      winEx: boolean;
    }
  | {
      type: 'aztec-gems-multiplier';
      multiplierIndex: number;
      multiplier: 1 | 2 | 3 | 5 | 10 | 15;
    }
  | {
      type: 'star-97-seven-multiplier';
      sevenCount: number;
      multiplier: number;
    };

export interface HotlineBetResult {
  betId: string;
  grid: number[][];
  lines: HotlineWinLine[];
  cascades?: HotlineCascadeStep[];
  finalGoldPositions?: HotlineWinPosition[];
  finalSourceStacks?: HotlineSourceStack[];
  features?: HotlineMegaFeatureResult;
  sourceFeature?: HotlineSourceFeatureResult;
  enhancedBet?: boolean;
  buyFeature?: boolean;
  baseAmount?: string;
  stakeAmount?: string;
  multiplier: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  /** The feature payout remains pending until the source finishes its free-game animation. */
  payoutDeferred?: boolean;
  jackpot?: HotlineJackpotSnapshot;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
  /** The paid trigger is stored server-side until the source selector replies. */
  requiresFreeModeSelection?: boolean;
  /** Response contains only the already-selected free-game continuation. */
  freeModeContinuation?: boolean;
  /** Caishen's trigger is waiting for collect or a free-game gamble. */
  requiresCaishenFreeDecision?: boolean;
  /** Response contains Caishen free rounds settled after the source decision. */
  caishenFreeContinuation?: boolean;
}
