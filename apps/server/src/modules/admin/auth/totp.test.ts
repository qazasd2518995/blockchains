import { describe, expect, it } from 'vitest';
import { totpIssuerForRealm } from './totp.js';

describe('admin TOTP realm branding', () => {
  it('uses the Jin Baobao issuer for the isolated Qmoney realm', () => {
    expect(totpIssuerForRealm('qmoney')).toBe('金寶寶管理後台');
  });

  it('preserves the legacy issuer for the legacy realm', () => {
    expect(totpIssuerForRealm('legacy')).toBe('八千代代理後台');
  });
});
