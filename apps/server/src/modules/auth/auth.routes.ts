import type { FastifyInstance } from 'fastify';
import { registerSchema, loginSchema, refreshSchema } from './auth.schema.js';
import { AuthService } from './auth.service.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AuthService(fastify.prisma, fastify.jwt);

  fastify.post('/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const result = await service.register(body);
    reply.code(201).send(result);
  });

  fastify.post('/login', async (req) => {
    const body = loginSchema.parse(req.body);
    return service.login(body);
  });

  fastify.post('/refresh', async (req) => {
    const body = refreshSchema.parse(req.body);
    return service.refresh(body.refreshToken);
  });

  fastify.post('/logout', async (req, reply) => {
    const body = refreshSchema.parse(req.body);
    await service.logout(body.refreshToken);
    reply.code(204).send();
  });

  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req) => {
    return service.getMe(req.userId);
  });
}
