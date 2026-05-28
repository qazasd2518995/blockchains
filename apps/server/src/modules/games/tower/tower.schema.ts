import { z } from 'zod';
import { MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';
import { TOWER_CONFIG } from '@bg/provably-fair';

const TOWER_MAX_COL_INDEX = Math.max(...Object.values(TOWER_CONFIG).map((config) => config.cols)) - 1;

export const towerStartSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  difficulty: z.enum(['easy', 'medium', 'hard', 'expert', 'master']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const towerPickSchema = z.object({
  roundId: z.string().min(1),
  level: z.number().int().min(0).max(8).optional(),
  col: z.number().int().min(0).max(TOWER_MAX_COL_INDEX),
});

export const towerCashoutSchema = z.object({
  roundId: z.string().min(1),
});

export type TowerStartInput = z.infer<typeof towerStartSchema>;
export type TowerPickInput = z.infer<typeof towerPickSchema>;
export type TowerCashoutInput = z.infer<typeof towerCashoutSchema>;
