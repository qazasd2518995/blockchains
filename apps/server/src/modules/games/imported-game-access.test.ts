import { describe, expect, it } from 'vitest';
import {
  GameId,
  H5_GAME_IDS,
  isGameVisibleForUsername,
  isImportedGameTestUsername,
} from '@bg/shared';
import { hotlineBetSchema } from './hotline/hotline.schema.js';

const IMPORTED_GAMES = [
  GameId.STORM_OF_SETH_2,
  GameId.POWER_OF_THOR_2,
  GameId.FRUIT_MARY,
  GameId.H5_SLOT_COLLECTION,
  ...H5_GAME_IDS,
] as const;

describe('imported game access', () => {
  it('recognizes the numbered testplayer account series', () => {
    for (const username of [
      'testplayer',
      'testplayer1',
      'testplayer2',
      'testplayer3',
      'testplayer4',
      'testplayer5',
      'testplayer6',
      ' TestPlayer3 ',
      'ＴＥＳＴＰＬＡＹＥＲ４',
    ]) {
      expect(isImportedGameTestUsername(username)).toBe(true);
    }

    for (const username of [
      'testplayer0',
      'testplayer02',
      'testplayer7',
      'testplayer25',
      'testplayer-demo',
      'admin',
      null,
    ]) {
      expect(isImportedGameTestUsername(username)).toBe(false);
    }
  });

  it('keeps shared imported-game visibility unchanged for the legacy lobby', () => {
    for (const gameId of IMPORTED_GAMES) {
      expect(isGameVisibleForUsername(gameId, 'testplayer')).toBe(true);
      expect(isGameVisibleForUsername(gameId, 'testplayer6')).toBe(true);
      expect(isGameVisibleForUsername(gameId, 'custom-member')).toBe(false);
      expect(isGameVisibleForUsername(gameId, ' 自創會員 ')).toBe(false);
      expect(isGameVisibleForUsername(gameId, null)).toBe(false);
    }
  });

  it('does not allow H5 games through the public Hotline bet schema', () => {
    for (const gameId of [GameId.H5_SLOT_COLLECTION, ...H5_GAME_IDS]) {
      expect(
        hotlineBetSchema.safeParse({
          amount: 10,
          gameId,
        }).success,
      ).toBe(false);
    }
  });
});
