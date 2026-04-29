import type { FastifyInstance } from 'fastify';
import { blackjackActionSchema, blackjackStartSchema } from './blackjack.schema.js';
import { BlackjackService } from './blackjack.service.js';

export async function blackjackRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new BlackjackService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/start', async (req) => {
    const body = blackjackStartSchema.parse(req.body);
    return service.start(req.userId, body);
  });

  fastify.post('/hit', async (req) => {
    const body = blackjackActionSchema.parse(req.body);
    return service.hit(req.userId, body);
  });

  fastify.post('/stand', async (req) => {
    const body = blackjackActionSchema.parse(req.body);
    return service.stand(req.userId, body);
  });

  fastify.post('/double', async (req) => {
    const body = blackjackActionSchema.parse(req.body);
    return service.double(req.userId, body);
  });

  fastify.post('/split', async (req) => {
    const body = blackjackActionSchema.parse(req.body);
    return service.split(req.userId, body);
  });

  fastify.get('/active', async (req) => {
    const state = await service.getActive(req.userId);
    return { state };
  });
}
