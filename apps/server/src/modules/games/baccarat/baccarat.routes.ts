import type { FastifyInstance } from 'fastify';
import { baccaratBetSchema } from './baccarat.schema.js';
import { BaccaratService } from './baccarat.service.js';

export async function baccaratRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new BaccaratService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/bet', async (req) => {
    const body = baccaratBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
