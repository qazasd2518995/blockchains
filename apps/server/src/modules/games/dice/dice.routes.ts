import type { FastifyInstance } from 'fastify';
import { diceBetSchema } from './dice.schema.js';
import { DiceService } from './dice.service.js';

export async function diceRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new DiceService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/bet', async (req) => {
    const body = diceBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
