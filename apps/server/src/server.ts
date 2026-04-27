import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { Server as SocketIOServer } from 'socket.io';

import { config, isAllowedOrigin } from './config.js';
import { GameId } from '@bg/shared';
import { prismaPlugin } from './plugins/prisma.js';
import { authPlugin } from './plugins/auth.js';
import { adminAuthPlugin } from './plugins/adminAuth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.plugin.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { pfRoutes } from './modules/provably-fair/pf.routes.js';
import { publicAnnouncementRoutes } from './modules/public/announcements.routes.js';
import { baccaratIntegrationRoutes } from './modules/integrations/baccarat.routes.js';
import { diceRoutes } from './modules/games/dice/dice.routes.js';
import { minesRoutes } from './modules/games/mines/mines.routes.js';
import { hiloRoutes } from './modules/games/hilo/hilo.routes.js';
import { kenoRoutes } from './modules/games/keno/keno.routes.js';
import { wheelRoutes } from './modules/games/wheel/wheel.routes.js';
import { plinkoRoutes } from './modules/games/plinko/plinko.routes.js';
import { rouletteRoutes } from './modules/games/roulette/roulette.routes.js';
import { hotlineRoutes } from './modules/games/hotline/hotline.routes.js';
import { towerRoutes } from './modules/games/tower/tower.routes.js';
import { CrashRoomRegistry } from './realtime/crashRoom.js';
import { ApiError, errorCodeToStatus } from './utils/errors.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'warn' : 'info',
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    trustProxy: true,
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply
        .code(errorCodeToStatus(error.code))
        .send({ code: error.code, message: error.message, details: error.details });
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send({
        code: 'INVALID_BET',
        message: 'Invalid request',
        details: error.flatten(),
      });
      return;
    }
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.code(statusCode).send({
      code: statusCode === 400 ? 'INVALID_BET' : 'INTERNAL',
      message: error.message || 'Internal server error',
    });
  });

  await server.register(helmet, { contentSecurityPolicy: false });
  await server.register(cors, {
    origin: (origin, cb) => {
      cb(null, isAllowedOrigin(origin));
    },
    credentials: true,
  });
  await server.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      const user = (req as unknown as { user?: { sub?: string } }).user;
      return user?.sub ?? req.ip;
    },
  });
  await server.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_ACCESS_TTL },
  });

  await server.register(prismaPlugin);
  await server.register(authPlugin);
  await server.register(adminAuthPlugin);

  server.get('/api/health', async () => ({ ok: true, env: config.NODE_ENV }));

  await server.register(authRoutes, { prefix: '/api/auth' });
  await server.register(adminRoutes, { prefix: '/api/admin' });
  await server.register(walletRoutes, { prefix: '/api/wallet' });
  await server.register(baccaratIntegrationRoutes, { prefix: '/api/integrations/baccarat' });
  await server.register(pfRoutes, { prefix: '/api/pf' });
  await server.register(publicAnnouncementRoutes, { prefix: '/api/public' });

  // Games
  await server.register(diceRoutes, { prefix: '/api/games/dice' });
  await server.register(minesRoutes, { prefix: '/api/games/mines' });
  await server.register(hiloRoutes, { prefix: '/api/games/hilo' });
  await server.register(kenoRoutes, { prefix: '/api/games/keno' });
  await server.register(wheelRoutes, { prefix: '/api/games/wheel' });
  await server.register(plinkoRoutes, { prefix: '/api/games/plinko' });
  await server.register(rouletteRoutes, { prefix: '/api/games' });
  await server.register(hotlineRoutes, { prefix: '/api/games/hotline' });
  await server.register(towerRoutes, { prefix: '/api/games/tower' });

  // Socket.IO for Crash games
  server.ready().then(() => {
    const io = new SocketIOServer(server.server, {
      cors: {
        origin: (origin, cb) => {
          cb(null, isAllowedOrigin(origin));
        },
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });
    const registry = new CrashRoomRegistry(io, server.prisma);
    for (const gameId of [
      GameId.ROCKET,
      GameId.AVIATOR,
      GameId.SPACE_FLEET,
      GameId.JETX,
      GameId.BALLOON,
      GameId.JETX3,
      GameId.DOUBLE_X,
      GameId.PLINKO_X,
    ]) {
      registry.register({ gameId });
    }
    void registry.startAll().catch((err) => {
      server.log.error(err, '[socket.io] failed to initialize crash rooms');
    });
    server.log.info('[socket.io] Crash rooms initialized');
  });

  return server;
}
