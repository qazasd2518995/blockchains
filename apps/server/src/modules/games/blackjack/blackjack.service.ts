import { PrismaClient, Prisma } from '@prisma/client';
import {
  BLACKJACK_HOUSE_RULES,
  blackjackDealerShouldHit,
  blackjackDeck,
  blackjackScore,
  blackjackSplitValue,
  type BlackjackCard,
} from '@bg/provably-fair';
import {
  GameId,
  type BlackjackHandStatus,
  type BlackjackOutcome,
  type BlackjackPlayerHand,
  type BlackjackRoundResult,
  type BlackjackRoundState,
} from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runSerializable,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { BlackjackActionInput, BlackjackStartInput } from './blackjack.schema.js';

const MAX_SPLIT_HANDS = 4;

interface StoredBlackjackHand {
  id: string;
  cards: BlackjackCard[];
  bet: string;
  status: BlackjackHandStatus;
  doubled: boolean;
  splitAces: boolean;
  outcome?: BlackjackOutcome;
  payout?: string;
  multiplier?: string;
}

interface BlackjackRoundRecord {
  id: string;
  status: 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';
  betAmount: Prisma.Decimal;
  totalBetAmount: Prisma.Decimal;
  dealerHand: Prisma.JsonValue;
  playerHands: Prisma.JsonValue;
  activeHandIndex: number;
  deck: Prisma.JsonValue;
  deckIndex: number;
  currentMultiplier: Prisma.Decimal;
  nonce: number;
  serverSeedId: string;
  clientSeedUsed: string;
}

interface ControlledBlackjackSettlement {
  dealerHand: BlackjackCard[];
  hands: StoredBlackjackHand[];
  payout: Prisma.Decimal;
  multiplier: Prisma.Decimal;
  controlled: boolean;
  flipReason?: string;
  outcome: ControlOutcome;
}

export class BlackjackService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, input: BlackjackStartInput): Promise<BlackjackRoundResult> {
    const amount = new Prisma.Decimal(input.amount);

