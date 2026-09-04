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
    const [pendingBets, activeMines, activeHiLo, activeTower, activeBlackjack] =
      await Promise.all([
        fastify.prisma.bet.findMany({
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
        }),
        fastify.prisma.minesRound.findMany({
          where: { userId: request.userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, betAmount: true, createdAt: true, bet: { select: { status: true } } },
        }),
        fastify.prisma.hiLoRound.findMany({
          where: { userId: request.userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, betAmount: true, createdAt: true, bet: { select: { status: true } } },
        }),
        fastify.prisma.towerRound.findMany({
          where: { userId: request.userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, betAmount: true, createdAt: true, bet: { select: { status: true } } },
        }),
        fastify.prisma.blackjackRound.findMany({
          where: { userId: request.userId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            tableId: true,
            totalBetAmount: true,
            createdAt: true,
            bet: { select: { status: true } },
          },
        }),
      ]);
    const activeRound = (
      round: {
        id: string;
        createdAt: Date;
        bet?: { status: string } | null;
      },
      gameId: string,
      amount: Prisma.Decimal,
    ) =>
      round.bet?.status === 'PENDING'
        ? []
        : [{ roundId: round.id, betId: null, gameId, amount, createdAt: round.createdAt }];
    const rounds = [
      ...pendingBets.map((bet) => ({
        roundId: null,
        betId: bet.id,
        gameId: pendingCatalogGameId(bet),
        amount: bet.amount,
        createdAt: bet.createdAt,
      })),
      ...activeMines.flatMap((round) => activeRound(round, GameId.MINES, round.betAmount)),
      ...activeHiLo.flatMap((round) => activeRound(round, GameId.HILO, round.betAmount)),
      ...activeTower.flatMap((round) => activeRound(round, GameId.TOWER, round.betAmount)),
      ...activeBlackjack.flatMap((round) =>
        activeRound(
          round,
          blackjackCatalogGameId(round.tableId),
          round.totalBetAmount,
        ),
      ),
    ]
      .filter((round) => availableIds.has(round.gameId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50)
      .map((round) => ({
        roundId: round.roundId,
        betId: round.betId,
        gameId: round.gameId,
        amount: round.amount.toFixed(2),
        createdAt: round.createdAt.toISOString(),
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
    return blackjackCatalogGameId('classic');
  }
  return bet.gameId;
}

export function blackjackCatalogGameId(tableId: string): string {
  return tableId === 'classic' ? 'blackjack-table-2' : GameId.BLACKJACK;
}
