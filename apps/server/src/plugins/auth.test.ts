import { describe, expect, it } from 'vitest';
import { isGameplayRequestAllowedForRealm } from './auth.js';

describe('qmoney gameplay access', () => {
  it.each([
    'testplayer',
    'testplayer1',
    'testplayer2',
    'testplayer3',
    'testplayer4',
    'testplayer5',
    'testplayer6',
  ])('allows %s to call qmoney game APIs', (username) => {
    expect(isGameplayRequestAllowedForRealm('/api/games/hotline/bet', username, 'qmoney')).toBe(
      true,
    );
  });

  it('blocks regular qmoney members from direct game API calls', () => {
    expect(
      isGameplayRequestAllowedForRealm('/api/games/hotline/bet', 'regular-member', 'qmoney'),
    ).toBe(false);
    expect(
      isGameplayRequestAllowedForRealm('/api/games/crash/state?gameId=rocket', null, 'qmoney'),
    ).toBe(false);
  });

  it('keeps catalog and non-game account APIs available', () => {
    expect(isGameplayRequestAllowedForRealm('/api/games/catalog', 'regular-member', 'qmoney')).toBe(
      true,
    );
    expect(
      isGameplayRequestAllowedForRealm('/api/wallet/balance', 'regular-member', 'qmoney'),
    ).toBe(true);
  });

  it('does not change legacy gameplay access', () => {
    expect(
      isGameplayRequestAllowedForRealm('/api/games/hotline/bet', 'regular-member', 'legacy'),
    ).toBe(true);
  });
});
