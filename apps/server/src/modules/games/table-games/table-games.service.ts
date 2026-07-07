import { PrismaClient, Prisma } from '@prisma/client';
import { hmacIntStream } from '@bg/provably-fair';
import {
  BLACK_DOT_GAME_IDS,
  GameId,
  LOCAL_TABLE_GAME_IDS,
  TUI_TONGZI_GAME_IDS,
  TWENTY_ONE_HALF_GAME_IDS,
  type LocalTableBetResult,
  type LocalTableCard,
  type LocalTableDominoTile,
  type LocalTableGameIdType,
  type LocalTableHand,
  type LocalTableKind,
  type LocalTableOutcome,
  type LocalTablePiece,
  type LocalTableRoundStage,
  type LocalTableRoundState,
  type LocalTableSplitOption,
  type LocalTableTubeTile,
  type TwentyOneHalfRoundState,
} from '@bg/shared';
import {
  SeedHelper,
  type ActiveSeedBundle,
  lockUserAndCheckFunds,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type {
  LocalTableBetInput,
  StagedTableActionInput,
  StagedTableSplitInput,
  StagedTableStartInput,
  TwentyOneHalfActionInput,
  TwentyOneHalfStartInput,
} from './table-games.schema.js';

type IntStream = Generator<number, any, unknown>;

interface SeedBundle {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

interface RoomConfig {
  gameId: LocalTableGameIdType;
  kind: LocalTableKind;
  roomName: string;
  ruleSummary: string[];
}

interface RoundDraft {
  gameId: LocalTableGameIdType;
  kind: LocalTableKind;
  roomName: string;
  outcome: LocalTableOutcome;
  outcomeLabel: string;
  multiplier: Prisma.Decimal;
  payout: Prisma.Decimal;
  profit: Prisma.Decimal;
  player: LocalTableHand;
  banker: LocalTableHand;
  extraHands?: LocalTableHand[];
  summary: string;
  ruleSummary: string[];
  raw?: unknown;
}

type TwentyOneHalfStoredStatus = 'ACTIVE' | 'SETTLED';
type TwentyOneHalfStoredPhase = 'PLAYER_TURN' | 'BANKER_TURN';
type StagedLocalTableKind = Exclude<LocalTableKind, 'twenty-one-half'>;
type StagedLocalTableStatus = 'ACTIVE' | 'SETTLED';

interface TwentyOneHalfStoredData {
  kind: 'twenty-one-half';
  status: TwentyOneHalfStoredStatus;
  phase?: TwentyOneHalfStoredPhase;
  gameId: LocalTableGameIdType;
  roomName: string;
  player: CardInternal[];
  banker: CardInternal[];
  deck: CardInternal[];
  deckIndex: number;
  outcome?: LocalTableOutcome | null;
  outcomeLabel?: string | null;
  multiplier?: string | null;
  payout?: string | null;
  profit?: string | null;
  summary?: string | null;
  controlled?: boolean;
  flipReason?: string | null;
  natural?: StoredRoundResult | null;
  control?: StoredControlOutcome | null;
  runControls?: boolean;
  raw?: unknown;
}

interface StoredRoundResult {
  gameId: LocalTableGameIdType;
  kind: LocalTableKind;
  roomName: string;
  outcome: LocalTableOutcome;
  outcomeLabel: string;
  multiplier: string;
  payout: string;
  profit: string;
  player: LocalTableHand;
  banker: LocalTableHand;
  extraHands?: LocalTableHand[] | null;
  summary: string;
  ruleSummary: string[];
  raw?: unknown;
}

interface StoredControlOutcome {
  won: boolean;
  multiplier: string;
  payout: string;
  controlled: boolean;
  flipReason?: string;
  controlId?: string;
  minMultiplier?: string;
  maxMultiplier?: string;
  maxPayout?: string;
  gameMatchedPayoutOnly?: boolean;
  burstCooldownRounds?: number;
}

interface StagedLocalTableStoredData {
  kind: StagedLocalTableKind;
  status: StagedLocalTableStatus;
  stage: LocalTableRoundStage;
  gameId: LocalTableGameIdType;
  roomName: string;
  natural?: StoredRoundResult | null;
  final?: StoredRoundResult | null;
  control?: StoredControlOutcome | null;
  runControls?: boolean;
  playerTiles?: DominoTileInternal[];
  deck?: DominoTileInternal[];
  deckIndex?: number;
  playerSplitId?: string | null;
  revealedPlayerIndexes?: number[];
  summary?: string | null;
}

interface RankedHand {
  category: number;
  rank: number;
  subRank?: number;
  label: string;
  scoreLabel: string;
  detail?: string;
}

interface CardInternal extends LocalTableCard {
  rankValue: number;
}

interface TubeTileInternal extends LocalTableTubeTile {
  rankValue: number;
}

interface DominoTileInternal extends LocalTableDominoTile {
  pairKey: string;
  pairRank: number;
}

const LOCAL_TABLE_GAME_ID_SET = new Set<string>(LOCAL_TABLE_GAME_IDS);
const TWENTY_ONE_HALF_ID_SET = new Set<string>(TWENTY_ONE_HALF_GAME_IDS);
const TUI_TONGZI_ID_SET = new Set<string>(TUI_TONGZI_GAME_IDS);
const BLACK_DOT_ID_SET = new Set<string>(BLACK_DOT_GAME_IDS);
const STAGED_LOCAL_TABLE_GAME_IDS = [
  ...TUI_TONGZI_GAME_IDS,
  ...BLACK_DOT_GAME_IDS,
  GameId.CARD_WAR,
] as const;
const STAGED_LOCAL_TABLE_ID_SET = new Set<string>(STAGED_LOCAL_TABLE_GAME_IDS);

const ROOM_CONFIGS: Record<LocalTableGameIdType, RoomConfig> = {
  [GameId.TWENTY_ONE_HALF_DOLL]: {
    gameId: GameId.TWENTY_ONE_HALF_DOLL,
    kind: 'twenty-one-half',
    roomName: '萌娃十點半',
    ruleSummary: [
      'A=1，2-10 照點，J/Q/K=0.5。',
      '閒家與莊家接近 10.5 且不爆者勝，平點莊家勝。',
      '閒家未爆後，莊家補到大於閒家或爆牌為止。',
    ],
  },
  [GameId.TWENTY_ONE_HALF_BUNNY]: {
    gameId: GameId.TWENTY_ONE_HALF_BUNNY,
    kind: 'twenty-one-half',
    roomName: '兔糖十點半',
    ruleSummary: [
      'A=1，2-10 照點，J/Q/K=0.5。',
      '閒家與莊家接近 10.5 且不爆者勝，平點莊家勝。',
      '滿點 10.5 或五張未爆標記為特別勝局。',
    ],
  },
  [GameId.TWENTY_ONE_HALF_STAR]: {
    gameId: GameId.TWENTY_ONE_HALF_STAR,
    kind: 'twenty-one-half',
    roomName: '星願十點半',
    ruleSummary: [
      'A=1，2-10 照點，J/Q/K=0.5。',
      '閒家與莊家接近 10.5 且不爆者勝，平點莊家勝。',
      '閒家未爆後，莊家補到大於閒家或爆牌為止。',
    ],
  },
  [GameId.TUI_TONGZI_DRAGON]: tuiTongziRoom(GameId.TUI_TONGZI_DRAGON, '龍門推筒'),
  [GameId.TUI_TONGZI_LION]: tuiTongziRoom(GameId.TUI_TONGZI_LION, '醒獅推筒'),
  [GameId.TUI_TONGZI_JADE]: tuiTongziRoom(GameId.TUI_TONGZI_JADE, '玉兔推筒'),
  [GameId.TUI_TONGZI_NEON]: tuiTongziRoom(GameId.TUI_TONGZI_NEON, '霓虹推筒'),
  [GameId.TUI_TONGZI_GOLD]: tuiTongziRoom(GameId.TUI_TONGZI_GOLD, '金殿推筒'),
  [GameId.BLACK_DOT_TIANJIU]: blackDotRoom(GameId.BLACK_DOT_TIANJIU, '天九黑粒'),
  [GameId.BLACK_DOT_ROYAL]: blackDotRoom(GameId.BLACK_DOT_ROYAL, '御殿黑粒'),
  [GameId.BLACK_DOT_STREET]: blackDotRoom(GameId.BLACK_DOT_STREET, '街頭黑粒'),
  [GameId.BLACK_DOT_SHADOW]: blackDotRoom(GameId.BLACK_DOT_SHADOW, '影武黑粒'),
  [GameId.BLACK_DOT_GOLD]: blackDotRoom(GameId.BLACK_DOT_GOLD, '金礦黑粒'),
  [GameId.CARD_WAR]: {
    gameId: GameId.CARD_WAR,
    kind: 'card-war',
    roomName: '王牌比大小',
    ruleSummary: [
      '閒家與莊家各發一張牌，A 最大，K 至 2 依序往下。',
      '閒家牌面大於莊家即勝，小於莊家即負。',
      '同點數視為和局，退回本金。',
    ],
  },
};

const CARD_SUITS: LocalTableCard['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];
const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const TEN_HALF_LIMIT = 10.5;
const TEN_HALF_PLAYER_HIT_BELOW = 7;
const TABLE_WIN_MULTIPLIER = new Prisma.Decimal('1.96');
const HALF_21_SPECIAL_MULTIPLIER = new Prisma.Decimal('2.4');
const TUI_TONGZI_PAIR_MULTIPLIER = new Prisma.Decimal('2.4');
const TUI_TONGZI_SUPREME_MULTIPLIER = new Prisma.Decimal('3');
const ZERO = new Prisma.Decimal(0);

const TUBE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;

const DOMINO_TILE_TYPES: Array<{
  key: string;
  name: string;
  pips: [number, number];
  copies: number;
  pairKey: string;
  pairRank: number;
}> = [
  { key: 'gee-12', name: '至尊一', pips: [1, 2], copies: 1, pairKey: 'gee', pairRank: 16 },
  { key: 'gee-24', name: '至尊二', pips: [2, 4], copies: 1, pairKey: 'gee', pairRank: 16 },
  { key: 'heaven', name: '天牌', pips: [6, 6], copies: 2, pairKey: 'heaven', pairRank: 15 },
  { key: 'earth', name: '地牌', pips: [1, 1], copies: 2, pairKey: 'earth', pairRank: 14 },
  { key: 'man', name: '人牌', pips: [4, 4], copies: 2, pairKey: 'man', pairRank: 13 },
  { key: 'goose', name: '和牌', pips: [1, 3], copies: 2, pairKey: 'goose', pairRank: 12 },
  { key: 'plum', name: '梅牌', pips: [5, 5], copies: 2, pairKey: 'plum', pairRank: 11 },
  { key: 'long', name: '長牌', pips: [3, 3], copies: 2, pairKey: 'long', pairRank: 10 },
  { key: 'bench', name: '板凳', pips: [2, 2], copies: 2, pairKey: 'bench', pairRank: 9 },
  { key: 'axe', name: '斧頭', pips: [5, 6], copies: 2, pairKey: 'axe', pairRank: 8 },
  { key: 'partition', name: '紅頭', pips: [4, 6], copies: 2, pairKey: 'partition', pairRank: 7 },
  { key: 'leg', name: '長腳', pips: [1, 6], copies: 2, pairKey: 'leg', pairRank: 6 },
  { key: 'head', name: '大頭', pips: [1, 5], copies: 2, pairKey: 'head', pairRank: 5 },
  { key: 'mixed-nine-a', name: '雜九', pips: [4, 5], copies: 1, pairKey: 'mixed-nine', pairRank: 4 },
  { key: 'mixed-nine-b', name: '雜九', pips: [3, 6], copies: 1, pairKey: 'mixed-nine', pairRank: 4 },
  { key: 'mixed-eight-a', name: '雜八', pips: [2, 6], copies: 1, pairKey: 'mixed-eight', pairRank: 3 },
  { key: 'mixed-eight-b', name: '雜八', pips: [3, 5], copies: 1, pairKey: 'mixed-eight', pairRank: 3 },
  { key: 'mixed-seven-a', name: '雜七', pips: [2, 5], copies: 1, pairKey: 'mixed-seven', pairRank: 2 },
  { key: 'mixed-seven-b', name: '雜七', pips: [3, 4], copies: 1, pairKey: 'mixed-seven', pairRank: 2 },
  { key: 'mixed-five-a', name: '雜五', pips: [1, 4], copies: 1, pairKey: 'mixed-five', pairRank: 1 },
  { key: 'mixed-five-b', name: '雜五', pips: [2, 3], copies: 1, pairKey: 'mixed-five', pairRank: 1 },
];

export class LocalTableService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: LocalTableBetInput): Promise<LocalTableBetResult> {
    if (TWENTY_ONE_HALF_ID_SET.has(input.gameId)) {
      const state = await this.startTwentyOneHalf(userId, {
        gameId: input.gameId as (typeof TWENTY_ONE_HALF_GAME_IDS)[number],
        amount: input.amount,
        clientSeed: input.clientSeed,
      });
      return twentyOneHalfStateToBetResult(state);
    }
    if (STAGED_LOCAL_TABLE_ID_SET.has(input.gameId)) {
      const state = await this.startStagedTableRound(userId, {
        gameId: input.gameId as (typeof STAGED_LOCAL_TABLE_GAME_IDS)[number],
        amount: input.amount,
        clientSeed: input.clientSeed,
      });
      return stagedTableStateToBetResult(state);
    }

    const amount = new Prisma.Decimal(input.amount);

    return runLockedTransaction(this.prisma, async (tx) => {
      const member = await lockUserAndCheckFunds(tx, userId, amount, input.gameId);
      const seed = await getLocalTableSeedBundle(
        tx,
        userId,
        `table:${getGameKind(input.gameId)}`,
        input.clientSeed,
      );
      const seedBundle = {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      };

      const natural = buildRound(input.gameId, amount, seedBundle, 0);
      const naturalWon = natural.profit.greaterThan(0);
      const predicted = {
        won: naturalWon,
        amount,
        multiplier: natural.multiplier,
        payout: natural.payout,
      };
      const runControls = await shouldRunControlPipeline(tx, member, input.gameId, natural);
      const controlled = runControls
        ? await applyControls(tx, userId, input.gameId, predicted)
        : { ...predicted, controlled: false };
      const { round: finalRound, control: effectiveControl } = runControls
        ? shapeRoundForControl(input.gameId, amount, seedBundle, natural, controlled)
        : { round: natural, control: controlled };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: input.gameId,
          amount,
          multiplier: finalRound.multiplier,
          payout: finalRound.payout,
          profit: finalRound.profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: toResultData(finalRound, effectiveControl),
        },
      });

      const newBalance = await settleLocalTableBalance(
        tx,
        userId,
        member.balance,
        amount,
        finalRound.payout,
        bet.id,
      );

      if (runControls) {
        await finalizeControls(
          tx,
          userId,
          input.gameId,
          predicted,
          {
            won: finalRound.profit.greaterThan(0),
            amount,
            multiplier: finalRound.multiplier,
            payout: finalRound.payout,
          },
          effectiveControl,
          bet.id,
          toResultData(natural, { ...controlled, controlled: false }),
          toResultData(finalRound, effectiveControl),
        );
      }

      return {
        betId: bet.id,
        gameId: finalRound.gameId,
        kind: finalRound.kind,
        roomName: finalRound.roomName,
        outcome: finalRound.outcome,
        outcomeLabel: finalRound.outcomeLabel,
        amount: amount.toFixed(2),
        payout: finalRound.payout.toFixed(2),
        profit: finalRound.profit.toFixed(2),
        multiplier: Number(finalRound.multiplier.toFixed(4)),
        player: finalRound.player,
        banker: finalRound.banker,
        extraHands: finalRound.extraHands,
        summary: finalRound.summary,
        ruleSummary: finalRound.ruleSummary,
        controlled: effectiveControl.controlled,
        flipReason: effectiveControl.flipReason ?? null,
        newBalance: newBalance.toFixed(2),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    });
  }

  async startTwentyOneHalf(
    userId: string,
    input: TwentyOneHalfStartInput,
  ): Promise<TwentyOneHalfRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runLockedTransaction(this.prisma, async (tx) => {
      const active = await tx.bet.findFirst({
        where: { userId, gameId: input.gameId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (active) return this.toTwentyOneHalfState(tx, active);

      const member = await lockUserAndCheckFunds(tx, userId, amount, input.gameId);
      const seed = await getLocalTableSeedBundle(
        tx,
        userId,
        `table:${getGameKind(input.gameId)}`,
        input.clientSeed,
      );
      const stream = makeStream(
        { serverSeed: seed.serverSeed, clientSeed: seed.clientSeed, nonce: seed.nonce },
        0,
      );
      const deck = drawCards(stream, 52);
      const config = ROOM_CONFIGS[input.gameId];
      const data: TwentyOneHalfStoredData = {
        kind: 'twenty-one-half',
        status: 'ACTIVE',
        phase: 'PLAYER_TURN',
        gameId: input.gameId,
        roomName: config.roomName,
        player: [deck[0]!],
        banker: [deck[1]!],
        deck,
        deckIndex: 2,
        summary: '請選擇補牌或停牌。',
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: input.gameId,
          amount,
          multiplier: new Prisma.Decimal(0),
          payout: new Prisma.Decimal(0),
          profit: amount.negated(),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: data as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      const balanceAfterBet = member.balance.minus(amount).toDecimalPlaces(2);
      await tx.user.update({ where: { id: userId }, data: { balance: balanceAfterBet } });
      await tx.transaction.create({
        data: {
          userId,
          type: 'BET_PLACE',
          amount: amount.negated(),
          balanceAfter: balanceAfterBet,
          betId: bet.id,
        },
      });

      return this.toTwentyOneHalfState(tx, bet, data, seed.serverSeedHash, balanceAfterBet);
    });
  }

  async hitTwentyOneHalf(
    userId: string,
    input: TwentyOneHalfActionInput,
  ): Promise<TwentyOneHalfRoundState> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await findActiveTwentyOneHalfBet(tx, userId, input.roundId);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } });
      const data = parseTwentyOneHalfData(bet.resultData);
      if (getTwentyOneHalfPhase(data) !== 'PLAYER_TURN') {
        throw new ApiError('INVALID_ACTION', '目前是莊家補牌階段。');
      }
      const action = getTwentyOneHalfAvailableAction(data.player);
      if (!action.canHit) {
        throw new ApiError(
          'INVALID_ACTION',
          action.forcedAction === 'stand' ? '目前點數必須停牌。' : '目前不能補牌。',
        );
      }
      if (data.deckIndex >= data.deck.length) throw new ApiError('INTERNAL', 'Deck exhausted');

      const rawData = cloneTwentyOneHalfData(data);
      let finalData = cloneTwentyOneHalfData(data);
      finalData.player = [...finalData.player, finalData.deck[finalData.deckIndex]!];
      finalData.deckIndex += 1;

      const rawRound = buildTwentyOneHalfRoundFromState(finalData, bet.amount);
      let effectiveControl: ControlOutcome = {
        won: rawRound.profit.greaterThan(0),
        multiplier: rawRound.multiplier,
        payout: rawRound.payout,
        controlled: false,
      };

      const shouldSettle = isTwentyOneHalfFinalPlayerHand(finalData.player);
      if (!shouldSettle) {
        return this.updateTwentyOneHalfProgress(tx, bet, finalData, serverSeed.seedHash);
      }

      const member = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, username: true, agentId: true },
      });
      const runControls = await shouldRunControlPipeline(
        tx,
        member,
        bet.gameId as LocalTableGameIdType,
        rawRound,
      );
      if (runControls) {
        const controlled = await applyControls(tx, userId, bet.gameId, {
          won: rawRound.profit.greaterThan(0),
          amount: bet.amount,
          multiplier: rawRound.multiplier,
          payout: rawRound.payout,
        });
        effectiveControl = controlled;
        if (controlled.controlled) {
          const shaped = shapeTwentyOneHalfHitForControl(
            rawData,
            bet.amount,
            controlled,
            rawRound,
          );
          if (shaped?.kind === 'progress') {
            return this.updateTwentyOneHalfProgress(tx, bet, shaped.data, serverSeed.seedHash);
          }
          if (shaped?.kind === 'settled') {
            finalData = shaped.data;
            effectiveControl = shaped.control;
          } else {
            effectiveControl = { ...controlled, controlled: false, flipReason: undefined };
          }
        }
      }

      const naturalRound = rawRound;
      const finalRound = buildTwentyOneHalfRoundFromState(finalData, bet.amount);
      return settleTwentyOneHalfBet(
        tx,
        userId,
        bet,
        finalData,
        naturalRound,
        finalRound,
        effectiveControl,
        runControls,
        serverSeed.seedHash,
      );
    });
  }

  async standTwentyOneHalf(
    userId: string,
    input: TwentyOneHalfActionInput,
  ): Promise<TwentyOneHalfRoundState> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await findActiveTwentyOneHalfBet(tx, userId, input.roundId);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } });
      const data = parseTwentyOneHalfData(bet.resultData);
      if (getTwentyOneHalfPhase(data) !== 'PLAYER_TURN') {
        throw new ApiError('INVALID_ACTION', '目前已停牌，請讓莊家補牌。');
      }
      const action = getTwentyOneHalfAvailableAction(data.player);
      if (!action.canStand) {
        throw new ApiError(
          'INVALID_ACTION',
          action.forcedAction === 'hit' ? '目前點數必須補牌。' : '目前不能停牌。',
        );
      }

      const naturalData = settleTwentyOneHalfBanker(data);
      const naturalRound = buildTwentyOneHalfRoundFromState(naturalData, bet.amount);
      let finalData = naturalData;
      let finalRound = naturalRound;
      let effectiveControl: ControlOutcome = {
        won: naturalRound.profit.greaterThan(0),
        multiplier: naturalRound.multiplier,
        payout: naturalRound.payout,
        controlled: false,
      };

      const member = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, username: true, agentId: true },
      });
      const runControls = await shouldRunControlPipeline(
        tx,
        member,
        bet.gameId as LocalTableGameIdType,
        naturalRound,
      );
      if (runControls) {
        const controlled = await applyControls(tx, userId, bet.gameId, {
          won: naturalRound.profit.greaterThan(0),
          amount: bet.amount,
          multiplier: naturalRound.multiplier,
          payout: naturalRound.payout,
        });
        effectiveControl = controlled;
        if (controlled.controlled) {
          const shaped = shapeTwentyOneHalfBankerForControl(data, bet.amount, controlled);
          if (shaped) {
            finalData = shaped.data;
            finalRound = shaped.round;
            effectiveControl = shaped.control;
          } else {
            effectiveControl = { ...controlled, controlled: false, flipReason: undefined };
          }
        }
      }

      const bankerTurnData = prepareTwentyOneHalfBankerTurnData(
        data,
        finalData,
        naturalRound,
        effectiveControl,
        runControls,
      );
      if (shouldTwentyOneHalfBankerDraw(bankerTurnData)) {
        return this.updateTwentyOneHalfProgress(tx, bet, bankerTurnData, serverSeed.seedHash);
      }

      return settleTwentyOneHalfBet(
        tx,
        userId,
        bet,
        finalData,
        naturalRound,
        finalRound,
        effectiveControl,
        runControls,
        serverSeed.seedHash,
      );
    });
  }

  async drawTwentyOneHalfBanker(
    userId: string,
    input: TwentyOneHalfActionInput,
  ): Promise<TwentyOneHalfRoundState> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await findActiveTwentyOneHalfBet(tx, userId, input.roundId);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } });
      const data = parseTwentyOneHalfData(bet.resultData);
      if (getTwentyOneHalfPhase(data) !== 'BANKER_TURN') {
        throw new ApiError('INVALID_ACTION', '目前不是莊家補牌階段。');
      }
      if (!shouldTwentyOneHalfBankerDraw(data)) {
        const finalRound = buildTwentyOneHalfRoundFromState(data, bet.amount);
        return settleTwentyOneHalfBet(
          tx,
          userId,
          bet,
          data,
          data.natural ? roundFromStored(data.natural) : finalRound,
          finalRound,
          data.control ? controlFromStored(data.control) : controlFromRound(finalRound),
          data.runControls ?? false,
          serverSeed.seedHash,
        );
      }
      if (data.deckIndex >= data.deck.length) throw new ApiError('INTERNAL', 'Deck exhausted');

      const nextData = cloneTwentyOneHalfData(data);
      nextData.banker.push(nextData.deck[nextData.deckIndex]!);
      nextData.deckIndex += 1;

      if (shouldTwentyOneHalfBankerDraw(nextData)) {
        return this.updateTwentyOneHalfProgress(tx, bet, nextData, serverSeed.seedHash);
      }

      const finalRound = buildTwentyOneHalfRoundFromState(nextData, bet.amount);
      return settleTwentyOneHalfBet(
        tx,
        userId,
        bet,
        nextData,
        data.natural ? roundFromStored(data.natural) : finalRound,
        finalRound,
        data.control ? controlFromStored(data.control) : controlFromRound(finalRound),
        data.runControls ?? false,
        serverSeed.seedHash,
      );
    });
  }

  async getActiveTwentyOneHalf(
    userId: string,
    gameId?: LocalTableGameIdType,
  ): Promise<TwentyOneHalfRoundState | null> {
    const bet = await this.prisma.bet.findFirst({
      where: {
        userId,
        status: 'PENDING',
        gameId: gameId ?? { in: [...TWENTY_ONE_HALF_GAME_IDS] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!bet) return null;
    return this.toTwentyOneHalfState(this.prisma, bet);
  }

  async startStagedTableRound(
    userId: string,
    input: StagedTableStartInput,
  ): Promise<LocalTableRoundState> {
    const amount = new Prisma.Decimal(input.amount);

    return runLockedTransaction(this.prisma, async (tx) => {
      const active = await tx.bet.findFirst({
        where: { userId, gameId: input.gameId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (active) return this.toStagedTableState(tx, active);

      const member = await lockUserAndCheckFunds(tx, userId, amount, input.gameId);
      const seed = await getLocalTableSeedBundle(
        tx,
        userId,
        `table:${getGameKind(input.gameId)}`,
        input.clientSeed,
      );
      const seedBundle = {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      };
      const config = ROOM_CONFIGS[input.gameId];
      let data: StagedLocalTableStoredData;

      if (config.kind === 'black-dot') {
        const deck = drawDominoTiles(makeStream(seedBundle, 0), 32);
        data = {
          kind: 'black-dot',
          status: 'ACTIVE',
          stage: 'AWAIT_SPLIT',
          gameId: input.gameId,
          roomName: config.roomName,
          playerTiles: deck.slice(0, 4),
          deck,
          deckIndex: 4,
          summary: '請選擇閒家高低兩墩，擺牌後莊家開牌比墩。',
        };
      } else {
        const natural = buildRound(input.gameId, amount, seedBundle, 0);
        const predicted = {
          won: natural.profit.greaterThan(0),
          amount,
          multiplier: natural.multiplier,
          payout: natural.payout,
        };
        const runControls = await shouldRunControlPipeline(tx, member, input.gameId, natural);
        const controlled = runControls
          ? await applyControls(tx, userId, input.gameId, predicted)
          : { ...predicted, controlled: false };
        const { round: finalRound, control: effectiveControl } = runControls
          ? shapeRoundForControl(input.gameId, amount, seedBundle, natural, controlled)
          : { round: natural, control: controlled };
        data = {
          kind: config.kind as StagedLocalTableKind,
          status: 'ACTIVE',
          stage: config.kind === 'tui-tongzi' ? 'AWAIT_FIRST_REVEAL' : 'AWAIT_PLAYER_REVEAL',
          gameId: input.gameId,
          roomName: config.roomName,
          natural: storeRound(natural),
          final: storeRound(finalRound),
          control: storeControlOutcome(effectiveControl),
          runControls,
          revealedPlayerIndexes: config.kind === 'tui-tongzi' ? [] : undefined,
          summary:
            config.kind === 'tui-tongzi'
              ? '莊家已開，請翻閒家任一張筒子。'
              : '下注完成，請先開閒家牌。',
        };
      }

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: input.gameId,
          amount,
          multiplier: new Prisma.Decimal(0),
          payout: new Prisma.Decimal(0),
          profit: amount.negated(),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: data as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });

      const balanceAfterBet = member.balance.minus(amount).toDecimalPlaces(2);
      await tx.user.update({ where: { id: userId }, data: { balance: balanceAfterBet } });
      await tx.transaction.create({
        data: {
          userId,
          type: 'BET_PLACE',
          amount: amount.negated(),
          balanceAfter: balanceAfterBet,
          betId: bet.id,
        },
      });

      return this.toStagedTableState(tx, bet, data, seed.serverSeedHash, balanceAfterBet);
    });
  }

  async revealStagedTableRound(
    userId: string,
    input: StagedTableActionInput,
  ): Promise<LocalTableRoundState> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await findActiveStagedTableBet(tx, userId, input.roundId);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } });
      const data = parseStagedTableData(bet.resultData);
      if (data.kind === 'black-dot') {
        throw new ApiError('INVALID_ACTION', '黑粒仔請先選擇高低墩。');
      }

      if (data.kind === 'tui-tongzi') {
        if (data.stage !== 'AWAIT_FIRST_REVEAL' && data.stage !== 'AWAIT_FINAL_REVEAL') {
          throw new ApiError('INVALID_ACTION', '目前不能翻牌。');
        }

        const revealed = normalizeTuiRevealIndexes(data.revealedPlayerIndexes);
        const revealIndex = input.revealIndex ?? firstUnrevealedTuiIndex(revealed);
        if (revealIndex == null || revealIndex < 0 || revealIndex > 1) {
          throw new ApiError('INVALID_ACTION', '無效的翻牌位置。');
        }
        if (revealed.includes(revealIndex)) {
          throw new ApiError('INVALID_ACTION', '這張牌已經翻開。');
        }

        const nextRevealed = [...revealed, revealIndex];
        if (nextRevealed.length < 2) {
          const next = {
            ...data,
            stage: 'AWAIT_FINAL_REVEAL' as const,
            revealedPlayerIndexes: nextRevealed,
            summary: '第一張已開，請翻另一張筒子比牌。',
          };
          const updated = await tx.bet.update({
            where: { id: bet.id },
            data: { resultData: next as unknown as Prisma.InputJsonValue },
          });
          return this.toStagedTableState(tx, updated, next, serverSeed.seedHash);
        }

        const natural = roundFromStored(data.natural);
        const finalRound = roundFromStored(data.final);
        const control = controlFromStored(data.control);
        return settleStagedTableBet(
          tx,
          userId,
          bet,
          {
            ...data,
            status: 'SETTLED',
            stage: 'SETTLED',
            revealedPlayerIndexes: [0, 1],
            summary: finalRound.summary,
          },
          natural,
          finalRound,
          control,
          data.runControls === true,
          serverSeed.seedHash,
        );
      }

      if (data.stage === 'AWAIT_PLAYER_REVEAL') {
        const next = { ...data, stage: 'AWAIT_BANKER_REVEAL' as const, summary: '閒家牌已開，請開莊家牌比大小。' };
        const updated = await tx.bet.update({
          where: { id: bet.id },
          data: { resultData: next as unknown as Prisma.InputJsonValue },
        });
        return this.toStagedTableState(tx, updated, next, serverSeed.seedHash);
      }

      if (data.stage !== 'AWAIT_FINAL_REVEAL' && data.stage !== 'AWAIT_BANKER_REVEAL') {
        throw new ApiError('INVALID_ACTION', '目前不能開牌。');
      }

      const natural = roundFromStored(data.natural);
      const finalRound = roundFromStored(data.final);
      const control = controlFromStored(data.control);
      return settleStagedTableBet(
        tx,
        userId,
        bet,
        { ...data, status: 'SETTLED', stage: 'SETTLED', summary: finalRound.summary },
        natural,
        finalRound,
        control,
        data.runControls === true,
        serverSeed.seedHash,
      );
    });
  }

  async splitStagedTableRound(
    userId: string,
    input: StagedTableSplitInput,
  ): Promise<LocalTableRoundState> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await findActiveStagedTableBet(tx, userId, input.roundId);
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } });
      const data = parseStagedTableData(bet.resultData);
      if (data.kind !== 'black-dot' || data.stage !== 'AWAIT_SPLIT') {
        throw new ApiError('INVALID_ACTION', '目前不能擺牌。');
      }
      const playerTiles = data.playerTiles ?? [];
      const deck = data.deck ?? [];
      const deckIndex = data.deckIndex ?? 4;
      const split = getBlackDotSplitOption(playerTiles, input.splitId);
      if (!split) throw new ApiError('INVALID_ACTION', '無效的高低墩選擇。');
      const naturalBanker = deck.slice(deckIndex, deckIndex + 4);
      const natural = buildBlackDotRoundFromSplit(
        ROOM_CONFIGS[data.gameId],
        bet.amount,
        playerTiles,
        naturalBanker,
        split.id,
      );
      const member = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, username: true, agentId: true },
      });
      const runControls = await shouldRunControlPipeline(
        tx,
        member,
        data.gameId,
        natural,
      );
      const predicted = {
        won: natural.profit.greaterThan(0),
        amount: bet.amount,
        multiplier: natural.multiplier,
        payout: natural.payout,
      };
      const controlled = runControls
        ? await applyControls(tx, userId, data.gameId, predicted)
        : { ...predicted, controlled: false };
      const shaped = shapeBlackDotRoundForControl(data, bet.amount, split.id, natural, controlled);
      const finalRound = shaped.round;
      const effectiveControl = shaped.control;

      return settleStagedTableBet(
        tx,
        userId,
        bet,
        {
          ...data,
          status: 'SETTLED',
          stage: 'SETTLED',
          natural: storeRound(natural),
          final: storeRound(finalRound),
          control: storeControlOutcome(effectiveControl),
          runControls,
          playerSplitId: split.id,
          summary: finalRound.summary,
        },
        natural,
        finalRound,
        effectiveControl,
        runControls,
        serverSeed.seedHash,
      );
    });
  }

  async getActiveStagedTableRound(
    userId: string,
    gameId?: LocalTableGameIdType,
  ): Promise<LocalTableRoundState | null> {
    const bet = await this.prisma.bet.findFirst({
      where: {
        userId,
        status: 'PENDING',
        gameId: gameId ?? { in: [...STAGED_LOCAL_TABLE_GAME_IDS] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!bet) return null;
    return this.toStagedTableState(this.prisma, bet);
  }

  private async updateTwentyOneHalfProgress(
    tx: Prisma.TransactionClient,
    bet: {
      id: string;
      amount: Prisma.Decimal;
      nonce: number;
      clientSeedUsed: string;
      serverSeedId: string;
      createdAt: Date;
    },
    data: TwentyOneHalfStoredData,
    serverSeedHash: string,
  ): Promise<TwentyOneHalfRoundState> {
    const stored = {
      ...data,
      summary: activeTwentyOneHalfSummary(data),
    };
    const updated = await tx.bet.update({
      where: { id: bet.id },
      data: { resultData: stored as unknown as Prisma.InputJsonValue },
    });
    return this.toTwentyOneHalfState(tx, updated, stored, serverSeedHash);
  }

  private async toTwentyOneHalfState(
    tx: Prisma.TransactionClient | PrismaClient,
    bet: {
      id: string;
      gameId: string;
      amount: Prisma.Decimal;
      payout: Prisma.Decimal;
      profit: Prisma.Decimal;
      multiplier: Prisma.Decimal;
      resultData: Prisma.JsonValue;
      nonce: number;
      clientSeedUsed: string;
      serverSeedId: string;
    },
    data = parseTwentyOneHalfData(bet.resultData),
    serverSeedHash?: string,
    newBalance?: Prisma.Decimal,
  ): Promise<TwentyOneHalfRoundState> {
    const hash =
      serverSeedHash ??
      (await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } })).seedHash;
    return toTwentyOneHalfState(bet, data, hash, newBalance);
  }

  private async toStagedTableState(
    tx: Prisma.TransactionClient | PrismaClient,
    bet: {
      id: string;
      gameId: string;
      amount: Prisma.Decimal;
      payout: Prisma.Decimal;
      profit: Prisma.Decimal;
      multiplier: Prisma.Decimal;
      resultData: Prisma.JsonValue;
      nonce: number;
      clientSeedUsed: string;
      serverSeedId: string;
    },
    data = parseStagedTableData(bet.resultData),
    serverSeedHash?: string,
    newBalance?: Prisma.Decimal,
  ): Promise<LocalTableRoundState> {
    const hash =
      serverSeedHash ??
      (await tx.serverSeed.findUniqueOrThrow({ where: { id: bet.serverSeedId } })).seedHash;
    return toStagedTableState(bet, data, hash, newBalance);
  }
}

