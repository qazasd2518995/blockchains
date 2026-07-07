import { z } from 'zod';
import {
  BLACK_DOT_GAME_IDS,
  GameId,
  LOCAL_TABLE_GAME_IDS,
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  TUI_TONGZI_GAME_IDS,
  TWENTY_ONE_HALF_GAME_IDS,
} from '@bg/shared';

const localTableGameIds = [...LOCAL_TABLE_GAME_IDS] as [
  (typeof LOCAL_TABLE_GAME_IDS)[number],
  ...(typeof LOCAL_TABLE_GAME_IDS)[number][],
];

export const localTableBetSchema = z.object({
  gameId: z.enum(localTableGameIds),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
});

const twentyOneHalfGameIds = [...TWENTY_ONE_HALF_GAME_IDS] as [
  (typeof TWENTY_ONE_HALF_GAME_IDS)[number],
  ...(typeof TWENTY_ONE_HALF_GAME_IDS)[number][],
];

export const twentyOneHalfStartSchema = z.object({
  gameId: z.enum(twentyOneHalfGameIds),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const twentyOneHalfActionSchema = z.object({
  roundId: z.string().min(1),
});

export const twentyOneHalfActiveQuerySchema = z.object({
  gameId: z.enum(twentyOneHalfGameIds).optional(),
});

const stagedTableGameIds = [
  ...TUI_TONGZI_GAME_IDS,
  ...BLACK_DOT_GAME_IDS,
  GameId.CARD_WAR,
] as [
  (typeof TUI_TONGZI_GAME_IDS)[number],
  ...Array<
    | (typeof TUI_TONGZI_GAME_IDS)[number]
    | (typeof BLACK_DOT_GAME_IDS)[number]
    | typeof GameId.CARD_WAR
  >,
];

export const stagedTableStartSchema = z.object({
  gameId: z.enum(stagedTableGameIds),
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const stagedTableActionSchema = z.object({
  roundId: z.string().min(1),
  revealIndex: z.number().int().min(0).max(1).optional(),
});

export const stagedTableSplitSchema = z.object({
  roundId: z.string().min(1),
  splitId: z.string().min(3).max(16),
});

export const stagedTableActiveQuerySchema = z.object({
  gameId: z.enum(stagedTableGameIds).optional(),
});

export type LocalTableBetInput = z.infer<typeof localTableBetSchema>;
export type TwentyOneHalfStartInput = z.infer<typeof twentyOneHalfStartSchema>;
export type TwentyOneHalfActionInput = z.infer<typeof twentyOneHalfActionSchema>;
export type TwentyOneHalfActiveQuery = z.infer<typeof twentyOneHalfActiveQuerySchema>;
export type StagedTableStartInput = z.infer<typeof stagedTableStartSchema>;
export type StagedTableActionInput = z.infer<typeof stagedTableActionSchema>;
export type StagedTableSplitInput = z.infer<typeof stagedTableSplitSchema>;
export type StagedTableActiveQuery = z.infer<typeof stagedTableActiveQuerySchema>;
