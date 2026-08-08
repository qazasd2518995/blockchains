import { Prisma, type PrismaClient } from '@prisma/client';
import {
  seth2Spin,
  seth2SpinForFactor,
  type Seth2Outcome,
  type Seth2SpinMode,
} from '@bg/provably-fair';
import {
  GameId,
  SETH2_ALLOWED_BETS,
  SETH2_BUY_FEATURE_MULTIPLIER,
  SETH2_FREE_SPINS,
  SETH2_MAX_WIN_MULTIPLIER,
  isSeth2TestUsername,
  type Seth2FeatureMode,
  type Seth2ProtocolResponse,
  type Seth2ReturnData,
} from '@bg/shared';
import {
  SeedHelper,
  creditAndRecord,
  debitAndRecord,
  lockUserAndCheckFunds,
  runSerializable,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { Seth2ProtocolInput } from './seth2.schema.js';

const GAME_ID = GameId.STORM_OF_SETH_2;
const ALLOWED_BET_SET = new Set<number>(SETH2_ALLOWED_BETS);
const CONTROL_FACTORS = [
  0, 0.5, 1, 2, 3, 4, 5, 8, 10, 20, 45, 50, 100, 200, 205, 220, 250, 300, 350, 400,
  450, 500, 1000, 2015, 5000, 10_000, 20_000, 50_000, 81_000,
] as const;

interface Seth2SessionState {
  freeSpinsRemaining: number;
  featureMode: Seth2FeatureMode;
  betAmount: string;
}

interface DemoState {
  freeSpinsRemaining: number;
  featureMode: Exclude<Seth2FeatureMode, 'none'>;
  betAmount: number;
  nonce: number;
}

interface Seth2Settlement {
  returnData: Seth2ReturnData;
  balance: number;
  spinId: string;
}

const EMPTY_SESSION: Seth2SessionState = {
  freeSpinsRemaining: 0,
  featureMode: 'none',
  betAmount: '0.00',
};

export class Seth2Service {
  private readonly demoStates = new Map<string, DemoState>();

  constructor(private readonly prisma: PrismaClient) {}

  async session(userId: string) {
    const user = await this.requireUser(userId);
    return {
      code: 1,
      data: {
        userInfo: {
          id: user.id,
          userName: user.username,
          nickname: user.displayName ?? user.username,
          score: Number(user.balance.toFixed(2)),
          free_bet: 1_000_000,
          socketPort: '',
        },
      },
    };
  }

  async protocol(userId: string, input: Seth2ProtocolInput): Promise<Seth2ProtocolResponse> {
    switch (input.type) {
      case 'ping':
        return response('pong', { timestamp: Date.now() });
      case 'connectToHall':
      case 'reconnect':
        await this.requireUser(userId);
        return response(input.type, { connected: true });
      case 'getUserInfo': {
        const session = await this.session(userId);
        return response(input.type, session.data.userInfo);
      }
      case 'getMachineList':
        await this.requireUser(userId);
        return response(input.type, { machineList: machineList() });
      case 'getMachineInfo':
        await this.requireUser(userId);
        return response(input.type, { machineInfo: machineInfo(requireMachineId(input.machineId)) });
      case 'useMachine': {
        await this.requireUser(userId);
        const machineId = requireMachineId(input.machineId);
        return response(input.type, { machineId, success: true });
      }
      case 'gameRecordList':
        return response(input.type, await this.history(userId));
      case 'gameToolsList':
      case 'buyFreeGame': {
        const buying = input.type === 'buyFreeGame';
        const bet = requireBet(input.yazhu);
        const machineId = requireMachineId(input.machineId);
        if (input.isFreeModel === 1) {
          return response(input.type, {
            returnData: await this.demoSpin(userId, bet, buying),
          });
        }
        const settlement = await this.settle(userId, bet, machineId, buying);
        return response(input.type, {
          returnData: settlement.returnData,
          balance: settlement.balance,
          spinId: settlement.spinId,
        });
      }
    }
  }

  async history(userId: string) {
    await this.requireUser(userId);
    const bets = await this.prisma.bet.findMany({
      where: { userId, gameId: GAME_ID, amount: { gt: 0 } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, amount: true, payout: true, createdAt: true },
    });
    return {
      recordList: bets.map((bet) => ({
        id: bet.id,
        create_time: bet.createdAt.getTime(),
        yazhu: Number(bet.amount.toFixed(2)),
        total_gold: Number(bet.payout.toFixed(2)),
      })),
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
      },
    });
    if (!user) throw new ApiError('UNAUTHORIZED', 'Authentication required');
    if (!isSeth2TestUsername(user.username)) {
      throw new ApiError('FORBIDDEN', '此遊戲目前僅開放指定測試帳號');
    }
    if (user.frozenAt || user.disabledAt) {
      throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
    }
    return user;
  }

  private async demoSpin(userId: string, requestedBet: number, buying: boolean) {
    await this.requireUser(userId);
    const current = this.demoStates.get(userId) ?? {
      freeSpinsRemaining: 0,
      featureMode: 'standard' as const,
      betAmount: requestedBet,
      nonce: 0,
    };
    const freeSpin = !buying && current.freeSpinsRemaining > 0;
    const bet = freeSpin ? current.betAmount : requestedBet;
    const mode: Seth2SpinMode = buying
      ? 'awakening_free'
      : freeSpin
        ? current.featureMode === 'awakening'
          ? 'awakening_free'
          : 'standard_free'
        : 'base';
    const outcome = seth2Spin('seth2-demo-server', userId, current.nonce, bet, mode);
    current.nonce += 1;
    if (buying) {
      current.betAmount = bet;
      current.featureMode = 'awakening';
      current.freeSpinsRemaining = SETH2_FREE_SPINS - 1;
    } else if (freeSpin) {
      current.freeSpinsRemaining -= 1;
    } else if (outcome.triggeredFreeSpins) {
      current.betAmount = bet;
      current.featureMode = 'standard';
      current.freeSpinsRemaining = SETH2_FREE_SPINS;
    } else {
      current.freeSpinsRemaining = 0;
    }
    this.demoStates.set(userId, current);
    applyFeatureState(outcome.returnData, current.freeSpinsRemaining, buying || outcome.triggeredFreeSpins);
    return outcome.returnData;
  }

  private async settle(
    userId: string,
    requestedBet: number,
    machineId: number,
    buying: boolean,
  ): Promise<Seth2Settlement> {
    return runSerializable(this.prisma, async (tx) => {
      const requestedBaseAmount = new Prisma.Decimal(requestedBet);
      const user = await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
        limitAmounts: [requestedBaseAmount],
      });
      if (!isSeth2TestUsername(user.username)) {
        throw new ApiError('FORBIDDEN', '此遊戲目前僅開放指定測試帳號');
      }

      const previous = await tx.bet.findFirst({
        where: { userId, gameId: GAME_ID },
        orderBy: { createdAt: 'desc' },
        select: { resultData: true },
      });
      const currentSession = readSession(previous?.resultData);
      const freeSpin = !buying && currentSession.freeSpinsRemaining > 0;
      if (buying && currentSession.freeSpinsRemaining > 0) {
        throw new ApiError('INVALID_ACTION', '免費遊戲進行中，無法再次購買功能');
      }

      const baseAmount = freeSpin
        ? new Prisma.Decimal(currentSession.betAmount)
        : requestedBaseAmount;
      const baseBet = requireBet(Number(baseAmount.toFixed(2)));
      const debitAmount = buying
        ? baseAmount.mul(SETH2_BUY_FEATURE_MULTIPLIER)
        : freeSpin
          ? new Prisma.Decimal(0)
          : baseAmount;
      if (user.balance.lessThan(debitAmount)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
      }

      const mode: Seth2SpinMode = buying
        ? 'awakening_free'
        : freeSpin
          ? currentSession.featureMode === 'awakening'
            ? 'awakening_free'
            : 'standard_free'
          : 'base';
      const seed = await new SeedHelper(tx).getActiveBundle(userId, GAME_ID);
      const originalOutcome = seth2Spin(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        baseBet,
        mode,
      );
      const originalPayout = payoutForFactor(baseAmount, originalOutcome.payoutFactor);
      const controlAmount = debitAmount.greaterThan(0) ? debitAmount : baseAmount;
      const originalMultiplier = originalPayout
        .div(controlAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      const originalPrediction = {
        won: originalPayout.greaterThan(controlAmount),
        amount: controlAmount,
        multiplier: originalMultiplier,
        payout: originalPayout,
      };
      const controlled = await applyControls(tx, userId, GAME_ID, originalPrediction, {
        burstEligible: true,
        burstPotentialMultiplier: baseAmount
          .mul(SETH2_MAX_WIN_MULTIPLIER)
          .div(controlAmount)
          .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
      });

      const finalOutcome = controlled.controlled
        ? seth2SpinForFactor(
            seed.serverSeed,
            seed.clientSeed,
            seed.nonce,
            baseBet,
            chooseControlledSethFactor(baseAmount, controlAmount, controlled),
            mode,
          )
        : originalOutcome;
      const finalPayout = payoutForFactor(baseAmount, finalOutcome.payoutFactor);
      const finalControlMultiplier = finalPayout
        .div(controlAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      const betMultiplier = debitAmount.greaterThan(0)
        ? finalPayout.div(debitAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(finalOutcome.payoutFactor).toDecimalPlaces(4);

      const nextSession = advanceSession(currentSession, {
        buying,
        freeSpin,
        betAmount: baseAmount,
        triggeredFreeSpins: finalOutcome.triggeredFreeSpins,
      });
      applyFeatureState(
        finalOutcome.returnData,
        nextSession.freeSpinsRemaining,
        buying || finalOutcome.triggeredFreeSpins || (freeSpin && nextSession.freeSpinsRemaining > 0),
      );

      const originalResult = {
        mode,
        machineId,
        baseAmount: baseAmount.toFixed(2),
        debitAmount: debitAmount.toFixed(2),
        returnData: originalOutcome.returnData,
      };
      const finalResult = {
        mode: buying ? 'buy' : mode,
        machineId,
        baseAmount: baseAmount.toFixed(2),
        debitAmount: debitAmount.toFixed(2),
        session: nextSession,
        returnData: finalOutcome.returnData,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };
      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GAME_ID,
          amount: debitAmount,
          multiplier: betMultiplier,
          payout: finalPayout,
          profit: finalPayout.minus(debitAmount),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
        },
      });

      if (debitAmount.greaterThan(0)) {
        await debitAndRecord(tx, userId, debitAmount, bet.id, {
          gameId: GAME_ID,
          mode: buying ? 'buy' : mode,
          machineId,
        });
      }
      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN', {
            gameId: GAME_ID,
            mode: buying ? 'buy' : mode,
            machineId,
          })
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;

      await finalizeControls(
        tx,
        userId,
        GAME_ID,
        originalPrediction,
        {
          won: finalPayout.greaterThan(controlAmount),
          amount: controlAmount,
          multiplier: finalControlMultiplier,
          payout: finalPayout,
        },
        controlled,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );

      return {
        returnData: finalOutcome.returnData,
        balance: Number(newBalance.toFixed(2)),
        spinId: bet.id,
      };
    });
  }
}