function twentyOneHalfStateToBetResult(state: TwentyOneHalfRoundState): LocalTableBetResult {
  return {
    betId: state.roundId,
    gameId: state.gameId,
    kind: state.kind,
    roomName: state.roomName,
    outcome: state.outcome ?? 'PUSH',
    outcomeLabel: state.outcomeLabel ?? '進行中',
    amount: state.amount,
    payout: state.payout,
    profit: state.profit,
    multiplier: state.multiplier,
    player: state.player,
    banker: state.banker,
    summary: state.summary,
    ruleSummary: state.ruleSummary,
    controlled: state.controlled ?? false,
    flipReason: state.flipReason ?? null,
    newBalance: state.newBalance ?? '0.00',
    nonce: state.nonce,
    serverSeedHash: state.serverSeedHash,
    clientSeed: state.clientSeed,
  };
}

function stagedTableStateToBetResult(state: LocalTableRoundState): LocalTableBetResult {
  return {
    betId: state.roundId,
    gameId: state.gameId,
    kind: state.kind,
    roomName: state.roomName,
    outcome: state.outcome ?? 'PUSH',
    outcomeLabel: state.outcomeLabel ?? '進行中',
    amount: state.amount,
    payout: state.payout,
    profit: state.profit,
    multiplier: state.multiplier,
    player: state.player,
    banker: state.banker,
    extraHands: state.extraHands,
    summary: state.summary,
    ruleSummary: state.ruleSummary,
    controlled: state.controlled ?? false,
    flipReason: state.flipReason ?? null,
    newBalance: state.newBalance ?? '0.00',
    nonce: state.nonce,
    serverSeedHash: state.serverSeedHash,
    clientSeed: state.clientSeed,
  };
}

