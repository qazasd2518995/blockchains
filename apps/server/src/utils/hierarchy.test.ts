import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { resolvePlatformRootAgentId } from './hierarchy.js';

describe('resolvePlatformRootAgentId', () => {
  it('selects only an active super admin as the platform operation root', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'active-root' }]);
    const db = { agent: { findMany } } as unknown as PrismaClient;

    await expect(resolvePlatformRootAgentId(db, 'authenticated-root')).resolves.toBe(
      'active-root',
    );
    expect(findMany).toHaveBeenCalledWith({
      where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });
  });

  it('falls back to the authenticated admin when no active platform root exists', async () => {
    const db = {
      agent: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    await expect(resolvePlatformRootAgentId(db, 'authenticated-root')).resolves.toBe(
      'authenticated-root',
    );
  });
});
