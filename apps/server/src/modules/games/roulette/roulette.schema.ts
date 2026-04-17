import { z } from 'zod';

export const rouletteBetSchema = z.object({
  bets: z
    .array(
      z.object({
        type: z.enum([
          'straight',
          'red',
          'black',
          'odd',
          'even',
          'low',
          'high',
          'column',
        ]),
        value: z.number().int().min(0).max(12).optional(),
        amount: z.number().positive().max(100000),
      }),
    )
    .min(1)
    .max(10),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type RouletteBetInput = z.infer<typeof rouletteBetSchema>;
