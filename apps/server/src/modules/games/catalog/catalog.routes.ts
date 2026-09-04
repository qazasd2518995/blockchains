import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  GameId,
  getNewCasinoGamesForUsername,
  NEW_CASINO_CATALOG_VERSION,
} from '@bg/shared';
import { config } from '../../../config.js';
import { ApiError } from '../../../utils/errors.js';

interface GameCatalogRouteOptions {
  platformRealm?: 'legacy' | 'qmoney';
}

export async function gameCatalogRoutes(
  fastify: FastifyInstance,
  options: GameCatalogRouteOptions = {},
): Promise<void> {
  const platformRealm = options.platformRealm ?? config.PLATFORM_REALM;
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
      games: getNewCasinoGamesForUsername(
        user.username,
        platformRealm === 'qmoney' ? 'all-members' : 'test-accounts',
      ),
    };
  });

  fastify.get('/pending', { preHandler: [fastify.authenticate] }, async (request) => {
    const user = await fastify.prisma.user.findUnique({
      where: { id: request.userId },
      select: { username: true, role: true, disabledAt: true },
    });
    if (!user || user.disabledAt) throw new ApiError('UNAUTHORIZED', 'Authentication required');
    if (user.role !== 'PLAYER') throw new ApiError('FORBIDDEN', 'Only players have game rounds');

    const availableGames = getNewCasinoGamesForUsername(
      user.username,
      platformRealm === 'qmoney' ? 'all-members' : 'test-accounts',
    );
    const availableIds = new Set(availableGames.map((game) => game.id));
    const pending = await fastify.prisma.bet.findMany({
      where: { userId: request.userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        gameId: true,
        amount: true,
        createdAt: true,
        blackjackRound: { select: { tableId: true } },
      },
    });
    const rounds = pending
      .map((bet) => ({ ...bet, catalogGameId: pendingCatalogGameId(bet) }))
      .filter((bet) => availableIds.has(bet.catalogGameId))
      .map((bet) => ({
        betId: bet.id,
        gameId: bet.catalogGameId,
        amount: bet.amount.toFixed(2),
        createdAt: bet.createdAt.toISOString(),
      }));
    const heldAmount = rounds.reduce(
      (total, round) => total.add(round.amount),
      new Prisma.Decimal(0),
    );

    return { count: rounds.length, heldAmount: heldAmount.toFixed(2), rounds };
  });
}

export function pendingCatalogGameId(bet: {
  gameId: string;
  blackjackRound?: { tableId: string } | null;
}): string {
  if (bet.gameId === GameId.BLACKJACK && bet.blackjackRound?.tableId === 'classic') {
    return 'blackjack-table-2';
  }
  return bet.gameId;
}
