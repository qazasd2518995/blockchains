import { z } from 'zod';
import { H5_GAME_CODES, MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

export const h5SlotSpinSchema = z.object({
  gameCode: z.enum(H5_GAME_CODES),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
  isBuyFree: z.boolean().optional(),
  isEnhancedBet: z.boolean().optional(),
});

export const h5FishSkillSchema = z.object({
  gameCode: z.enum(H5_GAME_CODES),
  skillId: z.literal(1),
});

export const h5BountyFreeModeSchema = z.object({
  gameCode: z.union([z.literal('281'), z.literal('232')]),
  betId: z.string().min(1).max(128),
  type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const h5CaishenFreeDecisionSchema = z.object({
  gameCode: z.literal('278'),
  betId: z.string().min(1).max(128),
});

export const h5FeatureCompleteSchema = z.object({
  gameCode: z.union([z.literal('278'), z.literal('321')]),
  betId: z.string().min(1).max(128),
});

export const h5CaishenFreeGambleSchema = h5CaishenFreeDecisionSchema.extend({
  type: z.union([z.literal(0), z.literal(1)]),
});

export type H5SlotSpinInput = z.infer<typeof h5SlotSpinSchema>;
export type H5FishSkillInput = z.infer<typeof h5FishSkillSchema>;
export type H5BountyFreeModeInput = z.infer<typeof h5BountyFreeModeSchema>;
export type H5CaishenFreeDecisionInput = z.infer<typeof h5CaishenFreeDecisionSchema>;
export type H5CaishenFreeGambleInput = z.infer<typeof h5CaishenFreeGambleSchema>;
export type H5FeatureCompleteInput = z.infer<typeof h5FeatureCompleteSchema>;
