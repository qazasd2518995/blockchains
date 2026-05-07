import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { ApiError } from '../../utils/errors.js';

describe('AuthService.refresh', () => {
  it('rejects replayed refresh tokens after atomic revoke fails', async () => {
    const tx = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'rt1',
          userId: 'u1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
      user: {
        findUniqueOrThrow: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn) => fn(tx)),
    };
    const service = new AuthService(prisma as never, { sign: vi.fn(() => 'access') });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<ApiError>);
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('issues new tokens only after the old refresh token is revoked once', async () => {
    const tx = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'rt1',
          userId: 'u1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'rt2' }),
      },
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'u1',
          role: 'PLAYER',
          disabledAt: null,
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn) => fn(tx)),
    };
    const signer = { sign: vi.fn(() => 'access') };
    const service = new AuthService(prisma as never, signer);

    const result = await service.refresh('refresh-token');

    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).toHaveLength(96);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rt1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledOnce();
  });
});
