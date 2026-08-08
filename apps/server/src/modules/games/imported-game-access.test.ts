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
  it('recognizes the numbered testplayer account series', () => {
    for (const username of [
      'testplayer',
      'testplayer2',
      'testplayer3',
      'testplayer4',
      'testplayer5',
      'testplayer6',
      'testplayer25',
    ]) {
      expect(isImportedGameTestUsername(username)).toBe(true);
    }

    for (const username of [
      'TestPlayer',
      'testplayer0',
      'testplayer02',
      'testplayer-demo',
      'admin',
      null,
    ]) {
      expect(isImportedGameTestUsername(username)).toBe(false);
    }
  });

  it('keeps every imported test game hidden from guests and regular members', () => {
    for (const gameId of IMPORTED_TEST_GAMES) {
      expect(isGameVisibleForUsername(gameId, 'testplayer')).toBe(true);
      expect(isGameVisibleForUsername(gameId, 'testplayer6')).toBe(true);
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
