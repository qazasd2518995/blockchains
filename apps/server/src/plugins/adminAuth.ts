import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiError } from '../utils/errors.js';

export interface AdminJwtPayload {
  sub: string;
  username: string;
  role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
  level: number;
  aud: 'admin';
}

export interface AdminCurrent {
  id: string;
  username: string;
  role: AdminJwtPayload['role'];
  level: number;
  status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticateAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireSuperAdmin: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    admin: AdminCurrent;
  }
}

async function pluginFn(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('authenticateAdmin', async (req: FastifyRequest, _reply: FastifyReply) => {
    if ((req as unknown as { admin?: AdminCurrent }).admin) return;
    try {
      await req.jwtVerify();
    } catch {
      throw new ApiError('UNAUTHORIZED', 'Admin authentication required');
    }
    const raw = (req as unknown as { user: unknown }).user as Partial<AdminJwtPayload> | undefined;
    if (!raw || raw.aud !== 'admin' || !raw.sub) {
      throw new ApiError('UNAUTHORIZED', 'Invalid admin token');
    }
    // 驗證 agent 仍 active
    const agent = await fastify.prisma.agent.findUnique({
      where: { id: raw.sub },
      select: { id: true, username: true, role: true, level: true, status: true },
    });
    if (!agent || agent.status === 'DISABLED' || agent.status === 'DELETED') {
      throw new ApiError('AGENT_FROZEN', 'Agent account is not active');
    }
    (req as unknown as { admin: AdminCurrent }).admin = {
      id: agent.id,
      username: agent.username,
      role: agent.role,
      level: agent.level,
      status: agent.status,
    };
  });

  fastify.decorate('requireSuperAdmin', async (req: FastifyRequest) => {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      throw new ApiError('FORBIDDEN', 'Super admin permission required');
    }
  });
}

export const adminAuthPlugin = fp(pluginFn, { name: 'adminAuth', dependencies: ['prisma'] });
