import { describe, expect, it } from 'vitest';
import {
  GameId,
  isGameVisibleForUsername,
  isImportedGameTestUsername,
} from '@bg/shared';
import { hotlineBetSchema } from './hotline/hotline.schema.js';

const IMPORTED_TEST_GAMES = [
  GameId.STORM_OF_SETH_2,
  GameId.FRUIT_MARY,
  GameId.H5_SLOT_COLLECTION,
] as const;

describe('imported test-game access', () => {
  it('recognizes only the exact testplayer account', () => {
    expect(isImportedGameTestUsername('testplayer')).toBe(true);
    expect(isImportedGameTestUsername('TestPlayer')).toBe(false);
    expect(isImportedGameTestUsername('admin')).toBe(false);
    expect(isImportedGameTestUsername(null)).toBe(false);
  });

  it('keeps every imported test game hidden from guests and regular members', () => {
    for (const gameId of IMPORTED_TEST_GAMES) {
      expect(isGameVisibleForUsername(gameId, 'testplayer')).toBe(true);
      expect(isGameVisibleForUsername(gameId, 'admin')).toBe(false);
      expect(isGameVisibleForUsername(gameId, null)).toBe(false);
    }
  });

  it('does not allow the H5 collection through the public Hotline bet schema', () => {
    expect(
      hotlineBetSchema.safeParse({
        amount: 10,
        gameId: GameId.H5_SLOT_COLLECTION,
      }).success,
    ).toBe(false);
  });
});