async function findActiveTwentyOneHalfBet(
  tx: Prisma.TransactionClient,
  userId: string,
  roundId: string,
) {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Bet"
    WHERE id = ${roundId}
      AND "userId" = ${userId}
      AND status = 'PENDING'
      AND "gameId" = ANY(${[...TWENTY_ONE_HALF_GAME_IDS]}::text[])
    FOR UPDATE
  `;
  if (!locked) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
  const bet = await tx.bet.findUnique({ where: { id: locked.id } });
  if (!bet) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
  if (bet.status !== 'PENDING') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
  return bet;
}

function parseTwentyOneHalfData(value: Prisma.JsonValue): TwentyOneHalfStoredData {
  const data = value as Partial<TwentyOneHalfStoredData>;
  if (
    data.kind !== 'twenty-one-half' ||
    !data.status ||
    !data.gameId ||
    !data.roomName ||
    !Array.isArray(data.player) ||
    !Array.isArray(data.banker) ||
    !Array.isArray(data.deck) ||
    typeof data.deckIndex !== 'number'
  ) {
    throw new ApiError('INVALID_ACTION', 'Invalid ten-half round data');
  }
  return {
    kind: 'twenty-one-half',
    status: data.status,
    phase: data.phase ?? 'PLAYER_TURN',
    gameId: data.gameId,
    roomName: data.roomName,
    player: data.player as CardInternal[],
    banker: data.banker as CardInternal[],
    deck: data.deck as CardInternal[],
    deckIndex: data.deckIndex,
    outcome: data.outcome ?? null,
    outcomeLabel: data.outcomeLabel ?? null,
    multiplier: data.multiplier ?? null,
    payout: data.payout ?? null,
    profit: data.profit ?? null,
    summary: data.summary ?? null,
    controlled: data.controlled ?? false,
    flipReason: data.flipReason ?? null,
    natural: data.natural ?? null,
    control: data.control ?? null,
    runControls: data.runControls ?? false,
    raw: data.raw ?? null,
  };
}

function cloneTwentyOneHalfData(data: TwentyOneHalfStoredData): TwentyOneHalfStoredData {
  return {
    ...data,
    player: data.player.map((card) => ({ ...card })),
    banker: data.banker.map((card) => ({ ...card })),
    deck: data.deck.map((card) => ({ ...card })),
    natural: data.natural ?? null,
    control: data.control ?? null,
    runControls: data.runControls ?? false,
  };
}

function getTwentyOneHalfPhase(data: TwentyOneHalfStoredData): TwentyOneHalfStoredPhase {
  return data.phase ?? 'PLAYER_TURN';
}

function getTwentyOneHalfAvailableAction(player: CardInternal[]): {
  canHit: boolean;
  canStand: boolean;
  forcedAction: 'hit' | 'stand' | null;
} {
  const score = half21Score(player);
  const busted = score > TEN_HALF_LIMIT;
  const special = isTwentyOneHalfSpecial(player);
  if (busted || special || player.length >= 5) {
    return { canHit: false, canStand: false, forcedAction: null };
  }
  if (score <= 4) return { canHit: true, canStand: false, forcedAction: 'hit' };
  if (score >= 8) return { canHit: false, canStand: true, forcedAction: 'stand' };
  return { canHit: true, canStand: true, forcedAction: null };
}

function isTwentyOneHalfSpecial(cards: CardInternal[]): boolean {
  const score = half21Score(cards);
  return score <= TEN_HALF_LIMIT && (score === TEN_HALF_LIMIT || cards.length >= 5);
}

function isTwentyOneHalfFinalPlayerHand(player: CardInternal[]): boolean {
  return half21Score(player) > TEN_HALF_LIMIT || isTwentyOneHalfSpecial(player);
}

function activeTwentyOneHalfSummary(data: TwentyOneHalfStoredData): string {
  if (getTwentyOneHalfPhase(data) === 'BANKER_TURN') {
    const playerScore = half21Score(data.player);
    const bankerScore = half21Score(data.banker);
    if (shouldTwentyOneHalfBankerDraw(data)) {
      return `閒家 ${formatHalfPoint(playerScore)} 停牌，莊家 ${formatHalfPoint(bankerScore)}，請補莊家下一張。`;
    }
    return `閒家 ${formatHalfPoint(playerScore)} 停牌，莊家 ${formatHalfPoint(bankerScore)}，準備結算。`;
  }

  const score = half21Score(data.player);
  const action = getTwentyOneHalfAvailableAction(data.player);
  if (action.forcedAction === 'hit') return `閒家 ${formatHalfPoint(score)}，4點以下必須補牌。`;
  if (action.forcedAction === 'stand') return `閒家 ${formatHalfPoint(score)}，8點以上必須停牌。`;
  return `閒家 ${formatHalfPoint(score)}，請選擇補牌或停牌。`;
}

function shouldTwentyOneHalfBankerDraw(data: TwentyOneHalfStoredData): boolean {
  const playerScore = half21Score(data.player);
  return (
    half21Score(data.banker) <= playerScore &&
    half21Score(data.banker) <= TEN_HALF_LIMIT &&
    !isTwentyOneHalfSpecial(data.banker) &&
    data.banker.length < 5 &&
    data.deckIndex < data.deck.length
  );
}

function settleTwentyOneHalfBanker(data: TwentyOneHalfStoredData): TwentyOneHalfStoredData {
  const settled = cloneTwentyOneHalfData(data);
  while (shouldTwentyOneHalfBankerDraw(settled)) {
    settled.banker.push(settled.deck[settled.deckIndex]!);
    settled.deckIndex += 1;
  }
  return settled;
}

function buildTwentyOneHalfRoundFromState(
  data: TwentyOneHalfStoredData,
  amount: Prisma.Decimal,
): RoundDraft {
  const config = ROOM_CONFIGS[data.gameId];
  const playerScore = half21Score(data.player);
  const bankerScore = half21Score(data.banker);
  const playerBust = playerScore > TEN_HALF_LIMIT;
  const bankerBust = bankerScore > TEN_HALF_LIMIT;
  const playerSpecial = isTwentyOneHalfSpecial(data.player);
  const bankerSpecial = isTwentyOneHalfSpecial(data.banker);

  let outcome: LocalTableOutcome;
  if (playerBust) outcome = 'LOSE';
  else if (playerSpecial) outcome = 'WIN';
  else if (bankerBust) outcome = 'WIN';
  else if (bankerSpecial) outcome = 'LOSE';
  else if (playerScore > bankerScore) outcome = 'WIN';
  else outcome = 'LOSE';

  const multiplier =
    outcome === 'WIN'
      ? playerSpecial
        ? HALF_21_SPECIAL_MULTIPLIER
        : TABLE_WIN_MULTIPLIER
      : new Prisma.Decimal(0);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);

  return {
    gameId: data.gameId,
    kind: 'twenty-one-half',
    roomName: data.roomName,
    outcome,
    outcomeLabel: labelOutcome(outcome),
    multiplier,
    payout,
    profit,
    player: toTwentyOneHalfHand('閒家', data.player, true),
    banker: toTwentyOneHalfHand('莊家', data.banker, false),
    summary:
      outcome === 'WIN'
        ? `閒家 ${formatHalfPoint(playerScore)} 勝莊家 ${formatHalfPoint(bankerScore)}`
        : `莊家 ${formatHalfPoint(bankerScore)} 勝閒家 ${formatHalfPoint(playerScore)}`,
    ruleSummary: config.ruleSummary,
  };
}

function toTwentyOneHalfHand(
  title: string,
  cards: CardInternal[],
  isPlayer: boolean,
): LocalTableHand {
  const score = half21Score(cards);
  const busted = score > TEN_HALF_LIMIT;
  const special = isTwentyOneHalfSpecial(cards);
  return {
    title,
    pieces: cards,
    scoreLabel: formatHalfPoint(score),
    rankLabel: busted ? '爆牌' : special ? (cards.length >= 5 ? '五龍' : '十點半') : isPlayer ? '閒家牌' : '莊家牌',
    detail: `${cards.length} 張`,
  };
}

function forceTwentyOneHalfHitSafe(data: TwentyOneHalfStoredData): TwentyOneHalfStoredData | null {
  const base = cloneTwentyOneHalfData(data);
  const index = findDeckCardIndex(base, base.deckIndex, (card) =>
    half21Score([...base.player, card]) <= TEN_HALF_LIMIT,
  );
  if (index < 0) return null;
  swapDeckCards(base.deck, base.deckIndex, index);
  base.player.push(base.deck[base.deckIndex]!);
  base.deckIndex += 1;
  return base;
}

type TwentyOneHalfHitControlShape =
  | {
      kind: 'settled';
      data: TwentyOneHalfStoredData;
      round: RoundDraft;
      control: ControlOutcome;
    }
  | {
      kind: 'progress';
      data: TwentyOneHalfStoredData;
    };

function shapeTwentyOneHalfHitForControl(
  data: TwentyOneHalfStoredData,
  amount: Prisma.Decimal,
  control: ControlOutcome,
  naturalRound: RoundDraft,
): TwentyOneHalfHitControlShape | null {
  const desired: LocalTableOutcome = control.won ? 'WIN' : 'LOSE';
  const shaped = findTwentyOneHalfHitDataByOutcome(data, amount, desired, control);
  if (shaped) return { kind: 'settled', ...shaped, control };

  if (control.won) {
    const forcedLoss = findTwentyOneHalfHitDataByOutcome(data, amount, 'LOSE', control);
    if (forcedLoss && naturalRound.profit.greaterThan(0)) {
      return {
        kind: 'settled',
        ...forcedLoss,
        control: controlAsForcedLoss(control),
      };
    }

    const safeProgress = forceTwentyOneHalfHitSafe(data);
    if (safeProgress && !isTwentyOneHalfFinalPlayerHand(safeProgress.player)) {
      return { kind: 'progress', data: safeProgress };
    }
  }

  return null;
}

function findTwentyOneHalfHitDataByOutcome(
  data: TwentyOneHalfStoredData,
  amount: Prisma.Decimal,
  desired: LocalTableOutcome,
  control: ControlOutcome,
): { data: TwentyOneHalfStoredData; round: RoundDraft } | null {
  for (let index = data.deckIndex; index < data.deck.length; index += 1) {
    const candidate = cloneTwentyOneHalfData(data);
    swapDeckCards(candidate.deck, candidate.deckIndex, index);
    candidate.player.push(candidate.deck[candidate.deckIndex]!);
    candidate.deckIndex += 1;
    if (!isTwentyOneHalfFinalPlayerHand(candidate.player)) continue;

    const round = buildTwentyOneHalfRoundFromState(candidate, amount);
    if (round.outcome !== desired) continue;
    if (desired === 'WIN' && !multiplierMatchesControlBounds(round.multiplier, amount, control)) {
      continue;
    }
    return { data: candidate, round };
  }
  return null;
}

function shapeTwentyOneHalfBankerForControl(
  data: TwentyOneHalfStoredData,
  amount: Prisma.Decimal,
  control: ControlOutcome,
): { data: TwentyOneHalfStoredData; round: RoundDraft; control: ControlOutcome } | null {
  const desired: LocalTableOutcome = control.won ? 'WIN' : 'LOSE';
  const natural = settleTwentyOneHalfBanker(data);
  const naturalRound = buildTwentyOneHalfRoundFromState(natural, amount);
  if (
    naturalRound.outcome === desired &&
    (desired !== 'WIN' || multiplierMatchesControlBounds(naturalRound.multiplier, amount, control))
  ) {
    return { data: natural, round: naturalRound, control };
  }

  for (let index = data.deckIndex; index < data.deck.length; index += 1) {
    const candidate = cloneTwentyOneHalfData(data);
    swapDeckCards(candidate.deck, candidate.deckIndex, index);
    const settled = settleTwentyOneHalfBanker(candidate);
    const round = buildTwentyOneHalfRoundFromState(settled, amount);
    if (round.outcome !== desired) continue;
    if (desired === 'WIN' && !multiplierMatchesControlBounds(round.multiplier, amount, control)) {
      continue;
    }
    return { data: settled, round, control };
  }

  if (control.won) {
    const forcedLoss = shapeTwentyOneHalfBankerForControl(data, amount, controlAsForcedLoss(control));
    if (forcedLoss) return forcedLoss;
  }

  return null;
}

function prepareTwentyOneHalfBankerTurnData(
  current: TwentyOneHalfStoredData,
  resolved: TwentyOneHalfStoredData,
  naturalRound: RoundDraft,
  control: ControlOutcome,
  runControls: boolean,
): TwentyOneHalfStoredData {
  return {
    ...cloneTwentyOneHalfData(current),
    phase: 'BANKER_TURN',
    deck: resolved.deck.map((card) => ({ ...card })),
    deckIndex: current.deckIndex,
    natural: storeRound(naturalRound),
    control: storeControlOutcome(control),
    runControls,
    summary: null,
  };
}

function controlAsForcedLoss(control: ControlOutcome): ControlOutcome {
  return {
    ...control,
    won: false,
    multiplier: new Prisma.Decimal(0),
    payout: new Prisma.Decimal(0),
    flipReason: control.flipReason?.startsWith('burst_')
      ? 'burst_risk_guard'
      : 'control_bounds_guard',
  };
}

function controlFromRound(round: RoundDraft): ControlOutcome {
  return {
    won: round.profit.greaterThan(0),
    multiplier: round.multiplier,
    payout: round.payout,
    controlled: false,
  };
}

function findDeckCardIndex(
  data: TwentyOneHalfStoredData,
  start: number,
  predicate: (card: CardInternal) => boolean,
): number {
  for (let index = start; index < data.deck.length; index += 1) {
    if (predicate(data.deck[index]!)) return index;
  }
  return -1;
}

function swapDeckCards(deck: CardInternal[], a: number, b: number): void {
  if (a === b) return;
  const next = deck[a]!;
  deck[a] = deck[b]!;
  deck[b] = next;
}

async function settleTwentyOneHalfBet(
  tx: Prisma.TransactionClient,
  userId: string,
  bet: {
    id: string;
    gameId: string;
    amount: Prisma.Decimal;
    nonce: number;
    clientSeedUsed: string;
    serverSeedId: string;
  },
  finalData: TwentyOneHalfStoredData,
  naturalRound: RoundDraft,
  finalRound: RoundDraft,
  control: ControlOutcome,
  runControls: boolean,
  serverSeedHash: string,
): Promise<TwentyOneHalfRoundState> {
  const stored: TwentyOneHalfStoredData = {
    ...finalData,
    status: 'SETTLED',
    outcome: finalRound.outcome,
    outcomeLabel: finalRound.outcomeLabel,
    multiplier: finalRound.multiplier.toFixed(4),
    payout: finalRound.payout.toFixed(2),
    profit: finalRound.profit.toFixed(2),
    summary: finalRound.summary,
    controlled: control.controlled,
    flipReason: control.flipReason ?? null,
    raw: control.controlled ? toResultData(naturalRound, { ...control, controlled: false }) : null,
  };

  const updatedBet = await tx.bet.update({
    where: { id: bet.id },
    data: {
      multiplier: finalRound.multiplier,
      payout: finalRound.payout,
      profit: finalRound.profit,
      status: 'SETTLED',
      settledAt: new Date(),
      resultData: toResultData(
        { ...finalRound, raw: stored.raw },
        control,
      ),
    },
  });

  const newBalance = finalRound.payout.greaterThan(0)
    ? await creditTwentyOneHalfPayout(tx, userId, finalRound.payout, bet.id)
    : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

  if (runControls) {
    await finalizeControls(
      tx,
      userId,
      bet.gameId,
      {
        won: naturalRound.profit.greaterThan(0),
        amount: bet.amount,
        multiplier: naturalRound.multiplier,
        payout: naturalRound.payout,
      },
      {
        won: finalRound.profit.greaterThan(0),
        amount: bet.amount,
        multiplier: finalRound.multiplier,
        payout: finalRound.payout,
      },
      control,
      bet.id,
      toResultData(naturalRound, { ...control, controlled: false }),
      toResultData(finalRound, control),
    );
  }

  return toTwentyOneHalfState(updatedBet, stored, serverSeedHash, newBalance);
}

async function creditTwentyOneHalfPayout(
  tx: Prisma.TransactionClient,
  userId: string,
  payout: Prisma.Decimal,
  betId: string,
): Promise<Prisma.Decimal> {
  const updated = await tx.user.update({
    where: { id: userId },
    data: { balance: { increment: payout } },
  });
  await tx.transaction.create({
    data: {
      userId,
      type: 'BET_WIN',
      amount: payout,
      balanceAfter: updated.balance,
      betId,
    },
  });
  return updated.balance;
}

function toTwentyOneHalfState(
  bet: {
    id: string;
    gameId: string;
    amount: Prisma.Decimal;
    payout: Prisma.Decimal;
    profit: Prisma.Decimal;
    multiplier: Prisma.Decimal;
    nonce: number;
    clientSeedUsed: string;
  },
  data: TwentyOneHalfStoredData,
  serverSeedHash: string,
  newBalance?: Prisma.Decimal,
): TwentyOneHalfRoundState {
  const active = data.status === 'ACTIVE';
  const phase = getTwentyOneHalfPhase(data);
  const playerTurn = active && phase === 'PLAYER_TURN';
  const action = playerTurn
    ? getTwentyOneHalfAvailableAction(data.player)
    : { canHit: false, canStand: false, forcedAction: null as null };
  const canBankerDraw = active && phase === 'BANKER_TURN' && shouldTwentyOneHalfBankerDraw(data);
  const round = active ? null : buildTwentyOneHalfRoundFromState(data, bet.amount);
  return {
    roundId: bet.id,
    gameId: bet.gameId as LocalTableGameIdType,
    kind: 'twenty-one-half',
    roomName: data.roomName,
    status: data.status,
    phase,
    amount: bet.amount.toFixed(2),
    payout: active ? '0.00' : bet.payout.toFixed(2),
    profit: active ? '0.00' : bet.profit.toFixed(2),
    multiplier: active ? 0 : Number(bet.multiplier.toFixed(4)),
    player: active
      ? toTwentyOneHalfHand('閒家', data.player, true)
      : (round?.player ?? toTwentyOneHalfHand('閒家', data.player, true)),
    banker: active
      ? toTwentyOneHalfHand('莊家', data.banker, false)
      : (round?.banker ?? toTwentyOneHalfHand('莊家', data.banker, false)),
    outcome: data.outcome ?? null,
    outcomeLabel: data.outcomeLabel ?? null,
    summary: active ? activeTwentyOneHalfSummary(data) : (data.summary ?? round?.summary ?? ''),
    ruleSummary: ROOM_CONFIGS[bet.gameId as LocalTableGameIdType].ruleSummary,
    canHit: action.canHit,
    canStand: action.canStand,
    canBankerDraw,
    forcedAction: action.forcedAction,
    controlled: data.controlled ?? false,
    flipReason: data.flipReason ?? null,
    newBalance: newBalance?.toFixed(2),
    nonce: bet.nonce,
    serverSeedHash,
    clientSeed: bet.clientSeedUsed,
  };
}

async function findActiveStagedTableBet(
  tx: Prisma.TransactionClient,
  userId: string,
  roundId: string,
) {
  const [locked] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "Bet"
    WHERE id = ${roundId}
      AND "userId" = ${userId}
      AND status = 'PENDING'
      AND "gameId" = ANY(${[...STAGED_LOCAL_TABLE_GAME_IDS]}::text[])
    FOR UPDATE
  `;
  if (!locked) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
  const bet = await tx.bet.findUnique({ where: { id: locked.id } });
  if (!bet) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
  if (bet.status !== 'PENDING') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
  return bet;
}

