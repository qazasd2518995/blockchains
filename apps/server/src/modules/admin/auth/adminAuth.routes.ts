import type { FastifyInstance } from 'fastify';
import { adminLoginSchema, adminRefreshSchema } from './adminAuth.schema.js';
import { AdminAuthService } from './adminAuth.service.js';

export async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AdminAuthService(fastify.prisma, fastify.jwt);

  fastify.post('/login', async (req) => {
    const body = adminLoginSchema.parse(req.body);
    return service.login(body);
  });

  fastify.post('/refresh', async (req) => {
    const body = adminRefreshSchema.parse(req.body);
    return service.refresh(body.refreshToken);
  });

  fastify.post('/logout', async (req, reply) => {
    const body = adminRefreshSchema.parse(req.body);
    await service.logout(body.refreshToken);
    reply.code(204).send();
  });

  fastify.get('/me', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    return service.getMe(req.admin.id);
  });
}
