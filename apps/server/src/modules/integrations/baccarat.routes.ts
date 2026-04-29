import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { BACCARAT_GAME_IDS } from '@bg/shared';
import { config } from '../../config.js';
import { ApiError } from '../../utils/errors.js';
import {
  SeedHelper,
  creditAndRecord,
  debitAndRecord,
  runSerializable,
} from '../games/_common/BaseGameService.js';
import { applyControls, finalizeControls } from '../games/_common/controls.js';

const userParamSchema = z.object({
  userId: z.string().min(1),
});

const amountSchema = z.coerce.number().positive().max(1_000_000_000);

const betPlaceSchema = z.object({
  userId: z.string().min(1),
  amount: amountSchema,
  meta: z.unknown().optional(),
});

const betClearSchema = z.object({
  userId: z.string().min(1),
  amount: amountSchema,
  meta: z.unknown().optional(),
});

const settleSchema = z.object({
  userId: z.string().min(1),
  amount: amountSchema,
  payout: z.coerce.number().min(0).max(1_000_000_000),
  gameId: z.enum(BACCARAT_GAME_IDS).default('baccarat'),
  resultData: z.unknown().optional(),
});

function assertIntegrationSecret(req: FastifyRequest): void {
  const raw = req.headers['x-baccarat-secret'];
  const secret = Array.isArray(raw) ? raw[0] : raw;
  if (!secret || secret !== config.BACCARAT_INTEGRATION_SECRET) {
    throw new ApiError('FORBIDDEN', 'Invalid baccarat integration secret');
  }
}

function roundMoney(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function syncAdjustment(
  fastify: FastifyInstance,
  userId: string,
  amount: Prisma.Decimal,
  meta: unknown,
): Promise<Prisma.Decimal> {
  const updated = await fastify.prisma.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });
  await fastify.prisma.transaction.create({
    data: {
      userId,
      type: 'ADJUSTMENT',
      amount,
      balanceAfter: updated.balance,
      meta: meta === undefined ? { source: 'baccarat_refund' } : { source: 'baccarat_refund', payload: meta },
    },
  });
  return updated.balance;
}

export async function baccaratIntegrationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/users/:userId/balance', async (req) => {
    assertIntegrationSecret(req);
    const { userId } = userParamSchema.parse(req.params);
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, balance: true, frozenAt: true, disabledAt: true },
    });
    if (!user || user.disabledAt) throw new ApiError('USER_NOT_FOUND', 'User not found');
    return {
      balance: user.balance.toFixed(2),
      frozen: Boolean(user.frozenAt),
      disabled: Boolean(user.disabledAt),
    };
  });

  fastify.post('/bet-place', async (req) => {
    assertIntegrationSecret(req);
    const body = betPlaceSchema.parse(req.body);
    return runSerializable(fastify.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: body.userId },
        select: { id: true, balance: true, frozenAt: true, disabledAt: true },
      });
      if (!user || user.disabledAt) throw new ApiError('USER_NOT_FOUND', 'User not found');
      if (user.frozenAt) throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');

      const amount = roundMoney(body.amount);
      if (user.balance.lessThan(amount)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
      }
      const balance = await debitAndRecord(tx, body.userId, amount, null);
      if (body.meta !== undefined) {
        await tx.transaction.updateMany({
          where: { userId: body.userId, type: 'BET_PLACE', betId: null, balanceAfter: balance },
          data: { meta: { source: 'baccarat_bet', payload: body.meta } },
        });
      }
      return { balance: balance.toFixed(2) };
    });
  });

  fastify.post('/bet-clear', async (req) => {
    assertIntegrationSecret(req);
    const body = betClearSchema.parse(req.body);
    const user = await fastify.prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, disabledAt: true },
    });
    if (!user || user.disabledAt) throw new ApiError('USER_NOT_FOUND', 'User not found');

    const balance = await syncAdjustment(fastify, body.userId, roundMoney(body.amount), body.meta);
    return { balance: balance.toFixed(2) };
  });

  fastify.post('/settle', async (req) => {
    assertIntegrationSecret(req);
    const body = settleSchema.parse(req.body);
    return runSerializable(fastify.prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: body.userId },
        select: { id: true, disabledAt: true },
      });
      if (!user || user.disabledAt) throw new ApiError('USER_NOT_FOUND', 'User not found');

      const amount = roundMoney(body.amount);
      const payout = roundMoney(body.payout);
      const multiplier = amount.greaterThan(0)
        ? payout.div(amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(0);
      const original = {
        won: payout.greaterThan(amount),
        amount,
        multiplier,
        payout,
      };
      const controlled = await applyControls(tx, body.userId, body.gameId, original);
      const finalPayout = controlled.controlled ? controlled.payout : payout;
      const finalMultiplier = controlled.controlled ? controlled.multiplier : multiplier;
      const submittedResult = body.resultData ?? null;
      const originalResult = {
        source: 'baccarat_settle',
        resultData: submittedResult,
        multiplier: multiplier.toFixed(4),
        payout: payout.toFixed(2),
      };
      const finalResult = {
        source: 'baccarat_settle',
        resultData: submittedResult,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        multiplier: finalMultiplier.toFixed(4),
        payout: finalPayout.toFixed(2),
        raw: controlled.controlled ? originalResult : null,
      };

      const seed = await new SeedHelper(tx).getActiveBundle(body.userId, body.gameId);
      const bet = await tx.bet.create({
        data: {
          userId: body.userId,
          gameId: body.gameId,
          amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit: finalPayout.sub(amount),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as Prisma.InputJsonValue,
          status: 'SETTLED',
        },
      });

      const balance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, body.userId, finalPayout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: body.userId } })).balance;

      if (finalPayout.lessThanOrEqualTo(0)) {
        await tx.transaction.create({
          data: {
            userId: body.userId,
            type: 'BET_WIN',
            amount: new Prisma.Decimal(0),
            balanceAfter: balance,
            betId: bet.id,
            meta: { source: 'baccarat_settle' },
          },
        });
      }

      await finalizeControls(
        tx,
        body.userId,
        body.gameId,
        original,
        {
          won: finalPayout.greaterThan(amount),
          amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
        },
        controlled,
        bet.id,
        originalResult as Prisma.InputJsonValue,
        finalResult as Prisma.InputJsonValue,
      );

      return {
        balance: balance.toFixed(2),
        betId: bet.id,
        payout: finalPayout.toFixed(2),
        multiplier: finalMultiplier.toFixed(4),
        controlled: controlled.controlled,
      };
    });
  });
}
