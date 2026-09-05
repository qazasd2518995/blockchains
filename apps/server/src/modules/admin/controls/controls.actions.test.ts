import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../admin.plugin.js';
import { ApiError, errorCodeToStatus } from '../../../utils/errors.js';

const models = {
  'win-loss': 'winLossControl',
  'win-cap': 'memberWinCapControl',
  deposit: 'memberDepositControl',
  'agent-line': 'agentLineWinCap',
  burst: 'burstControl',
  'manual-detection': 'manualDetectionControl',
} as const;

async function harness(kind: keyof typeof models, completed = false) {
  const record = {
    id: 'rule',
    isActive: true,
    isCompleted: completed,
    controlZoneRootAgentId: null,
    controlMode: 'lifecycle_path',
    scope: 'MEMBER',
    targetMemberId: 'member',
    targetAgentId: null,
    targetMemberUsername: 'review-member',
  };
  let exists = true;
  const audit = vi.fn(async () => ({}));
  const matches = (where: Record<string, unknown>) =>
    exists &&
    Object.entries(where).every(
      ([key, value]) => value === undefined || (record as Record<string, unknown>)[key] === value,
    );
  const model = {
    findFirst: vi.fn(async ({ where }) => (matches(where) ? { ...record } : null)),
    findUniqueOrThrow: vi.fn(async () => {
      if (!exists) throw new Error('missing');
      return { ...record };
    }),
    update: vi.fn(async ({ data }) => {
      Object.assign(record, data);
      return { ...record };
    }),
    updateMany: vi.fn(async ({ where, data }) => {
      if (!matches(where)) return { count: 0 };
      Object.assign(record, data);
      return { count: 1 };
    }),
    delete: vi.fn(async () => {
      exists = false;
      return { ...record };
    }),
  };
  const resetRuntime = vi.fn(async () => ({ count: 1 }));
  const tx = {
    [models[kind]]: model,
    auditLog: { create: audit },
    memberAutoBalanceControl: { updateMany: resetRuntime },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn: (db: typeof tx) => Promise<unknown>) => {
      const before = { ...record };
      const beforeExists = exists;
      try {
        return await fn(tx);
      } catch (error) {
        Object.assign(record, before);
        exists = beforeExists;
        throw error;
      }
    }),
  } as unknown as PrismaClient;
  const app = Fastify();
  app.decorate('prisma', prisma);
  app.decorate('authenticateAdmin', async (req) => {
    req.admin = {
      id: 'review-admin',
      username: 'review-admin',
      role: req.headers['x-role'] || 'SUPER_ADMIN',
      status: req.headers['x-status'] || 'ACTIVE',
      canManageControlZone: req.headers['x-zone'] === 'true',
    } as typeof req.admin;
  });
  app.decorate('requireSuperAdmin', async (req) => {
    if (req.admin.role !== 'SUPER_ADMIN') throw new ApiError('FORBIDDEN', 'Super admin required');
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ApiError)
      return reply.code(errorCodeToStatus(error.code)).send({ code: error.code });
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_ACTION' });
    return reply.code(500).send({ code: 'INTERNAL' });
  });
  await app.register(adminRoutes);
  return { app, record, model, audit, resetRuntime, exists: () => exists };
}

describe('admin control action request contracts', () => {
  for (const kind of Object.keys(models) as (keyof typeof models)[]) {
    it(`${kind}: stop preserves the selected rule, delete removes only after DELETE`, async () => {
      const h = await harness(kind);
      try {
        const stop = await h.app.inject(
          kind === 'manual-detection'
            ? {
                method: 'POST',
                url: '/controls/manual-detection/deactivate',
                payload: { id: 'rule' },
              }
            : {
                method: 'PATCH',
                url: `/controls/${kind}/rule/toggle`,
                payload: { isActive: false },
              },
        );
        expect(stop.statusCode).toBe(200);
        expect(h.record.isActive).toBe(false);
        expect(h.exists()).toBe(true);
        expect(h.model.delete).not.toHaveBeenCalled();
        if (kind === 'manual-detection') expect(h.resetRuntime).toHaveBeenCalledOnce();
        if (kind !== 'manual-detection') {
          const enabled = await h.app.inject({
            method: 'PATCH',
            url: `/controls/${kind}/rule/toggle`,
            payload: { isActive: true },
          });
          expect(enabled.statusCode).toBe(200);
          expect(h.record.isActive).toBe(true);
        }
        const removed = await h.app.inject({ method: 'DELETE', url: `/controls/${kind}/rule` });
        expect(removed.statusCode).toBe(204);
        expect(h.exists()).toBe(false);
        expect(h.model.delete).toHaveBeenCalledWith({ where: { id: 'rule' } });
      } finally {
        await h.app.close();
      }
    });

    it.each(['toggle', 'delete'])(`${kind}: %s rolls back if audit fails`, async (operation) => {
      const h = await harness(kind);
      h.audit.mockRejectedValueOnce(new Error('isolated audit failure'));
      try {
        const response = await h.app.inject(
          operation === 'delete'
            ? { method: 'DELETE', url: `/controls/${kind}/rule` }
            : kind === 'manual-detection'
              ? {
                  method: 'POST',
                  url: '/controls/manual-detection/deactivate',
                  payload: { id: 'rule' },
                }
              : {
                  method: 'PATCH',
                  url: `/controls/${kind}/rule/toggle`,
                  payload: { isActive: false },
                },
        );
        expect(response.statusCode).toBe(500);
        expect(h.exists()).toBe(true);
        expect(h.record.isActive).toBe(true);
      } finally {
        await h.app.close();
      }
    });

    it.each([
      { 'x-role': 'SUB_ACCOUNT' },
      { 'x-status': 'FROZEN' },
      { 'x-role': 'AGENT' },
      { 'x-role': 'AGENT', 'x-zone': 'true' },
    ])(`${kind}: unauthorized mutation does not touch data (%j)`, async (headers) => {
      const h = await harness(kind);
      try {
        const response = await h.app.inject({
          method: 'DELETE',
          url: `/controls/${kind}/rule`,
          headers,
        });
        expect([400, 403]).toContain(response.statusCode);
        expect(h.model.delete).not.toHaveBeenCalled();
        expect(h.exists()).toBe(true);
      } finally {
        await h.app.close();
      }
    });
  }

  it.each(['win-loss', 'deposit'] as const)(
    '%s: completed progress cannot silently be enabled',
    async (kind) => {
      const h = await harness(kind, true);
      h.record.isActive = false;
      try {
        const response = await h.app.inject({
          method: 'PATCH',
          url: `/controls/${kind}/rule/toggle`,
          payload: { isActive: true },
        });
        expect(response.statusCode).toBe(400);
        expect(h.record.isActive).toBe(false);
        expect(h.record.isCompleted).toBe(true);
        expect(h.audit).not.toHaveBeenCalled();
      } finally {
        await h.app.close();
      }
    },
  );
});
