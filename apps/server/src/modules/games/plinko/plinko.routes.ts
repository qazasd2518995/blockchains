import type { FastifyInstance } from 'fastify';
import { plinkoBetSchema } from './plinko.schema.js';
import { PlinkoService } from './plinko.service.js';

export async function plinkoRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new PlinkoService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/bet', async (req) => {
    const body = plinkoBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