    return runSerializable(this.prisma, async (tx) => {
      const active = await tx.blackjackRound.findFirst({ where: { userId, status: 'ACTIVE' } });
      if (active) throw new ApiError('INVALID_ACTION', 'You have an active Blackjack round');

      await lockUserAndCheckFunds(tx, userId, amount);
      const seed = await new SeedHelper(tx).getActiveBundle(userId, GameId.BLACKJACK, input.clientSeed);
      const deck = blackjackDeck(seed.serverSeed, seed.clientSeed, seed.nonce);
      const playerCards = [deck[0]!, deck[2]!];
      const dealerHand = [deck[1]!, deck[3]!];
      const playerHands: StoredBlackjackHand[] = [
        {
          id: 'hand-1',
          cards: playerCards,
          bet: amount.toFixed(2),
          status: 'PLAYING',
          doubled: false,
          splitAces: false,
        },
      ];

      let newBalance = await debitAndRecord(tx, userId, amount);
      const natural = settleOpeningBlackjack(playerHands, dealerHand, amount);
      const openingControl = natural
        ? await applyControls(tx, userId, GameId.BLACKJACK, {
            won: natural.payout.greaterThan(amount),
            amount,
            multiplier: natural.multiplier,
            payout: natural.payout,
          })
        : null;
      const controlledNatural = natural
        ? applyBlackjackControl(natural.hands, dealerHand, amount, openingControl!)
        : null;
      const finalOpeningHands = controlledNatural?.hands ?? natural?.hands ?? playerHands;
      const finalOpeningDealer = controlledNatural?.dealerHand ?? dealerHand;
      const finalOpeningPayout = controlledNatural?.payout ?? natural?.payout ?? new Prisma.Decimal(0);
      const finalOpeningMultiplier = controlledNatural?.multiplier ?? natural?.multiplier ?? new Prisma.Decimal(1);
      const finalOpeningStatus =
        finalOpeningPayout.greaterThan(0) ? 'CASHED_OUT' : 'BUSTED';

      const round = await tx.blackjackRound.create({
        data: {
          userId,
          betAmount: amount,
          totalBetAmount: amount,
          dealerHand: finalOpeningDealer as unknown as Prisma.InputJsonValue,
          playerHands: finalOpeningHands as unknown as Prisma.InputJsonValue,
          activeHandIndex: 0,
          deck: deck as unknown as Prisma.InputJsonValue,
          deckIndex: 4,
          currentMultiplier: finalOpeningMultiplier,
          status: natural ? finalOpeningStatus : 'ACTIVE',
          nonce: seed.nonce,
          serverSeedId: seed.serverSeedId,
          clientSeedUsed: seed.clientSeed,
          finishedAt: natural ? new Date() : undefined,
        },
      });

      if (natural) {
        const bet = await tx.bet.create({
          data: {
            userId,
            gameId: GameId.BLACKJACK,
            amount,
            multiplier: finalOpeningMultiplier,
            payout: finalOpeningPayout,
            profit: finalOpeningPayout.minus(amount),
            nonce: seed.nonce,
            clientSeedUsed: seed.clientSeed,
            serverSeedId: seed.serverSeedId,
            resultData: {
              dealerHand: finalOpeningDealer,
              playerHands: finalOpeningHands,
              rules: blackjackRulesPayload(),
              openingNatural: true,
              controlled: controlledNatural?.controlled ?? false,
              flipReason: controlledNatural?.flipReason ?? null,
              raw: controlledNatural?.controlled
                ? {
                    dealerHand,
                    playerHands: natural.hands,
                    totalPayout: natural.payout.toFixed(2),
                    rules: blackjackRulesPayload(),
                    openingNatural: true,
                  }
                : null,
            } as unknown as Prisma.InputJsonValue,
            blackjackRoundId: round.id,
          },
        });
        if (finalOpeningPayout.greaterThan(0)) {
          newBalance = await creditAndRecord(tx, userId, finalOpeningPayout, bet.id, 'BET_WIN');
        }
        await finalizeControls(
          tx,
          userId,
          GameId.BLACKJACK,
          { won: natural.payout.greaterThan(amount), amount, multiplier: natural.multiplier, payout: natural.payout },
          {
            won: finalOpeningPayout.greaterThan(amount),
            amount,
            multiplier: finalOpeningMultiplier,
            payout: finalOpeningPayout,
          },
          controlledNatural?.outcome ?? openingControl!,
          bet.id,
          {
            dealerHand,
            playerHands: natural.hands,
            totalPayout: natural.payout.toFixed(2),
            rules: blackjackRulesPayload(),
            openingNatural: true,
          } as unknown as Prisma.InputJsonValue,
          {
            dealerHand: finalOpeningDealer,
            playerHands: finalOpeningHands,
            totalPayout: finalOpeningPayout.toFixed(2),
            controlled: controlledNatural?.controlled ?? false,
            flipReason: controlledNatural?.flipReason ?? null,
            rules: blackjackRulesPayload(),
            openingNatural: true,
          } as unknown as Prisma.InputJsonValue,
        );
      }

      return {
        state: this.toState(round, seed.serverSeedHash),
        newBalance: newBalance.toFixed(2),
      };
    });
  }

  async hit(userId: string, input: BlackjackActionInput): Promise<BlackjackRoundResult> {
    return this.withActiveRound(userId, input.roundId, async (tx, round, serverSeedHash) => {
      const hands = parseHands(round.playerHands);
      const deck = parseDeck(round.deck);
      const active = getActiveHandOrThrow(hands, round.activeHandIndex);
      if (active.splitAces) throw new ApiError('INVALID_ACTION', 'Split aces receive one card only');

      const { card, nextIndex } = drawCard(deck, round.deckIndex);
      active.cards = [...active.cards, card];
      const score = blackjackScore(active.cards);
      if (score.isBust) {
        active.status = 'BUSTED';
        active.outcome = 'LOSE';
        active.payout = '0.00';
        active.multiplier = '0.0000';
      } else if (score.total === 21) {
        active.status = 'STANDING';
      }

      const nextActive = findNextPlayingHand(hands, round.activeHandIndex);
      if (nextActive === -1) {
        return this.resolveRound(tx, userId, round, hands, parseCards(round.dealerHand), deck, nextIndex, serverSeedHash);
      }

      const updated = await tx.blackjackRound.update({
        where: { id: round.id },
        data: {
          playerHands: hands as unknown as Prisma.InputJsonValue,
          activeHandIndex: nextActive,
          deckIndex: nextIndex,
        },
      });
      return { state: this.toState(updated, serverSeedHash) };
    });
  }

  async stand(userId: string, input: BlackjackActionInput): Promise<BlackjackRoundResult> {
    return this.withActiveRound(userId, input.roundId, async (tx, round, serverSeedHash) => {
      const hands = parseHands(round.playerHands);
      const active = getActiveHandOrThrow(hands, round.activeHandIndex);
      active.status = 'STANDING';

      const nextActive = findNextPlayingHand(hands, round.activeHandIndex);
      if (nextActive === -1) {
        return this.resolveRound(
          tx,
          userId,
          round,
          hands,
          parseCards(round.dealerHand),
          parseDeck(round.deck),
          round.deckIndex,
          serverSeedHash,
        );
      }

      const updated = await tx.blackjackRound.update({
        where: { id: round.id },
        data: {
          playerHands: hands as unknown as Prisma.InputJsonValue,
          activeHandIndex: nextActive,
        },
      });
      return { state: this.toState(updated, serverSeedHash) };
    });
  }

  async double(userId: string, input: BlackjackActionInput): Promise<BlackjackRoundResult> {
    return this.withActiveRound(userId, input.roundId, async (tx, round, serverSeedHash) => {
      const hands = parseHands(round.playerHands);
      const deck = parseDeck(round.deck);
      const active = getActiveHandOrThrow(hands, round.activeHandIndex);
      if (!canDoubleHand(active)) throw new ApiError('INVALID_ACTION', 'You can double only on a fresh two-card hand');

      const extraBet = new Prisma.Decimal(active.bet);
      await lockUserAndCheckFunds(tx, userId, extraBet);
      let newBalance = await debitAndRecord(tx, userId, extraBet);

      const { card, nextIndex } = drawCard(deck, round.deckIndex);
      active.cards = [...active.cards, card];
      active.bet = extraBet.mul(2).toFixed(2);
      active.doubled = true;
      const score = blackjackScore(active.cards);
      if (score.isBust) {
        active.status = 'BUSTED';
        active.outcome = 'LOSE';
        active.payout = '0.00';
        active.multiplier = '0.0000';
      } else {
        active.status = 'STANDING';
      }

      const nextTotalBet = round.totalBetAmount.add(extraBet);
      const nextActive = findNextPlayingHand(hands, round.activeHandIndex);
      const roundWithExtra = { ...round, totalBetAmount: nextTotalBet, deckIndex: nextIndex };
      if (nextActive === -1) {
        const settled = await this.resolveRound(
          tx,
          userId,
          roundWithExtra,
          hands,
          parseCards(round.dealerHand),
          deck,
          nextIndex,
          serverSeedHash,
        );
        return { ...settled, newBalance: settled.newBalance ?? newBalance.toFixed(2) };
      }

      const updated = await tx.blackjackRound.update({
        where: { id: round.id },
        data: {
          playerHands: hands as unknown as Prisma.InputJsonValue,
          totalBetAmount: nextTotalBet,
          activeHandIndex: nextActive,
          deckIndex: nextIndex,
        },
      });
      return { state: this.toState(updated, serverSeedHash), newBalance: newBalance.toFixed(2) };
    });
  }

  async split(userId: string, input: BlackjackActionInput): Promise<BlackjackRoundResult> {
    return this.withActiveRound(userId, input.roundId, async (tx, round, serverSeedHash) => {
      const hands = parseHands(round.playerHands);
      const deck = parseDeck(round.deck);
      const active = getActiveHandOrThrow(hands, round.activeHandIndex);
      if (!canSplitHand(active, hands.length)) {
        throw new ApiError('INVALID_ACTION', 'This hand cannot be split');
      }

      const extraBet = new Prisma.Decimal(active.bet);
      await lockUserAndCheckFunds(tx, userId, extraBet);
      let newBalance = await debitAndRecord(tx, userId, extraBet);

      const firstDraw = drawCard(deck, round.deckIndex);
      const secondDraw = drawCard(deck, firstDraw.nextIndex);
      const splitAces = active.cards[0]!.rank === 1;
      const firstHand: StoredBlackjackHand = {
        id: `${active.id}a`,
        cards: [active.cards[0]!, firstDraw.card],
        bet: active.bet,
        status: splitAces ? 'STANDING' : 'PLAYING',
        doubled: false,
        splitAces,
      };
      const secondHand: StoredBlackjackHand = {
        id: `${active.id}b`,
        cards: [active.cards[1]!, secondDraw.card],
        bet: active.bet,
        status: splitAces ? 'STANDING' : 'PLAYING',
        doubled: false,
        splitAces,
      };
      hands.splice(round.activeHandIndex, 1, firstHand, secondHand);

      const nextTotalBet = round.totalBetAmount.add(extraBet);
      const nextActive = splitAces ? findNextPlayingHand(hands, round.activeHandIndex) : round.activeHandIndex;
      const roundWithExtra = { ...round, totalBetAmount: nextTotalBet, deckIndex: secondDraw.nextIndex };
      if (nextActive === -1) {
        const settled = await this.resolveRound(
          tx,
          userId,
          roundWithExtra,
          hands,
          parseCards(round.dealerHand),
          deck,
          secondDraw.nextIndex,
          serverSeedHash,
        );
        return { ...settled, newBalance: settled.newBalance ?? newBalance.toFixed(2) };
      }

      const updated = await tx.blackjackRound.update({
        where: { id: round.id },
        data: {
          playerHands: hands as unknown as Prisma.InputJsonValue,
          totalBetAmount: nextTotalBet,
          activeHandIndex: nextActive,
          deckIndex: secondDraw.nextIndex,
        },
      });
      return { state: this.toState(updated, serverSeedHash), newBalance: newBalance.toFixed(2) };
    });
  }

  async getActive(userId: string): Promise<BlackjackRoundState | null> {
    const round = await this.prisma.blackjackRound.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
    if (!round) return null;
    const serverSeedRecord = await this.prisma.serverSeed.findUniqueOrThrow({
      where: { id: round.serverSeedId },
    });
    return this.toState(round, serverSeedRecord.seedHash);
  }

  private async withActiveRound<T>(
    userId: string,
    roundId: string,
    fn: (
      tx: Prisma.TransactionClient,
      round: BlackjackRoundRecord,
      serverSeedHash: string,
    ) => Promise<T>,
  ): Promise<T> {
    return runSerializable(this.prisma, async (tx) => {
      const round = await tx.blackjackRound.findFirst({
        where: { id: roundId, userId },
      });
      if (!round) throw new ApiError('ROUND_NOT_FOUND', 'Round not found');
      if (round.status !== 'ACTIVE') throw new ApiError('ROUND_NOT_ACTIVE', 'Round is not active');
      const serverSeed = await tx.serverSeed.findUniqueOrThrow({
        where: { id: round.serverSeedId },
      });
      return fn(tx, round, serverSeed.seedHash);
    });
  }

  private async resolveRound(
    tx: Prisma.TransactionClient,
    userId: string,
    round: BlackjackRoundRecord,
    hands: StoredBlackjackHand[],
    dealerHand: BlackjackCard[],
    deck: BlackjackCard[],
    deckIndex: number,
    serverSeedHash: string,
  ): Promise<BlackjackRoundResult> {
    let nextDeckIndex = deckIndex;
    const hasLiveHands = hands.some((hand) => blackjackScore(hand.cards).isBust === false);
    let finalDealerHand = dealerHand;
    if (hasLiveHands) {
      finalDealerHand = [...dealerHand];
      while (blackjackDealerShouldHit(finalDealerHand)) {
        const drawn = drawCard(deck, nextDeckIndex);
        finalDealerHand.push(drawn.card);
        nextDeckIndex = drawn.nextIndex;
      }
    }

    const raw = settleBlackjackHands(hands, finalDealerHand);
    const rawPayout = sumHandPayout(raw);
    const rawMultiplier = multiplierFromPayout(rawPayout, round.totalBetAmount);
    const controlled = await applyControls(tx, userId, GameId.BLACKJACK, {
      won: rawPayout.greaterThan(round.totalBetAmount),
      amount: round.totalBetAmount,
      multiplier: rawMultiplier,
      payout: rawPayout,
    });

    const controlledFinal = applyBlackjackControl(raw, finalDealerHand, round.totalBetAmount, controlled);
    const finalHands = controlledFinal.hands;
    const finalDealer = controlledFinal.dealerHand;
    const finalPayout = controlledFinal.payout;
    const finalMultiplier = controlledFinal.multiplier;
    const finalStatus = finalPayout.greaterThan(0) ? 'CASHED_OUT' : 'BUSTED';
    const profit = finalPayout.minus(round.totalBetAmount);

    const originalResult = {
      dealerHand: finalDealerHand,
      playerHands: raw,
      deckIndex: nextDeckIndex,
      totalPayout: rawPayout.toFixed(2),
      rules: blackjackRulesPayload(),
    };
    const finalResult = {
      dealerHand: finalDealer,
      playerHands: finalHands,
      deckIndex: nextDeckIndex,
      totalPayout: finalPayout.toFixed(2),
      controlled: controlledFinal.controlled,
      flipReason: controlledFinal.flipReason ?? null,
      raw: controlledFinal.controlled ? originalResult : null,
      rules: blackjackRulesPayload(),
    };

    const updated = await tx.blackjackRound.update({
      where: { id: round.id },
      data: {
        dealerHand: finalDealer as unknown as Prisma.InputJsonValue,
        playerHands: finalHands as unknown as Prisma.InputJsonValue,
        activeHandIndex: finalHands.length,
        deckIndex: nextDeckIndex,
        currentMultiplier: finalMultiplier,
        totalBetAmount: round.totalBetAmount,
        status: finalStatus,
        finishedAt: new Date(),
      },
    });
    const bet = await tx.bet.create({
      data: {
        userId,
        gameId: GameId.BLACKJACK,
        amount: round.totalBetAmount,
        multiplier: finalMultiplier,
        payout: finalPayout,
        profit,
        nonce: round.nonce,
        clientSeedUsed: round.clientSeedUsed,
        serverSeedId: round.serverSeedId,
        resultData: finalResult as unknown as Prisma.InputJsonValue,
        blackjackRoundId: round.id,
      },
    });
    const newBalance = finalPayout.greaterThan(0)
      ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
      : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

    await finalizeControls(
      tx,
      userId,
      GameId.BLACKJACK,
      {
        won: rawPayout.greaterThan(round.totalBetAmount),
        amount: round.totalBetAmount,
        multiplier: rawMultiplier,
        payout: rawPayout,
      },
      {
        won: finalPayout.greaterThan(round.totalBetAmount),
        amount: round.totalBetAmount,
        multiplier: finalMultiplier,
        payout: finalPayout,
      },
      controlledFinal.outcome,
      bet.id,
      originalResult as unknown as Prisma.InputJsonValue,
      finalResult as unknown as Prisma.InputJsonValue,
    );

    return {
      state: this.toState(updated, serverSeedHash),
      newBalance: newBalance.toFixed(2),
    };
  }

  private toState(round: BlackjackRoundRecord, serverSeedHash: string): BlackjackRoundState {
    const hands = parseHands(round.playerHands);
    const dealerHand = parseCards(round.dealerHand);
    const isActive = round.status === 'ACTIVE';
    const activeHand = hands[round.activeHandIndex] ?? null;
    const visibleDealerCards = isActive ? dealerHand.slice(0, 1) : dealerHand;
    const potentialPayout = isActive
      ? estimateActivePayout(hands, round.activeHandIndex)
      : round.totalBetAmount.mul(round.currentMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    return {
      roundId: round.id,
      status: round.status,
      dealerCards: visibleDealerCards,
      dealerScore: visibleDealerCards.length > 0 ? blackjackScore(visibleDealerCards) : null,
      dealerHoleHidden: isActive && dealerHand.length > 1,
      playerHands: hands.map(toPublicHand),
      activeHandIndex: round.activeHandIndex,
      amount: round.betAmount.toFixed(2),
      totalBetAmount: round.totalBetAmount.toFixed(2),
      potentialPayout: potentialPayout.toFixed(2),
      canHit: Boolean(activeHand && canHitHand(activeHand)),
      canStand: Boolean(activeHand && activeHand.status === 'PLAYING'),
      canDouble: Boolean(activeHand && canDoubleHand(activeHand)),
      canSplit: Boolean(activeHand && canSplitHand(activeHand, hands.length)),
      deckIndex: round.deckIndex,
      serverSeedHash,
      nonce: round.nonce,
    };
  }
}

