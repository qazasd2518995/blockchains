import { Prisma, type PrismaClient } from '@prisma/client';
import {
  thor2ControlFactorCandidates,
  thor2Spin,
  thor2SpinForFactor,
  THOR2_MAX_WIN_MULTIPLIER,
  THOR2_MODEL_VERSION,
} from '@bg/provably-fair';
import {
  GameId,
  type Thor2JackpotPools,
  type Thor2SessionResult,
  type Thor2SpinAction,
  type Thor2SpinResult,
} from '@bg/shared';
import {
  SeedHelper,
  creditAndRecord,
  debitAndRecord,
  lockUserAndCheckFunds,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  forceControlOutcomeToLoss,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { Thor2SpinInput } from './thor2.schema.js';
import { assertThor2FeatureComplete, nextThor2FeatureCursor } from './thor2.progress.js';
import { thor2ActionCostMultiplier, thor2Payout } from './thor2.economics.js';

const GAME_ID = GameId.POWER_OF_THOR_2;
const WALLET_VERSION = 'thor2-deferred-feature-v1';
const THOR2_JACKPOT_SEEDS = {
  grand: new Prisma.Decimal('1246184.41'),
  major: new Prisma.Decimal('115647.19'),
  minor: new Prisma.Decimal('20032.04'),
  mini: new Prisma.Decimal('3318.91'),
} as const;

type Thor2JackpotPoolValue = {
  grand: Prisma.Decimal;
  major: Prisma.Decimal;
  minor: Prisma.Decimal;
  mini: Prisma.Decimal;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function engineOptions(action: Thor2SpinAction) {
  if (action === 'regular' || action === 'super' || action === 'lucky') {
    return { buyFeature: action } as const;
  }
  return action === 'extra' ? ({ extraBet: true } as const) : {};
}

function isDeferred(resultData: unknown): boolean {
  const wallet = record(record(resultData)?.walletSettlement);
  return wallet?.version === WALLET_VERSION && wallet.status === 'DEFERRED';
}

function publicResultData(resultData: unknown): Omit<Thor2SpinResult, 'newBalance'> | null {
  const data = record(resultData);
  const value = data?.publicResult;
  return record(value) as unknown as Omit<Thor2SpinResult, 'newBalance'> | null;
}

function featureRoundCount(resultData: unknown): number {
  const feature = record(publicResultData(resultData)?.feature);
  return Array.isArray(feature?.rounds) ? feature.rounds.length : 0;
}

interface Candidate {
  clientSeed: string;
  engine: ReturnType<typeof thor2Spin>;
  payout: Prisma.Decimal;
  multiplier: Prisma.Decimal;
}

function buildCandidate(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  baseBet: Prisma.Decimal,
  stake: Prisma.Decimal,
  action: Thor2SpinAction,
): Candidate {
  const engine = thor2Spin(serverSeed, clientSeed, nonce, engineOptions(action));
  const payout = thor2Payout(baseBet, engine.totalMultiplier);
  const multiplier = payout.div(stake).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
  return { clientSeed, engine, payout, multiplier };
}

function buildControlledCandidate(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  baseBet: Prisma.Decimal,
  stake: Prisma.Decimal,
  action: Thor2SpinAction,
  factor: number,
): Candidate {
  const controlledClientSeed = `${clientSeed}:thor2-control:${factor.toFixed(4)}`;
  const engine = thor2SpinForFactor(
    serverSeed,
    controlledClientSeed,
    nonce,
    factor,
    engineOptions(action),
  );
  const payout = thor2Payout(baseBet, engine.totalMultiplier);
  const multiplier = payout.div(stake).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
  return { clientSeed: controlledClientSeed, engine, payout, multiplier };
}

function controlledThor2Factors(
  baseBet: Prisma.Decimal,
  stake: Prisma.Decimal,
  action: Thor2SpinAction,
  control: Pick<ControlOutcome, 'won' | 'multiplier' | 'minMultiplier' | 'maxMultiplier'>,
): number[] {
  const options = engineOptions(action);
  const costMultiplier = stake.div(baseBet);
  const targets = new Set<number>();
  const addAccountingMultiplier = (value: Prisma.Decimal | number | undefined) => {
    if (value === undefined) return;
    const factor = Number(new Prisma.Decimal(value).mul(costMultiplier).toFixed(4));
    if (Number.isFinite(factor)) targets.add(Math.max(0, factor));
  };
  addAccountingMultiplier(control.multiplier);
  addAccountingMultiplier(control.minMultiplier);
  addAccountingMultiplier(control.maxMultiplier);
  if (control.won) {
    for (const scale of [1.05, 1.1, 1.2, 1.25]) {
      addAccountingMultiplier(control.multiplier.mul(scale));
    }
  }
  // Keep legal loss anchors available even for a requested win. If a narrow
  // cap has no representable positive Thor result, the shared control contract
  // must receive a real visible loss rather than a winning natural fallback.
  for (const ratio of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    addAccountingMultiplier(ratio);
  }
  const factors = new Set<number>();
  for (const target of targets) {
    for (const factor of thor2ControlFactorCandidates(target, options).slice(0, 64)) {
      factors.add(factor);
    }
  }
  return [...factors];
}

export function selectThor2Candidate(
  natural: Candidate,
  control: ControlOutcome,
  params: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    baseBet: Prisma.Decimal;
    stake: Prisma.Decimal;
    action: Thor2SpinAction;
  },
): { candidate: Candidate; control: ControlOutcome } {
  if (!control.controlled) return { candidate: natural, control };
  const factorCandidates = controlledThor2Factors(
    params.baseBet,
    params.stake,
    params.action,
    control,
  ).map((factor) => {
    const payout = thor2Payout(params.baseBet, factor);
    return {
      factor,
      payout,
      multiplier: payout.div(params.stake).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
    };
  });
  const naturalWon = natural.payout.greaterThan(params.stake);
  // A recorded control decision must always resolve through the deterministic
  // controlled-board builder. Letting a coincidentally matching natural round
  // pass through made the audit record say "controlled" while retaining the
  // unqualified client seed and an unrelated presentation sequence.
  const matching = factorCandidates.filter((candidate) => {
    const won = candidate.payout.greaterThan(params.stake);
    return (
      won === control.won &&
      (!control.maxPayout || candidate.payout.lessThanOrEqualTo(control.maxPayout)) &&
      multiplierMatchesControlBounds(candidate.multiplier, params.stake, control)
    );
  });
  if (matching.length > 0) {
    const nearest = [...matching].sort((a, b) =>
      a.multiplier
        .minus(control.multiplier)
        .abs()
        .cmp(b.multiplier.minus(control.multiplier).abs()),
    );
    const pool = control.won ? nearest.slice(0, Math.min(8, nearest.length)) : matching;
    let selectedFactor: number;
    if (control.won) {
      selectedFactor = (pool[Math.abs(params.nonce) % pool.length] ?? nearest[0])!.factor;
    } else {
      const lossRatios = [0, 0.1, 0.25, 0.5, 0.75, 1];
      const lossTarget = params.stake.mul(
        lossRatios[Math.abs(params.nonce) % lossRatios.length] ?? 0,
      );
      const variedLosses = [...pool].sort((left, right) =>
        left.payout.minus(lossTarget).abs().cmp(right.payout.minus(lossTarget).abs()),
      );
      selectedFactor = (variedLosses[0] ?? nearest[0])!.factor;
    }
    return {
      candidate: buildControlledCandidate(
        params.serverSeed,
        params.clientSeed,
        params.nonce,
        params.baseBet,
        params.stake,
        params.action,
        selectedFactor,
      ),
      control,
    };
  }
  const losses = factorCandidates
    .filter((candidate) => candidate.payout.lessThanOrEqualTo(params.stake))
    .sort((a, b) => a.payout.cmp(b.payout));
  if (losses.length > 0) {
    const selectedFactor = losses[0]!.factor;
    return {
      candidate: buildControlledCandidate(
        params.serverSeed,
        params.clientSeed,
        params.nonce,
        params.baseBet,
        params.stake,
        params.action,
        selectedFactor,
      ),
      control: forceControlOutcomeToLoss(control),
    };
  }
  if (!naturalWon) return { candidate: natural, control: forceControlOutcomeToLoss(control) };
  throw new Error(`Thor II ${params.action} has no representable controlled loss`);
}

export class Thor2Service {
  constructor(private readonly prisma: PrismaClient) {}

  async session(userId: string): Promise<Thor2SessionResult> {
    const [user, pending, jackpotPool] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } }),
      this.prisma.bet.findFirst({
        where: {
          userId,
          gameId: GAME_ID,
          status: 'SETTLED',
          resultData: { path: ['walletSettlement', 'status'], equals: 'DEFERRED' },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.seth2JackpotPool.findUnique({ where: { gameId: GAME_ID } }),
    ]);
    const pendingPublic = pending ? publicResultData(pending.resultData) : null;
    return {
      balance: user.balance.toFixed(2),
      pendingFeature: pendingPublic
        ? { ...pendingPublic, newBalance: user.balance.toFixed(2), payoutDeferred: true }
        : null,
      jackpotPools: thor2JackpotPoolPayload(jackpotPool ?? THOR2_JACKPOT_SEEDS),
    };
  }

  async spin(userId: string, input: Thor2SpinInput): Promise<Thor2SpinResult> {
    const baseBet = new Prisma.Decimal(input.amount);
    const action = input.action as Thor2SpinAction;
    const stake = baseBet.mul(thor2ActionCostMultiplier(action)).toDecimalPlaces(2);
    return runLockedTransaction(this.prisma, async (tx) => {
      const existing = await tx.bet.findFirst({
        where: { userId, gameId: GAME_ID, operationId: input.operationId },
      });
      if (existing) {
        const stored = publicResultData(existing.resultData);
        if (!stored) throw new ApiError('INTERNAL', '雷神之錘回合資料損壞');
        const [user, jackpotPool] = await Promise.all([
          tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { balance: true },
          }),
          tx.seth2JackpotPool.findUnique({ where: { gameId: GAME_ID } }),
        ]);
        return {
          ...stored,
          jackpotPools: thor2JackpotPoolPayload(jackpotPool ?? THOR2_JACKPOT_SEEDS),
          newBalance: user.balance.toFixed(2),
        };
      }
      await lockUserAndCheckFunds(tx, userId, stake, GAME_ID, { limitAmounts: [baseBet] });
      const pending = await tx.bet.findFirst({
        where: {
          userId,
          gameId: GAME_ID,
          status: 'SETTLED',
          resultData: { path: ['walletSettlement', 'status'], equals: 'DEFERRED' },
        },
        select: { id: true },
      });
      if (pending) throw new ApiError('INVALID_ACTION', '請先完成目前的雷神免費遊戲');

      const jackpotPool = await contributeThor2Jackpot(tx, stake);

      const seed = await new SeedHelper(tx).getActiveBundle(userId, GAME_ID, input.clientSeed);
      const natural = buildCandidate(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        baseBet,
        stake,
        action,
      );
      const prediction = {
        won: natural.payout.greaterThan(stake),
        amount: stake,
        multiplier: natural.multiplier,
        payout: natural.payout,
      };
      const controlled = await applyControls(tx, userId, GAME_ID, prediction, {
        burstEligible: true,
        burstPotentialMultiplier: new Prisma.Decimal(THOR2_MAX_WIN_MULTIPLIER)
          .div(thor2ActionCostMultiplier(action))
          .toDecimalPlaces(4),
      });
      const selection = selectThor2Candidate(natural, controlled, {
        serverSeed: seed.serverSeed,
        clientSeed: seed.clientSeed,
        nonce: seed.nonce,
        baseBet,
        stake,
        action,
      });
      const selected = selection.candidate;
      const payoutDeferred = Boolean(selected.engine.feature);
      const profit = selected.payout.minus(stake);
      const publicResult: Omit<Thor2SpinResult, 'newBalance'> = {
        betId: '',
        operationId: input.operationId,
        modelVersion: THOR2_MODEL_VERSION,
        action,
        baseBet: baseBet.toFixed(2),
        chargedAmount: stake.toFixed(2),
        payout: selected.payout.toFixed(2),
        multiplier: Number(selected.multiplier.toFixed(4)),
        grid: selected.engine.grid,
        cascades: selected.engine.cascades,
        ...(selected.engine.feature ? { feature: selected.engine.feature } : {}),
        jackpotPools: thor2JackpotPoolPayload(jackpotPool),
        payoutDeferred,
        ...(payoutDeferred ? { featureCursor: 0 } : {}),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: selected.clientSeed,
      };
      const originalResult = {
        modelVersion: THOR2_MODEL_VERSION,
        action,
        engine: natural.engine,
      };
      const finalResult = {
        modelVersion: THOR2_MODEL_VERSION,
        action,
        engine: selected.engine,
        controlled: selection.control.controlled,
        flipReason: selection.control.flipReason ?? null,
        controlResult: {
          controlled: selection.control.controlled,
          reason: selection.control.flipReason ?? null,
          accountingAmount: stake.toFixed(2),
          originalPayout: natural.payout.toFixed(2),
          finalPayout: selected.payout.toFixed(2),
          originalMultiplier: natural.multiplier.toFixed(4),
          finalMultiplier: selected.multiplier.toFixed(4),
        },
      };
      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GAME_ID,
          amount: stake,
          multiplier: selected.multiplier,
          payout: selected.payout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: selected.clientSeed,
          serverSeedId: seed.serverSeedId,
          operationId: input.operationId,
          resultData: {
            ...finalResult,
            publicResult,
            ...(payoutDeferred
              ? { walletSettlement: { version: WALLET_VERSION, status: 'DEFERRED', cursor: 0 } }
              : { walletSettlement: { version: WALLET_VERSION, status: 'PAID' } }),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      publicResult.betId = bet.id;
      const data = record(bet.resultData) ?? {};
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          resultData: { ...data, publicResult } as unknown as Prisma.InputJsonValue,
        },
      });
      const debited = await debitAndRecord(tx, userId, stake, bet.id, {
        gameId: GAME_ID,
        action,
        baseBet: baseBet.toFixed(2),
      });
      const balance =
        !payoutDeferred && selected.payout.greaterThan(0)
          ? await creditAndRecord(tx, userId, selected.payout, bet.id, 'BET_WIN', {
              gameId: GAME_ID,
              action,
            })
          : debited;
      await finalizeControls(
        tx,
        userId,
        GAME_ID,
        prediction,
        {
          won: selected.payout.greaterThan(stake),
          amount: stake,
          multiplier: selected.multiplier,
          payout: selected.payout,
        },
        selection.control,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );
      return { ...publicResult, newBalance: balance.toFixed(2) };
    });
  }

  async updateProgress(userId: string, betId: string, cursor: number): Promise<{ cursor: number }> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const bet = await tx.bet.findFirst({ where: { id: betId, userId, gameId: GAME_ID } });
      if (!bet || !isDeferred(bet.resultData))
        throw new ApiError('INVALID_ACTION', '免費遊戲不存在或已完成');
      const data = record(bet.resultData) ?? {};
      const wallet = record(data.walletSettlement) ?? {};
      const previous = Math.max(0, Number(wallet.cursor) || 0);
      const rounds = featureRoundCount(bet.resultData);
      const nextCursor = nextThor2FeatureCursor(previous, cursor, rounds);
      const storedPublic = publicResultData(bet.resultData);
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          resultData: {
            ...data,
            walletSettlement: { ...wallet, cursor: nextCursor },
            ...(storedPublic
              ? { publicResult: { ...storedPublic, featureCursor: nextCursor } }
              : {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { cursor: nextCursor };
    });
  }

  async complete(userId: string, betId: string): Promise<{ newBalance: string }> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const user = await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
        skipBetValidation: true,
      });
      const bet = await tx.bet.findFirst({ where: { id: betId, userId, gameId: GAME_ID } });
      if (!bet) throw new ApiError('INVALID_ACTION', '找不到免費遊戲');
      if (!isDeferred(bet.resultData)) return { newBalance: user.balance.toFixed(2) };
      const wallet = record(record(bet.resultData)?.walletSettlement) ?? {};
      const cursor = Math.max(0, Number(wallet.cursor) || 0);
      const rounds = featureRoundCount(bet.resultData);
      assertThor2FeatureComplete(cursor, rounds);
      const balance = await creditAndRecord(tx, userId, bet.payout, bet.id, 'BET_WIN', {
        gameId: GAME_ID,
        mode: 'feature-complete',
      });
      const data = record(bet.resultData) ?? {};
      const paidWallet = record(data.walletSettlement) ?? {};
      await tx.bet.update({
        where: { id: bet.id },
        data: {
          resultData: {
            ...data,
            walletSettlement: {
              ...paidWallet,
              status: 'PAID',
              completedAt: new Date().toISOString(),
            },
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { newBalance: balance.toFixed(2) };
    });
  }

  async history(userId: string) {
    const bets = await this.prisma.bet.findMany({
      where: { userId, gameId: GAME_ID },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        amount: true,
        payout: true,
        multiplier: true,
        resultData: true,
        createdAt: true,
      },
    });
    return bets.map((bet) => ({
      id: bet.id,
      amount: bet.amount.toFixed(2),
      payout: bet.payout.toFixed(2),
      multiplier: Number(bet.multiplier.toFixed(4)),
      action: record(bet.resultData)?.action ?? 'spin',
      createdAt: bet.createdAt.toISOString(),
      payoutDeferred: isDeferred(bet.resultData),
    }));
  }
}

