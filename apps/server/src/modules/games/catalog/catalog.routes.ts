import type { FastifyInstance } from 'fastify';
import {
  getNewCasinoGamesForUsername,
  NEW_CASINO_CATALOG_VERSION,
} from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';

export async function gameCatalogRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        username: true,
        role: true,
        disabledAt: true,
      },
    });

    if (!user || user.disabledAt) {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }
    if (user.role !== 'PLAYER') {
      throw new ApiError('FORBIDDEN', 'Only player accounts can enter games');
    }

    return {
      version: NEW_CASINO_CATALOG_VERSION,
      games: getNewCasinoGamesForUsername(user.username),
    };
  });
}
