import type { FastifyInstance } from 'fastify';
import { adminAuthRoutes } from './auth/adminAuth.routes.js';
import { agentRoutes } from './agents/agent.routes.js';
import { memberRoutes } from './members/member.routes.js';
import { transferRoutes } from './transfers/transfer.routes.js';
import { reportRoutes } from './reports/report.routes.js';
import { controlRoutes } from './controls/controls.routes.js';
import { auditRoutes } from './audit/audit.routes.js';
import { hierarchyRoutes } from './hierarchy/hierarchy.routes.js';

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(adminAuthRoutes, { prefix: '/auth' });
  await fastify.register(hierarchyRoutes, { prefix: '/hierarchy' });
  await fastify.register(agentRoutes, { prefix: '/agents' });
  await fastify.register(memberRoutes, { prefix: '/members' });
  await fastify.register(transferRoutes, { prefix: '/transfers' });
  await fastify.register(reportRoutes, { prefix: '/reports' });
  await fastify.register(controlRoutes, { prefix: '/controls' });
  await fastify.register(auditRoutes, { prefix: '/audit' });
}
