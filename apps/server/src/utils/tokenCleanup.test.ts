import { describe, expect, it, vi } from 'vitest';
import { cleanupExpiredAuthTokens } from './tokenCleanup.js';

describe('cleanupExpiredAuthTokens', () => {
  it('removes only tokens older than the supplied cutoff', async () => {
    const now = new Date('2026-09-04T00:00:00.000Z');
    const prisma = {
      refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 35 }) },
      agentRefreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 10 }) },
    };

    await expect(cleanupExpiredAuthTokens(prisma as never, now)).resolves.toEqual({
      memberTokens: 35,
      adminTokens: 10,
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
    expect(prisma.agentRefreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: now } },
    });
  });
});