function response(type: string, data: unknown): Seth2ProtocolResponse {
  return { type, data };
}

function requireBet(value: number | undefined): number {
  if (value === undefined || !ALLOWED_BET_SET.has(value)) {
    throw new ApiError('INVALID_BET', '無效的投注金額');
  }
  return value;
}

function requireMachineId(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value < 1 || value > 20) {
    throw new ApiError('INVALID_ACTION', '無效的機台');
  }
  return value;
}

function machineInfo(id: number) {
  const totalBet = 18_000_000 + id * 937_421;
  return {
    id,
    code: String(id).padStart(3, '0'),
    use_status: 0,
    day_rate: '96.89',
    totalBet,
    totalBet30: Math.floor(totalBet * 0.38),
    day_rate_30: '96.89',
    MINI_start_number: 25,
    MINI_JP_store: Number((id * 0.13).toFixed(2)),
    MINOR_start_number: 100,
    MINOR_JP_store: Number((id * 0.41).toFixed(2)),
    MAJOR_start_number: 500,
    MAJOR_JP_store: Number((id * 1.37).toFixed(2)),
    GRAND_start_number: 2000,
    GRAND_JP_store: Number((id * 4.73).toFixed(2)),
  };
}

function machineList() {
  return Array.from({ length: 20 }, (_, index) => machineInfo(index + 1));
}

