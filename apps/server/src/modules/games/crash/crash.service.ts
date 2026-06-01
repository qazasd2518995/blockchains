import { PrismaClient, Prisma } from '@prisma/client';
import { crashPoint } from '@bg/provably-fair';
import {
  GameId,
  type CrashBetStartResponse,
  type CrashCashOutResponse,
  type CrashSoloRoundState,
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
  type ControlOutcome,
  type PredictedResult,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { CrashBetInput, CrashCashoutInput } from './crash.schema.js';

const MIN_CASHOUT_MULTIPLIER = 1.01;
const CONTROLLED_LOSS_CRASH_MIN = 1.1;
const CONTROLLED_LOSS_CRASH_MAX = 1.8;
const CONTROLLED_RELIEF_AFTER_LOSSES = 3;
const CONTROLLED_RELIEF_CRASH_MIN = 2.02;
const CONTROLLED_RELIEF_CRASH_MAX = 2.18;
const CONTROLLED_WIN_BASE_MIN = 2.05;
const CONTROLLED_WIN_BASE_MAX = 6.8;
const CONTROLLED_WIN_HIGH_MIN = 7.2;
const CONTROLLED_WIN_HIGH_MAX = 15;
const CONTROLLED_WIN_HIGH_RATE = 0.18;
const SOLO_GROWTH_RATE = 0.00012;
const HISTORY_LIMIT = 20;
const CRASH_CONTROL_GAME_IDS = [
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.SPACE_FLEET,
  GameId.JETX,
  GameId.BALLOON,
  GameId.JETX3,
  GameId.DOUBLE_X,
] as const;

type CrashBetWithRound = Prisma.CrashBetGetPayload<{ include: { round: true } }>;

interface StoredPredictedResult {
  won: boolean;
  amount: string;
  multiplier: string;
  payout: string;
}

interface StoredControlOutcome extends StoredPredictedResult {
  controlled: boolean;
  flipReason?: string;
  controlId?: string;
  minMultiplier?: string;
  maxMultiplier?: string;
  maxPayout?: string;
}

export class CrashSoloService {
  constructor(private readonly prisma: PrismaClient) {}

  async history(gameId: string): Promise<{ multipliers: number[] }> {
    const rounds = await this.prisma.crashRound.findMany({
      where: { gameId, status: 'CRASHED', crashedAt: { not: null } },
      orderBy: { roundNumber: 'desc' },
      take: HISTORY_LIMIT,
      select: { crashPoint: true },
    });
    return { multipliers: rounds.map((round) => Number(round.crashPoint)) };
  }

  async start(userId: string, input: CrashBetInput): Promise<CrashBetStartResponse> {
    const amount = new Prisma.Decimal(input.amount);
    const autoCashOut =
      input.autoCashOut !== undefined ? new Prisma.Decimal(input.autoCashOut.toFixed(4)) : null;

    return runSerializable(this.prisma, async (tx) => {
      const active = await tx.crashBet.findFirst({
        where: {
          userId,
          round: { gameId: input.gameId, status: 'RUNNING' },
        },
        select: { roundId: true },
      });
      if (active) {
        const activeBet = await this.getLockedOwnBet(tx, userId, active.roundId);
        const resolved = await this.resolveRoundInTx(tx, activeBet);
        if (resolved.bet.round.status === 'RUNNING') {
          throw new ApiError('ROUND_NOT_ACTIVE', '上一局尚未結束，請等待爆炸。');
        }
      }

      await lockUserAndCheckFunds(tx, userId, amount, input.gameId);
      const seed = await new SeedHelper(tx).getActiveBundle(
        userId,
        `crash:${input.gameId}`,
        input.clientSeed,
      );
      const roundNumber = await this.nextRoundNumber(tx, input.gameId);
      const naturalCrashPoint = crashPoint(seed.serverSeed, `${input.gameId}:${roundNumber}`);
      const original = this.predictStartOutcome(amount);
      const control = await applyControls(tx, userId, input.gameId, original);
      const recentControlledLosses = control.controlled
        ? await this.countRecentControlledCrashLosses(tx, userId)
        : 0;
      const tuned = this.tuneCrashPoint(naturalCrashPoint, amount, control, recentControlledLosses);
      const startedAt = new Date();
      const crashesImmediately = tuned.crashPoint <= 1.0;
      const round = await tx.crashRound.create({
        data: {
          gameId: input.gameId,
          roundNumber,
          serverSeedHash: seed.serverSeedHash,
          serverSeed: seed.serverSeed,
          crashPoint: new Prisma.Decimal(tuned.crashPoint.toFixed(4)),
          status: crashesImmediately ? 'CRASHED' : 'RUNNING',
          startedAt,
          crashedAt: crashesImmediately ? startedAt : null,
        },
      });
      const bet = await tx.crashBet.create({
        data: {
          roundId: round.id,
          userId,
          amount,
          autoCashOut,
          controlOriginal: serializePredicted(original) as unknown as Prisma.InputJsonValue,
          controlOutcome: serializeOutcome(tuned.control) as unknown as Prisma.InputJsonValue,
        },
        include: { round: true },
      });
      const newBalance = await debitAndRecord(tx, userId, amount, null, {
        gameId: input.gameId,
        roundId: round.id,
        crashBetId: bet.id,
      });

      if (crashesImmediately) {
        await this.finalizeLossInTx(tx, { ...bet, round }, round, tuned.control, original);
      }

      return toRoundState(
        { ...bet, round },
        crashesImmediately ? tuned.crashPoint : 1,
        0,
        newBalance.toFixed(2),
      ) as CrashBetStartResponse;
    });
  }

  async cashout(userId: string, input: CrashCashoutInput): Promise<CrashCashOutResponse> {
    return runSerializable(this.prisma, async (tx) => {
      const bet = await this.getLockedOwnBet(tx, userId, input.roundId);
      const resolved = await this.resolveRoundInTx(tx, bet);
      const latest = resolved.bet;

      if (latest.cashedOutAt) {
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { balance: true },
        });
        return {
          multiplier: Number(latest.cashedOutAt.toFixed(4)),
          payout: latest.payout.toFixed(2),
          newBalance: user.balance.toFixed(2),
        };
      }

      if (latest.round.status !== 'RUNNING') {
        throw new ApiError('ROUND_NOT_ACTIVE', '本局已爆炸，無法提領。');
      }

      const multiplier = Math.max(MIN_CASHOUT_MULTIPLIER, resolved.currentMultiplier);
      if (multiplier >= Number(latest.round.crashPoint)) {
        throw new ApiError('ROUND_NOT_ACTIVE', '本局已爆炸，無法提領。');
      }

      const finalized = await this.finalizeCashoutInTx(
        tx,
        latest,
        latest.round,
        multiplier,
        parseOutcome(latest.controlOutcome),
        parsePredicted(latest.controlOriginal, latest.amount),
      );

      return {
        multiplier: Number(finalized.bet.cashedOutAt?.toFixed(4) ?? multiplier.toFixed(4)),
        payout: finalized.payout.toFixed(2),
        newBalance: finalized.newBalance,
      };
    });
  }

  async getRound(userId: string, roundId: string): Promise<CrashSoloRoundState> {
    return runSerializable(this.prisma, async (tx) => {
      const bet = await this.getLockedOwnBet(tx, userId, roundId);
      const resolved = await this.resolveRoundInTx(tx, bet);
      return toRoundState(
        resolved.bet,
        resolved.currentMultiplier,
        resolved.elapsedMs,
        resolved.newBalance,
      );
    });
  }

  async active(userId: string, gameId: string): Promise<CrashSoloRoundState | null> {
    return runSerializable(this.prisma, async (tx) => {
      const bet = await tx.crashBet.findFirst({
        where: {
          userId,
          round: { gameId, status: 'RUNNING' },
        },
        include: { round: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!bet) return null;
      const locked = await this.getLockedOwnBet(tx, userId, bet.roundId);
      const resolved = await this.resolveRoundInTx(tx, locked);
      return toRoundState(
        resolved.bet,
        resolved.currentMultiplier,
        resolved.elapsedMs,
        resolved.newBalance,
      );
    });
  }

  private async resolveRoundInTx(
    tx: Prisma.TransactionClient,
    bet: CrashBetWithRound,
  ): Promise<{
    bet: CrashBetWithRound;
    currentMultiplier: number;
    elapsedMs: number;
    newBalance?: string;
  }> {
    const round = bet.round;
    if (round.status !== 'RUNNING' || !round.startedAt) {
      return {
        bet,
        currentMultiplier: Number(round.crashPoint.toFixed(4)),
        elapsedMs: round.startedAt ? Math.max(0, Date.now() - round.startedAt.getTime()) : 0,
      };
    }

    const elapsedMs = Math.max(0, Date.now() - round.startedAt.getTime());
    const currentMultiplier = multiplierAt(elapsedMs);
    const crashPointNumber = Number(round.crashPoint);
    let latestBet = bet;
    let newBalance: string | undefined;
    const autoCashOut = bet.autoCashOut ? Number(bet.autoCashOut.toFixed(4)) : null;

    if (
      autoCashOut !== null &&
      !bet.cashedOutAt &&
      autoCashOut < crashPointNumber &&
      currentMultiplier >= autoCashOut
    ) {
      const finalized = await this.finalizeCashoutInTx(
        tx,
        bet,
        round,
        autoCashOut,
        parseOutcome(bet.controlOutcome),
        parsePredicted(bet.controlOriginal, bet.amount),
      );
      latestBet = finalized.bet;
      newBalance = finalized.newBalance;
    }

    if (currentMultiplier >= crashPointNumber) {
      const crashedAt = new Date(
        round.startedAt.getTime() + crashElapsedMs(Number(round.crashPoint)),
      );
      const updatedRound = await tx.crashRound.update({
        where: { id: round.id },
        data: {
          status: 'CRASHED',
          crashedAt,
        },
      });
      latestBet = await this.getBetWithRound(tx, bet.id);
      if (!latestBet.cashedOutAt) {
        await this.finalizeLossInTx(
          tx,
          latestBet,
          updatedRound,
          parseOutcome(latestBet.controlOutcome),
          parsePredicted(latestBet.controlOriginal, latestBet.amount),
        );
      }
      const finalized = await this.getBetWithRound(tx, bet.id);
      return {
        bet: finalized,
        currentMultiplier: Number(updatedRound.crashPoint.toFixed(4)),
        elapsedMs,
        newBalance,
      };
    }

    return { bet: latestBet, currentMultiplier, elapsedMs, newBalance };
  }

  private async finalizeCashoutInTx(
    tx: Prisma.TransactionClient,
    bet: CrashBetWithRound,
    round: { id: string; gameId: string; crashPoint: Prisma.Decimal },
    multiplier: number,
    control: ControlOutcome | null,
    original: PredictedResult,
  ): Promise<{ bet: CrashBetWithRound; payout: Prisma.Decimal; newBalance: string }> {
    if (bet.cashedOutAt) {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: bet.userId },
        select: { balance: true },
      });
      return { bet, payout: bet.payout, newBalance: user.balance.toFixed(2) };
    }

    const cashoutMultiplier = new Prisma.Decimal(multiplier.toFixed(4));
    const payout = bet.amount.mul(cashoutMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const claimed = await tx.crashBet.updateMany({
      where: { id: bet.id, cashedOutAt: null, controlFinalizedAt: null },
      data: {
        cashedOutAt: cashoutMultiplier,
        payout,
        controlFinalizedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      const current = await this.getBetWithRound(tx, bet.id);
      const user = await tx.user.findUniqueOrThrow({
        where: { id: bet.userId },
        select: { balance: true },
      });
      return { bet: current, payout: current.payout, newBalance: user.balance.toFixed(2) };
    }

    const newBalance = await creditAndRecord(tx, bet.userId, payout, null, 'CASHOUT', {
      gameId: round.gameId,
      roundId: round.id,
      crashBetId: bet.id,
      multiplier: cashoutMultiplier.toFixed(4),
    });
    const finalizedBet = await this.getBetWithRound(tx, bet.id);
    const final = {
      won: payout.greaterThan(bet.amount),
      amount: bet.amount,
      multiplier: cashoutMultiplier,
      payout,
    };
    const effectiveOutcome =
      control?.controlled && control.won
        ? {
            ...control,
            multiplier: cashoutMultiplier,
            payout,
            won: payout.greaterThan(bet.amount),
          }
        : {
            won: payout.greaterThan(bet.amount),
            multiplier: cashoutMultiplier,
            payout,
            controlled: false,
          };

    await finalizeControls(
      tx,
      bet.userId,
      round.gameId,
      original,
      final,
      effectiveOutcome,
      bet.id,
      {
        crashPoint: original.multiplier.toFixed(4),
        payout: original.payout.toFixed(2),
      },
      {
        crashPoint: round.crashPoint.toFixed(4),
        cashoutAt: cashoutMultiplier.toFixed(4),
        payout: payout.toFixed(2),
      },
    );

    return { bet: finalizedBet, payout, newBalance: newBalance.toFixed(2) };
  }

  private async finalizeLossInTx(
    tx: Prisma.TransactionClient,
    bet: CrashBetWithRound,
    round: { id: string; gameId: string; crashPoint: Prisma.Decimal },
    control: ControlOutcome | null,
    original: PredictedResult,
  ): Promise<void> {
    if (bet.controlFinalizedAt) return;
    const claimed = await tx.crashBet.updateMany({
      where: { id: bet.id, controlFinalizedAt: null },
      data: { payout: new Prisma.Decimal(0), controlFinalizedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    const effectiveOutcome =
      control?.controlled && !control.won
        ? control
        : {
            won: false,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            controlled: false,
          };
    await finalizeControls(
      tx,
      bet.userId,
      round.gameId,
      original,
      {
        won: false,
        amount: bet.amount,
        multiplier: new Prisma.Decimal(0),
        payout: new Prisma.Decimal(0),
      },
      effectiveOutcome,
      bet.id,
      {
        crashPoint: original.multiplier.toFixed(4),
        payout: original.payout.toFixed(2),
      },
      {
        crashPoint: round.crashPoint.toFixed(4),
        payout: '0.00',
      },
    );
  }

  private async getLockedOwnBet(
    tx: Prisma.TransactionClient,
    userId: string,
    roundId: string,
  ): Promise<CrashBetWithRound> {
    const owned = await tx.crashBet.findFirst({
      where: { userId, roundId },
      select: { id: true, roundId: true },
    });
    if (!owned) throw new ApiError('ROUND_NOT_FOUND', '找不到本局資料。');
    await tx.$queryRaw`SELECT id FROM "CrashRound" WHERE id = ${owned.roundId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "CrashBet" WHERE id = ${owned.id} FOR UPDATE`;
    return this.getBetWithRound(tx, owned.id);
  }

  private async getBetWithRound(
    tx: Prisma.TransactionClient,
    betId: string,
  ): Promise<CrashBetWithRound> {
    return tx.crashBet.findUniqueOrThrow({
      where: { id: betId },
      include: { round: true },
    });
  }

  private async nextRoundNumber(tx: Prisma.TransactionClient, gameId: string): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`crash-round:${gameId}`}))`;
    const last = await tx.crashRound.findFirst({
      where: { gameId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    return (last?.roundNumber ?? 0) + 1;
  }

  private async countRecentControlledCrashLosses(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<number> {
    const recent = await tx.crashBet.findMany({
      where: {
        userId,
        controlFinalizedAt: { not: null },
        round: { gameId: { in: [...CRASH_CONTROL_GAME_IDS] } },
      },
      orderBy: { createdAt: 'desc' },
      take: CONTROLLED_RELIEF_AFTER_LOSSES,
      select: {
        controlOutcome: true,
        round: { select: { crashPoint: true } },
      },
    });

    let streak = 0;
    for (const bet of recent) {
      const outcome = parseOutcome(bet.controlOutcome);
      const crash = Number(bet.round.crashPoint.toFixed(4));
      const controlledLoss =
        outcome?.controlled === true &&
        outcome.won === false &&
        crash >= CONTROLLED_LOSS_CRASH_MIN &&
        crash <= CONTROLLED_LOSS_CRASH_MAX;
      if (!controlledLoss) break;
      streak += 1;
    }
    return streak;
  }

  private predictStartOutcome(amount: Prisma.Decimal): PredictedResult {
    const multiplier = new Prisma.Decimal(0);
    const payout = new Prisma.Decimal(0);
    return {
      won: payout.greaterThan(amount),
      amount,
      multiplier,
      payout,
    };
  }

  private tuneCrashPoint(
    naturalCrashPoint: number,
    amount: Prisma.Decimal,
    control: ControlOutcome,
    recentControlledLosses = 0,
  ): { crashPoint: number; control: ControlOutcome } {
    if (!control.controlled) {
      return { crashPoint: Number(naturalCrashPoint.toFixed(4)), control };
    }
    if (!control.won) {
      if (recentControlledLosses >= CONTROLLED_RELIEF_AFTER_LOSSES) {
        const crashPoint = randomCrashPoint(
          CONTROLLED_RELIEF_CRASH_MIN,
          CONTROLLED_RELIEF_CRASH_MAX,
        );
        return {
          crashPoint,
          control: {
            ...control,
            won: true,
            multiplier: new Prisma.Decimal('2.0000'),
            payout: amount.mul(2).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN),
            flipReason: control.flipReason ?? 'controlled_crash_relief_win',
          },
        };
      }

      return {
        crashPoint: randomCrashPoint(CONTROLLED_LOSS_CRASH_MIN, CONTROLLED_LOSS_CRASH_MAX),
        control,
      };
    }

    const capFromPayout = control.maxPayout
      ? Number(control.maxPayout.div(amount).toFixed(4))
      : Number.POSITIVE_INFINITY;
    const maxTarget = Math.min(
      control.maxMultiplier ? Number(control.maxMultiplier.toFixed(4)) : Number.POSITIVE_INFINITY,
      capFromPayout,
    );
    const minTarget = control.minMultiplier
      ? Number(control.minMultiplier.toFixed(4))
      : MIN_CASHOUT_MULTIPLIER;
    const requestedTarget = Math.max(
      MIN_CASHOUT_MULTIPLIER,
      minTarget,
      Number(control.multiplier.toFixed(4)),
    );

    if (requestedTarget > maxTarget || maxTarget <= 1) {
      return {
        crashPoint: MIN_CASHOUT_MULTIPLIER,
        control: {
          won: false,
          multiplier: new Prisma.Decimal(0),
          payout: new Prisma.Decimal(0),
          controlled: true,
          flipReason: 'burst_budget_guard',
          controlId: control.controlId,
        },
      };
    }

    const target = chooseControlledWinCrashTarget(requestedTarget, maxTarget);
    const randomCushion = 0.03 + Math.random() * 0.22;
    const controlledCrashPoint = target + randomCushion;
    const cappedCrashPoint = Number.isFinite(maxTarget)
      ? Math.min(Math.max(naturalCrashPoint, controlledCrashPoint), maxTarget + 0.03)
      : Math.max(naturalCrashPoint, controlledCrashPoint);
    return {
      crashPoint: Number(cappedCrashPoint.toFixed(4)),
      control,
    };
  }
}

function multiplierAt(elapsedMs: number): number {
  return Number(Math.max(1, Math.exp(SOLO_GROWTH_RATE * elapsedMs)).toFixed(4));
}

function crashElapsedMs(multiplier: number): number {
  if (multiplier <= 1) return 0;
  return Math.max(0, Math.floor(Math.log(multiplier) / SOLO_GROWTH_RATE));
}

function randomCrashPoint(min: number, max: number): number {
  return Number((min + Math.random() * (max - min)).toFixed(4));
}

function chooseControlledWinCrashTarget(requestedTarget: number, maxTarget: number): number {
  if (!Number.isFinite(maxTarget)) {
    const high = Math.random() < CONTROLLED_WIN_HIGH_RATE;
    const sampled = high
      ? randomCrashPoint(CONTROLLED_WIN_HIGH_MIN, CONTROLLED_WIN_HIGH_MAX)
      : randomCrashPoint(CONTROLLED_WIN_BASE_MIN, CONTROLLED_WIN_BASE_MAX);
    return Math.max(requestedTarget, sampled);
  }

  if (maxTarget >= CONTROLLED_WIN_HIGH_MIN && Math.random() < CONTROLLED_WIN_HIGH_RATE) {
    return randomCrashPoint(
      Math.max(requestedTarget, CONTROLLED_WIN_HIGH_MIN),
      Math.min(maxTarget, CONTROLLED_WIN_HIGH_MAX),
    );
  }

  const upper = maxTarget;
  const baseUpper = Math.min(upper, CONTROLLED_WIN_BASE_MAX);
  if (baseUpper > requestedTarget) {
    return randomCrashPoint(requestedTarget, baseUpper);
  }
  return Number(requestedTarget.toFixed(4));
}

function toRoundState(
  bet: CrashBetWithRound,
  currentMultiplier: number,
  elapsedMs: number,
  newBalance?: string,
): CrashSoloRoundState {
  const round = bet.round;
  const crashed = round.status === 'CRASHED';
  return {
    gameId: round.gameId,
    roundId: round.id,
    betId: bet.id,
    roundNumber: round.roundNumber,
    status: round.status,
    serverSeedHash: round.serverSeedHash,
    startedAt: round.startedAt?.toISOString(),
    crashedAt: round.crashedAt?.toISOString(),
    crashPoint: crashed ? Number(round.crashPoint.toFixed(4)) : undefined,
    serverSeed: crashed ? (round.serverSeed ?? undefined) : undefined,
    amount: bet.amount.toFixed(2),
    autoCashOut: bet.autoCashOut ? Number(bet.autoCashOut.toFixed(4)) : undefined,
    cashedOutAt: bet.cashedOutAt ? Number(bet.cashedOutAt.toFixed(4)) : undefined,
    payout: bet.payout.toFixed(2),
    currentMultiplier: crashed
      ? Number(round.crashPoint.toFixed(4))
      : Number(currentMultiplier.toFixed(4)),
    elapsedMs,
    visualCrashPoint: Number(round.crashPoint.toFixed(4)),
    newBalance,
  };
}

function serializePredicted(result: PredictedResult): StoredPredictedResult {
  return {
    won: result.won,
    amount: result.amount.toFixed(2),
    multiplier: result.multiplier.toFixed(4),
    payout: result.payout.toFixed(2),
  };
}

function serializeOutcome(outcome: ControlOutcome): StoredControlOutcome {
  return {
    won: outcome.won,
    amount: '0.00',
    multiplier: outcome.multiplier.toFixed(4),
    payout: outcome.payout.toFixed(2),
    controlled: outcome.controlled,
    flipReason: outcome.flipReason,
    controlId: outcome.controlId,
    minMultiplier: outcome.minMultiplier?.toFixed(4),
    maxMultiplier: outcome.maxMultiplier?.toFixed(4),
    maxPayout: outcome.maxPayout?.toFixed(2),
  };
}

function parsePredicted(value: unknown, amount: Prisma.Decimal): PredictedResult {
  const record = asRecord(value);
  return {
    won: Boolean(record?.won),
    amount,
    multiplier: decimalFrom(record?.multiplier, '0'),
    payout: decimalFrom(record?.payout, '0'),
  };
}

function parseOutcome(value: unknown): ControlOutcome | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    won: Boolean(record.won),
    multiplier: decimalFrom(record.multiplier, '0'),
    payout: decimalFrom(record.payout, '0'),
    controlled: Boolean(record.controlled),
    flipReason: typeof record.flipReason === 'string' ? record.flipReason : undefined,
    controlId: typeof record.controlId === 'string' ? record.controlId : undefined,
    minMultiplier:
      record.minMultiplier !== undefined ? decimalFrom(record.minMultiplier, '0') : undefined,
    maxMultiplier:
      record.maxMultiplier !== undefined ? decimalFrom(record.maxMultiplier, '0') : undefined,
    maxPayout: record.maxPayout !== undefined ? decimalFrom(record.maxPayout, '0') : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function decimalFrom(value: unknown, fallback: string): Prisma.Decimal {
  const raw = typeof value === 'string' || typeof value === 'number' ? value : fallback;
  return new Prisma.Decimal(raw);
}
