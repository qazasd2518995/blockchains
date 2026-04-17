import { z } from 'zod';
import { MINES_MIN_COUNT, MINES_MAX_COUNT, MINES_GRID_SIZE } from '@bg/provably-fair';

export const minesStartSchema = z.object({
  amount: z.number().positive().max(100000),
  mineCount: z.number().int().min(MINES_MIN_COUNT).max(MINES_MAX_COUNT),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const minesRevealSchema = z.object({
  roundId: z.string().min(1),
  cellIndex: z.number().int().min(0).max(MINES_GRID_SIZE - 1),
});

export const minesCashoutSchema = z.object({
  roundId: z.string().min(1),
});

export type MinesStartInput = z.infer<typeof minesStartSchema>;
export type MinesRevealInput = z.infer<typeof minesRevealSchema>;
export type MinesCashoutInput = z.infer<typeof minesCashoutSchema>;
