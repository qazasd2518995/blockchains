import { PrismaClient, Prisma } from '@prisma/client';
import { hmacIntStream } from '@bg/provably-fair';
import {
  GameId,
  type BaccaratTableBetResult,
  type BaccaratTableBetSide,
  type BaccaratTableCard,
  type BaccaratTableGameIdType,
  type BaccaratTableHand,
  type BaccaratTableOutcome,
  type BaccaratTableRoundResult,
} from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import type { BaccaratBetInput } from './baccarat.schema.js';

type IntStream = Generator<number, any, unknown>;

interface SeedBundle {
  serverSeed: string;
  clientSeed: string;
  nonce: number;
}

interface BaccaratRoomConfig {
  gameId: BaccaratTableGameIdType;
  roomName: string;
}

interface BaccaratRoundDraft {
  gameId: BaccaratTableGameIdType;
  roomName: string;
  betSide: BaccaratTableBetSide;
  betLabel: string;
  outcome: BaccaratTableOutcome;
  outcomeLabel: string;
  result: BaccaratTableRoundResult;
  resultLabel: string;
  natural: boolean;
  multiplier: Prisma.Decimal;
  payout: Prisma.Decimal;
  profit: Prisma.Decimal;
  player: BaccaratTableHand;
  banker: BaccaratTableHand;
  summary: string;
  ruleSummary: string[];
  raw?: unknown;
}

const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);
const PLAYER_WIN_MULTIPLIER = new Prisma.Decimal(2);
const BANKER_WIN_MULTIPLIER = new Prisma.Decimal('1.95');
const TIE_WIN_MULTIPLIER = new Prisma.Decimal(9);
const BACCARAT_SHOE_DECKS = 8;

const ROOM_CONFIGS: Record<BaccaratTableGameIdType, BaccaratRoomConfig> = {
  [GameId.BACCARAT_DRAGON]: baccaratRoom(GameId.BACCARAT_DRAGON, '龍姬百家'),
  [GameId.BACCARAT_PANDA]: baccaratRoom(GameId.BACCARAT_PANDA, '熊貓百家'),
  [GameId.BACCARAT_FOX]: baccaratRoom(GameId.BACCARAT_FOX, '狐姬百家'),
  [GameId.BACCARAT_TIGER]: baccaratRoom(GameId.BACCARAT_TIGER, '虎爵百家'),
  [GameId.BACCARAT_PHOENIX]: baccaratRoom(GameId.BACCARAT_PHOENIX, '鳳凰百家'),
};

const RULE_SUMMARY = [
  'A=1，2-9 照點，10/J/Q/K=0，只看個位數。',
  '任一方前兩張 8/9 為 Natural，雙方停牌。',
  '閒家 0-5 補牌、6-7 停牌；莊家依第三張牌表補牌。',
  '閒/莊下注遇和退回本金；莊勝按 5% commission，和局 8:1。',
];

const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
const SUIT_LABELS = ['♠', '♥', '♦', '♣'] as const;

export class BaccaratService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: BaccaratBetInput): Promise<BaccaratTableBetResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runLockedTransaction(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount, input.gameId);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        `baccarat:${input.gameId}`,
        input.clientSeed,
      );
      const seedBundle = {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
      };

      const natural = buildBaccaratRound(input.gameId, amount, input.side, seedBundle);
      const predicted = {
        won: natural.profit.greaterThan(0),
        amount,
        multiplier: natural.multiplier,
        payout: natural.payout,
      };
      const controlled = await applyControls(tx, userId, input.gameId, predicted);
      const { round: finalRound, control: effectiveControl } = shapeBaccaratRoundForControl(
        input.gameId,
        amount,
        input.side,
        seedBundle,
        natural,
        controlled,
      );
      const originalResult = toResultData(natural, { ...controlled, controlled: false });
      const finalResult = toResultData(finalRound, effectiveControl);

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
          resultData: finalResult,
        },
      });

      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance = finalRound.payout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalRound.payout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

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
        originalResult,
        finalResult,
      );

      return toBetResult(finalRound, {
        betId: bet.id,
        amount,
        newBalance,
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
        control: effectiveControl,
      });
    });
  }
}

