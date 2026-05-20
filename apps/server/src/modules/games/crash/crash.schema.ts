import { z } from 'zod';
import { GameId, MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

export const crashGameIdSchema = z.enum([
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.SPACE_FLEET,
  GameId.JETX,
  GameId.BALLOON,
  GameId.JETX3,
  GameId.DOUBLE_X,
]);

export const crashBetSchema = z.object({
  gameId: crashGameIdSchema,
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const crashRoundParamsSchema = z.object({
  roundId: z.string().min(1),
});

export const crashHistoryQuerySchema = z.object({
  gameId: crashGameIdSchema,
});

export type CrashBetInput = z.infer<typeof crashBetSchema>;
export type CrashHistoryQuery = z.infer<typeof crashHistoryQuerySchema>;
