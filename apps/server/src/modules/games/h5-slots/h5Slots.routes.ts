import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  getH5GameByCode,
  isH5GameCode,
  isImportedGameTestUsername,
  type H5GameCode,
} from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import {
  debitAndRecord,
  lockUserAndCheckFunds,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import { HotlineService } from '../hotline/hotline.service.js';
import {
  h5BountyFreeModeSchema,
  h5CaishenFreeDecisionSchema,
  h5CaishenFreeGambleSchema,
  h5FeatureCompleteSchema,
  h5FishSkillSchema,
  h5SlotSpinSchema,
} from './h5Slots.schema.js';

const H5_BUY_FREE_COST_MULTIPLIERS: Partial<Record<H5GameCode, number>> = {
  '278': 50,
  // gatesofolympushbMain renders the confirmation amount as 75 * betSum.
  '321': 75,
};

const H5_ENHANCED_BET_MULTIPLIERS: Partial<Record<H5GameCode, number>> = {
  '302': 1.5,
};

const H5_FISH_FREEZE_SKILL_COSTS: Partial<Record<H5GameCode, number>> = {
  '2': 100,
  '12': 100,
  '13': 100,
  '14': 100,
};

export const H5_FISH_FREEZE_DURATION_MS = 5_000;

export function getH5BuyFreeCostMultiplier(gameCode: H5GameCode): number | undefined {
  return H5_BUY_FREE_COST_MULTIPLIERS[gameCode];
}

export function getH5EnhancedBetMultiplier(gameCode: H5GameCode): number | undefined {
  return H5_ENHANCED_BET_MULTIPLIERS[gameCode];
}

export function getH5FishFreezeSkillCost(gameCode: H5GameCode): number | undefined {
  return H5_FISH_FREEZE_SKILL_COSTS[gameCode];
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
    const requestedCode = (request.query as { gameCode?: string }).gameCode;
    const requestedGame =
      requestedCode && isH5GameCode(requestedCode) ? getH5GameByCode(requestedCode) : undefined;
    const pendingFreeMode = requestedGame
      ? await service.getPendingSourceFreeMode(request.userId, requestedGame.gameId)
      : null;
    const pendingCaishenFree =
      requestedCode === '278' ? await service.getPendingCaishenFreeDecision(request.userId) : null;
    const pendingFeature = requestedGame
      ? await service.getPendingDeferredFeature(request.userId, requestedGame.gameId)
      : null;
    const jackpot =
      requestedCode === '113' || requestedCode === '160'
        ? await service.jackpot(getH5GameByCode(requestedCode).gameId)
        : undefined;
    return {
      code: 1,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.displayName ?? user.username,
        balance: Number(user.balance.toFixed(2)),
      },
      ...(pendingFreeMode ? { pendingFreeMode } : {}),
      ...(pendingCaishenFree ? { pendingCaishenFree } : {}),
      ...(pendingFeature ? { pendingFeature } : {}),
      ...(jackpot ? { jackpot } : {}),
    };
  });

  fastify.post('/spin', async (request) => {
    await requireTestUser(request.userId);
    const input = h5SlotSpinSchema.parse(request.body);
    const game = getH5GameByCode(input.gameCode);
    const buyFeatureCostMultiplier = getH5BuyFreeCostMultiplier(input.gameCode);
    const enhancedBetMultiplier = getH5EnhancedBetMultiplier(input.gameCode);
    if (input.isBuyFree && !buyFeatureCostMultiplier) {
      throw new ApiError('INVALID_ACTION', '此遊戲沒有購買免費遊戲功能');
    }
    if (input.isEnhancedBet && !enhancedBetMultiplier) {
      throw new ApiError('INVALID_ACTION', '此遊戲沒有額外投注功能');
    }
    if (input.isBuyFree && input.isEnhancedBet) {
      throw new ApiError('INVALID_ACTION', '不能同時購買免費遊戲與啟用額外投注');
    }
    const result = await service.bet(
      request.userId,
      {
        amount: input.amount,
        clientSeed: input.clientSeed,
        ...(input.isBuyFree ? { buyFeature: true } : {}),
      },
      game.gameId,
      {
        ...(input.isBuyFree
          ? {
              buyFeatureCostMultiplier,
              buyFeatureMaxStake: null,
            }
          : input.isEnhancedBet
            ? {
                stakeMultiplier: enhancedBetMultiplier,
                sourceFeatureMode: 'fortune-gems-extra-bet' as const,
              }
            : {}),
        ...(input.gameCode === '281' || input.gameCode === '232'
          ? { deferSourceFreeModeSelection: true }
          : {}),
        ...(input.gameCode === '278' ? { deferCaishenFreeDecision: true } : {}),
      },
    );
    return { ...result, gameCode: input.gameCode };
  });

  fastify.post('/select-free-mode', async (request) => {
    await requireTestUser(request.userId);
    const input = h5BountyFreeModeSchema.parse(request.body);
    const result = await service.selectSourceFreeMode(
      request.userId,
      getH5GameByCode(input.gameCode).gameId,
      input.betId,
      input.type,
    );
    return { ...result, gameCode: input.gameCode };
  });

  fastify.post('/caishen/gamble-free', async (request) => {
    await requireTestUser(request.userId);
    const input = h5CaishenFreeGambleSchema.parse(request.body);
    return service.gambleCaishenFree(request.userId, input.betId, input.type);
  });

  fastify.post('/caishen/collect-free', async (request) => {
    await requireTestUser(request.userId);
    const input = h5CaishenFreeDecisionSchema.parse(request.body);
    const result = await service.collectCaishenFree(request.userId, input.betId);
    return { ...result, gameCode: input.gameCode };
  });

  fastify.post('/complete-feature', async (request) => {
    await requireTestUser(request.userId);
    const input = h5FeatureCompleteSchema.parse(request.body);
    const game = getH5GameByCode(input.gameCode);
    const newBalance = await service.completeDeferredFeature(
      request.userId,
      game.gameId,
      input.betId,
    );
    return { gameCode: input.gameCode, betId: input.betId, newBalance };
  });

  fastify.post('/fish/skill', async (request) => {
    const user = await requireTestUser(request.userId);
    const input = h5FishSkillSchema.parse(request.body);
    const skillCost = getH5FishFreezeSkillCost(input.gameCode);
    if (skillCost === undefined) {
      throw new ApiError('INVALID_ACTION', '此遊戲沒有捕魚冰凍技能');
    }
    const game = getH5GameByCode(input.gameCode);
    const cost = new Prisma.Decimal(skillCost);
    const balance = await runLockedTransaction(fastify.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, request.userId, cost, game.gameId, {
        limitAmounts: [cost],
      });
      return debitAndRecord(tx, request.userId, cost, null, {
        gameId: game.gameId,
        kind: 'fish-freeze-skill',
        skillId: input.skillId,
      });
    });
    return {
      ResultCode: 1,
      userId: user.id,
      skillId: input.skillId,
      cost: skillCost,
      durationMs: H5_FISH_FREEZE_DURATION_MS,
      balance: Number(balance.toFixed(2)),
    };
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