function settleOpeningBlackjack(
  hands: StoredBlackjackHand[],
  dealerHand: BlackjackCard[],
  amount: Prisma.Decimal,
): { hands: StoredBlackjackHand[]; payout: Prisma.Decimal; multiplier: Prisma.Decimal; status: 'BUSTED' | 'CASHED_OUT' } | null {
  const playerScore = blackjackScore(hands[0]!.cards);
  const dealerScore = blackjackScore(dealerHand);
  if (!playerScore.isBlackjack && !dealerScore.isBlackjack) return null;

  const settled = hands.map((hand) => ({ ...hand, status: 'RESOLVED' as const }));
  let payout = new Prisma.Decimal(0);
  if (playerScore.isBlackjack && dealerScore.isBlackjack) {
    payout = amount;
    settled[0]!.outcome = 'PUSH';
    settled[0]!.payout = amount.toFixed(2);
    settled[0]!.multiplier = '1.0000';
  } else if (playerScore.isBlackjack) {
    payout = amount.mul(BLACKJACK_HOUSE_RULES.blackjackPayout).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    settled[0]!.outcome = 'BLACKJACK';
    settled[0]!.payout = payout.toFixed(2);
    settled[0]!.multiplier = BLACKJACK_HOUSE_RULES.blackjackPayout.toFixed(4);
  } else {
    settled[0]!.outcome = 'LOSE';
    settled[0]!.payout = '0.00';
    settled[0]!.multiplier = '0.0000';
  }

  return {
    hands: settled,
    payout,
    multiplier: multiplierFromPayout(payout, amount),
    status: payout.greaterThan(0) ? 'CASHED_OUT' : 'BUSTED',
  };
}