function parseStagedTableData(value: Prisma.JsonValue): StagedLocalTableStoredData {
  const data = value as Partial<StagedLocalTableStoredData>;
  if (
    !data.kind ||
    !data.status ||
    !data.stage ||
    !data.gameId ||
    !data.roomName
  ) {
    throw new ApiError('INVALID_ACTION', 'Invalid table round data');
  }
  return {
    kind: data.kind,
    status: data.status,
    stage: data.stage,
    gameId: data.gameId,
    roomName: data.roomName,
    natural: data.natural ?? null,
    final: data.final ?? null,
    control: data.control ?? null,
    runControls: data.runControls ?? false,
    playerTiles: (data.playerTiles ?? []) as DominoTileInternal[],
    deck: (data.deck ?? []) as DominoTileInternal[],
    deckIndex: data.deckIndex ?? 0,
    playerSplitId: data.playerSplitId ?? null,
    revealedPlayerIndexes: normalizeTuiRevealIndexes(data.revealedPlayerIndexes),
    summary: data.summary ?? null,
  };
}

function normalizeTuiRevealIndexes(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const indexes: number[] = [];
  for (const item of value) {
    if ((item === 0 || item === 1) && !indexes.includes(item)) {
      indexes.push(item);
    }
  }
  return indexes;
}

