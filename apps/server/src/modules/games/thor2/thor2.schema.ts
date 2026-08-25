import { z } from 'zod';
import { MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

export const thor2SpinSchema = z.object({
  action: z.enum(['spin', 'extra', 'regular', 'super', 'lucky']),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  operationId: z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const thor2FeatureProgressSchema = z.object({
  betId: z.string().min(1).max(128),
  cursor: z.number().int().min(0).max(100),
});

export const thor2FeatureCompleteSchema = z.object({
  betId: z.string().min(1).max(128),
});

export type Thor2SpinInput = z.infer<typeof thor2SpinSchema>;
