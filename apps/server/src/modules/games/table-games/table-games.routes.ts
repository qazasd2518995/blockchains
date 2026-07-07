import type { FastifyInstance } from 'fastify';
import { canAccessLocalTableBeta } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import {
  localTableBetSchema,
  stagedTableActionSchema,
  stagedTableActiveQuerySchema,
  stagedTableSplitSchema,
  stagedTableStartSchema,
  twentyOneHalfActionSchema,
  twentyOneHalfActiveQuerySchema,
  twentyOneHalfStartSchema,
} from './table-games.schema.js';
import { LocalTableService } from './table-games.service.js';

interface LocalTableBetaAccessStore {
  user: {
    findUnique: (args: {
      where: { id: string };
      select: { username: true };
    }) => Promise<{ username: string } | null>;
  };
}

export async function assertLocalTableBetaAccess(
  store: LocalTableBetaAccessStore,
  userId: string,
): Promise<void> {
  const user = await store.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (!canAccessLocalTableBeta(user?.username)) {
    throw new ApiError('FORBIDDEN', 'Local table games are not available for this account');
  }
}

export async function tableGamesRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new LocalTableService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (req) => {
    await assertLocalTableBetaAccess(fastify.prisma, req.userId);
  });

  fastify.post('/bet', async (req) => {
    const body = localTableBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });

  fastify.post('/twenty-one-half/start', async (req) => {
    const body = twentyOneHalfStartSchema.parse(req.body);
    return service.startTwentyOneHalf(req.userId, body);
  });

  fastify.post('/twenty-one-half/hit', async (req) => {
    const body = twentyOneHalfActionSchema.parse(req.body);
    return service.hitTwentyOneHalf(req.userId, body);
  });

  fastify.post('/twenty-one-half/stand', async (req) => {
    const body = twentyOneHalfActionSchema.parse(req.body);
    return service.standTwentyOneHalf(req.userId, body);
  });

  fastify.post('/twenty-one-half/banker-draw', async (req) => {
    const body = twentyOneHalfActionSchema.parse(req.body);
    return service.drawTwentyOneHalfBanker(req.userId, body);
  });

  fastify.get('/twenty-one-half/active', async (req) => {
    const query = twentyOneHalfActiveQuerySchema.parse(req.query);
    const state = await service.getActiveTwentyOneHalf(req.userId, query.gameId);
    return { state };
  });

  fastify.post('/round/start', async (req) => {
    const body = stagedTableStartSchema.parse(req.body);
    return service.startStagedTableRound(req.userId, body);
  });

  fastify.post('/round/reveal', async (req) => {
    const body = stagedTableActionSchema.parse(req.body);
    return service.revealStagedTableRound(req.userId, body);
  });

  fastify.post('/round/split', async (req) => {
    const body = stagedTableSplitSchema.parse(req.body);
    return service.splitStagedTableRound(req.userId, body);
  });

  fastify.get('/round/active', async (req) => {
    const query = stagedTableActiveQuerySchema.parse(req.query);
    const state = await service.getActiveStagedTableRound(req.userId, query.gameId);
    return { state };
  });
}
