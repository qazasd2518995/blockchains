export interface H5OriginalPaytableEntry {
  readonly sourceSymbolId: number;
  readonly payout1?: number;
  readonly payout2?: number;
  readonly payout3: number;
  readonly payout4: number;
  readonly payout5: number;
  readonly payout6?: number;
}

export interface H5OriginalFreeMode {
  readonly type: number;
  readonly spins: number;
  readonly cascadeMultipliers: readonly number[];
}

export interface H5OriginalGameSpec {
  readonly sourceMainModule: string;
  readonly sourceDetailModule?: string;
  readonly standardSymbolCount: number;
  /** Paying/special symbols that may be generated on the reels. */
  readonly generatedSymbolCount?: number;
  readonly specialSymbols: Readonly<Record<string, number>>;
  /** Values shown by the source detail prefab, before total-bet normalization. */
  readonly paytable: readonly H5OriginalPaytableEntry[];
  /**
   * Cluster awards in ascending source-symbol order. Each row is ordered as
   * 4, 5, 6, 7, 8, 9, 10-12, 13-14, 15-17, 18-20, 21-24 and 25 symbols.
   */
  readonly clusterPaytable?: readonly (readonly number[])[];
  readonly clusterMinimum?: number;
  readonly collectionThresholds?: readonly number[];
  readonly totalBetUnits: number;
  /** Maximum total-stake award advertised by the original game. */
  readonly maximumWinMultiplier?: number;
  /** Number of source Scatter symbols required to enter the free feature. */
  readonly scatterTrigger?: number;
  /** Feature-buy price rendered by the source client, in total-bet units. */
  readonly buyFeatureCostMultiplier?: number;
  /** Amount added after each successful tumble. */
  readonly cascadeMultiplierStep?: number;
  /** The tumble multiplier carries across free spins instead of resetting. */
  readonly persistentFreeCascadeMultiplier?: boolean;
  /** The source table has been verified closely enough to settle real rounds. */
  readonly settleWithSourcePaytable?: boolean;
  readonly freeModes?: readonly H5OriginalFreeMode[];
}

const BOUNTY_PAYTABLE: readonly H5OriginalPaytableEntry[] = [
  { sourceSymbolId: 1, payout3: 3, payout4: 10, payout5: 50 },
  { sourceSymbolId: 2, payout3: 4, payout4: 15, payout5: 75 },
  { sourceSymbolId: 3, payout3: 5, payout4: 20, payout5: 100 },
  { sourceSymbolId: 4, payout3: 10, payout4: 25, payout5: 200 },
  { sourceSymbolId: 5, payout3: 15, payout4: 50, payout5: 500 },
  { sourceSymbolId: 6, payout3: 20, payout4: 100, payout5: 1_000 },
  { sourceSymbolId: 7, payout3: 50, payout4: 250, payout5: 2_500 },
] as const;

/**
 * Contracts recovered directly from the active Cocos modules and prefabs.
 * These are source facts, not inferred payout tuning. The settlement engine
 * can therefore migrate one rule at a time without inventing symbol IDs or
 * silently treating special symbols as ordinary cards.
 */
