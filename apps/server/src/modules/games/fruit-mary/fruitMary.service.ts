import { Prisma, type PrismaClient } from '@prisma/client';
import {
  FRUIT_MARY_PAYOUT_POSITIONS,
  fruitMaryGamble,
  fruitMaryOutcomeForPosition,
  fruitMaryOutcomeForPresentation,
  fruitMarySpin,
  type FruitMaryBetSelection,
  type FruitMaryOutcome,
} from '@bg/provably-fair';
import {
  GameId,
  FRUIT_MARY_BET_IDS,
  MIN_BET_AMOUNT,
  getBettingLimitForGame,
  type FruitMaryLegacySpinResponse,
} from '@bg/shared';
import {
  SeedHelper,
  checkLockedUserFunds,
  creditAndRecord,
  debitAndRecord,
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
import { config } from '../../../config.js';
import { isImportedGameAccessUsername } from '../_common/importedGameAccess.js';
import type {
  FruitMaryGambleInput,
  FruitMaryHistoryInput,
  FruitMarySpinInput,
} from './fruitMary.schema.js';

const FRUIT_MARY_DENOMINATION = 10;

const GAME_ID = GameId.FRUIT_MARY;
const BET_ID_SET = new Set<number>(FRUIT_MARY_BET_IDS);

export class FruitMaryService {
  constructor(private readonly prisma: PrismaClient) {}

  async session(userId: string) {
    const user = await this.requireUser(userId);
    return {
      code: '200',
      data: {
        info: {
          uid: user.id,
          gold: Number(user.balance.toFixed(2)),
          nickname: user.displayName ?? user.username,
        },
        uid: user.id,
        nickname: user.displayName ?? user.username,
        avatar: '',
      },
    };
  }

  async room(userId: string) {
    const user = await this.requireUser(userId);
    const limit = resolveFruitMaryBettingLimit(
      user.bettingLimits,
      user.bettingLimitLevel,
      config.MAX_SINGLE_BET,
    );
    return {
      code: '200',
      data: {
        multiple: FRUIT_MARY_DENOMINATION,
        minBet: limit.min,
        maxBet: limit.max,
        minUnits: Math.max(1, Math.ceil(limit.min / FRUIT_MARY_DENOMINATION)),
        maxUnits: Math.max(1, Math.floor(limit.max / FRUIT_MARY_DENOMINATION)),
      },
    };
  }

  async authorize(userId: string) {
    await this.requireUser(userId);
    return { code: 1, data: { authorized: true } };
  }

  async noop(userId: string) {
    await this.requireUser(userId);
    return { code: '200', data: {} };
  }

  async disabled(userId: string) {
    await this.requireUser(userId);
    const platformName = config.PLATFORM_REALM === 'qmoney' ? '金寶寶' : '八千代';
    return { code: 0, msg: `此版本僅使用${platformName}測試點數，不提供儲值、提領或推廣功能` };
  }

  async spin(userId: string, input: FruitMarySpinInput): Promise<FruitMaryLegacySpinResponse> {
    const bets = normalizeBets(input);
    const totalUnits = bets.reduce((total, bet) => total + bet.units, 0);
    if (totalUnits !== input.money) {
      throw new ApiError('INVALID_BET', '投注總數與各水果注數不一致');
    }

    return runLockedTransaction(this.prisma, async (tx) => {
      const amount = new Prisma.Decimal(totalUnits).mul(FRUIT_MARY_DENOMINATION);
      const user = await lockUserAndCheckFunds(tx, userId, amount, GAME_ID, {
        skipBetValidation: true,
      });
      requireMemberUser(user.username);
      const fingerprint = JSON.stringify([
        'wheel',
        [...bets].sort((a, b) => a.fruitId - b.fruitId),
      ]);
      const replay = await replayFruitMaryOperation(tx, userId, input.operationId, fingerprint);
      if (replay) {
        return spinResponse(
          replay.result.outcome as unknown as FruitMaryOutcome,
          user.balance,
          replay.id,
        );
      }
      checkLockedUserFunds(user, amount, GAME_ID, { limitAmounts: [amount] });

      const seed = await new SeedHelper(tx).getActiveBundle(userId, GAME_ID);
      const originalOutcome = fruitMarySpin(seed.serverSeed, seed.clientSeed, seed.nonce, bets);
      const originalPayout = new Prisma.Decimal(originalOutcome.totalPayoutUnits).mul(
        FRUIT_MARY_DENOMINATION,
      );
      const originalPrediction = prediction(amount, originalPayout);
      const controlled = await applyControls(tx, userId, GAME_ID, originalPrediction, {
        burstEligible: true,
        burstPotentialMultiplier: new Prisma.Decimal(100),
      });
      const finalOutcome = controlled.controlled
        ? chooseControlledFruitOutcome(
            bets,
            amount,
            controlled,
            FRUIT_MARY_DENOMINATION,
            fruitOutcomeEntropy(originalOutcome, seed.nonce),
          )
        : originalOutcome;
      const finalPayout = new Prisma.Decimal(finalOutcome.totalPayoutUnits).mul(
        FRUIT_MARY_DENOMINATION,
      );
      const finalPrediction = prediction(amount, finalPayout);
      const betMultiplier = finalPayout.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);

      const originalResult = serializeSpinResult(originalOutcome, bets, totalUnits);
      const finalResult = {
        ...serializeSpinResult(finalOutcome, bets, totalUnits),
        requestFingerprint: fingerprint,
        gambleAmount: finalPayout.toFixed(2),
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };
      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GAME_ID,
          operationId: input.operationId,
          amount,
          multiplier: betMultiplier,
          payout: finalPayout,
          profit: finalPayout.minus(amount),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
        },
      });

      const debitedBalance = await debitAndRecord(tx, userId, amount, bet.id, {
        gameId: GAME_ID,
        kind: 'wheel',
      });
      const balance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN', {
            gameId: GAME_ID,
            kind: 'wheel',
          })
        : debitedBalance;

      await finalizeControls(
        tx,
        userId,
        GAME_ID,
        originalPrediction,
        finalPrediction,
        controlled,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
        { member: user, balance },
      );

      return spinResponse(finalOutcome, balance, bet.id);
    });
  }

  async gamble(userId: string, input: FruitMaryGambleInput) {
    return runLockedTransaction(this.prisma, async (tx) => {
      const amount = new Prisma.Decimal(input.balance).toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_DOWN,
      );
      const user = await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
        skipBetValidation: true,
      });
      requireMemberUser(user.username);
      const fingerprint = JSON.stringify(['gamble', amount.toFixed(2), input.size]);
      const replay = await replayFruitMaryOperation(tx, userId, input.operationId, fingerprint);
      if (replay) {
        return {
          code: 1,
          data: Number(replay.result.number),
          balance: Number(user.balance.toFixed(2)),
          spinId: replay.id,
        };
      }
      checkLockedUserFunds(user, amount, GAME_ID, { limitAmounts: [amount] });
      const previous = await tx.bet.findFirst({
        where: { userId, gameId: GAME_ID },
        orderBy: { createdAt: 'desc' },
        select: { resultData: true },
      });
      const available = readGambleAmount(previous?.resultData);
      const allocationStatus = fruitMaryGambleAllocationStatus(available, amount, user.balance);
      if (allocationStatus === 'expired') {
        throw new ApiError('INVALID_ACTION', '本輪可比大小分數已失效');
      }
      if (allocationStatus === 'insufficient') {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
      }

      const choice = input.size as 1 | 2;
      const seed = await new SeedHelper(tx).getActiveBundle(userId, GAME_ID);
      const originalOutcome = fruitMaryGamble(seed.serverSeed, seed.clientSeed, seed.nonce, choice);
      const originalPayout = originalOutcome.won ? amount.mul(2) : new Prisma.Decimal(0);
      const originalPrediction = prediction(amount, originalPayout);
      const controlled = await applyControls(tx, userId, GAME_ID, originalPrediction);
      const finalOutcome = controlled.controlled
        ? controlledGambleOutcome(choice, controlled.won)
        : originalOutcome;
      const finalPayout = finalOutcome.won ? amount.mul(2) : new Prisma.Decimal(0);
      const finalPrediction = prediction(amount, finalPayout);
      const result = {
        kind: 'gamble',
        requestFingerprint: fingerprint,
        choice,
        number: finalOutcome.number,
        won: finalOutcome.won,
        gambleAmount: finalOutcome.won ? finalPayout.toFixed(2) : '0.00',
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalOutcome : null,
      };
      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GAME_ID,
          operationId: input.operationId,
          amount,
          multiplier: finalOutcome.won ? new Prisma.Decimal(2) : new Prisma.Decimal(0),
          payout: finalPayout,
          profit: finalPayout.minus(amount),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: result as unknown as Prisma.InputJsonValue,
        },
      });
      const debitedBalance = await debitAndRecord(tx, userId, amount, bet.id, {
        gameId: GAME_ID,
        kind: 'gamble',
      });
      const balance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN', {
            gameId: GAME_ID,
            kind: 'gamble',
          })
        : debitedBalance;
      await finalizeControls(
        tx,
        userId,
        GAME_ID,
        originalPrediction,
        finalPrediction,
        controlled,
        bet.id,
        originalOutcome as unknown as Prisma.InputJsonValue,
        result as unknown as Prisma.InputJsonValue,
        { member: user, balance },
      );
      return {
        code: 1,
        data: finalOutcome.number,
        balance: Number(balance.toFixed(2)),
        spinId: bet.id,
      };
    });
  }

  async history(userId: string, input: FruitMaryHistoryInput) {
    await this.requireUser(userId);
    const [bets, count] = await this.prisma.$transaction([
      this.prisma.bet.findMany({
        where: { userId, gameId: GAME_ID },
        orderBy: { createdAt: 'desc' },
        skip: input.offset,
        take: input.length,
        select: { amount: true, payout: true, profit: true, createdAt: true },
      }),
      this.prisma.bet.count({ where: { userId, gameId: GAME_ID } }),
    ]);
    return {
      code: 1,
      data: {
        count,
        data: bets.map((bet) => ({
          money: Number(bet.amount.toFixed(2)),
          in_money: Number(bet.payout.toFixed(2)),
          profit: Number(bet.profit.toFixed(2)),
          log_time: bet.createdAt.toISOString().replace('T', ' ').slice(0, 19),
        })),
      },
    };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        balance: true,
        frozenAt: true,
        disabledAt: true,
        bettingLimits: true,
        bettingLimitLevel: true,
      },
    });
    if (!user) throw new ApiError('UNAUTHORIZED', 'Authentication required');
    requireMemberUser(user.username);
    if (user.frozenAt || user.disabledAt) {
      throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
    }
    return user;
  }
}

