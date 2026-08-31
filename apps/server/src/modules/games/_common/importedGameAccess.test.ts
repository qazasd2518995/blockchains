import { afterEach, describe, expect, it } from 'vitest';
import { isImportedGameAccessUsername } from './importedGameAccess.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalPrefix = process.env.CONTROL_API_FIXTURE_PREFIX;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalPrefix === undefined) delete process.env.CONTROL_API_FIXTURE_PREFIX;
  else process.env.CONTROL_API_FIXTURE_PREFIX = originalPrefix;
});

describe('isImportedGameAccessUsername', () => {
  it('always accepts the explicit imported-game test accounts', () => {
    process.env.NODE_ENV = 'production';
    expect(isImportedGameAccessUsername('testplayer6')).toBe(true);
  });

  it('accepts only the configured matrix fixture prefix outside production', () => {
    process.env.NODE_ENV = 'test';
    process.env.CONTROL_API_FIXTURE_PREFIX = 'ctrl_api_123';

    expect(isImportedGameAccessUsername('ctrl_api_123_member')).toBe(true);
    expect(isImportedGameAccessUsername('ctrl_api_124_member')).toBe(false);
    expect(isImportedGameAccessUsername('regular-member')).toBe(false);
  });

  it('ignores the matrix fixture prefix in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.CONTROL_API_FIXTURE_PREFIX = 'ctrl_api_123';

    expect(isImportedGameAccessUsername('ctrl_api_123_member')).toBe(false);
  });
});
