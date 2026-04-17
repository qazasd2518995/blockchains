import { z } from 'zod';

export const wheelBetSchema = z.object({
  amount: z.number().positive().max(100000),
  risk: z.enum(['low', 'medium', 'high']),
  segments: z.union([
    z.literal(10),
    z.literal(20),
    z.literal(30),
    z.literal(40),
    z.literal(50),
  ]),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type WheelBetInput = z.infer<typeof wheelBetSchema>;
