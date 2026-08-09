import type { FastifyInstance } from 'fastify';
import {
  getH5GameByCode,
  isH5GameCode,
  isImportedGameTestUsername,
  type H5GameCode,
} from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { HotlineService } from '../hotline/hotline.service.js';
import { h5SlotSpinSchema } from './h5Slots.schema.js';

const H5_BUY_FREE_COST_MULTIPLIERS: Partial<Record<H5GameCode, number>> = {
  '278': 50,
  '321': 50,
};

export function getH5BuyFreeCostMultiplier(gameCode: H5GameCode): number | undefined {
  return H5_BUY_FREE_COST_MULTIPLIERS[gameCode];
}

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
    const game = getH5GameByCode(input.gameCode);
    const buyFeatureCostMultiplier = getH5BuyFreeCostMultiplier(input.gameCode);
    if (input.isBuyFree && !buyFeatureCostMultiplier) {
      throw new ApiError('INVALID_ACTION', '此遊戲沒有購買免費遊戲功能');
    }
    const result = await service.bet(
      request.userId,
      {
        amount: input.amount,
        clientSeed: input.clientSeed,
        ...(input.isBuyFree ? { buyFeature: true } : {}),
      },
      game.gameId,
      input.isBuyFree
        ? {
            buyFeatureCostMultiplier,
            buyFeatureMaxStake: null,
          }
        : undefined,
    );
    return { ...result, gameCode: input.gameCode };
  });

  fastify.get('/history', async (request) => {
    await requireTestUser(request.userId);
    const requestedCode = (request.query as { gameCode?: string }).gameCode;
    if (!requestedCode || !isH5GameCode(requestedCode)) {
      throw new ApiError('INVALID_ACTION', '缺少有效的遊戲代碼');
    }
    const game = getH5GameByCode(requestedCode as H5GameCode);
    const bets = await fastify.prisma.bet.findMany({
      where: { userId: request.userId, gameId: game.gameId },
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