export function settleBlackjackHands(
  hands: StoredBlackjackHand[],
  dealerHand: BlackjackCard[],
): StoredBlackjackHand[] {
  const dealerScore = blackjackScore(dealerHand);
  return hands.map((hand) => {
    const score = blackjackScore(hand.cards);
    const bet = new Prisma.Decimal(hand.bet);
    const next: StoredBlackjackHand = { ...hand, status: 'RESOLVED' };

    if (score.isBust || hand.status === 'BUSTED') {
      next.outcome = 'LOSE';
      next.payout = '0.00';
      next.multiplier = '0.0000';
      return next;
    }

    if (dealerScore.isBust || score.total > dealerScore.total) {
      const payout = bet.mul(BLACKJACK_HOUSE_RULES.regularWinPayout);
      next.outcome = 'WIN';
      next.payout = payout.toFixed(2);
      next.multiplier = BLACKJACK_HOUSE_RULES.regularWinPayout.toFixed(4);
      return next;
    }

    if (score.total === dealerScore.total) {
      next.outcome = 'PUSH';
      next.payout = bet.toFixed(2);
      next.multiplier = BLACKJACK_HOUSE_RULES.pushPayout.toFixed(4);
      return next;
    }

    next.outcome = 'LOSE';
    next.payout = '0.00';
    next.multiplier = '0.0000';
    return next;
  });
}

