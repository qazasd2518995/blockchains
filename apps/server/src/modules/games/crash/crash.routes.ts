import type { FastifyInstance } from 'fastify';
import {
  crashBetSchema,
  crashHistoryQuerySchema,
  crashRoundParamsSchema,
} from './crash.schema.js';
import { CrashSoloService } from './crash.service.js';
import { ApiError } from '../../../utils/errors.js';

export async function crashRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new CrashSoloService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/history', async (req) => {
    const query = crashHistoryQuerySchema.parse(req.query);
    return service.history(query.gameId);
  });

  fastify.post('/bet', async (req) => {
    const body = crashBetSchema.parse(req.body);
    return service.start(req.userId, body);
  });

  fastify.get('/round/:roundId', async (req) => {
    const params = crashRoundParamsSchema.parse(req.params);
    return service.getRound(req.userId, params.roundId);
  });

  fastify.post('/cashout', async () => {
    throw new ApiError('INVALID_ACTION', 'Crash 提領功能已停用，本局會直接飛到爆炸。');
  });
}