async function replayFruitMaryOperation(
  tx: Prisma.TransactionClient,
  userId: string,
  operationId: string | undefined,
  fingerprint: string,
) {
  if (!operationId) return null;
  // The user row is already locked. A lost-response retry reads the same bet
  // before checking current funds, even when that bet spent the last 10 points.
  const bet = await tx.bet.findUnique({
    where: { userId_gameId_operationId: { userId, gameId: GAME_ID, operationId } },
    select: { id: true, resultData: true },
  });
  if (!bet) return null;
  const result = bet.resultData as Record<string, Prisma.JsonValue>;
  if (!result || result.requestFingerprint !== fingerprint) {
    throw new ApiError('INVALID_ACTION', '相同操作編號的下注內容不一致');
  }
  return { id: bet.id, result };
}

function spinResponse(
  outcome: FruitMaryOutcome,
  balance: Prisma.Decimal,
  spinId: string,
): FruitMaryLegacySpinResponse {
  const firstPosition = outcome.positions[0] ?? 10;
  return {
    code: 1,
    data: {
      data: {
        type: outcome.legacyType,
        pos:
          outcome.legacyType === 0
            ? firstPosition
            : { pos: firstPosition, luck: outcome.positions.slice(1) },
      },
      money: outcome.payoutByPosition,
    },
    balance: Number(balance.toFixed(2)),
    spinId,
  };
}

