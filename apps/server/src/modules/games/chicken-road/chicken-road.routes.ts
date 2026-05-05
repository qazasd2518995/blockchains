import type { FastifyInstance } from 'fastify';
import {
  chickenRoadCashoutSchema,
  chickenRoadStartSchema,
  chickenRoadStepSchema,
} from './chicken-road.schema.js';
import { ChickenRoadService } from './chicken-road.service.js';

export async function chickenRoadRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new ChickenRoadService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/start', async (req) => {
    const body = chickenRoadStartSchema.parse(req.body);
    return service.start(req.userId, body);
  });

  fastify.post('/step', async (req) => {
    const body = chickenRoadStepSchema.parse(req.body);
    return service.step(req.userId, body);
  });

  fastify.post('/cashout', async (req) => {
    const body = chickenRoadCashoutSchema.parse(req.body);
    return service.cashout(req.userId, body);
  });

  fastify.get('/active', async (req) => {
    const state = await service.getActive(req.userId);
    return { state };
  });
}