function thor2JackpotPoolPayload(pool: Thor2JackpotPoolValue): Thor2JackpotPools {
  return {
    grand: Number(pool.grand.toFixed(2)),
    major: Number(pool.major.toFixed(2)),
    minor: Number(pool.minor.toFixed(2)),
    mini: Number(pool.mini.toFixed(2)),
  };
}

async function contributeThor2Jackpot(
  tx: Prisma.TransactionClient,
  stake: Prisma.Decimal,
): Promise<Thor2JackpotPoolValue> {
  const contribution = stake.mul('0.01').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const grand = contribution.mul('0.4').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const major = contribution.mul('0.3').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const minor = contribution.mul('0.2').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const mini = contribution.minus(grand).minus(major).minus(minor);
  return tx.seth2JackpotPool.upsert({
    where: { gameId: GAME_ID },
    create: {
      gameId: GAME_ID,
      grand: THOR2_JACKPOT_SEEDS.grand.add(grand),
      major: THOR2_JACKPOT_SEEDS.major.add(major),
      minor: THOR2_JACKPOT_SEEDS.minor.add(minor),
      mini: THOR2_JACKPOT_SEEDS.mini.add(mini),
    },
    update: {
      grand: { increment: grand },
      major: { increment: major },
      minor: { increment: minor },
      mini: { increment: mini },
    },
  });
}
