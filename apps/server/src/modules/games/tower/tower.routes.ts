import type { FastifyInstance } from 'fastify';
import {
  towerStartSchema,
  towerPickSchema,
  towerCashoutSchema,
} from './tower.schema.js';
import { TowerService } from './tower.service.js';

export async function towerRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new TowerService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/start', async (req) => {
    const body = towerStartSchema.parse(req.body);
    return service.start(req.userId, body);
  });
  fastify.post('/pick', async (req) => {
    const body = towerPickSchema.parse(req.body);
    return service.pick(req.userId, body);
  });
  fastify.post('/cashout', async (req) => {
    const body = towerCashoutSchema.parse(req.body);
    return service.cashout(req.userId, body);
  });
  fastify.get('/active', async (req) => {
    const state = await service.getActive(req.userId);
    return { state };
  });
}