function firstUnrevealedTuiIndex(revealed: number[]): number | null {
  if (!revealed.includes(0)) return 0;
  if (!revealed.includes(1)) return 1;
  return null;
}

function storeRound(round: RoundDraft): StoredRoundResult {
  return {
    gameId: round.gameId,
    kind: round.kind,
    roomName: round.roomName,
    outcome: round.outcome,
    outcomeLabel: round.outcomeLabel,
    multiplier: round.multiplier.toFixed(4),
    payout: round.payout.toFixed(2),
    profit: round.profit.toFixed(2),
    player: round.player,
    banker: round.banker,
    extraHands: round.extraHands ?? null,
    summary: round.summary,
    ruleSummary: round.ruleSummary,
    raw: round.raw ?? null,
  };
}

function roundFromStored(value?: StoredRoundResult | null): RoundDraft {
  if (!value) throw new ApiError('INVALID_ACTION', 'Missing round result');
  return {
    gameId: value.gameId,
    kind: value.kind,
    roomName: value.roomName,
    outcome: value.outcome,
    outcomeLabel: value.outcomeLabel,
    multiplier: new Prisma.Decimal(value.multiplier),
    payout: new Prisma.Decimal(value.payout),
    profit: new Prisma.Decimal(value.profit),
    player: value.player,
    banker: value.banker,
    extraHands: value.extraHands ?? undefined,
    summary: value.summary,
    ruleSummary: value.ruleSummary,
    raw: value.raw,
  };
}

function storeControlOutcome(control: ControlOutcome): StoredControlOutcome {
  return {
    won: control.won,
    multiplier: control.multiplier.toFixed(4),
    payout: control.payout.toFixed(2),
    controlled: control.controlled,
    flipReason: control.flipReason,
    controlId: control.controlId,
    minMultiplier: control.minMultiplier?.toFixed(4),
    maxMultiplier: control.maxMultiplier?.toFixed(4),
    maxPayout: control.maxPayout?.toFixed(2),
    gameMatchedPayoutOnly: control.gameMatchedPayoutOnly,
    burstCooldownRounds: control.burstCooldownRounds,
  };
}

function controlFromStored(value?: StoredControlOutcome | null): ControlOutcome {
  if (!value) {
    return {
      won: false,
      multiplier: new Prisma.Decimal(0),
      payout: new Prisma.Decimal(0),
      controlled: false,
    };
  }
  return {
    won: value.won,
    multiplier: new Prisma.Decimal(value.multiplier),
    payout: new Prisma.Decimal(value.payout),
    controlled: value.controlled,
    flipReason: value.flipReason,
    controlId: value.controlId,
    minMultiplier: value.minMultiplier ? new Prisma.Decimal(value.minMultiplier) : undefined,
    maxMultiplier: value.maxMultiplier ? new Prisma.Decimal(value.maxMultiplier) : undefined,
    maxPayout: value.maxPayout ? new Prisma.Decimal(value.maxPayout) : undefined,
    gameMatchedPayoutOnly: value.gameMatchedPayoutOnly,
    burstCooldownRounds: value.burstCooldownRounds,
  };
}

function toStagedTableState(
  bet: {
    id: string;
    gameId: string;
    amount: Prisma.Decimal;
    payout: Prisma.Decimal;
    profit: Prisma.Decimal;
    multiplier: Prisma.Decimal;
    nonce: number;
    clientSeedUsed: string;
  },
  data: StagedLocalTableStoredData,
  serverSeedHash: string,
  newBalance?: Prisma.Decimal,
): LocalTableRoundState {
  const active = data.status === 'ACTIVE';
  const finalRound = data.final ? roundFromStored(data.final) : null;
  const settledRound = active ? null : finalRound;
  const view = active
    ? stagedActiveView(data)
    : {
        player: settledRound?.player ?? emptyHand('閒家', '已結算'),
        banker: settledRound?.banker ?? emptyHand('莊家', '已結算'),
        extraHands: settledRound?.extraHands,
        summary: settledRound?.summary ?? data.summary ?? '',
        canReveal: false,
        revealLabel: null,
        revealedPlayerIndexes:
          data.kind === 'tui-tongzi' && settledRound ? [0, 1] : undefined,
        revealablePlayerIndexes: undefined,
        canSplit: false,
        splitOptions: undefined,
      };
  const control = data.control ? controlFromStored(data.control) : null;
  return {
    roundId: bet.id,
    gameId: bet.gameId as LocalTableGameIdType,
    kind: data.kind,
    roomName: data.roomName,
    status: data.status,
    stage: data.stage,
    amount: bet.amount.toFixed(2),
    payout: active ? '0.00' : bet.payout.toFixed(2),
    profit: active ? '0.00' : bet.profit.toFixed(2),
    multiplier: active ? 0 : Number(bet.multiplier.toFixed(4)),
    player: view.player,
    banker: view.banker,
    extraHands: view.extraHands,
    outcome: settledRound?.outcome ?? null,
    outcomeLabel: settledRound?.outcomeLabel ?? null,
    summary: view.summary,
    ruleSummary: ROOM_CONFIGS[bet.gameId as LocalTableGameIdType].ruleSummary,
    canReveal: view.canReveal,
    revealLabel: view.revealLabel,
    revealedPlayerIndexes: view.revealedPlayerIndexes,
    revealablePlayerIndexes: view.revealablePlayerIndexes,
    canSplit: view.canSplit,
    splitOptions: view.splitOptions,
    controlled: control?.controlled ?? false,
    flipReason: control?.flipReason ?? null,
    newBalance: newBalance?.toFixed(2),
    nonce: bet.nonce,
    serverSeedHash,
    clientSeed: bet.clientSeedUsed,
  };
}