export function resolveFruitMaryBettingLimit(
  bettingLimits: unknown,
  bettingLimitLevel: unknown,
  configuredMaximum: number,
): { min: number; max: number } {
  const configured = getBettingLimitForGame(bettingLimits, GAME_ID, bettingLimitLevel);
  return {
    min: Math.max(MIN_BET_AMOUNT, configured.min),
    max: Math.min(configuredMaximum, configured.max),
  };
}

function normalizeBets(input: FruitMarySpinInput): FruitMaryBetSelection[] {
  const seen = new Set<number>();
  return input.fruits.map(([fruitId, units]) => {
    if (!BET_ID_SET.has(fruitId) || seen.has(fruitId)) {
      throw new ApiError('INVALID_BET', '水果下注項目重複或不存在');
    }
    seen.add(fruitId);
    return { fruitId: fruitId as FruitMaryBetSelection['fruitId'], units };
  });
}

function requireMemberUser(username: string): void {
  if (!isImportedGameAccessUsername(username, config.PLATFORM_REALM)) {
    throw new ApiError('FORBIDDEN', '會員身份無法使用此遊戲');
  }
}

function prediction(amount: Prisma.Decimal, payout: Prisma.Decimal) {
  return {
    won: payout.greaterThan(amount),
    amount,
    multiplier: payout.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
    payout,
  };
}