function baccaratRoom(
  gameId: BaccaratTableGameIdType,
  roomName: string,
): BaccaratRoomConfig {
  return { gameId, roomName };
}

function buildBaccaratRound(
  gameId: BaccaratTableGameIdType,
  amount: Prisma.Decimal,
  side: BaccaratTableBetSide,
  seed: SeedBundle,
): BaccaratRoundDraft {
  const config = ROOM_CONFIGS[gameId];
  const shoe = drawBaccaratShoe(makeStream(seed));
  const deal = evaluateBaccaratDeal(shoe);
  const outcome = baccaratWinner(deal.player.points, deal.banker.points);
  const result = baccaratBetResult(side, outcome);
  const multiplier = baccaratMultiplier(side, result);
  const payout = amount.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const profit = payout.minus(amount);
  const outcomeLabel = baccaratOutcomeLabel(outcome);
  const resultLabel = baccaratResultLabel(result);
  const naturalLabel = deal.natural ? 'Natural ' : '';

  return {
    gameId,
    roomName: config.roomName,
    betSide: side,
    betLabel: baccaratSideLabel(side),
    outcome,
    outcomeLabel,
    result,
    resultLabel,
    natural: deal.natural,
    multiplier,
    payout,
    profit,
    player: deal.player,
    banker: deal.banker,
    summary: `${naturalLabel}${outcomeLabel}，${resultLabel}`,
    ruleSummary: RULE_SUMMARY,
  };
}

function evaluateBaccaratDeal(cards: BaccaratTableCard[]): {
  player: BaccaratTableHand;
  banker: BaccaratTableHand;
  natural: boolean;
} {
  if (cards.length < 6) throw new Error('Baccarat deal requires at least six cards');
  const playerCards = [cards[0]!, cards[2]!];
  const bankerCards = [cards[1]!, cards[3]!];
  let nextIndex = 4;
  const initialPlayerPoints = baccaratPoints(playerCards);
  const initialBankerPoints = baccaratPoints(bankerCards);
  const natural = initialPlayerPoints >= 8 || initialBankerPoints >= 8;

  let playerThird: BaccaratTableCard | null = null;
  if (!natural) {
    if (initialPlayerPoints <= 5) {
      playerThird = cards[nextIndex++]!;
      playerCards.push(playerThird);
    }

    const bankerPoints = baccaratPoints(bankerCards);
    const bankerDraws = playerThird
      ? shouldBankerDraw(bankerPoints, playerThird.value)
      : bankerPoints <= 5;
    if (bankerDraws) bankerCards.push(cards[nextIndex++]!);
  }

  return {
    player: {
      cards: playerCards,
      points: baccaratPoints(playerCards),
      drewThirdCard: playerCards.length === 3,
    },
    banker: {
      cards: bankerCards,
      points: baccaratPoints(bankerCards),
      drewThirdCard: bankerCards.length === 3,
    },
    natural,
  };
}

function shouldBankerDraw(bankerPoints: number, playerThirdValue: number): boolean {
  if (bankerPoints <= 2) return true;
  if (bankerPoints === 3) return playerThirdValue !== 8;
  if (bankerPoints === 4) return playerThirdValue >= 2 && playerThirdValue <= 7;
  if (bankerPoints === 5) return playerThirdValue >= 4 && playerThirdValue <= 7;
  if (bankerPoints === 6) return playerThirdValue === 6 || playerThirdValue === 7;
  return false;
}

function baccaratPoints(cards: BaccaratTableCard[]): number {
  return cards.reduce((sum, card) => sum + card.value, 0) % 10;
}

function baccaratCardValue(rank: number): number {
  if (rank === 1) return 1;
  if (rank >= 10) return 0;
  return rank;
}

function baccaratWinner(playerPoints: number, bankerPoints: number): BaccaratTableOutcome {
  if (playerPoints > bankerPoints) return 'PLAYER';
  if (bankerPoints > playerPoints) return 'BANKER';
  return 'TIE';
}

