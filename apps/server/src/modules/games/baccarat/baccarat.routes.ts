import type { FastifyInstance } from 'fastify';
import { canAccessLocalTableBeta } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { baccaratBetSchema } from './baccarat.schema.js';
import { BaccaratService } from './baccarat.service.js';

interface BaccaratBetaAccessStore {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { username: true };
    }) => Promise<{ username: string } | null>;
  };
}

async function assertBaccaratTableBetaAccess(
  store: BaccaratBetaAccessStore,
  userId: string,
): Promise<void> {
  const user = await store.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!canAccessLocalTableBeta(user?.username)) {
    throw new ApiError('FORBIDDEN', 'Baccarat table games are not available for this account');
  }
}

export async function baccaratRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new BaccaratService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (req) => {
    await assertBaccaratTableBetaAccess(fastify.prisma, req.userId);
  });

  fastify.post('/bet', async (req) => {
    const body = baccaratBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
