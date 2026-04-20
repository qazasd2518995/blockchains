import type { FastifyInstance } from 'fastify';
import { MemberService } from './member.service.js';
import {
  createMemberSchema,
  updateMemberNotesSchema,
  updateMemberStatusSchema,
  adjustMemberBalanceSchema,
  resetMemberPasswordSchema,
  memberListQuerySchema,
  memberBetQuerySchema,
} from './member.schema.js';

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new MemberService(fastify.prisma);

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const query = memberListQuerySchema.parse(req.query);
    return service.list(req.admin, query);
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

  fastify.get('/:id/bets', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const query = memberBetQuerySchema.parse(req.query);
    return service.getBets(req.admin, id, query);
  });
}
