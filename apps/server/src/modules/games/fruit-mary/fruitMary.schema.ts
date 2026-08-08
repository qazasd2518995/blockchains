import { z } from 'zod';
import { FRUIT_MARY_BET_IDS, FRUIT_MARY_MAX_UNITS_PER_FRUIT } from '@bg/shared';

const fruitIdSchema = z.coerce
  .number()
  .int()
  .refine((value) => FRUIT_MARY_BET_IDS.includes(value as (typeof FRUIT_MARY_BET_IDS)[number]), {
    message: 'Unknown fruit bet id',
  });

export const fruitMarySpinSchema = z.object({
  fruits: z
    .array(
      z.tuple([
        fruitIdSchema,
        z.coerce.number().int().min(1).max(FRUIT_MARY_MAX_UNITS_PER_FRUIT),
      ]),
    )
    .min(1)
    .max(FRUIT_MARY_BET_IDS.length),
  money: z.coerce.number().int().positive(),
  uid: z.union([z.string(), z.number()]).optional(),
});

export const fruitMaryGambleSchema = z.object({
  balance: z.coerce.number().positive(),
  size: z.coerce.number().int().min(1).max(2),
  uid: z.union([z.string(), z.number()]).optional(),
});

export const fruitMaryHistorySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  length: z.coerce.number().int().min(1).max(100).default(10),
});

export type FruitMarySpinInput = z.infer<typeof fruitMarySpinSchema>;
export type FruitMaryGambleInput = z.infer<typeof fruitMaryGambleSchema>;
export type FruitMaryHistoryInput = z.infer<typeof fruitMaryHistorySchema>;
