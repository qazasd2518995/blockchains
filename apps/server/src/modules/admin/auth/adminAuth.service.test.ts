import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcrypt';
import { AdminAuthService } from './adminAuth.service.js';
import { ApiError } from '../../../utils/errors.js';

describe('AdminAuthService.refresh', () => {
  it('rejects replayed refresh tokens after atomic revoke fails', async () => {
    const tx = {
      agentRefreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'rt1',
          agentId: 'a1',
          sessionId: 's1',
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

  it('rejects refresh tokens from a replaced device session', async () => {
    const tx = {
      agentRefreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'rt1',
          agentId: 'a1',
          sessionId: 'old-session',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(),
      },
      agent: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'a1',
          username: 'agent',
          role: 'AGENT',
          level: 1,
          status: 'ACTIVE',
          activeSessionId: 'new-session',
        }),
      },
    };
    const prisma = {
      $transaction: vi.fn((fn) => fn(tx)),
    };
    const service = new AdminAuthService(prisma as never, { sign: vi.fn(() => 'access') });

    await expect(service.refresh('refresh-token')).rejects.toMatchObject({
      code: 'SESSION_REPLACED',
    } satisfies Partial<ApiError>);
    expect(tx.agentRefreshToken.create).not.toHaveBeenCalled();
  });
});

describe('AdminAuthService.changePassword', () => {
  it('rejects an incorrect current password', async () => {
    const passwordHash = await bcrypt.hash('OldPass1', 4);
    const prisma = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'a1',
          passwordHash,
          status: 'ACTIVE',
        }),
        update: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
    };
    const service = new AdminAuthService(prisma as never, { sign: vi.fn(() => 'access') });

    await expect(
      service.changePassword(
        { id: 'a1', username: 'agent', role: 'AGENT', level: 1, status: 'ACTIVE' },
        { currentPassword: 'WrongPass1', newPassword: 'NewPass1' },
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: '目前密碼錯誤',
    } satisfies Partial<ApiError>);
    expect(prisma.agent.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('updates the authenticated agent password', async () => {
    const passwordHash = await bcrypt.hash('OldPass1', 4);
    const prisma = {
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'a1',
          passwordHash,
          status: 'ACTIVE',
        }),
        update: vi.fn().mockResolvedValue({ id: 'a1' }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit1' }),
      },
    };
    const service = new AdminAuthService(prisma as never, { sign: vi.fn(() => 'access') });

    await service.changePassword(
      { id: 'a1', username: 'agent', role: 'AGENT', level: 1, status: 'ACTIVE' },
      { currentPassword: 'OldPass1', newPassword: 'NewPass1' },
    );

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { passwordHash: expect.any(String) },
    });
    const updatedHash = prisma.agent.update.mock.calls[0]?.[0].data.passwordHash as string;
    await expect(bcrypt.compare('NewPass1', updatedHash)).resolves.toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'a1',
          actorType: 'agent',
          actorUsername: 'agent',
          action: 'auth.password.change',
          targetType: 'agent',
          targetId: 'a1',
        }),
      }),
    );
  });
});
