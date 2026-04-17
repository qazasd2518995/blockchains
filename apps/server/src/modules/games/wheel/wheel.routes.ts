import type { FastifyInstance } from 'fastify';
import { wheelBetSchema } from './wheel.schema.js';
import { WheelService } from './wheel.service.js';

export async function wheelRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new WheelService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/bet', async (req) => {
    const body = wheelBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
