import type { FastifyInstance } from 'fastify';
import { GameId } from '@bg/shared';
import { rouletteBetSchema } from './roulette.schema.js';
import { RouletteService } from './roulette.service.js';

export async function rouletteRoutes(fastify: FastifyInstance): Promise<void> {
  const miniService = new RouletteService(fastify.prisma, GameId.MINI_ROULETTE);
  const carnivalService = new RouletteService(fastify.prisma, GameId.CARNIVAL);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.post('/mini-roulette/bet', async (req) => {
    const body = rouletteBetSchema.parse(req.body);
    return miniService.bet(req.userId, body);
  });
  fastify.post('/carnival/bet', async (req) => {
    const body = rouletteBetSchema.parse(req.body);
    return carnivalService.bet(req.userId, body);
  });
}