export const H5_ORIGINAL_GAME_SPECS: Readonly<Record<string, H5OriginalGameSpec>> = {
  'h5-water-margin': {
    sourceMainModule: 'SHZMain',
    standardSymbolCount: 9,
    specialSymbols: { bonusDragon: 9 },
    // Read directly from shz_img_guize1. These are single-line bet
    // multipliers; the source always stakes all nine paylines (90 at the
    // default 10-per-line setting), so settlement divides them by nine.
    paytable: [
      { sourceSymbolId: 1, payout3: 2, payout4: 5, payout5: 20 },
      { sourceSymbolId: 2, payout3: 3, payout4: 10, payout5: 40 },
      { sourceSymbolId: 3, payout3: 5, payout4: 15, payout5: 60 },
      { sourceSymbolId: 4, payout3: 7, payout4: 20, payout5: 100 },
      { sourceSymbolId: 5, payout3: 10, payout4: 30, payout5: 160 },
      { sourceSymbolId: 6, payout3: 15, payout4: 40, payout5: 200 },
      { sourceSymbolId: 7, payout3: 20, payout4: 80, payout5: 400 },
      { sourceSymbolId: 8, payout3: 50, payout4: 200, payout5: 1_000 },
      { sourceSymbolId: 9, payout3: 0, payout4: 0, payout5: 2_000 },
    ],
    totalBetUnits: 9,
    settleWithSourcePaytable: true,
    // The packaged SHZ client presents the Little Mary award through its
    // existing free-game background and suppresses Dragon (id 9) while it is
    // active. The actual count is derived from each triggering line.
    freeModes: [{ type: 1, spins: 1, cascadeMultipliers: [1] }],
  },
  'h5-diamond-strike': {
    sourceMainModule: 'DiamondMain',
    standardSymbolCount: 9,
    specialSymbols: { seven: 6, scatter: 7, wild: 8, goldenSeven: 9 },
    // The packaged help page renders these values dynamically from the
    // current line bet. Values below are therefore source line-bet
    // multipliers and are normalized across the game's fixed 15 lines.
    paytable: [
      { sourceSymbolId: 1, payout3: 0.5, payout4: 1, payout5: 4 },
      { sourceSymbolId: 2, payout3: 0.5, payout4: 1, payout5: 4 },
      { sourceSymbolId: 3, payout3: 0.5, payout4: 1, payout5: 4 },
      { sourceSymbolId: 4, payout3: 0.5, payout4: 1, payout5: 4 },
      { sourceSymbolId: 5, payout3: 1, payout4: 2, payout5: 10 },
      { sourceSymbolId: 6, payout3: 1, payout4: 2, payout5: 20 },
      { sourceSymbolId: 8, payout3: 2, payout4: 6, payout5: 30 },
      { sourceSymbolId: 9, payout3: 1, payout4: 2, payout5: 20 },
    ],
    totalBetUnits: 15,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 8, cascadeMultipliers: [1] }],
  },
  'h5-yu-pu-tuan': {
    sourceMainModule: 'YPTMain',
    standardSymbolCount: 13,
    specialSymbols: {
      wild: 9,
      scatter: 10,
      dress: 11,
      shoes: 12,
      lady: 13,
    },
    // Read from slots_ptable_1. The help page is expressed in line-bet
    // multipliers and the source always stakes all 50 fixed lines. The three
    // premium symbols pay from two consecutive reels; all others start at
    // three. Wild and Scatter do not have independent line awards.
    paytable: [
      { sourceSymbolId: 1, payout3: 2.5, payout4: 5, payout5: 25 },
      { sourceSymbolId: 2, payout3: 2.5, payout4: 5, payout5: 25 },
      { sourceSymbolId: 3, payout3: 2.5, payout4: 7.5, payout5: 25 },
      { sourceSymbolId: 4, payout3: 2.5, payout4: 7.5, payout5: 25 },
      { sourceSymbolId: 5, payout3: 5, payout4: 10, payout5: 25 },
      { sourceSymbolId: 6, payout3: 5, payout4: 10, payout5: 25 },
      { sourceSymbolId: 7, payout3: 5, payout4: 12.5, payout5: 37.5 },
      { sourceSymbolId: 8, payout3: 5, payout4: 12.5, payout5: 37.5 },
      { sourceSymbolId: 11, payout2: 2.5, payout3: 7.5, payout4: 25, payout5: 37.5 },
      { sourceSymbolId: 12, payout2: 2.5, payout3: 7.5, payout4: 25, payout5: 37.5 },
      { sourceSymbolId: 13, payout2: 2.5, payout3: 7.5, payout4: 25, payout5: 50 },
    ],
    totalBetUnits: 50,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 10, cascadeMultipliers: [1] }],
  },
  'h5-fruit-little-mary': {
    sourceMainModule: 'SGXMLMain',
    standardSymbolCount: 11,
    specialSymbols: { bonus: 9, scatter: 10, wild: 11 },
    // Read directly from the packaged first help page. These are line-bet
    // multipliers and the source always stakes all nine fixed paylines.
    // Banana is the only ordinary symbol that pays from two reels. Wild has
    // no line award of its own: three/four/five consecutive Wilds start one,
    // two or three Little Mary attempts instead.
    paytable: [
      { sourceSymbolId: 1, payout2: 1, payout3: 3, payout4: 10, payout5: 75 },
      { sourceSymbolId: 2, payout3: 3, payout4: 10, payout5: 85 },
      { sourceSymbolId: 3, payout3: 15, payout4: 40, payout5: 250 },
      { sourceSymbolId: 4, payout3: 25, payout4: 50, payout5: 400 },
      { sourceSymbolId: 5, payout3: 30, payout4: 70, payout5: 550 },
      { sourceSymbolId: 6, payout3: 35, payout4: 80, payout5: 650 },
      { sourceSymbolId: 7, payout3: 45, payout4: 100, payout5: 800 },
      { sourceSymbolId: 8, payout3: 75, payout4: 175, payout5: 1_250 },
      { sourceSymbolId: 9, payout3: 25, payout4: 50, payout5: 400 },
      { sourceSymbolId: 10, payout3: 100, payout4: 200, payout5: 1_750 },
    ],
    totalBetUnits: 9,
    settleWithSourcePaytable: true,
    // The source help describes this as one free draw when BONUS occupies
    // three consecutive reels. The client accepts a server-provided counter;
    // one trigger therefore starts one draw and may retrigger the same way.
    freeModes: [{ type: 1, spins: 1, cascadeMultipliers: [1] }],
  },
  'h5-aztec-treasure': {
    sourceMainModule: 'AZTKMain',
    standardSymbolCount: 8,
    specialSymbols: { wild: 8 },
    // The packaged help orders the seven gems from most to least frequent,
    // then states that a winning line is multiplied by the separate fourth
    // reel. Every one of the five fixed lines therefore pays one line bet;
    // the visible 1x/2x/3x/5x/10x/15x reel is applied afterwards.
    paytable: Array.from({ length: 8 }, (_, index) => ({
      sourceSymbolId: index + 1,
      payout3: 1,
      payout4: 1,
      payout5: 1,
    })),
    totalBetUnits: 5,
    settleWithSourcePaytable: true,
  },
  'h5-fire-88': {
    sourceMainModule: 'Fire88Main',
    standardSymbolCount: 8,
    specialSymbols: { wild: 7, jackpot88: 8 },
    // The source rule pages print these as line-bet multipliers. Jackpot 88
    // is the bannered variant of ordinary 88 and keeps its 100x line award.
    paytable: [
      { sourceSymbolId: 1, payout3: 3, payout4: 3, payout5: 3 },
      { sourceSymbolId: 2, payout3: 6, payout4: 6, payout5: 6 },
      { sourceSymbolId: 3, payout3: 15, payout4: 15, payout5: 15 },
      { sourceSymbolId: 4, payout3: 30, payout4: 30, payout5: 30 },
      { sourceSymbolId: 5, payout3: 60, payout4: 60, payout5: 60 },
      { sourceSymbolId: 6, payout3: 100, payout4: 100, payout5: 100 },
      { sourceSymbolId: 7, payout3: 250, payout4: 250, payout5: 250 },
      { sourceSymbolId: 8, payout3: 100, payout4: 100, payout5: 100 },
    ],
    totalBetUnits: 7,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 1, cascadeMultipliers: [1] }],
  },
  'h5-lucky-777': {
    sourceMainModule: 'lucky777Main',
    standardSymbolCount: 9,
    specialSymbols: { wild: 9 },
    // The source scene prints these awards beside the reels. They are
    // single-line-bet multipliers and the source always stakes all three
    // horizontal lines. Wild substitutes for ids 1-8 but has no printed line
    // award of its own; three Wilds open the Gold Cup free-game selector.
    paytable: [
      { sourceSymbolId: 1, payout3: 0.5, payout4: 0.5, payout5: 0.5 },
      { sourceSymbolId: 2, payout3: 1, payout4: 1, payout5: 1 },
      { sourceSymbolId: 3, payout3: 3, payout4: 3, payout5: 3 },
      { sourceSymbolId: 4, payout3: 5, payout4: 5, payout5: 5 },
      { sourceSymbolId: 5, payout3: 10, payout4: 10, payout5: 10 },
      { sourceSymbolId: 6, payout3: 20, payout4: 20, payout5: 20 },
      { sourceSymbolId: 7, payout3: 50, payout4: 50, payout5: 50 },
      { sourceSymbolId: 8, payout3: 100, payout4: 100, payout5: 100 },
    ],
    totalBetUnits: 3,
    settleWithSourcePaytable: true,
    // Button custom data in slots_bg_fs_begin maps the visible choices as:
    // 28 spins (type 1), 14 spins x2 (type 2), 7 spins x4 (type 3).
    freeModes: [
      { type: 1, spins: 28, cascadeMultipliers: [1] },
      { type: 2, spins: 14, cascadeMultipliers: [2] },
      { type: 3, spins: 7, cascadeMultipliers: [4] },
    ],
  },
  'h5-nine-line-pull-king': {
    sourceMainModule: 'JXLWMain',
    standardSymbolCount: 14,
    specialSymbols: { seven: 11, jackpotChest: 12, freeDiamond: 13, bar: 14 },
    // Read directly from the packaged `rule` sprite. Values are line-bet
    // multipliers; the source stakes nine lines at once, so settlement
    // normalizes them by totalBetUnits below. Seven and chest are resolved by
    // the dedicated evaluator because their awards are random/jackpot based.
    paytable: [
      { sourceSymbolId: 1, payout3: 5, payout4: 15, payout5: 75 },
      { sourceSymbolId: 2, payout3: 6, payout4: 30, payout5: 80 },
      { sourceSymbolId: 3, payout3: 8, payout4: 35, payout5: 85 },
      { sourceSymbolId: 4, payout3: 5, payout4: 40, payout5: 90 },
      { sourceSymbolId: 5, payout3: 6, payout4: 20, payout5: 100 },
      { sourceSymbolId: 6, payout3: 8, payout4: 20, payout5: 150 },
      { sourceSymbolId: 7, payout3: 10, payout4: 20, payout5: 200 },
      { sourceSymbolId: 8, payout3: 15, payout4: 25, payout5: 250 },
      { sourceSymbolId: 9, payout3: 20, payout4: 50, payout5: 300 },
      { sourceSymbolId: 10, payout3: 50, payout4: 200, payout5: 2_000 },
      { sourceSymbolId: 13, payout3: 9, payout4: 18, payout5: 36 },
      { sourceSymbolId: 14, payout2: 5, payout3: 100, payout4: 900, payout5: 6_000 },
    ],
    totalBetUnits: 9,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 20, cascadeMultipliers: [1] }],
  },
  'h5-fortune-ox': {
    sourceMainModule: 'fortuneoxMain',
    sourceDetailModule: 'fortuneoxDetail',
    standardSymbolCount: 6,
    generatedSymbolCount: 7,
    specialSymbols: { wild: 7, blank: 8 },
    paytable: [
      { sourceSymbolId: 1, payout3: 3, payout4: 3, payout5: 3 },
      { sourceSymbolId: 2, payout3: 5, payout4: 5, payout5: 5 },
      { sourceSymbolId: 3, payout3: 10, payout4: 10, payout5: 10 },
      { sourceSymbolId: 4, payout3: 20, payout4: 20, payout5: 20 },
      { sourceSymbolId: 5, payout3: 50, payout4: 50, payout5: 50 },
      { sourceSymbolId: 6, payout3: 100, payout4: 100, payout5: 100 },
      { sourceSymbolId: 7, payout3: 200, payout4: 200, payout5: 200 },
    ],
    totalBetUnits: 10,
    settleWithSourcePaytable: true,
  },
  'h5-fortune-gems': {
    sourceMainModule: 'fortunegemsMain',
    // The packaged scene wires rolePb 001-008 to the three main reels and
    // 009-014 to the separate multiplier reel. Prefab 008 contains the
    // source wild_02 animation, so it must remain in the generated pool.
    standardSymbolCount: 8,
    generatedSymbolCount: 8,
    specialSymbols: { wild: 8, multiplierStart: 9, multiplierEnd: 14 },
    // Source line-bet awards (J/Q/K/A/green/blue/red/Wild). The game always
    // stakes all five fixed lines, and the centre multiplier reel applies to
    // the sum of every winning line. Five Wild lines at 15x therefore reach
    // the documented 375x maximum: (25 / 5) * 5 * 15.
    paytable: [
      { sourceSymbolId: 1, payout3: 2, payout4: 2, payout5: 2 },
      { sourceSymbolId: 2, payout3: 5, payout4: 5, payout5: 5 },
      { sourceSymbolId: 3, payout3: 8, payout4: 8, payout5: 8 },
      { sourceSymbolId: 4, payout3: 10, payout4: 10, payout5: 10 },
      { sourceSymbolId: 5, payout3: 12, payout4: 12, payout5: 12 },
      { sourceSymbolId: 6, payout3: 15, payout4: 15, payout5: 15 },
      { sourceSymbolId: 7, payout3: 20, payout4: 20, payout5: 20 },
      { sourceSymbolId: 8, payout3: 25, payout4: 25, payout5: 25 },
    ],
    totalBetUnits: 5,
    settleWithSourcePaytable: true,
  },
  'h5-mahjong-ways': {
    sourceMainModule: 'majianghulePGMain',
    sourceDetailModule: 'majianghulePGDetail',
    standardSymbolCount: 8,
    specialSymbols: { scatter: 9, wild: 10 },
    paytable: [
      { sourceSymbolId: 1, payout3: 2, payout4: 5, payout5: 10 },
      { sourceSymbolId: 2, payout3: 2, payout4: 5, payout5: 10 },
      { sourceSymbolId: 3, payout3: 4, payout4: 10, payout5: 20 },
      { sourceSymbolId: 4, payout3: 4, payout4: 10, payout5: 20 },
      { sourceSymbolId: 5, payout3: 6, payout4: 15, payout5: 40 },
      { sourceSymbolId: 6, payout3: 8, payout4: 20, payout5: 60 },
      { sourceSymbolId: 7, payout3: 10, payout4: 40, payout5: 80 },
      { sourceSymbolId: 8, payout3: 15, payout4: 60, payout5: 100 },
    ],
    totalBetUnits: 20,
    settleWithSourcePaytable: true,
  },
  'h5-mahjong-ways-2': {
    sourceMainModule: 'majianghule2PGMain',
    sourceDetailModule: 'majianghule2PGDetail',
    standardSymbolCount: 9,
    specialSymbols: { scatter: 10, wild: 11, blank: 12 },
    paytable: [
      { sourceSymbolId: 1, payout3: 1, payout4: 3, payout5: 6 },
      { sourceSymbolId: 2, payout3: 1, payout4: 3, payout5: 6 },
      { sourceSymbolId: 3, payout3: 2, payout4: 4, payout5: 10 },
      { sourceSymbolId: 4, payout3: 3, payout4: 5, payout5: 12 },
      { sourceSymbolId: 5, payout3: 3, payout4: 5, payout5: 12 },
      { sourceSymbolId: 6, payout3: 5, payout4: 10, payout5: 15 },
      { sourceSymbolId: 7, payout3: 6, payout4: 15, payout5: 30 },
      { sourceSymbolId: 8, payout3: 8, payout4: 20, payout5: 40 },
      { sourceSymbolId: 9, payout3: 10, payout4: 25, payout5: 50 },
    ],
    totalBetUnits: 20,
    settleWithSourcePaytable: true,
  },
  'h5-dragon-hatch': {
    sourceMainModule: 'dragonhatchMain',
    sourceDetailModule: 'dragonhatchDetail',
    standardSymbolCount: 8,
    generatedSymbolCount: 9,
    specialSymbols: { wild: 9, feature: 10 },
    // The packaged Detail component is a stale three/four/five-column table,
    // but the original PG Soft rule sheet and the source `wp`/`sc` protocol
    // define a connected 5x5 Cluster Pays game. Values below are ordered from
    // the four low suits through Earth/Water/Fire/Dragon Eye.
    paytable: [],
    clusterPaytable: [
      [0, 0, 4, 6, 8, 10, 15, 20, 40, 100, 200, 300],
      [0, 0, 6, 10, 15, 20, 30, 40, 60, 200, 300, 400],
      [0, 0, 9, 15, 20, 30, 40, 50, 80, 300, 400, 500],
      [0, 0, 15, 20, 30, 40, 50, 60, 100, 500, 600, 600],
      [10, 15, 30, 60, 70, 80, 100, 300, 400, 600, 800, 800],
      [15, 20, 40, 70, 80, 100, 200, 400, 500, 800, 1_000, 1_000],
      [20, 30, 50, 80, 100, 200, 300, 600, 800, 1_000, 2_000, 5_000],
      [30, 40, 70, 100, 200, 300, 500, 1_000, 2_000, 5_000, 10_000, 20_000],
    ],
    clusterMinimum: 4,
    collectionThresholds: [10, 30, 50, 70],
    totalBetUnits: 10,
    settleWithSourcePaytable: true,
  },
  'h5-captains-bounty': {
    sourceMainModule: 'captainsbountyMain',
    sourceDetailModule: 'captainsbountyDetail',
    standardSymbolCount: 7,
    specialSymbols: { scatter: 8, wild: 9 },
    paytable: BOUNTY_PAYTABLE,
    totalBetUnits: 20,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 10, cascadeMultipliers: [3, 6, 9, 15] }],
  },
  'h5-queen-of-bounty': {
    sourceMainModule: 'queenbountyMain',
    sourceDetailModule: 'queenbountyDetail',
    standardSymbolCount: 7,
    specialSymbols: { scatter: 8, wild: 9 },
    paytable: BOUNTY_PAYTABLE,
    totalBetUnits: 20,
    settleWithSourcePaytable: true,
    freeModes: [
      { type: 1, spins: 20, cascadeMultipliers: [1, 2, 3, 5] },
      { type: 2, spins: 10, cascadeMultipliers: [3, 6, 9, 20] },
      { type: 3, spins: 5, cascadeMultipliers: [6, 12, 18, 40] },
    ],
  },
  'h5-caishen-wins': {
    sourceMainModule: 'caishenwinsMain',
    sourceDetailModule: 'caishenwinsDetail',
    standardSymbolCount: 7,
    specialSymbols: { successCaishen: 10, wild: 11, scatter: 12, blank: 13 },
    paytable: [
      { sourceSymbolId: 1, payout3: 5, payout4: 8, payout5: 40 },
      { sourceSymbolId: 2, payout3: 5, payout4: 8, payout5: 50 },
      { sourceSymbolId: 3, payout3: 6, payout4: 10, payout5: 60 },
      { sourceSymbolId: 4, payout3: 8, payout4: 20, payout5: 80 },
      { sourceSymbolId: 5, payout3: 10, payout4: 30, payout5: 100 },
      { sourceSymbolId: 6, payout3: 30, payout4: 60, payout5: 300 },
      { sourceSymbolId: 7, payout3: 100, payout4: 300, payout5: 1_000 },
    ],
    totalBetUnits: 20,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 8, cascadeMultipliers: [8, 8, 8, 8] }],
  },
  'h5-caishen-fa-fa-fa': {
    sourceMainModule: 'caishenfafafaBMain',
    standardSymbolCount: 11,
    generatedSymbolCount: 11,
    specialSymbols: { scatter: 9, blueWild: 10, redWild: 11 },
    // Read directly from the five packaged help pages. Values are expressed
    // against one line bet; the source always stakes all nine fixed lines.
    // Scatter has no line award, while either colour of Fa Wild substitutes
    // ordinary ids 1-8 but never the other Wild colour or Scatter.
    paytable: [
      { sourceSymbolId: 1, payout3: 2, payout4: 5, payout5: 20 },
      { sourceSymbolId: 2, payout3: 3, payout4: 10, payout5: 40 },
      { sourceSymbolId: 3, payout3: 5, payout4: 15, payout5: 60 },
      { sourceSymbolId: 4, payout3: 7, payout4: 20, payout5: 100 },
      { sourceSymbolId: 5, payout3: 10, payout4: 30, payout5: 160 },
      { sourceSymbolId: 6, payout3: 15, payout4: 40, payout5: 200 },
      { sourceSymbolId: 7, payout3: 20, payout4: 80, payout5: 400 },
      { sourceSymbolId: 8, payout3: 50, payout4: 200, payout5: 1_000 },
      { sourceSymbolId: 10, payout3: 0, payout4: 0, payout5: 5_000 },
      { sourceSymbolId: 11, payout3: 0, payout4: 0, payout5: 5_000 },
    ],
    totalBetUnits: 9,
    settleWithSourcePaytable: true,
    // Three, four and five Scatter symbols award 10, 20 and 50 free games.
    freeModes: [
      { type: 3, spins: 10, cascadeMultipliers: [1] },
      { type: 4, spins: 20, cascadeMultipliers: [1] },
      { type: 5, spins: 50, cascadeMultipliers: [1] },
    ],
  },
  'h5-flying-together': {
    sourceMainModule: 'biyishuangfeiMain',
    standardSymbolCount: 13,
    generatedSymbolCount: 13,
    specialSymbols: { wild: 13 },
    // Read from the packaged bysf_pic_1 paytable. Values are line-bet
    // multipliers; the second help page states that the 243-ways game is
    // entered with a 25-line stake. The logo Wild has no independent award
    // and is restricted to reels 2-4.
    paytable: [
      { sourceSymbolId: 1, payout3: 3, payout4: 15, payout5: 40 },
      { sourceSymbolId: 2, payout3: 3, payout4: 15, payout5: 40 },
      { sourceSymbolId: 3, payout3: 3, payout4: 15, payout5: 40 },
      { sourceSymbolId: 4, payout3: 3, payout4: 15, payout5: 40 },
      { sourceSymbolId: 5, payout3: 3, payout4: 15, payout5: 40 },
      { sourceSymbolId: 6, payout3: 10, payout4: 75, payout5: 250 },
      { sourceSymbolId: 7, payout3: 10, payout4: 75, payout5: 250 },
      { sourceSymbolId: 8, payout3: 10, payout4: 75, payout5: 250 },
      { sourceSymbolId: 9, payout3: 20, payout4: 100, payout5: 400 },
      { sourceSymbolId: 10, payout3: 30, payout4: 150, payout5: 600 },
      { sourceSymbolId: 11, payout3: 40, payout4: 200, payout5: 800 },
      { sourceSymbolId: 12, payout3: 50, payout4: 400, payout5: 2_000 },
    ],
    totalBetUnits: 25,
    settleWithSourcePaytable: true,
  },
  'h5-star-97': {
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
    // Recovered from all four packaged help pages. The source stakes eight
    // fixed lines on its 3x3 board. Cherry is the only symbol that pays with
    // fewer than three occurrences on a line; mixed BAR combinations are
    // handled by the dedicated evaluator rather than represented as a reel
    // symbol that does not exist in the source prefab.
    paytable: [
      { sourceSymbolId: 1, payout1: 2, payout2: 5, payout3: 10, payout4: 10, payout5: 10 },
      { sourceSymbolId: 2, payout3: 10, payout4: 10, payout5: 10 },
      { sourceSymbolId: 3, payout3: 14, payout4: 14, payout5: 14 },
      { sourceSymbolId: 4, payout3: 18, payout4: 18, payout5: 18 },
      { sourceSymbolId: 5, payout3: 20, payout4: 20, payout5: 20 },
      { sourceSymbolId: 6, payout3: 30, payout4: 30, payout5: 30 },
      { sourceSymbolId: 7, payout3: 50, payout4: 50, payout5: 50 },
      { sourceSymbolId: 8, payout3: 70, payout4: 70, payout5: 70 },
      { sourceSymbolId: 9, payout3: 80, payout4: 80, payout5: 80 },
    ],
    totalBetUnits: 8,
    settleWithSourcePaytable: true,
  },
  'h5-golden-empire': {
    sourceMainModule: 'goldenempireMain',
    standardSymbolCount: 10,
    specialSymbols: { scatter: 11, wild: 12 },
    // The source prefabs are numbered 001-012: ten paying symbols followed by
    // Scatter and Wild. The game's published table is expressed directly as
    // total-bet Ways multipliers for 3/4/5/6 adjacent reels. Source symbol ids
    // progress from the two 0.05x low cards to the 0.5x premium character.
    paytable: [
      { sourceSymbolId: 1, payout3: 0.05, payout4: 0.1, payout5: 0.15, payout6: 0.2 },
      { sourceSymbolId: 2, payout3: 0.05, payout4: 0.1, payout5: 0.15, payout6: 0.2 },
      { sourceSymbolId: 3, payout3: 0.1, payout4: 0.2, payout5: 0.3, payout6: 0.4 },
      { sourceSymbolId: 4, payout3: 0.1, payout4: 0.2, payout5: 0.3, payout6: 0.4 },
      { sourceSymbolId: 5, payout3: 0.15, payout4: 0.3, payout5: 0.45, payout6: 0.6 },
      { sourceSymbolId: 6, payout3: 0.2, payout4: 0.4, payout5: 0.6, payout6: 0.8 },
      { sourceSymbolId: 7, payout3: 0.25, payout4: 0.5, payout5: 0.75, payout6: 1 },
      { sourceSymbolId: 8, payout3: 0.3, payout4: 0.6, payout5: 0.9, payout6: 1.2 },
      { sourceSymbolId: 9, payout3: 0.4, payout4: 0.8, payout5: 1.2, payout6: 1.6 },
      { sourceSymbolId: 10, payout3: 0.5, payout4: 1, payout5: 1.5, payout6: 2 },
    ],
    totalBetUnits: 1,
    maximumWinMultiplier: 2_000,
    settleWithSourcePaytable: true,
    freeModes: [{ type: 1, spins: 8, cascadeMultipliers: [1] }],
  },
  'h5-gates-of-olympus': {
    sourceMainModule: 'gatesofolympushbMain',
    standardSymbolCount: 9,
    specialSymbols: { scatter: 10 },
    // The active scene owns prefabs 001-009 plus thor_scatter as prefab 010.
    // Its loading copy says 3+ Scatter awards ten free spins, the buy dialog
    // renders 75 * betSum, and gm/tgm form a +1 tumble ladder that persists
    // during the free feature. There is no multiplier-ball prefab in rolePb.
    paytable: [],
    totalBetUnits: 1,
    scatterTrigger: 3,
    buyFeatureCostMultiplier: 75,
    cascadeMultiplierStep: 1,
    persistentFreeCascadeMultiplier: true,
    freeModes: [{ type: 1, spins: 10, cascadeMultipliers: [1] }],
  },
};

export function getH5OriginalGameSpec(gameId?: string): H5OriginalGameSpec | undefined {
  return gameId ? H5_ORIGINAL_GAME_SPECS[gameId] : undefined;
}