function applyBlackjackControl(
  rawHands: StoredBlackjackHand[],
  dealerHand: BlackjackCard[],
  amount: Prisma.Decimal,
  control: ControlOutcome,
): ControlledBlackjackSettlement {
  const rawPayout = sumHandPayout(rawHands);
  const rawMultiplier = multiplierFromPayout(rawPayout, amount);
  if (!control.controlled) {
    return {
      dealerHand,
      hands: rawHands,
      payout: rawPayout,
      multiplier: rawMultiplier,
      controlled: false,
      outcome: control,
    };
  }

  if (!control.won) {
    const hands = rawHands.map((hand) => ({
      ...hand,
      status: 'RESOLVED' as const,
      outcome: 'LOSE' as const,
      payout: '0.00',
      multiplier: '0.0000',
    }));
    return {
      dealerHand: makeDealerTwenty(),
      hands,
      payout: new Prisma.Decimal(0),
      multiplier: new Prisma.Decimal(0),
      controlled: true,
      flipReason: control.flipReason,
      outcome: control,
    };
  }

  const targetMultiplier = new Prisma.Decimal(BLACKJACK_HOUSE_RULES.regularWinPayout);
  if (!multiplierMatchesControlBounds(targetMultiplier, amount, control)) {
    const guarded = {
      won: false,
      multiplier: new Prisma.Decimal(0),
      payout: new Prisma.Decimal(0),
      controlled: true,
      flipReason: control.flipReason === 'burst_risk_cap' ? 'burst_risk_guard' : 'burst_budget_guard',
      controlId: control.controlId,
    };
    const hands = rawHands.map((hand) => ({
      ...hand,
      status: 'RESOLVED' as const,
      outcome: 'LOSE' as const,
      payout: '0.00',
      multiplier: '0.0000',
    }));
    return {
      dealerHand: makeDealerTwenty(),
      hands,
      payout: new Prisma.Decimal(0),
      multiplier: new Prisma.Decimal(0),
      controlled: true,
      flipReason: guarded.flipReason,
      outcome: guarded,
    };
  }

  const hands = rawHands.map((hand) => {
    const bet = new Prisma.Decimal(hand.bet);
    const payout = bet.mul(BLACKJACK_HOUSE_RULES.regularWinPayout);
    return {
      ...hand,
      status: 'RESOLVED' as const,
      cards: makePlayerTwenty(hand.cards[0]?.suit ?? 0),
      outcome: 'WIN' as const,
      payout: payout.toFixed(2),
      multiplier: BLACKJACK_HOUSE_RULES.regularWinPayout.toFixed(4),
    };
  });
  const payout = sumHandPayout(hands);
  return {
    dealerHand: makeDealerEighteen(),
    hands,
    payout,
    multiplier: multiplierFromPayout(payout, amount),
    controlled: true,
    flipReason: control.flipReason,
    outcome: control,
  };
}

