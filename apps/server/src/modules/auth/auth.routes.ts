import type { FastifyInstance } from 'fastify';
import { loginSchema, refreshSchema } from './auth.schema.js';
import { AuthService } from './auth.service.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AuthService(fastify.prisma, fastify.jwt);

  // 公開註冊已停用：會員帳號僅能由代理後台建立
  fastify.post('/register', async (req, reply) => {
    await fastify.prisma.auditLog
      .create({
        data: {
          actorType: 'system',
          actorUsername: 'system',
          action: 'register.blocked',
          targetType: 'auth',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
        },
      })
      .catch(() => undefined);
    reply.code(404).send({
      code: 'REGISTRATION_CLOSED',
      message: 'Member accounts are created by agents only.',
    });
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
