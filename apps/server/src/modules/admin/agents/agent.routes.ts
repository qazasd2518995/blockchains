import type { FastifyInstance } from 'fastify';
import { AgentService } from './agent.service.js';
import {
  createAgentSchema,
  updateAgentSchema,
  updateAgentRebateSchema,
  updateAgentStatusSchema,
  resetPasswordSchema,
} from './agent.schema.js';

export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AgentService(fastify.prisma);

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    // 預設列出 operator 的直屬子代理
    const parentId = (req.query as { parentId?: string }).parentId ?? req.admin.id;
    const items = await service.listDirectChildren(parentId);
    return { items };
  });

  // Lookup by username — 給控制 / 轉帳 modal 填帳號時用
  // 權限限制：非 SUPER_ADMIN 只能查自己下級樹的代理（避免側道枚舉）
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
      const { canManageAgent } = await import('../../../utils/hierarchy.js');
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
