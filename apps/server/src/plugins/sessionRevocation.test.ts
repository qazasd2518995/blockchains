import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { authPlugin } from './auth.js';
import { adminAuthPlugin, type AdminCurrent } from './adminAuth.js';
import { MemberService } from '../modules/admin/members/member.service.js';
import { AgentService } from '../modules/admin/agents/agent.service.js';
import { SubAccountService } from '../modules/admin/subaccounts/subaccount.service.js';
import { AuthService } from '../modules/auth/auth.service.js';
import { AdminAuthService } from '../modules/admin/auth/adminAuth.service.js';
import { ApiError, errorCodeToStatus } from '../utils/errors.js';

const operator = {
  id: 'root',
  username: 'root',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  level: 0,
  canManageControlZone: true,
} as AdminCurrent;
async function fixture(role = 'AGENT') {
  const user: any = {
    id: 'member',
    username: 'member',
    role: 'PLAYER',
    frozenAt: null,
    disabledAt: null,
    activeSessionId: 'member-session',
    activeSessionAt: new Date(),
  };
  const agent: any = {
    id: 'agent',
    username: 'agent',
    parentId: 'root',
    role,
    level: 1,
    status: 'ACTIVE',
    canManageControlZone: false,
    activeSessionId: 'agent-session',
    activeSessionAt: new Date(),
  };
  const model = (value: any) => ({
    findUnique: async () => value,
    update: async ({ data }: any) => Object.assign(value, data),
    updateMany: async ({ where, data }: any) => {
      if (where.activeSessionId !== undefined && where.activeSessionId !== value.activeSessionId)
        return { count: 0 };
      Object.assign(value, data);
      return { count: 1 };
    },
  });
  const db: any = {
    user: model(user),
    agent: model(agent),
    refreshToken: {
      findUnique: async () => ({ id: 'r', userId: user.id, sessionId: 'member-session' }),
      updateMany: async () => ({ count: 1 }),
    },
    agentRefreshToken: {
      findUnique: async () => ({ id: 'ar', agentId: agent.id, sessionId: 'agent-session' }),
      updateMany: async () => ({ count: 1 }),
    },
    auditLog: { create: async () => ({}) },
  };
  db.$transaction = async (fn: any) => fn(db);
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ApiError)
      return reply.code(errorCodeToStatus(error.code)).send({ code: error.code });
    return reply.code(500).send({ message: String(error) });
  });
  await app.register(
    fp(
      async (a) => {
        a.decorate('prisma', db);
      },
      { name: 'prisma' },
    ),
  );
  await app.register(jwt, { secret: 'isolated-session-regression-secret-only' });
  await app.register(authPlugin);
  await app.register(adminAuthPlugin);
  app.get('/member', { preHandler: [app.authenticate] }, async () => ({ ok: true }));
  app.get('/admin', { preHandler: [app.authenticateAdmin] }, async () => ({ ok: true }));
  await app.ready();
  const token = (admin: boolean, sid?: string) =>
    app.jwt.sign({
      sub: admin ? 'agent' : 'member',
      role: admin ? role : 'PLAYER',
      ...(admin ? { aud: 'admin' } : {}),
      ...(sid ? { sid } : {}),
    });
  const check = async (admin: boolean, sid?: string) =>
    (
      await app.inject({
        url: admin ? '/admin' : '/member',
        headers: { authorization: `Bearer ${token(admin, sid)}` },
      })
    ).statusCode;
  return { app, db, user, agent, check };
}
describe('access-token revocation uses authoritative session identity', () => {
  it.each([false, true])(
    'rejects absent, revoked and replaced sessions (admin=%s)',
    async (admin) => {
      const f = await fixture();
      try {
        const current = admin ? 'agent-session' : 'member-session';
        expect(await f.check(admin, current)).toBe(200);
        expect(await f.check(admin)).toBe(401);
        expect(await f.check(admin, 'other')).toBe(401);
        (admin ? f.agent : f.user).activeSessionId = null;
        expect(await f.check(admin, current)).toBe(401);
        (admin ? f.agent : f.user).activeSessionId = 'new-session';
        expect(await f.check(admin, current)).toBe(401);
        expect(await f.check(admin, 'new-session')).toBe(200);
      } finally {
        await f.app.close();
      }
    },
  );
  it.each(['member', 'agent', 'subaccount'])(
    'password reset revokes %s access immediately',
    async (kind) => {
      const f = await fixture(kind === 'subaccount' ? 'SUB_ACCOUNT' : 'AGENT');
      try {
        const Service =
          kind === 'member' ? MemberService : kind === 'agent' ? AgentService : SubAccountService;
        await new Service(f.db).resetPassword(operator, kind === 'member' ? 'member' : 'agent', {
          newPassword: 'ReviewOnly123',
        });
        expect(
          await f.check(kind !== 'member', kind === 'member' ? 'member-session' : 'agent-session'),
        ).toBe(401);
      } finally {
        await f.app.close();
      }
    },
  );
  it.each([false, true])(
    'logout revokes old access but not a newer login (admin=%s)',
    async (admin) => {
      const f = await fixture();
      try {
        const service = admin
          ? new AdminAuthService(f.db, f.app.jwt)
          : new AuthService(f.db, f.app.jwt);
        await service.logout('isolated-refresh');
        expect(await f.check(admin, admin ? 'agent-session' : 'member-session')).toBe(401);
        (admin ? f.agent : f.user).activeSessionId = 'new-session';
        await service.logout('isolated-refresh');
        expect(await f.check(admin, 'new-session')).toBe(200);
      } finally {
        await f.app.close();
      }
    },
  );
});
