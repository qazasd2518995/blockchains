import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../utils/errors.js';
import { assertLocalTableBetaAccess } from './table-games.routes.js';

describe('local table route access gate', () => {
  it('allows the beta account to use local table APIs', async () => {
    const store = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ username: 'testplayer' }),
      },
    };

    await expect(assertLocalTableBetaAccess(store, 'u-test')).resolves.toBeUndefined();
    expect(store.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u-test' },
      select: { username: true },
    });
  });

  it('allows additional test player accounts to use local table APIs', async () => {
    const store = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ username: 'testplayer4' }),
      },
    };

    await expect(assertLocalTableBetaAccess(store, 'u-test-4')).resolves.toBeUndefined();
  });

  it('blocks every other member from local table APIs', async () => {
    const store = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ username: 'normalplayer' }),
      },
    };

    await expect(assertLocalTableBetaAccess(store, 'u-normal')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<ApiError>);
  });
});
