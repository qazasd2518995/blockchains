import { z } from 'zod';

export const towerStartSchema = z.object({
  amount: z.number().positive().max(100000),
  difficulty: z.enum(['easy', 'medium', 'hard', 'expert', 'master']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const towerPickSchema = z.object({
  roundId: z.string().min(1),
  col: z.number().int().min(0).max(3),
});

export const towerCashoutSchema = z.object({
  roundId: z.string().min(1),
});

export type TowerStartInput = z.infer<typeof towerStartSchema>;
export type TowerPickInput = z.infer<typeof towerPickSchema>;
export type TowerCashoutInput = z.infer<typeof towerCashoutSchema>;
