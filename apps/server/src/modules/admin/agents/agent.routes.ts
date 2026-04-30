import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { AgentService } from './agent.service.js';
import { ApiError } from '../../../utils/errors.js';
import { canManageAgent, listAgentDescendants, resolveAgentScopeRootId } from '../../../utils/hierarchy.js';
import {
  createAgentSchema,
  updateAgentSchema,
  updateAgentRebateSchema,
  updateAgentStatusSchema,
  resetPasswordSchema,
  updateBettingLimitSchema,
} from './agent.schema.js';

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AgentService(fastify.prisma);

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    // 預設列出 operator 的直屬子代理
    const parentId = (req.query as { parentId?: string }).parentId ?? req.admin.id;
    const ok = await canManageAgent(fastify.prisma, req.admin, parentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot list agents under this parent');
    const items = await service.listDirectChildren(parentId);
    return { items };
  });

  // Search by username / displayName — 給控制 / 轉帳 modal 即時搜尋選單使用
  // 權限限制：非 SUPER_ADMIN 只能查自己下級樹的代理（避免側道枚舉）
  fastify.get('/search', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { q = '', limit = '12' } = req.query as { q?: string; limit?: string };
    const keyword = q.trim();
    const take = Math.min(Math.max(Number.parseInt(limit, 10) || 12, 1), 25);
    const where: Prisma.AgentWhereInput = {
      status: { not: 'DELETED' },
      role: { not: 'SUB_ACCOUNT' },
    };

    if (req.admin.role !== 'SUPER_ADMIN') {
      const rootId = await resolveAgentScopeRootId(fastify.prisma, req.admin);
      const scopedIds = rootId ? await listAgentDescendants(fastify.prisma, rootId) : [];
      where.id = { in: scopedIds };
    }
    if (keyword) {
      where.OR = [
        { username: { contains: keyword, mode: 'insensitive' } },
        { displayName: { contains: keyword, mode: 'insensitive' } },
        { id: keyword },
      ];
    }

    const items = await fastify.prisma.agent.findMany({
      where,
      select: {
        id: true,
        username: true,
        displayName: true,
        level: true,
        balance: true,
        status: true,
        role: true,
      },
      orderBy: [{ level: 'asc' }, { username: 'asc' }],
      take,
    });

    return {
      items: items.map((agent) => ({
        ...agent,
        balance: agent.balance.toFixed(2),
      })),
    };
  });

  fastify.get('/lookup', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { username } = req.query as { username?: string };
    if (!username) {
      reply.code(400).send({ code: 'INVALID_ACTION', message: 'Missing username' });
      return;
    }
    const agent = await fastify.prisma.agent.findUnique({
      where: { username },
      select: { id: true, username: true },
    });
    if (!agent) {
      reply.code(404).send({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' });
      return;
    }
    if (req.admin.role !== 'SUPER_ADMIN') {
      const ok = await canManageAgent(fastify.prisma, req.admin, agent.id);
      if (!ok) {
        reply.code(404).send({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' });
        return;
      }
    }
    return agent;
  });

  fastify.get('/tree', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const rootId = (req.query as { rootId?: string }).rootId ?? req.admin.id;
    const ok = await canManageAgent(fastify.prisma, req.admin, rootId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this agent tree');
    const root = await service.getTree(rootId);
    return { root };
  });

  fastify.get('/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    return service.getById(req.admin, id);
  });

  fastify.post('/', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const body = createAgentSchema.parse(req.body);
    const result = await service.create(req.admin, body, req);
    reply.code(201).send(result);
  });

  fastify.put('/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateAgentSchema.parse(req.body);
    return service.update(req.admin, id, body, req);
  });

  fastify.put('/:id/rebate', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateAgentRebateSchema.parse(req.body);
    return service.updateRebate(req.admin, id, body, req);
  });

  fastify.patch('/:id/status', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateAgentStatusSchema.parse(req.body);
    return service.updateStatus(req.admin, id, body, req);
  });

  fastify.patch('/:id/betting-limit', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateBettingLimitSchema.parse(req.body);
    return service.updateBettingLimit(req.admin, id, body, req);
  });

  fastify.post(
    '/:id/reset-password',
    { preHandler: [fastify.authenticateAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = resetPasswordSchema.parse(req.body);
      await service.resetPassword(req.admin, id, body, req);
      reply.code(204).send();
    },
  );
}
