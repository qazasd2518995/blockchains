import type { FastifyInstance } from 'fastify';
import { hotlineBetSchema } from './hotline.schema.js';
import { HotlineService } from './hotline.service.js';

export async function hotlineRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new HotlineService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/bet', async (req) => {
    const body = hotlineBetSchema.parse(req.body);
    return service.bet(req.userId, body);
  });
}
