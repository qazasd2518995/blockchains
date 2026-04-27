import { z } from 'zod';
import { GameId } from '@bg/shared';

const slotGameIds = [
  GameId.HOTLINE,
  GameId.FRUIT_SLOT,
  GameId.FORTUNE_SLOT,
  GameId.OCEAN_SLOT,
  GameId.TEMPLE_SLOT,
  GameId.CANDY_SLOT,
  GameId.SAKURA_SLOT,
] as const;

export const hotlineBetSchema = z.object({
  amount: z.number().positive().max(100000),
  clientSeed: z.string().min(4).max(64).optional(),
  gameId: z.enum(slotGameIds).optional(),
});

export type HotlineBetInput = z.infer<typeof hotlineBetSchema>;