function stagedActiveView(data: StagedLocalTableStoredData): {
  player: LocalTableHand;
  banker: LocalTableHand;
  extraHands?: LocalTableHand[];
  summary: string;
  canReveal: boolean;
  revealLabel: string | null;
  revealedPlayerIndexes?: number[];
  revealablePlayerIndexes?: number[];
  canSplit: boolean;
  splitOptions?: LocalTableSplitOption[];
} {
  if (data.kind === 'tui-tongzi') {
    const finalRound = roundFromStored(data.final);
    const playerPieces = finalRound.player.pieces;
    const revealedPlayerIndexes = normalizeTuiRevealIndexes(data.revealedPlayerIndexes);
    const revealablePlayerIndexes = [0, 1].filter((index) => !revealedPlayerIndexes.includes(index));
    const revealedPieces = revealedPlayerIndexes
      .map((index) => playerPieces[index])
      .filter((piece): piece is LocalTablePiece => Boolean(piece));
    return {
      player: partialHand(
        '閒家',
        revealedPieces,
        revealedPieces.length ? `${revealedPieces.length} 張已開` : '待翻牌',
        revealedPieces.length ? '等待下一張' : '兩張蓋牌',
      ),
      banker: finalRound.banker,
      summary:
        data.summary ??
        (revealedPieces.length
          ? '第一張已開，請翻另一張筒子比牌。'
          : '莊家已開，請翻閒家任一張筒子。'),
      canReveal: true,
      revealLabel: revealedPieces.length ? '翻第二張' : '翻閒家牌',
      revealedPlayerIndexes,
      revealablePlayerIndexes,
      canSplit: false,
    };
  }

  if (data.kind === 'card-war') {
    const finalRound = roundFromStored(data.final);
    if (data.stage === 'AWAIT_PLAYER_REVEAL') {
      return {
        player: emptyHand('閒家', '待開閒家牌'),
        banker: emptyHand('莊家', '待開莊家牌'),
        summary: data.summary ?? '下注完成，請先開閒家牌。',
        canReveal: true,
        revealLabel: '開閒家牌',
        canSplit: false,
      };
    }
    return {
      player: finalRound.player,
      banker: emptyHand('莊家', '待開莊家牌'),
      summary: data.summary ?? '閒家牌已開，請開莊家牌比大小。',
      canReveal: true,
      revealLabel: '開莊家牌',
      canSplit: false,
    };
  }

  const playerTiles = data.playerTiles ?? [];
  return {
    player: {
      title: '閒家手牌',
      pieces: playerTiles,
      scoreLabel: '四張待擺',
      rankLabel: '請選高低墩',
      detail: playerTiles.map((tile) => tile.name).join('、'),
    },
    banker: emptyHand('莊家', '擺牌後開牌'),
    summary: data.summary ?? '請選擇閒家高低兩墩，擺牌後莊家開牌比墩。',
    canReveal: false,
    revealLabel: null,
    canSplit: true,
    splitOptions: buildBlackDotSplitOptions(playerTiles),
  };
}

function emptyHand(title: string, label: string): LocalTableHand {
  return {
    title,
    pieces: [],
    scoreLabel: '--',
    rankLabel: label,
  };
}

function partialHand(
  title: string,
  pieces: LocalTablePiece[],
  scoreLabel: string,
  rankLabel: string,
): LocalTableHand {
  return {
    title,
    pieces,
    scoreLabel,
    rankLabel,
    detail: `${pieces.length} 張已開`,
  };
}

async function settleStagedTableBet(
  tx: Prisma.TransactionClient,
  userId: string,
  bet: {
    id: string;
    gameId: string;
    amount: Prisma.Decimal;
    nonce: number;
    clientSeedUsed: string;
    serverSeedId: string;
  },
  finalData: StagedLocalTableStoredData,
  naturalRound: RoundDraft,
  finalRound: RoundDraft,
  control: ControlOutcome,
  runControls: boolean,
  serverSeedHash: string,
): Promise<LocalTableRoundState> {
  const stored: StagedLocalTableStoredData = {
    ...finalData,
    status: 'SETTLED',
    stage: 'SETTLED',
    natural: storeRound(naturalRound),
    final: storeRound(finalRound),
    control: storeControlOutcome(control),
    summary: finalRound.summary,
  };

  const updatedBet = await tx.bet.update({
    where: { id: bet.id },
    data: {
      multiplier: finalRound.multiplier,
      payout: finalRound.payout,
      profit: finalRound.profit,
      status: 'SETTLED',
      settledAt: new Date(),
      resultData: toResultData(
        {
          ...finalRound,
          raw: control.controlled
            ? toResultData(naturalRound, { ...control, controlled: false })
            : null,
        },
        control,
      ),
    },
  });

  const newBalance = finalRound.payout.greaterThan(0)
    ? await creditTwentyOneHalfPayout(tx, userId, finalRound.payout, bet.id)
    : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

  if (runControls) {
    await finalizeControls(
      tx,
      userId,
      bet.gameId,
      {
        won: naturalRound.profit.greaterThan(0),
        amount: bet.amount,
        multiplier: naturalRound.multiplier,
        payout: naturalRound.payout,
      },
      {
        won: finalRound.profit.greaterThan(0),
        amount: bet.amount,
        multiplier: finalRound.multiplier,
        payout: finalRound.payout,
      },
      control,
      bet.id,
      toResultData(naturalRound, { ...control, controlled: false }),
      toResultData(finalRound, control),
    );
  }

  return toStagedTableState(updatedBet, stored, serverSeedHash, newBalance);
}

async function getLocalTableSeedBundle(
  tx: Prisma.TransactionClient,
  userId: string,
  gameCategory: string,
  providedClientSeed?: string,
): Promise<ActiveSeedBundle> {
  if (providedClientSeed) {
    return new SeedHelper(tx).getActiveBundle(userId, gameCategory, providedClientSeed);
  }

  const [bundle] = await tx.$queryRaw<ActiveSeedBundle[]>(Prisma.sql`
    WITH client AS (
      SELECT seed
      FROM "ClientSeed"
      WHERE "userId" = ${userId}
        AND "isActive" = true
      LIMIT 1
    ),
    updated_server AS (
      UPDATE "ServerSeed"
      SET nonce = nonce + 1
      WHERE id = (
        SELECT id
        FROM "ServerSeed"
        WHERE "userId" = ${userId}
          AND "gameCategory" = ${gameCategory}
          AND "isActive" = true
        LIMIT 1
        FOR UPDATE
      )
        AND EXISTS (SELECT 1 FROM client)
      RETURNING id, seed, "seedHash", nonce
    )
    SELECT
      updated_server.id AS "serverSeedId",
      updated_server.seed AS "serverSeed",
      updated_server."seedHash" AS "serverSeedHash",
      client.seed AS "clientSeed",
      updated_server.nonce
    FROM updated_server
    CROSS JOIN client
  `);

  if (bundle) return bundle;
  return new SeedHelper(tx).getActiveBundle(userId, gameCategory);
}

async function settleLocalTableBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  startingBalance: Prisma.Decimal,
  amount: Prisma.Decimal,
  payout: Prisma.Decimal,
  betId: string,
): Promise<Prisma.Decimal> {
  const balanceAfterBet = startingBalance.minus(amount).toDecimalPlaces(2);
  const finalBalance = balanceAfterBet.add(payout).toDecimalPlaces(2);

  await tx.user.update({
    where: { id: userId },
    data: { balance: finalBalance },
  });

  const transactions: Prisma.TransactionCreateManyInput[] = [
    {
      userId,
      type: 'BET_PLACE',
      amount: amount.negated(),
      balanceAfter: balanceAfterBet,
      betId,
    },
  ];
  if (payout.greaterThan(0)) {
    transactions.push({
      userId,
      type: 'BET_WIN',
      amount: payout,
      balanceAfter: finalBalance,
      betId,
    });
  }
  await tx.transaction.createMany({ data: transactions });

  return finalBalance;
}

async function shouldRunControlPipeline(
  tx: Prisma.TransactionClient,
  member: { id: string; username: string; agentId: string | null },
  gameId: LocalTableGameIdType,
  natural: RoundDraft,
): Promise<boolean> {
  void tx;
  void member;
  void gameId;
  void natural;
  // Local table games must flow through the shared control pipeline just like the
  // one-shot games. A preflight "has controls" shortcut can miss already-capped
  // win limits and path guards, so every settlement probes applyControls().
  return true;
}

function tuiTongziRoom(gameId: LocalTableGameIdType, roomName: string): RoomConfig {
  return {
    gameId,
    kind: 'tui-tongzi',
    roomName,
    ruleSummary: [
      '一筒至九筒與白板各四張，莊閒各兩張。',
      '牌型序：白板對、對子、二八槓、點數、鱉十。',
      '同牌型同點數由莊家吃平點。',
    ],
  };
}

function blackDotRoom(gameId: LocalTableGameIdType, roomName: string): RoomConfig {
  return {
    gameId,
    kind: 'black-dot',
    roomName,
    ruleSummary: [
      '使用天九牌三十二張，莊閒各四張。',
      '四張分成高低兩墩，對子大於點數，至尊寶為最大對。',
      '閒家高低兩墩都大於莊家才算勝，一勝一負為和，平點莊吃。',
    ],
  };
}

function getGameKind(gameId: LocalTableGameIdType): LocalTableKind {
  if (TWENTY_ONE_HALF_ID_SET.has(gameId)) return 'twenty-one-half';
  if (TUI_TONGZI_ID_SET.has(gameId)) return 'tui-tongzi';
  if (BLACK_DOT_ID_SET.has(gameId)) return 'black-dot';
  return 'card-war';
}

function buildRound(
  gameId: LocalTableGameIdType,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  streamOffset: number,
): RoundDraft {
  if (!LOCAL_TABLE_GAME_ID_SET.has(gameId)) {
    throw new Error(`Unsupported local table game: ${gameId}`);
  }
  const config = ROOM_CONFIGS[gameId];
  if (config.kind === 'twenty-one-half') return buildTwentyOneHalfRound(config, amount, seed, streamOffset);
  if (config.kind === 'tui-tongzi') return buildTuiTongziRound(config, amount, seed, streamOffset);
  if (config.kind === 'black-dot') return buildBlackDotRound(config, amount, seed, streamOffset);
  return buildCardWarRound(config, amount, seed, streamOffset);
}

function shapeRoundForControl(
  gameId: LocalTableGameIdType,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  natural: RoundDraft,
  control: ControlOutcome,
): { round: RoundDraft; control: ControlOutcome } {
  if (!control.controlled) return { round: natural, control };

  const desired: LocalTableOutcome = control.won ? 'WIN' : 'LOSE';
  const candidate = findRoundByOutcome(gameId, amount, seed, desired, control);
  if (candidate) return { round: { ...candidate, raw: natural }, control };

  if (control.won) {
    const forcedLoss = findRoundByOutcome(gameId, amount, seed, 'LOSE', control);
    if (forcedLoss) {
      return {
        round: { ...forcedLoss, raw: natural },
        control: controlAsForcedLoss(control),
      };
    }
  }

  return { round: natural, control: { ...control, controlled: false, flipReason: undefined } };
}

function findRoundByOutcome(
  gameId: LocalTableGameIdType,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  desired: LocalTableOutcome,
  control: ControlOutcome,
): RoundDraft | null {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    const round = buildRound(gameId, amount, { ...seed, nonce: seed.nonce + 1000 + attempt }, 0);
    if (round.outcome !== desired) continue;
    if (desired === 'WIN' && !multiplierMatchesControlBounds(round.multiplier, amount, control)) {
      continue;
    }
    return round;
  }
  return null;
}

