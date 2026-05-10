import { z } from 'zod';
import { MIN_BET_AMOUNT } from '@bg/shared';

export const chickenRoadStartSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(100000),
  difficulty: z.enum(['easy', 'medium', 'hard', 'hardcore']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const chickenRoadStepSchema = z.object({
  roundId: z.string().min(1),
});

export const chickenRoadCashoutSchema = z.object({
  roundId: z.string().min(1),
});

export type ChickenRoadStartInput = z.infer<typeof chickenRoadStartSchema>;
export type ChickenRoadStepInput = z.infer<typeof chickenRoadStepSchema>;
export type ChickenRoadCashoutInput = z.infer<typeof chickenRoadCashoutSchema>;