function readSession(resultData: Prisma.JsonValue | undefined): Seth2SessionState {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) {
    return EMPTY_SESSION;
  }
  const session = (resultData as Record<string, unknown>).session;
  if (!session || typeof session !== 'object' || Array.isArray(session)) return EMPTY_SESSION;
  const value = session as Record<string, unknown>;
  const remaining = Number(value.freeSpinsRemaining);
  const betAmount = String(value.betAmount ?? '0');
  const featureMode = value.featureMode;
  if (
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    remaining > SETH2_FREE_SPINS ||
    !ALLOWED_BET_SET.has(Number(betAmount)) ||
    (featureMode !== 'none' && featureMode !== 'standard' && featureMode !== 'awakening')
  ) {
    return EMPTY_SESSION;
  }
  return { freeSpinsRemaining: remaining, featureMode, betAmount };
}

function advanceSession(
  current: Seth2SessionState,
  input: {
    buying: boolean;
    freeSpin: boolean;
    betAmount: Prisma.Decimal;
    triggeredFreeSpins: boolean;
  },
): Seth2SessionState {
  if (input.buying) {
    return {
      freeSpinsRemaining: SETH2_FREE_SPINS - 1,
      featureMode: 'awakening',
      betAmount: input.betAmount.toFixed(2),
    };
  }
  if (input.freeSpin) {
    const remaining = Math.max(0, current.freeSpinsRemaining - 1);
    return {
      freeSpinsRemaining: remaining,
      featureMode: remaining > 0 ? current.featureMode : 'none',
      betAmount: remaining > 0 ? current.betAmount : '0.00',
    };
  }
  if (input.triggeredFreeSpins) {
    return {
      freeSpinsRemaining: SETH2_FREE_SPINS,
      featureMode: 'standard',
      betAmount: input.betAmount.toFixed(2),
    };
  }
  return EMPTY_SESSION;
}