function baccaratBetResult(
  side: BaccaratTableBetSide,
  outcome: BaccaratTableOutcome,
): BaccaratTableRoundResult {
  if (outcome === 'TIE' && side !== 'tie') return 'PUSH';
  if (side === 'player' && outcome === 'PLAYER') return 'WIN';
  if (side === 'banker' && outcome === 'BANKER') return 'WIN';
  if (side === 'tie' && outcome === 'TIE') return 'WIN';
  return 'LOSE';
}

function baccaratMultiplier(
  side: BaccaratTableBetSide,
  result: BaccaratTableRoundResult,
): Prisma.Decimal {
  if (result === 'PUSH') return ONE;
  if (result === 'LOSE') return ZERO;
  if (side === 'banker') return BANKER_WIN_MULTIPLIER;
  if (side === 'tie') return TIE_WIN_MULTIPLIER;
  return PLAYER_WIN_MULTIPLIER;
}

function shapeBaccaratRoundForControl(
  gameId: BaccaratTableGameIdType,
  amount: Prisma.Decimal,
  side: BaccaratTableBetSide,
  seed: SeedBundle,
  natural: BaccaratRoundDraft,
  control: ControlOutcome,
): { round: BaccaratRoundDraft; control: ControlOutcome } {
  if (!control.controlled) return { round: natural, control };

  const desired: BaccaratTableRoundResult = control.won ? 'WIN' : 'LOSE';
  const candidate = findBaccaratRoundByResult(gameId, amount, side, seed, desired, control);
  if (candidate) return { round: { ...candidate, raw: roundSnapshot(natural) }, control };

  if (control.won) {
    const forcedLoss = findBaccaratRoundByResult(gameId, amount, side, seed, 'LOSE', control);
    if (forcedLoss) {
      return {
        round: { ...forcedLoss, raw: roundSnapshot(natural) },
        control: controlAsForcedLoss(control),
      };
    }
  }

  return { round: natural, control: { ...control, controlled: false, flipReason: undefined } };
}

function findBaccaratRoundByResult(
  gameId: BaccaratTableGameIdType,
  amount: Prisma.Decimal,
  side: BaccaratTableBetSide,
  seed: SeedBundle,
  desired: BaccaratTableRoundResult,
  control: ControlOutcome,
): BaccaratRoundDraft | null {
  for (let attempt = 0; attempt < 720; attempt += 1) {
    const round = buildBaccaratRound(gameId, amount, side, {
      ...seed,
      nonce: seed.nonce + 1000 + attempt,
    });
    if (round.result !== desired) continue;
    if (desired === 'WIN' && !multiplierMatchesControlBounds(round.multiplier, amount, control)) {
      continue;
    }
    return round;
  }
  return null;
}

function controlAsForcedLoss(control: ControlOutcome): ControlOutcome {
  return {
    ...control,
    won: false,
    multiplier: ZERO,
    payout: ZERO,
    controlled: true,
    flipReason:
      control.flipReason === 'burst_risk_cap' ? 'burst_risk_guard' : 'control_bounds_guard',
  };
}

function drawBaccaratShoe(stream: IntStream): BaccaratTableCard[] {
  const shoe: BaccaratTableCard[] = [];
  for (let deck = 0; deck < BACCARAT_SHOE_DECKS; deck += 1) {
    for (let suit = 0; suit < SUIT_LABELS.length; suit += 1) {
      for (let rank = 1; rank <= RANK_LABELS.length; rank += 1) {
        shoe.push(toBaccaratCard(rank, suit));
      }
    }
  }

  for (let index = shoe.length - 1; index > 0; index -= 1) {
    const swapIndex = (stream.next().value as number) % (index + 1);
    const current = shoe[index]!;
    shoe[index] = shoe[swapIndex]!;
    shoe[swapIndex] = current;
  }
  return shoe;
}

function toBaccaratCard(rank: number, suit: number): BaccaratTableCard {
  const rankLabel = RANK_LABELS[rank - 1] ?? String(rank);
  const suitLabel = SUIT_LABELS[suit] ?? '♠';
  return {
    rank,
    suit,
    label: `${rankLabel}${suitLabel}`,
    value: baccaratCardValue(rank),
  };
}

