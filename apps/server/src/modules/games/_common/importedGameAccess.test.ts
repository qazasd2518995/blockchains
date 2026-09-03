import { describe, expect, it } from 'vitest';
import { isImportedGameAccessUsername } from './importedGameAccess.js';

describe('isImportedGameAccessUsername', () => {
  it('accepts every authenticated member username in the Jin Baobao realm', () => {
    expect(isImportedGameAccessUsername('testplayer6', 'qmoney')).toBe(true);
    expect(isImportedGameAccessUsername('regular-member', 'qmoney')).toBe(true);
    expect(isImportedGameAccessUsername(' 自創會員 ', 'qmoney')).toBe(true);
  });

  it('keeps the legacy realm on its existing test-account allowlist', () => {
    expect(isImportedGameAccessUsername('testplayer6', 'legacy')).toBe(true);
    expect(isImportedGameAccessUsername('regular-member', 'legacy')).toBe(false);
  });

  it('rejects a missing or blank authenticated identity', () => {
    expect(isImportedGameAccessUsername(null, 'qmoney')).toBe(false);
    expect(isImportedGameAccessUsername(undefined, 'qmoney')).toBe(false);
    expect(isImportedGameAccessUsername('', 'qmoney')).toBe(false);
    expect(isImportedGameAccessUsername('   ', 'qmoney')).toBe(false);
  });
});