function serializeSpinResult(
  outcome: FruitMaryOutcome,
  bets: readonly FruitMaryBetSelection[],
  totalUnits: number,
) {
  return { kind: 'wheel', totalUnits, bets, outcome };
}

export function chooseControlledFruitOutcome(
  bets: readonly FruitMaryBetSelection[],
  amount: Prisma.Decimal,
  control: Pick<
    ControlOutcome,
    'won' | 'multiplier' | 'minMultiplier' | 'maxMultiplier' | 'maxPayout'
  >,
  denomination = 1,
  entropy?: number,
): FruitMaryOutcome {
  const allCandidates = controlledFruitCandidates(bets);
  const candidates = allCandidates.filter((candidate) => {
    const payout = new Prisma.Decimal(candidate.totalPayoutUnits).mul(denomination);
    const multiplier = payout.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
    return (
      (control.won ? multiplier.greaterThan(1) : multiplier.lessThanOrEqualTo(1)) &&
      multiplierMatchesControlBounds(multiplier, amount, control)
    );
  });
  const fallback = allCandidates.filter((candidate) => {
    const payout = new Prisma.Decimal(candidate.totalPayoutUnits).mul(denomination);
    return control.won ? payout.greaterThan(amount) : payout.lessThanOrEqualTo(amount);
  });
  const eligible = candidates.length > 0 ? candidates : fallback;
  if (eligible.length === 0) return fruitMaryOutcomeForPosition(control.won ? 4 : 10, bets);

  const deltaFor = (candidate: FruitMaryOutcome) =>
    new Prisma.Decimal(candidate.totalPayoutUnits)
      .mul(denomination)
      .div(amount)
      .minus(control.multiplier)
      .abs();
  const minimumDelta = eligible.reduce((minimum, candidate) => {
    const delta = deltaFor(candidate);
    return delta.lessThan(minimum) ? delta : minimum;
  }, deltaFor(eligible[0]!));
  const nearest = eligible.filter((candidate) => deltaFor(candidate).equals(minimumDelta));
  if (entropy === undefined || nearest.length === 1) return nearest[0]!;

  const normalizedEntropy = Math.abs(Math.trunc(entropy));
  const normal = nearest.filter((candidate) => candidate.legacyType === 0);
  const lucky = nearest.filter((candidate) => candidate.legacyType !== 0);
  // Keep ordinary landings as the majority while regularly allowing a
  // controlled round to use the same bounded LUCKY presentations.
  const pool =
    normalizedEntropy % 5 === 0 && lucky.length > 0 ? lucky : normal.length > 0 ? normal : nearest;
  return pool[Math.floor(normalizedEntropy / 5) % pool.length]!;
}