function canHitHand(hand: StoredBlackjackHand): boolean {
  return hand.status === 'PLAYING' && !hand.splitAces && !blackjackScore(hand.cards).isBust;
}

function canDoubleHand(hand: StoredBlackjackHand): boolean {
  return hand.status === 'PLAYING' && hand.cards.length === 2 && !hand.doubled && !hand.splitAces;
}

function canSplitHand(hand: StoredBlackjackHand, handCount: number): boolean {
  if (hand.status !== 'PLAYING' || hand.cards.length !== 2 || handCount >= MAX_SPLIT_HANDS) return false;
  return blackjackSplitValue(hand.cards[0]!) === blackjackSplitValue(hand.cards[1]!);
}

function parseHands(value: Prisma.JsonValue): StoredBlackjackHand[] {
  return (value as unknown as StoredBlackjackHand[]).map((hand) => ({
    ...hand,
    doubled: Boolean(hand.doubled),
    splitAces: Boolean(hand.splitAces),
  }));
}

function parseCards(value: Prisma.JsonValue): BlackjackCard[] {
  return value as unknown as BlackjackCard[];
}

function parseDeck(value: Prisma.JsonValue): BlackjackCard[] {
  return value as unknown as BlackjackCard[];
}

function getActiveHandOrThrow(hands: StoredBlackjackHand[], index: number): StoredBlackjackHand {
  const hand = hands[index];
  if (!hand || hand.status !== 'PLAYING') {
    throw new ApiError('INVALID_ACTION', 'No active Blackjack hand');
  }
  return hand;
}

