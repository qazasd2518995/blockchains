import { z } from 'zod';
import { BACCARAT_TABLE_GAME_IDS, MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

const baccaratTableGameIds = [...BACCARAT_TABLE_GAME_IDS] as [
  (typeof BACCARAT_TABLE_GAME_IDS)[number],
  ...(typeof BACCARAT_TABLE_GAME_IDS)[number][],
];

export const baccaratBetSchema = z.object({
  gameId: z.enum(baccaratTableGameIds),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  side: z.enum(['player', 'banker', 'tie']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type BaccaratBetInput = z.infer<typeof baccaratBetSchema>;
