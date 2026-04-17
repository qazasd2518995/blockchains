import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';

const pingBetSchema = z.object({
  amount: z.number().positive().max(100000),
});

export async function pingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/bet',
    { preHandler: [fastify.authenticate] },
    async (req) => {
      const body = pingBetSchema.parse(req.body);
      const amount = new Prisma.Decimal(body.amount);
      if (amount.greaterThan(config.MAX_SINGLE_BET)) {
        throw new ApiError('BET_OUT_OF_RANGE', `Max single bet is ${config.MAX_SINGLE_BET}`);
      }

      return fastify.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUniqueOrThrow({ where: { id: req.userId } });
        if (user.balance.lessThan(amount)) {
          throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
        }
        const deducted = await tx.user.update({
          where: { id: req.userId },
          data: { balance: { decrement: amount } },
        });
        await tx.transaction.create({
          data: {
            userId: req.userId,
            type: 'BET_PLACE',
            amount: amount.negated(),
            balanceAfter: deducted.balance,
          },
        });
        const credited = await tx.user.update({
          where: { id: req.userId },
          data: { balance: { increment: amount } },
        });
        await tx.transaction.create({
          data: {
            userId: req.userId,
            type: 'BET_WIN',
            amount,
            balanceAfter: credited.balance,
            meta: { note: 'Ping echo' },
          },
        });
        return {
          ok: true,
          echoedAmount: amount.toFixed(2),
          balance: credited.balance.toFixed(2),
        };
      }, { isolationLevel: 'Serializable' });
    },
  );
}
