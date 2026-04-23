import type { FastifyInstance } from 'fastify';
import { SubAccountService } from './subaccount.service.js';
import {
  createSubAccountSchema,
  resetSubAccountPasswordSchema,
  subAccountListQuerySchema,
  updateSubAccountStatusSchema,
} from './subaccount.schema.js';

export async function subAccountRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new SubAccountService(fastify.prisma);

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const query = subAccountListQuerySchema.parse(req.query);
    return service.list(req.admin, query.parentAgentId);
  });

  fastify.post('/', { preHandler: [fastify.authenticateAdmin] }, async (req, reply) => {
    const body = createSubAccountSchema.parse(req.body);
    const result = await service.create(req.admin, body, req);
    reply.code(201).send(result);
  });

  fastify.patch('/:id/status', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const { id } = req.params as { id: string };
    const body = updateSubAccountStatusSchema.parse(req.body);
    return service.updateStatus(req.admin, id, body, req);
  });

  fastify.post(
    '/:id/reset-password',
    { preHandler: [fastify.authenticateAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = resetSubAccountPasswordSchema.parse(req.body);
      await service.resetPassword(req.admin, id, body, req);
      reply.code(204).send();
    },
  );

}
