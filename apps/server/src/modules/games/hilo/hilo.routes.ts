import type { FastifyInstance } from 'fastify';
import {
  hiloStartSchema,
  hiloGuessSchema,
  hiloCashoutSchema,
  hiloSkipSchema,
} from './hilo.schema.js';
import { HiLoService } from './hilo.service.js';

export async function hiloRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new HiLoService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/start', async (req) => {
    const body = hiloStartSchema.parse(req.body);
    return service.start(req.userId, body);
  });
  fastify.post('/guess', async (req) => {
    const body = hiloGuessSchema.parse(req.body);
    return service.guess(req.userId, body);
  });
  fastify.post('/skip', async (req) => {
    const body = hiloSkipSchema.parse(req.body);
    return service.skip(req.userId, body.roundId);
  });
  fastify.post('/cashout', async (req) => {
    const body = hiloCashoutSchema.parse(req.body);
    return service.cashout(req.userId, body);
  });
  fastify.get('/active', async (req) => {
    const state = await service.getActive(req.userId);
    return { state };
  });
}
