import type { FastifyInstance } from 'fastify';
import { MemberService } from './member.service.js';
import {
  createMemberSchema,
  updateMemberNotesSchema,
  updateMemberStatusSchema,
  adjustMemberBalanceSchema,
  resetMemberPasswordSchema,
  updateMemberBettingLimitSchema,
  memberListQuerySchema,
  memberBetQuerySchema,
} from './member.schema.js';

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new MemberService(fastify.prisma);

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const query = memberListQuerySchema.parse(req.query);
    return service.list(req.admin, query);
  });

  // Lookup by username — 給控制 modal 填帳號時用
  // 權限限制：非 SUPER_ADMIN 只能查自己下級樹的會員（避免側道枚舉）
  fastify.get('/lookup', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { username } = req.query as { username?: string };
    if (!username) {
      reply.code(400).send({ code: 'INVALID_ACTION', message: 'Missing username' });
      return;
    }
    const user = await fastify.prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });
    if (!user) {
      reply.code(404).send({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
      return;
    }
    if (req.admin.role !== 'SUPER_ADMIN') {
      const { canManageMember } = await import('../../../utils/hierarchy.js');
      const ok = await canManageMember(fastify.prisma, req.admin, user.id);
      if (!ok) {
        reply.code(404).send({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
        return;
      }
    }
    return user;
  });

  fastify.post('/', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const body = createMemberSchema.parse(req.body);
    const result = await service.create(req.admin, body, req);
    reply.code(201).send(result);
  });

  fastify.get('/:id', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    return service.getById(req.admin, id);
  });

  fastify.put('/:id/notes', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateMemberNotesSchema.parse(req.body);
    return service.updateNotes(req.admin, id, body, req);
  });

  fastify.patch('/:id/status', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateMemberStatusSchema.parse(req.body);
    return service.updateStatus(req.admin, id, body, req);
  });

  fastify.post('/:id/adjust-balance', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = adjustMemberBalanceSchema.parse(req.body);
    return service.adjustBalance(req.admin, id, body, req);
  });

  fastify.post('/:id/reset-password', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = resetMemberPasswordSchema.parse(req.body);
    await service.resetPassword(req.admin, id, body, req);
    reply.code(204).send();
  });

  fastify.patch('/:id/betting-limit', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateMemberBettingLimitSchema.parse(req.body);
    return service.updateBettingLimit(req.admin, id, body, req);
  });

  fastify.get('/:id/bets', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const query = memberBetQuerySchema.parse(req.query);
    return service.getBets(req.admin, id, query);
  });
}
