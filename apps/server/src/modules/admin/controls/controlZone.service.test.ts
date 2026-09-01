import { describe, expect, it } from 'vitest';
import { resolveControlAccessContext } from './controlZone.service.js';

describe('resolveControlAccessContext', () => {
  it('keeps platform super admins as central control managers', () => {
    expect(
      resolveControlAccessContext({
        id: 'root',
        role: 'SUPER_ADMIN',
        canManageControlZone: false,
      }),
    ).toEqual({ allowed: true, role: 'central', zoneRootAgentId: null });
  });

  it('grants only the exact delegated agent account its control zone', () => {
    expect(
      resolveControlAccessContext({
        id: 'delegated-root',
        role: 'AGENT',
        canManageControlZone: true,
      }),
    ).toEqual({
      allowed: true,
      role: 'delegated',
      zoneRootAgentId: 'delegated-root',
    });
  });

  it('does not inherit control access to a downline agent', () => {
    expect(
      resolveControlAccessContext({
        id: 'downline-agent',
        role: 'AGENT',
        canManageControlZone: false,
      }),
    ).toEqual({ allowed: false, role: 'none', zoneRootAgentId: null });
  });

  it('never grants a sub-account control access even if its flag is malformed', () => {
    expect(
      resolveControlAccessContext({
        id: 'sub-account',
        role: 'SUB_ACCOUNT',
        canManageControlZone: true,
      }),
    ).toEqual({ allowed: false, role: 'none', zoneRootAgentId: null });
  });
});
