import type { FastifyInstance } from 'fastify';
import {
  adminChangePasswordSchema,
  adminLoginSchema,
  adminRefreshSchema,
} from './adminAuth.schema.js';
import { AdminAuthService } from './adminAuth.service.js';
import { ApiError } from '../../../utils/errors.js';

export async function adminAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new AdminAuthService(fastify.prisma, fastify.jwt);

  fastify.get('/captcha', async () => {
    return service.issueCaptcha();
  });

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

  fastify.post(
    '/change-password',
    { preHandler: [fastify.authenticateAdmin] },
    async (req, reply) => {
      const parsed = adminChangePasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          'INVALID_ACTION',
          '請確認目前密碼與新密碼格式，新密碼至少 8 字並包含英文與數字',
        );
      }
      await service.changePassword(req.admin, parsed.data, req);
      reply.code(204).send();
    },
  );

  fastify.get('/me', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    return service.getMe(req.admin.id);
  });
}