function drawCard(deck: BlackjackCard[], deckIndex: number): { card: BlackjackCard; nextIndex: number } {
  const card = deck[deckIndex];
  if (!card) throw new ApiError('INTERNAL', 'Blackjack deck exhausted');
  return { card, nextIndex: deckIndex + 1 };
}

function findNextPlayingHand(hands: StoredBlackjackHand[], currentIndex: number): number {
  for (let i = currentIndex; i < hands.length; i += 1) {
    if (hands[i]?.status === 'PLAYING') return i;
  }
  return -1;
}

function toPublicHand(hand: StoredBlackjackHand): BlackjackPlayerHand {
  return {
    id: hand.id,
    cards: hand.cards,
    bet: new Prisma.Decimal(hand.bet).toFixed(2),
    status: hand.status,
    score: blackjackScore(hand.cards),
    doubled: hand.doubled,
    splitAces: hand.splitAces,
    outcome: hand.outcome,
    payout: hand.payout,
    multiplier: hand.multiplier,
  };
}

function estimateActivePayout(hands: StoredBlackjackHand[], activeIndex: number): Prisma.Decimal {
  const active = hands[activeIndex];
  if (!active) return new Prisma.Decimal(0);
  return new Prisma.Decimal(active.bet).mul(BLACKJACK_HOUSE_RULES.regularWinPayout);
}

