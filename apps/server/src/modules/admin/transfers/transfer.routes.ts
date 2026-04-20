import type { FastifyInstance } from 'fastify';
import { TransferService } from './transfer.service.js';
import {
  agentToAgentSchema,
  agentToMemberSchema,
  csTransferSchema,
  transferListQuerySchema,
} from './transfer.schema.js';

export async function transferRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new TransferService(fastify.prisma);

  fastify.post('/agent-to-agent', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const body = agentToAgentSchema.parse(req.body);
    return service.agentToAgent(req.admin, body, req);
  });

  fastify.post('/agent-to-member', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const body = agentToMemberSchema.parse(req.body);
    return service.agentToMember(req.admin, body, req);
  });

  fastify.post(
    '/cs-agent',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const body = csTransferSchema.parse(req.body);
      return service.csAgent(req.admin, body, req);
    },
  );

  fastify.post(
    '/cs-member',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const body = csTransferSchema.parse(req.body);
      return service.csMember(req.admin, body, req);
    },
  );

  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const query = transferListQuerySchema.parse(req.query);
    return service.list(req.admin, query);
  });
}
