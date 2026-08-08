import { z } from 'zod';
import { H5_GAME_CODES, MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

export const h5SlotSpinSchema = z.object({
  gameCode: z.enum(H5_GAME_CODES),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
  isBuyFree: z.boolean().optional(),
});

export type H5SlotSpinInput = z.infer<typeof h5SlotSpinSchema>;