function sumHandPayout(hands: StoredBlackjackHand[]): Prisma.Decimal {
  return hands.reduce((sum, hand) => sum.add(new Prisma.Decimal(hand.payout ?? 0)), new Prisma.Decimal(0));
}

function multiplierFromPayout(payout: Prisma.Decimal, amount: Prisma.Decimal): Prisma.Decimal {
  if (amount.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
  return payout.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
}

function blackjackRulesPayload() {
  return {
    blackjackPays: '3:2',
    regularWinPays: '1:1',
    pushReturnsStake: true,
    dealerStandsSoft17: BLACKJACK_HOUSE_RULES.dealerStandsSoft17,
    splitAcesOneCardOnly: true,
    maxSplitHands: MAX_SPLIT_HANDS,
  };
}

function makeDealerTwenty(): BlackjackCard[] {
  return [
    { rank: 10, suit: 0 },
    { rank: 13, suit: 1 },
  ];
}

function makeDealerEighteen(): BlackjackCard[] {
  return [
    { rank: 10, suit: 2 },
    { rank: 8, suit: 3 },
  ];
}

function makePlayerTwenty(suit: number): BlackjackCard[] {
  return [
    { rank: 10, suit },
    { rank: 12, suit: (suit + 1) % 4 },
  ];
}
