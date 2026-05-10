import { z } from 'zod';
import { GameId, MIN_BET_AMOUNT } from '@bg/shared';

const slotGameIds = [
  GameId.HOTLINE,
  GameId.FRUIT_SLOT,
  GameId.FORTUNE_SLOT,
  GameId.OCEAN_SLOT,
  GameId.TEMPLE_SLOT,
  GameId.CANDY_SLOT,
  GameId.SAKURA_SLOT,
  GameId.THUNDER_SLOT,
  GameId.DRAGON_MEGA_SLOT,
  GameId.NEBULA_SLOT,
  GameId.JUNGLE_SLOT,
  GameId.VAMPIRE_SLOT,
] as const;

export const hotlineBetSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(100000),
  clientSeed: z.string().min(4).max(64).optional(),
  gameId: z.enum(slotGameIds).optional(),
  buyFeature: z.boolean().optional(),
});

export const hotlineJackpotQuerySchema = z.object({
  gameId: z.enum(slotGameIds),
});

export type HotlineBetInput = z.infer<typeof hotlineBetSchema>;
export type HotlineJackpotQuery = z.infer<typeof hotlineJackpotQuerySchema>;