const CONTROLLED_BONUS_TEMPLATES: ReadonlyArray<{
  legacyType: number;
  positions: readonly number[];
}> = [
  { legacyType: 1, positions: [10, 6, 12, 24] },
  { legacyType: 2, positions: [22, 5, 1, 2] },
  { legacyType: 3, positions: [10, 23, 11, 5, 17] },
  { legacyType: 4, positions: [22, 9, 15, 18] },
  { legacyType: 5, positions: [10, 8, 16, 20] },
  { legacyType: 6, positions: [22, 21, 12, 6] },
  { legacyType: 7, positions: [10, 7, 13, 19] },
  { legacyType: 8, positions: [10, ...FRUIT_MARY_PAYOUT_POSITIONS] },
];

function controlledFruitCandidates(bets: readonly FruitMaryBetSelection[]): FruitMaryOutcome[] {
  const positions = [10, 22, ...FRUIT_MARY_PAYOUT_POSITIONS];
  const zeroPayoutPositions = FRUIT_MARY_PAYOUT_POSITIONS.filter(
    (position) => fruitMaryOutcomeForPosition(position, bets).totalPayoutUnits === 0,
  );
  const candidates: FruitMaryOutcome[] = [];
  for (const [positionIndex, position] of positions.entries()) {
    candidates.push(fruitMaryOutcomeForPosition(position, bets));
    for (let variant = 0; variant < 2; variant += 1) {
      const intermediate = Array.from({ length: variant + 1 }, (_, hopIndex) => {
        if (zeroPayoutPositions.length === 0) return hopIndex % 2 === 0 ? 10 : 22;
        return zeroPayoutPositions[
          (positionIndex * 3 + variant + hopIndex) % zeroPayoutPositions.length
        ]!;
      });
      candidates.push(
        fruitMaryOutcomeForPresentation(
          6 + variant,
          [position <= 10 ? 22 : 10, ...intermediate, position],
          bets,
        ),
      );
    }
  }
  for (const template of CONTROLLED_BONUS_TEMPLATES) {
    candidates.push(fruitMaryOutcomeForPresentation(template.legacyType, template.positions, bets));
  }
  return candidates;
}

function fruitOutcomeEntropy(outcome: FruitMaryOutcome, nonce: number): number {
  return outcome.positions.reduce(
    (entropy, position, index) => entropy + position * (index + 17),
    nonce * 31 + outcome.legacyType * 101,
  );
}

function readGambleAmount(resultData: Prisma.JsonValue | undefined): Prisma.Decimal {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) {
    return new Prisma.Decimal(0);
  }
  const value = (resultData as Record<string, unknown>).gambleAmount;
  try {
    return new Prisma.Decimal(String(value ?? 0));
  } catch {
    return new Prisma.Decimal(0);
  }
}

export function fruitMaryGambleAllocationStatus(
  pendingValue: Prisma.Decimal.Value,
  requestedValue: Prisma.Decimal.Value,
  balanceValue: Prisma.Decimal.Value,
): 'ok' | 'expired' | 'insufficient' {
  const pending = new Prisma.Decimal(pendingValue);
  if (pending.lessThanOrEqualTo(0)) return 'expired';
  const requested = new Prisma.Decimal(requestedValue);
  const balance = new Prisma.Decimal(balanceValue);
  return requested.greaterThan(balance) ? 'insufficient' : 'ok';
}

function controlledGambleOutcome(choice: 1 | 2, won: boolean) {
  if (choice === 1) return { number: won ? 7 : 8, won };
  return { number: won ? 8 : 7, won };
}