function buildTwentyOneHalfRound(
  config: RoomConfig,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  streamOffset: number,
): RoundDraft {
  const stream = makeStream(seed, streamOffset);
  const deck = drawCards(stream, 52);
  const player = [deck[0]!, deck[2]!];
  const banker = [deck[1]!, deck[3]!];
  let deckIndex = 4;

  while (
    half21Score(player) < TEN_HALF_PLAYER_HIT_BELOW &&
    half21Score(player) <= TEN_HALF_LIMIT &&
    player.length < 5
  ) {
    player.push(deck[deckIndex++]!);
  }

  const playerScore = half21Score(player);
  if (playerScore <= TEN_HALF_LIMIT) {
    while (
      half21Score(banker) <= playerScore &&
      half21Score(banker) <= TEN_HALF_LIMIT &&
      banker.length < 5
    ) {
      banker.push(deck[deckIndex++]!);
    }
  }

  const bankerScore = half21Score(banker);
  const playerBust = playerScore > TEN_HALF_LIMIT;
  const bankerBust = bankerScore > TEN_HALF_LIMIT;
  const playerSpecial = !playerBust && (playerScore === TEN_HALF_LIMIT || player.length >= 5);
  let outcome: LocalTableOutcome;
  if (playerBust) outcome = 'LOSE';
  else if (bankerBust) outcome = 'WIN';
  else if (playerScore > bankerScore) outcome = 'WIN';
  else outcome = 'LOSE';

  const multiplier =
    outcome === 'WIN'
      ? playerSpecial
        ? HALF_21_SPECIAL_MULTIPLIER
        : TABLE_WIN_MULTIPLIER
      : new Prisma.Decimal(0);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);

  return {
    gameId: config.gameId,
    kind: config.kind,
    roomName: config.roomName,
    outcome,
    outcomeLabel: labelOutcome(outcome),
    multiplier,
    payout,
    profit,
    player: {
      title: '閒家',
      pieces: player,
      scoreLabel: formatHalfPoint(playerScore),
      rankLabel: playerBust ? '爆牌' : playerSpecial ? '特別勝型' : '半點牌',
      detail: `${player.length} 張`,
    },
    banker: {
      title: '莊家',
      pieces: banker,
      scoreLabel: formatHalfPoint(bankerScore),
      rankLabel: bankerBust ? '爆牌' : '莊家牌',
      detail: `${banker.length} 張`,
    },
    summary:
      outcome === 'WIN'
        ? `閒家 ${formatHalfPoint(playerScore)} 勝莊家 ${formatHalfPoint(bankerScore)}`
        : `莊家 ${formatHalfPoint(bankerScore)} 勝閒家 ${formatHalfPoint(playerScore)}`,
    ruleSummary: config.ruleSummary,
  };
}

function buildTuiTongziRound(
  config: RoomConfig,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  streamOffset: number,
): RoundDraft {
  const stream = makeStream(seed, streamOffset);
  const tiles = drawTubeTiles(stream, 4);
  const playerTiles = tiles.slice(0, 2);
  const bankerTiles = tiles.slice(2, 4);
  const playerRank = rankTubeHand(playerTiles);
  const bankerRank = rankTubeHand(bankerTiles);
  const comparison = compareRankedHands(playerRank, bankerRank);
  const outcome: LocalTableOutcome = comparison > 0 ? 'WIN' : 'LOSE';
  const multiplier = outcome === 'WIN' ? tuiTongziMultiplier(playerRank) : new Prisma.Decimal(0);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);

  return {
    gameId: config.gameId,
    kind: config.kind,
    roomName: config.roomName,
    outcome,
    outcomeLabel: labelOutcome(outcome),
    multiplier,
    payout,
    profit,
    player: toTubeHand('閒家', playerTiles, playerRank),
    banker: toTubeHand('莊家', bankerTiles, bankerRank),
    summary:
      outcome === 'WIN'
        ? `閒家 ${playerRank.label} 壓過莊家 ${bankerRank.label}`
        : `莊家 ${bankerRank.label} 吃閒家 ${playerRank.label}`,
    ruleSummary: config.ruleSummary,
  };
}

function buildBlackDotRound(
  config: RoomConfig,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  streamOffset: number,
): RoundDraft {
  const stream = makeStream(seed, streamOffset);
  const tiles = drawDominoTiles(stream, 8);
  const playerTiles = tiles.slice(0, 4);
  const bankerTiles = tiles.slice(4, 8);
  const playerSplit = bestDominoSplit(playerTiles);
  const bankerSplit = bestDominoSplit(bankerTiles);
  const lowCompare = compareRankedHands(playerSplit.low.rank, bankerSplit.low.rank);
  const highCompare = compareRankedHands(playerSplit.high.rank, bankerSplit.high.rank);
  const outcome: LocalTableOutcome =
    lowCompare > 0 && highCompare > 0
      ? 'WIN'
      : lowCompare <= 0 && highCompare <= 0
        ? 'LOSE'
        : 'PUSH';
  const multiplier =
    outcome === 'WIN'
      ? TABLE_WIN_MULTIPLIER
      : outcome === 'PUSH'
        ? new Prisma.Decimal(1)
        : new Prisma.Decimal(0);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);

  return {
    gameId: config.gameId,
    kind: config.kind,
    roomName: config.roomName,
    outcome,
    outcomeLabel: labelOutcome(outcome),
    multiplier,
    payout,
    profit,
    player: {
      title: '閒家',
      pieces: playerTiles,
      scoreLabel: `高墩 ${playerSplit.high.rank.scoreLabel} / 低墩 ${playerSplit.low.rank.scoreLabel}`,
      rankLabel: `${playerSplit.high.rank.label}｜${playerSplit.low.rank.label}`,
    },
    banker: {
      title: '莊家',
      pieces: bankerTiles,
      scoreLabel: `高墩 ${bankerSplit.high.rank.scoreLabel} / 低墩 ${bankerSplit.low.rank.scoreLabel}`,
      rankLabel: `${bankerSplit.high.rank.label}｜${bankerSplit.low.rank.label}`,
    },
    extraHands: [
      toDominoHand('閒家低墩', playerSplit.low.tiles, playerSplit.low.rank),
      toDominoHand('閒家高墩', playerSplit.high.tiles, playerSplit.high.rank),
      toDominoHand('莊家低墩', bankerSplit.low.tiles, bankerSplit.low.rank),
      toDominoHand('莊家高墩', bankerSplit.high.tiles, bankerSplit.high.rank),
    ],
    summary:
      outcome === 'WIN'
        ? `閒家高低兩墩皆大於莊家`
        : outcome === 'PUSH'
          ? `雙方各守一墩，和局退回本金`
          : `莊家高低兩墩守住，莊吃平點`,
    ruleSummary: config.ruleSummary,
  };
}

function buildBlackDotRoundFromSplit(
  config: RoomConfig,
  amount: Prisma.Decimal,
  playerTiles: DominoTileInternal[],
  bankerTiles: DominoTileInternal[],
  splitId: string,
): RoundDraft {
  const playerSplit = getBlackDotSplitOption(playerTiles, splitId);
  if (!playerSplit) throw new ApiError('INVALID_ACTION', '無效的高低墩選擇。');
  const bankerSplit = bestDominoSplit(bankerTiles);
  const lowCompare = compareRankedHands(playerSplit.lowRank, bankerSplit.low.rank);
  const highCompare = compareRankedHands(playerSplit.highRank, bankerSplit.high.rank);
  const outcome: LocalTableOutcome =
    lowCompare > 0 && highCompare > 0
      ? 'WIN'
      : lowCompare <= 0 && highCompare <= 0
        ? 'LOSE'
        : 'PUSH';
  const multiplier =
    outcome === 'WIN'
      ? TABLE_WIN_MULTIPLIER
      : outcome === 'PUSH'
        ? new Prisma.Decimal(1)
        : new Prisma.Decimal(0);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);

  return {
    gameId: config.gameId,
    kind: config.kind,
    roomName: config.roomName,
    outcome,
    outcomeLabel: labelOutcome(outcome),
    multiplier,
    payout,
    profit,
    player: {
      title: '閒家',
      pieces: playerTiles,
      scoreLabel: `高墩 ${playerSplit.highRank.scoreLabel} / 低墩 ${playerSplit.lowRank.scoreLabel}`,
      rankLabel: `${playerSplit.highRank.label}｜${playerSplit.lowRank.label}`,
      detail: '玩家擺牌',
    },
    banker: {
      title: '莊家',
      pieces: bankerTiles,
      scoreLabel: `高墩 ${bankerSplit.high.rank.scoreLabel} / 低墩 ${bankerSplit.low.rank.scoreLabel}`,
      rankLabel: `${bankerSplit.high.rank.label}｜${bankerSplit.low.rank.label}`,
      detail: '莊家最佳擺牌',
    },
    extraHands: [
      toDominoHand('閒家低墩', playerSplit.lowTiles, playerSplit.lowRank),
      toDominoHand('閒家高墩', playerSplit.highTiles, playerSplit.highRank),
      toDominoHand('莊家低墩', bankerSplit.low.tiles, bankerSplit.low.rank),
      toDominoHand('莊家高墩', bankerSplit.high.tiles, bankerSplit.high.rank),
    ],
    summary:
      outcome === 'WIN'
        ? `閒家高低兩墩皆大於莊家`
        : outcome === 'PUSH'
          ? `雙方各守一墩，和局退回本金`
          : `莊家高低兩墩守住，莊吃平點`,
    ruleSummary: config.ruleSummary,
  };
}

function shapeBlackDotRoundForControl(
  data: StagedLocalTableStoredData,
  amount: Prisma.Decimal,
  splitId: string,
  natural: RoundDraft,
  control: ControlOutcome,
): { round: RoundDraft; control: ControlOutcome } {
  if (!control.controlled) return { round: natural, control };

  const desired: LocalTableOutcome = control.won ? 'WIN' : 'LOSE';
  const shaped = findBlackDotBankerRoundForOutcome(data, amount, splitId, desired, control);
  if (shaped) return { round: shaped, control };

  if (control.won) {
    const forcedLossControl = controlAsForcedLoss(control);
    const forcedLoss = findBlackDotBankerRoundForOutcome(
      data,
      amount,
      splitId,
      'LOSE',
      forcedLossControl,
    );
    if (forcedLoss) return { round: forcedLoss, control: forcedLossControl };
  }

  return { round: natural, control: { ...control, controlled: false, flipReason: undefined } };
}

function findBlackDotBankerRoundForOutcome(
  data: StagedLocalTableStoredData,
  amount: Prisma.Decimal,
  splitId: string,
  desired: LocalTableOutcome,
  control: ControlOutcome,
): RoundDraft | null {
  const playerTiles = data.playerTiles ?? [];
  const deck = data.deck ?? [];
  const start = data.deckIndex ?? 4;
  const remaining = deck.slice(start);
  const limit = Math.min(remaining.length, 20);

  for (let a = 0; a < limit - 3; a += 1) {
    for (let b = a + 1; b < limit - 2; b += 1) {
      for (let c = b + 1; c < limit - 1; c += 1) {
        for (let d = c + 1; d < limit; d += 1) {
          const bankerTiles = [remaining[a]!, remaining[b]!, remaining[c]!, remaining[d]!];
          const round = buildBlackDotRoundFromSplit(
            ROOM_CONFIGS[data.gameId],
            amount,
            playerTiles,
            bankerTiles,
            splitId,
          );
          if (round.outcome !== desired) continue;
          if (desired === 'WIN' && !multiplierMatchesControlBounds(round.multiplier, amount, control)) {
            continue;
          }
          return round;
        }
      }
    }
  }

  return null;
}

function buildCardWarRound(
  config: RoomConfig,
  amount: Prisma.Decimal,
  seed: SeedBundle,
  streamOffset: number,
): RoundDraft {
  const stream = makeStream(seed, streamOffset);
  const [playerCard, bankerCard] = drawCards(stream, 2);
  const playerRank = cardWarRank(playerCard!);
  const bankerRank = cardWarRank(bankerCard!);
  const outcome: LocalTableOutcome =
    playerRank > bankerRank ? 'WIN' : playerRank === bankerRank ? 'PUSH' : 'LOSE';
  const multiplier =
    outcome === 'WIN' ? TABLE_WIN_MULTIPLIER : outcome === 'PUSH' ? new Prisma.Decimal(1) : new Prisma.Decimal(0);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);

  return {
    gameId: config.gameId,
    kind: config.kind,
    roomName: config.roomName,
    outcome,
    outcomeLabel: labelOutcome(outcome),
    multiplier,
    payout,
    profit,
    player: {
      title: '閒家',
      pieces: [playerCard!],
      scoreLabel: cardWarLabel(playerCard!),
      rankLabel: '單張高牌',
    },
    banker: {
      title: '莊家',
      pieces: [bankerCard!],
      scoreLabel: cardWarLabel(bankerCard!),
      rankLabel: '單張高牌',
    },
    summary:
      outcome === 'WIN'
        ? `${cardWarLabel(playerCard!)} 大於 ${cardWarLabel(bankerCard!)}`
        : outcome === 'PUSH'
          ? `${cardWarLabel(playerCard!)} 同點，退回本金`
          : `${cardWarLabel(bankerCard!)} 大於 ${cardWarLabel(playerCard!)}`,
    ruleSummary: config.ruleSummary,
  };
}

function makeStream(seed: SeedBundle, offset: number): IntStream {
  const stream = hmacIntStream(seed.serverSeed, seed.clientSeed, seed.nonce);
  for (let i = 0; i < offset; i += 1) stream.next();
  return stream;
}

function takeIndex(stream: IntStream, length: number): number {
  return (stream.next().value as number) % length;
}

