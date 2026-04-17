import { z } from 'zod';

export const hotlineBetSchema = z.object({
  amount: z.number().positive().max(100000),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type HotlineBetInput = z.infer<typeof hotlineBetSchema>;
