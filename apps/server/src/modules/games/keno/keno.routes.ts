import type { FastifyInstance } from 'fastify';
import { kenoBetSchema } from './keno.schema.js';
import { KenoService } from './keno.service.js';

export async function kenoRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new KenoService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/bet', async (req) => {
    const body = kenoBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