function drawCards(stream: IntStream, count: number): CardInternal[] {
  const deck: CardInternal[] = [];
  for (const suit of CARD_SUITS) {
    for (let index = 0; index < CARD_RANKS.length; index += 1) {
      const rank = CARD_RANKS[index]!;
      deck.push({
        kind: 'card',
        rank,
        suit,
        label: `${rank}${suitSymbol(suit)}`,
        valueLabel: half21CardValue(index + 1) === 0.5 ? '0.5' : String(half21CardValue(index + 1)),
        rankValue: index + 1,
      });
    }
  }
  return drawUnique(stream, deck, count);
}

function drawTubeTiles(stream: IntStream, count: number): TubeTileInternal[] {
  const tiles: TubeTileInternal[] = [];
  for (const value of TUBE_VALUES) {
    for (let copy = 0; copy < 4; copy += 1) {
      tiles.push({
        kind: 'tube',
        id: `${value}-${copy}`,
        label: value === 0 ? '白板' : `${value}筒`,
        value,
        rankValue: value,
        isWhite: value === 0,
      });
    }
  }
  return drawUnique(stream, tiles, count);
}

function drawDominoTiles(stream: IntStream, count: number): DominoTileInternal[] {
  const tiles: DominoTileInternal[] = [];
  for (const tile of DOMINO_TILE_TYPES) {
    for (let copy = 0; copy < tile.copies; copy += 1) {
      tiles.push({
        kind: 'domino',
        id: `${tile.key}-${copy}`,
        name: tile.name,
        pips: tile.pips,
        pairKey: tile.pairKey,
        pairRank: tile.pairRank,
      });
    }
  }
  return drawUnique(stream, tiles, count);
}

function drawUnique<T>(stream: IntStream, source: T[], count: number): T[] {
  const deck = [...source];
  const drawn: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const index = takeIndex(stream, deck.length);
    drawn.push(deck.splice(index, 1)[0]!);
  }
  return drawn;
}

function half21CardValue(rankValue: number): number {
  if (rankValue >= 11) return 0.5;
  return rankValue;
}

function half21Score(cards: CardInternal[]): number {
  return cards.reduce((sum, card) => sum + half21CardValue(card.rankValue), 0);
}

function formatHalfPoint(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}點`;
}

function suitSymbol(suit: LocalTableCard['suit']): string {
  if (suit === 'spades') return '♠';
  if (suit === 'hearts') return '♥';
  if (suit === 'diamonds') return '♦';
  return '♣';
}

function rankTubeHand(tiles: TubeTileInternal[]): RankedHand {
  const values = tiles.map((tile) => tile.value);
  const allWhite = values.every((value) => value === 0);
  if (allWhite) {
    return { category: 5, rank: 10, label: '白板對', scoreLabel: '至尊' };
  }
  if (values[0] === values[1]) {
    const rank = values[0] === 0 ? 10 : values[0]!;
    return {
      category: 4,
      rank,
      label: `${tiles[0]!.label}對`,
      scoreLabel: `${rank === 10 ? '白板' : `${rank}筒`}對`,
    };
  }
  if (values.includes(2) && values.includes(8)) {
    return { category: 3, rank: 8, label: '二八槓', scoreLabel: '二八槓' };
  }
  const point = values.reduce((sum, value) => sum + value, 0) % 10;
  if (point === 0) {
    return { category: 0, rank: 0, label: '鱉十', scoreLabel: '0點' };
  }
  return { category: 1, rank: point, label: `${point}點`, scoreLabel: `${point}點` };
}

function compareRankedHands(a: RankedHand, b: RankedHand): number {
  if (a.category !== b.category) return a.category - b.category;
  if (a.rank !== b.rank) return a.rank - b.rank;
  return (a.subRank ?? 0) - (b.subRank ?? 0);
}

function tuiTongziMultiplier(rank: RankedHand): Prisma.Decimal {
  if (rank.category >= 5) return TUI_TONGZI_SUPREME_MULTIPLIER;
  if (rank.category >= 4) return TUI_TONGZI_PAIR_MULTIPLIER;
  return TABLE_WIN_MULTIPLIER;
}

function toTubeHand(title: string, tiles: TubeTileInternal[], rank: RankedHand): LocalTableHand {
  return {
    title,
    pieces: tiles,
    scoreLabel: rank.scoreLabel,
    rankLabel: rank.label,
    detail: tiles.map((tile) => tile.label).join('、'),
  };
}

function rankDominoPair(tiles: DominoTileInternal[]): RankedHand {
  const [first, second] = tiles;
  if (!first || !second) throw new Error('Domino hand requires two tiles');
  if (first.pairKey === second.pairKey) {
    const label = first.pairKey === 'gee' ? '至尊寶' : `${first.name}對`;
    return {
      category: 3,
      rank: first.pairRank,
      label,
      scoreLabel: label,
    };
  }

  const isHeavenOrEarthWithNine =
    hasHeavenOrEarth(first, second) && (isPointTile(first, 9) || isPointTile(second, 9));
  if (isHeavenOrEarthWithNine) {
    return {
      category: 2,
      rank: 2,
      subRank: Math.max(first.pairRank, second.pairRank),
      label: '王',
      scoreLabel: '王',
      detail: '天/地配九',
    };
  }

  const isHeavenOrEarthWithEight =
    hasHeavenOrEarth(first, second) && (isPointTile(first, 8) || isPointTile(second, 8));
  if (isHeavenOrEarthWithEight) {
    return {
      category: 2,
      rank: 1,
      subRank: Math.max(first.pairRank, second.pairRank),
      label: '槓',
      scoreLabel: '槓',
      detail: '天/地配八',
    };
  }

  const point = bestDominoPoint(first, second);
  return {
    category: 1,
    rank: point,
    subRank: Math.max(first.pairRank, second.pairRank),
    label: point === 0 ? '零點' : `${point}點`,
    scoreLabel: point === 0 ? '0點' : `${point}點`,
  };
}

function pipTotal(tile: DominoTileInternal): number {
  return tile.pips[0] + tile.pips[1];
}

function hasHeavenOrEarth(first: DominoTileInternal, second: DominoTileInternal): boolean {
  return (
    first.pairKey === 'heaven' ||
    first.pairKey === 'earth' ||
    second.pairKey === 'heaven' ||
    second.pairKey === 'earth'
  );
}

function isPointTile(tile: DominoTileInternal, point: 8 | 9): boolean {
  return point === 9
    ? tile.pairKey === 'mixed-nine'
    : tile.pairKey === 'mixed-eight';
}

function dominoPointValues(tile: DominoTileInternal): number[] {
  return tile.pairKey === 'gee' ? [3, 6] : [pipTotal(tile)];
}

function bestDominoPoint(first: DominoTileInternal, second: DominoTileInternal): number {
  let best = 0;
  for (const a of dominoPointValues(first)) {
    for (const b of dominoPointValues(second)) {
      best = Math.max(best, (a + b) % 10);
    }
  }
  return best;
}

function bestDominoSplit(tiles: DominoTileInternal[]): {
  low: { tiles: DominoTileInternal[]; rank: RankedHand };
  high: { tiles: DominoTileInternal[]; rank: RankedHand };
} {
  const [a, b, c, d] = tiles;
  if (!a || !b || !c || !d) throw new Error('Black Dot split requires four tiles');
  const pairings: Array<[DominoTileInternal[], DominoTileInternal[]]> = [
    [
      [a, b],
      [c, d],
    ],
    [
      [a, c],
      [b, d],
    ],
    [
      [a, d],
      [b, c],
    ],
  ];

  const ranked = pairings.map(([a, b]) => {
    const rankA = rankDominoPair(a);
    const rankB = rankDominoPair(b);
    const [lowTiles, lowRank, highTiles, highRank] =
      compareRankedHands(rankA, rankB) <= 0
        ? [a, rankA, b, rankB]
        : [b, rankB, a, rankA];
    return {
      low: { tiles: lowTiles, rank: lowRank },
      high: { tiles: highTiles, rank: highRank },
    };
  });

  return ranked.sort((a, b) => {
    const high = compareRankedHands(b.high.rank, a.high.rank);
    if (high !== 0) return high;
    return compareRankedHands(b.low.rank, a.low.rank);
  })[0]!;
}

function buildBlackDotSplitOptions(tiles: DominoTileInternal[]): LocalTableSplitOption[] {
  return listBlackDotSplitChoices(tiles).map((choice) => ({
    id: choice.id,
    label: `${choice.highRank.label} / ${choice.lowRank.label}`,
    lowIndexes: choice.lowIndexes,
    highIndexes: choice.highIndexes,
    low: toDominoHand('低墩', choice.lowTiles, choice.lowRank),
    high: toDominoHand('高墩', choice.highTiles, choice.highRank),
  }));
}

function getBlackDotSplitOption(
  tiles: DominoTileInternal[],
  splitId: string,
):
  | {
      id: string;
      lowIndexes: number[];
      highIndexes: number[];
      lowTiles: DominoTileInternal[];
      highTiles: DominoTileInternal[];
      lowRank: RankedHand;
      highRank: RankedHand;
    }
  | null {
  return listBlackDotSplitChoices(tiles).find((choice) => choice.id === splitId) ?? null;
}

function listBlackDotSplitChoices(tiles: DominoTileInternal[]): Array<{
  id: string;
  lowIndexes: number[];
  highIndexes: number[];
  lowTiles: DominoTileInternal[];
  highTiles: DominoTileInternal[];
  lowRank: RankedHand;
  highRank: RankedHand;
}> {
  const [a, b, c, d] = tiles;
  if (!a || !b || !c || !d) return [];
  const pairings: Array<[number[], number[]]> = [
    [
      [0, 1],
      [2, 3],
    ],
    [
      [0, 2],
      [1, 3],
    ],
    [
      [0, 3],
      [1, 2],
    ],
  ];

  return pairings.map(([leftIndexes, rightIndexes]) => {
    const leftTiles = leftIndexes.map((index) => tiles[index]!);
    const rightTiles = rightIndexes.map((index) => tiles[index]!);
    const leftRank = rankDominoPair(leftTiles);
    const rightRank = rankDominoPair(rightTiles);
    const leftIsLow = compareRankedHands(leftRank, rightRank) <= 0;
    const lowIndexes = leftIsLow ? leftIndexes : rightIndexes;
    const highIndexes = leftIsLow ? rightIndexes : leftIndexes;
    const lowTiles = leftIsLow ? leftTiles : rightTiles;
    const highTiles = leftIsLow ? rightTiles : leftTiles;
    const lowRank = leftIsLow ? leftRank : rightRank;
    const highRank = leftIsLow ? rightRank : leftRank;
    return {
      id: `${lowIndexes.join('-')}_${highIndexes.join('-')}`,
      lowIndexes,
      highIndexes,
      lowTiles,
      highTiles,
      lowRank,
      highRank,
    };
  });
}

function toDominoHand(
  title: string,
  tiles: DominoTileInternal[],
  rank: RankedHand,
): LocalTableHand {
  return {
    title,
    pieces: tiles,
    scoreLabel: rank.scoreLabel,
    rankLabel: rank.label,
    detail: tiles.map((tile) => tile.name).join('、'),
  };
}

function cardWarRank(card: CardInternal): number {
  return card.rankValue === 1 ? 14 : card.rankValue;
}

function cardWarLabel(card: CardInternal): string {
  return `${card.rank}${suitSymbol(card.suit)}`;
}

function labelOutcome(outcome: LocalTableOutcome): string {
  if (outcome === 'WIN') return '閒家勝';
  if (outcome === 'PUSH') return '和局';
  return '莊家勝';
}

function toResultData(round: RoundDraft, control: ControlOutcome): Prisma.InputJsonValue {
  return {
    gameId: round.gameId,
    kind: round.kind,
    roomName: round.roomName,
    outcome: round.outcome,
    outcomeLabel: round.outcomeLabel,
    multiplier: round.multiplier.toFixed(4),
    payout: round.payout.toFixed(2),
    profit: round.profit.toFixed(2),
    player: round.player,
    banker: round.banker,
    extraHands: round.extraHands ?? null,
    summary: round.summary,
    ruleSummary: round.ruleSummary,
    controlled: control.controlled,
    flipReason: control.flipReason ?? null,
    raw: round.raw ?? null,
  } as unknown as Prisma.InputJsonValue;
}

export const __localTableServiceTestHooks = {
  buildRound,
  buildTwentyOneHalfRoundFromState,
  bestDominoSplit,
  cardWarRank,
  compareRankedHands,
  controlAsForcedLoss,
  half21Score,
  prepareTwentyOneHalfBankerTurnData,
  rankDominoPair,
  rankTubeHand,
  settleTwentyOneHalfBanker,
  shapeBlackDotRoundForControl,
  shapeRoundForControl,
  shapeTwentyOneHalfBankerForControl,
  shapeTwentyOneHalfHitForControl,
  shouldTwentyOneHalfBankerDraw,
};
