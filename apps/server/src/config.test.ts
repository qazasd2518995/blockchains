import { describe, expect, it } from 'vitest';
import { isAllowedOriginForRealm } from './config.js';

describe('platform realm origin isolation', () => {
  it('keeps the legacy API closed to the Qmoney sites', () => {
    expect(isAllowedOriginForRealm('https://bg-web-ny73.onrender.com', 'legacy', [])).toBe(true);
    expect(isAllowedOriginForRealm('https://bg-admin.onrender.com', 'legacy', [])).toBe(true);
    expect(isAllowedOriginForRealm('https://bg-qmoney.onrender.com', 'legacy', [])).toBe(false);
    expect(isAllowedOriginForRealm('https://bg-qmoney-admin.onrender.com', 'legacy', [])).toBe(
      false,
    );
  });

  it('keeps the Qmoney API closed to the legacy sites', () => {
    expect(isAllowedOriginForRealm('https://bg-qmoney.onrender.com', 'qmoney', [])).toBe(true);
    expect(isAllowedOriginForRealm('https://bg-qmoney-admin.onrender.com', 'qmoney', [])).toBe(true);
    expect(isAllowedOriginForRealm('https://bg-web-ny73.onrender.com', 'qmoney', [])).toBe(false);
    expect(isAllowedOriginForRealm('https://bg-admin.onrender.com', 'qmoney', [])).toBe(false);
  });

  it('allows an explicitly configured custom domain only in its configured realm', () => {
    const customOrigin = 'https://play.new-casino.example';
    expect(isAllowedOriginForRealm(customOrigin, 'qmoney', [customOrigin])).toBe(true);
    expect(isAllowedOriginForRealm(customOrigin, 'legacy', [])).toBe(false);
  });
});
