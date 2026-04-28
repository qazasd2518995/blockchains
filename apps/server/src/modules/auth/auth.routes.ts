import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { BACCARAT_GAME_IDS } from '@bg/shared';
import { loginSchema, refreshSchema } from './auth.schema.js';
import { AuthService } from './auth.service.js';
import { ApiError } from '../../utils/errors.js';
import { config } from '../../config.js';

const BACCARAT_LAUNCH_TTL_SECONDS = 15 * 60;
const baccaratLaunchBodySchema = z.object({
  gameId: z.enum(BACCARAT_GAME_IDS).default('baccarat'),
  provider: z.string().min(1).max(80).default('Royal Crown Studios'),
  skin: z.enum(['royal', 'nova', 'imperial']).default('royal'),
});

function toBase64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function signBaccaratLaunchToken(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = toBase64Url(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + BACCARAT_LAUNCH_TTL_SECONDS,
    }),
  );
  const signature = createHmac('sha256', config.BACCARAT_INTEGRATION_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

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

  fastify.post('/baccarat-launch', { preHandler: [fastify.authenticate] }, async (req) => {
    const body = baccaratLaunchBodySchema.parse(req.body ?? {});
    const user = await fastify.prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true, role: true, balance: true, displayName: true, disabledAt: true },
    });
    if (!user || user.disabledAt) {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }
    if (user.role !== 'PLAYER') {
      throw new ApiError('FORBIDDEN', 'Only player accounts can enter baccarat');
    }

    const launchToken = signBaccaratLaunchToken({
      aud: 'baccarat-launch',
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      balance: user.balance.toFixed(2),
      role: 'member',
      gameId: body.gameId,
      provider: body.provider,
      skin: body.skin,
    });

    return { launchToken };
  });
}
