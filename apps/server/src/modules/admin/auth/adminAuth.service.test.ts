import { describe, expect, it, vi } from 'vitest';
import { AdminAuthService } from './adminAuth.service.js';
import { ApiError } from '../../../utils/errors.js';

describe('AdminAuthService.refresh', () => {
  it('rejects replayed refresh tokens after atomic revoke fails', async () => {
    const tx = {
      agentRefreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'rt1',
          agentId: 'a1',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(),
      },
      agent: {
        findUniqueOrThrow: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn) => fn(tx)),
    };
    const service = new AdminAuthService(prisma as never, { sign: vi.fn(() => 'access') });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    } satisfies Partial<ApiError>);
    expect(tx.agentRefreshToken.create).not.toHaveBeenCalled();
  });
});