function applyFeatureState(
  data: Seth2ReturnData | Seth2Outcome['returnData'],
  remaining: number,
  featureActive: boolean,
): void {
  data.is_sjc = featureActive ? 1 : 0;
  data.freeGameCount = remaining;
}

function payoutForFactor(baseAmount: Prisma.Decimal, factor: number): Prisma.Decimal {
  return baseAmount
    .mul(new Prisma.Decimal(factor))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

export function chooseControlledSethFactor(
  baseAmount: Prisma.Decimal,
  controlAmount: Prisma.Decimal,
  control: Pick<
    ControlOutcome,
    'won' | 'multiplier' | 'minMultiplier' | 'maxMultiplier' | 'maxPayout'
  >,
): number {
  const candidates = CONTROL_FACTORS.filter((factor) => {
    const accountingMultiplier = baseAmount
      .mul(factor)
      .div(controlAmount)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
    if (control.won) {
      return (
        accountingMultiplier.greaterThan(1) &&
        multiplierMatchesControlBounds(accountingMultiplier, controlAmount, control)
      );
    }
    return accountingMultiplier.lessThanOrEqualTo(1);
  });
  if (candidates.length === 0) return 0;
  const targetFactor = Number(control.multiplier.mul(controlAmount).div(baseAmount).toFixed(4));
  return candidates.reduce((best, factor) =>
    Math.abs(factor - targetFactor) < Math.abs(best - targetFactor) ? factor : best,
  );
}
