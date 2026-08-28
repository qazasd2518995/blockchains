import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  provisionQmoneyControlExcludedLine,
  QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME,
  QMONEY_TEST_PLAYER_USERNAMES,
} from './qmoney-agent-hierarchy.js';

describe('provisionQmoneyControlExcludedLine', () => {
  it('creates an active root exception line and assigns all Jin Baobao test players', async () => {
    const root = {
      id: 'qmoney-root',
      username: 'jinbaobao_root',
      passwordHash: 'root-hash',
      displayName: '金寶寶總代理',
      parentId: null,
      level: 0,
      marketType: 'D',
      balance: new Prisma.Decimal(0),
      commissionBalance: new Prisma.Decimal(0),
      commissionRate: new Prisma.Decimal(0),
      rebateMode: 'PERCENTAGE',
      rebatePercentage: new Prisma.Decimal('0.025'),
      maxRebatePercentage: new Prisma.Decimal('0.025'),
      baccaratRebateMode: 'PERCENTAGE',
      baccaratRebatePercentage: new Prisma.Decimal('0.010'),
      maxBaccaratRebatePercentage: new Prisma.Decimal('0.010'),
      bettingLimitLevel: 'range_10_5000',
      bettingLimits: { seth2: ['range_10_5000'] },
      excludeFromControlSettlement: false,
      status: 'ACTIVE',
      role: 'SUPER_ADMIN',
      notes: null,
      lastLoginAt: null,
      activeSessionId: null,
      activeSessionAt: null,
      twoFactorRequired: false,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorLastUsedStep: null,
      twoFactorLastUsedAt: null,
      createdAt: new Date('2026-08-29T00:00:00Z'),
      updatedAt: new Date('2026-08-29T00:00:00Z'),
    } as const;
    const findUnique = vi.fn().mockResolvedValueOnce(root).mockResolvedValueOnce(null);
    const upsert = vi.fn().mockResolvedValue({
      id: 'qmoney-exception',
      username: QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME,
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 6 });
    const tx = {
      agent: { findUnique, upsert },
      user: { updateMany },
    } as unknown as Prisma.TransactionClient;

    const result = await provisionQmoneyControlExcludedLine(tx, {
      superAdminId: root.id,
      createPasswordHash: 'exception-hash',
      assignTestPlayers: true,
    });

    expect(result.id).toBe('qmoney-exception');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME },
        create: expect.objectContaining({
          parentId: root.id,
          role: 'AGENT',
          status: 'ACTIVE',
          excludeFromControlSettlement: true,
        }),
        update: expect.objectContaining({
          parentId: root.id,
          role: 'AGENT',
          status: 'ACTIVE',
          excludeFromControlSettlement: true,
        }),
      }),
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { username: { in: [...QMONEY_TEST_PLAYER_USERNAMES] } },
      data: { agentId: 'qmoney-exception' },
    });
  });

  it('refuses to provision below a non-super-admin root', async () => {
    const tx = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ordinary-agent',
          role: 'AGENT',
          status: 'ACTIVE',
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      provisionQmoneyControlExcludedLine(tx, {
        superAdminId: 'ordinary-agent',
        createPasswordHash: 'unused',
      }),
    ).rejects.toThrow('Active Jin Baobao super admin is required');
  });
});
