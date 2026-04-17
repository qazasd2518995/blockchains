import type { FastifyInstance } from 'fastify';
import { minesStartSchema, minesRevealSchema, minesCashoutSchema } from './mines.schema.js';
import { MinesService } from './mines.service.js';

export async function minesRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new MinesService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/start', async (req) => {
    const body = minesStartSchema.parse(req.body);
    return service.start(req.userId, body);
  });

  fastify.post('/reveal', async (req) => {
    const body = minesRevealSchema.parse(req.body);
    return service.reveal(req.userId, body);
  });

  fastify.post('/cashout', async (req) => {
    const body = minesCashoutSchema.parse(req.body);
    return service.cashout(req.userId, body);
  });

  fastify.get('/active', async (req) => {
    const state = await service.getActive(req.userId);
    return { state };
  });
}