function makeStream(seed: SeedBundle): IntStream {
  return hmacIntStream(seed.serverSeed, seed.clientSeed, seed.nonce);
}

function baccaratSideLabel(side: BaccaratTableBetSide): string {
  if (side === 'banker') return '莊家';
  if (side === 'tie') return '和';
  return '閒家';
}

function baccaratOutcomeLabel(outcome: BaccaratTableOutcome): string {
  if (outcome === 'BANKER') return '莊家勝';
  if (outcome === 'TIE') return '和局';
  return '閒家勝';
}

function baccaratResultLabel(result: BaccaratTableRoundResult): string {
  if (result === 'WIN') return '下注命中';
  if (result === 'PUSH') return '和局退回本金';
  return '未命中';
}

function toResultData(
  round: BaccaratRoundDraft,
  control: ControlOutcome,
): Prisma.InputJsonValue {
  const snapshot = roundSnapshot(round);
  return {
    ...snapshot,
    controlled: control.controlled,
    flipReason: control.flipReason ?? null,
    raw: control.controlled ? (round.raw as Prisma.InputJsonValue | undefined) ?? null : null,
  };
}

function roundSnapshot(round: BaccaratRoundDraft): Prisma.InputJsonObject {
  return {
    kind: 'baccarat',
    gameId: round.gameId,
    roomName: round.roomName,
    betSide: round.betSide,
    betLabel: round.betLabel,
    outcome: round.outcome,
    outcomeLabel: round.outcomeLabel,
    result: round.result,
    resultLabel: round.resultLabel,
    natural: round.natural,
    multiplier: Number(round.multiplier.toFixed(4)),
    payout: round.payout.toFixed(2),
    profit: round.profit.toFixed(2),
    player: round.player as unknown as Prisma.InputJsonValue,
    banker: round.banker as unknown as Prisma.InputJsonValue,
    playerCards: round.player.cards as unknown as Prisma.InputJsonValue,
    bankerCards: round.banker.cards as unknown as Prisma.InputJsonValue,
    playerPoints: round.player.points,
    bankerPoints: round.banker.points,
    summary: round.summary,
    ruleSummary: round.ruleSummary,
  };
}

function toBetResult(
  round: BaccaratRoundDraft,
  meta: {
    betId: string;
    amount: Prisma.Decimal;
    newBalance: Prisma.Decimal;
    nonce: number;
    serverSeedHash: string;
    clientSeed: string;
    control: ControlOutcome;
  },
): BaccaratTableBetResult {
  return {
    betId: meta.betId,
    gameId: round.gameId,
    kind: 'baccarat',
    roomName: round.roomName,
    betSide: round.betSide,
    betLabel: round.betLabel,
    outcome: round.outcome,
    outcomeLabel: round.outcomeLabel,
    result: round.result,
    resultLabel: round.resultLabel,
    natural: round.natural,
    amount: meta.amount.toFixed(2),
    payout: round.payout.toFixed(2),
    profit: round.profit.toFixed(2),
    multiplier: Number(round.multiplier.toFixed(4)),
    player: round.player,
    banker: round.banker,
    playerCards: round.player.cards,
    bankerCards: round.banker.cards,
    playerPoints: round.player.points,
    bankerPoints: round.banker.points,
    summary: round.summary,
    ruleSummary: round.ruleSummary,
    controlled: meta.control.controlled,
    flipReason: meta.control.flipReason ?? null,
    newBalance: meta.newBalance.toFixed(2),
    nonce: meta.nonce,
    serverSeedHash: meta.serverSeedHash,
    clientSeed: meta.clientSeed,
  };
}

export const __baccaratServiceTestHooks = {
  baccaratBetResult,
  baccaratCardValue,
  baccaratMultiplier,
  baccaratPoints,
  buildBaccaratRound,
  evaluateBaccaratDeal,
  shapeBaccaratRoundForControl,
  shouldBankerDraw,
  toBaccaratCard,
};
