import type { FastifyInstance } from 'fastify';
import { GameId, isImportedGameTestUsername } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { HotlineService } from '../hotline/hotline.service.js';
import { h5SlotSpinSchema } from './h5Slots.schema.js';

export async function h5SlotsRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new HotlineService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  async function requireTestUser(userId: string) {
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        balance: true,
        frozenAt: true,
        disabledAt: true,
      },
    });
    if (!user) throw new ApiError('UNAUTHORIZED', 'Authentication required');
    if (!isImportedGameTestUsername(user.username)) {
      throw new ApiError('FORBIDDEN', '此遊戲目前僅開放指定測試帳號');
    }
    if (user.frozenAt || user.disabledAt) {
      throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
    }
    return user;
  }

  fastify.get('/session', async (request) => {
    const user = await requireTestUser(request.userId);
    return {
      code: 1,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.displayName ?? user.username,
        balance: Number(user.balance.toFixed(2)),
      },
    };
  });

  fastify.post('/spin', async (request) => {
    await requireTestUser(request.userId);
    const input = h5SlotSpinSchema.parse(request.body);
    if (input.isBuyFree) {
      throw new ApiError('INVALID_ACTION', '此測試版本尚未開放購買免費遊戲');
    }
    const result = await service.bet(
      request.userId,
      {
        amount: input.amount,
        clientSeed: input.clientSeed,
      },
      GameId.H5_SLOT_COLLECTION,
    );
    return { ...result, gameCode: input.gameCode };
  });

  fastify.get('/history', async (request) => {
    await requireTestUser(request.userId);
    const bets = await fastify.prisma.bet.findMany({
      where: { userId: request.userId, gameId: GameId.H5_SLOT_COLLECTION },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, amount: true, payout: true, createdAt: true },
    });
    return {
      ResultCode: 1,
      Result: bets.map((bet) => ({
        id: bet.id,
        lotteryTime: bet.createdAt.getTime(),
        score_linescore: Number(bet.amount.toFixed(2)),
        score_win: Number(bet.payout.toFixed(2)),
      })),
    };
  });
}
