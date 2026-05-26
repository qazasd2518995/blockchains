import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';

import { config, isAllowedOrigin } from './config.js';
import {
  MAX_BET_AMOUNT,
  MIN_BET_AMOUNT,
  PLINKO_MAX_BALLS,
  ROULETTE_MAX_BET_LINES,
} from '@bg/shared';
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
import { blackjackRoutes } from './modules/games/blackjack/blackjack.routes.js';
import { chickenRoadRoutes } from './modules/games/chicken-road/chicken-road.routes.js';
import { crashRoutes } from './modules/games/crash/crash.routes.js';
import { ApiError, errorCodeToStatus } from './utils/errors.js';
import {
  getRequestLogContext,
  getSafeRequestPayload,
  hasRequestErrorLogged,
  markRequestErrorLogged,
  markRequestStart,
  sanitizeForLog,
  shouldDebugRequest,
  shouldSkipRequestLog,
} from './utils/requestLogging.js';

const SLOT_DEBUG_BUILD = 'mega-slot-mobile-debug-20260527-01';
const SLOT_DEBUG_SW_VERSION = 'yachiyo-assets-v5-mega-slot-20260527';

function formatCurrencyLimit(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

function zodBetError(error: ZodError): { code: string; message: string; details: unknown } {
  const issue = error.issues[0];
  const path = issue?.path.map(String).join('.') ?? '';
  const details = error.flatten();

  if (path.includes('amount')) {
    if (issue?.code === 'too_small') {
      return {
        code: 'BET_OUT_OF_RANGE',
        message: `最低下注為 ${formatCurrencyLimit(MIN_BET_AMOUNT)}。`,
        details,
      };
    }
    if (issue?.code === 'too_big') {
      return {
        code: 'BET_OUT_OF_RANGE',
        message: `單注上限為 ${formatCurrencyLimit(MAX_BET_AMOUNT)}。`,
        details,
      };
    }
  }

  if (path === 'bets' && issue?.code === 'too_big') {
    return {
      code: 'BET_OUT_OF_RANGE',
      message: `輪盤一次最多可選 ${ROULETTE_MAX_BET_LINES} 個投注項目。`,
      details,
    };
  }

  if (path === 'balls' && issue?.code === 'too_big') {
    return {
      code: 'BET_OUT_OF_RANGE',
      message: `彈珠台一次最多 ${PLINKO_MAX_BALLS} 顆。`,
      details,
    };
  }

  return {
    code: 'INVALID_BET',
    message: '下注設定不符合規則，請檢查金額或選項。',
    details,
  };
}

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'warn' : config.LOG_LEVEL,
      redact: {
        censor: '[Redacted]',
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'payload.body.password',
          'payload.body.token',
          'payload.body.accessToken',
          'payload.body.refreshToken',
          'payload.body.clientSeed',
          'payload.body.serverSeed',
          'payload.query.token',
          'payload.query.accessToken',
          'payload.query.refreshToken',
        ],
      },
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    disableRequestLogging: true,
    trustProxy: true,
  });

  server.log.info(
    {
      env: config.NODE_ENV,
      logLevel: server.log.level,
      prismaQueryLog: config.PRISMA_QUERY_LOG,
      slowRequestMs: config.SLOW_REQUEST_MS,
    },
    'Server logging configured',
  );

  server.addHook('onRequest', async (request, reply) => {
    markRequestStart(request);
    reply.header('x-request-id', request.id);
  });

  server.addHook('onResponse', async (request, reply) => {
    if (shouldSkipRequestLog(request)) return;

    const context = getRequestLogContext(request, reply);
    const payload = getSafeRequestPayload(request);
    const durationMs = typeof context.durationMs === 'number' ? context.durationMs : undefined;

    if (reply.statusCode >= 500 && !hasRequestErrorLogged(request)) {
      request.log.error({ ...context, payload }, 'Request completed with server error');
      return;
    }

    if (reply.statusCode >= 400 && !hasRequestErrorLogged(request)) {
      request.log.warn({ ...context, payload }, 'Request completed with client error');
      return;
    }

    if (durationMs !== undefined && durationMs >= config.SLOW_REQUEST_MS) {
      request.log.warn({ ...context, payload }, 'Slow request completed');
      return;
    }

    if (shouldDebugRequest(request)) {
      request.log.debug({ ...context, payload }, 'Request completed');
    }
  });

  server.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      const statusCode = errorCodeToStatus(error.code);
      const logPayload = {
        ...getRequestLogContext(request),
        statusCode,
        code: error.code,
        details: sanitizeForLog(error.details),
        payload: getSafeRequestPayload(request),
      };
      markRequestErrorLogged(request);
      if (statusCode >= 500) {
        request.log.error(logPayload, 'API error');
      } else {
        request.log.warn(logPayload, 'API error');
      }
      reply
        .code(statusCode)
        .send({ code: error.code, message: error.message, details: error.details });
      return;
    }
    if (error instanceof ZodError) {
      const response = zodBetError(error);
      markRequestErrorLogged(request);
      request.log.warn(
        {
          ...getRequestLogContext(request),
          statusCode: 400,
          code: response.code,
          issues: sanitizeForLog(error.issues),
          payload: getSafeRequestPayload(request),
        },
        'Request validation failed',
      );
      reply.code(400).send(response);
      return;
    }
    const statusCode = error.statusCode ?? 500;
    markRequestErrorLogged(request);
    request.log.error(
      {
        err: error,
        ...getRequestLogContext(request),
        statusCode,
        payload: getSafeRequestPayload(request),
      },
      'Unhandled request error',
    );
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

  server.head('/', async (_request, reply) => {
    reply.code(204).send();
  });
  server.get('/', async () => ({ ok: true, env: config.NODE_ENV }));
  server.get('/api/health', async () => ({ ok: true, env: config.NODE_ENV }));
  server.get('/api/debug/client-build', async (request) => {
    const query = request.query as Record<string, unknown>;
    const debugRequested =
      query.slotDebug === '1' ||
      query['slot-debug'] === '1' ||
      request.headers['x-slot-debug'] === '1';
    const payload = {
      ok: true,
      slotDebugBuild: SLOT_DEBUG_BUILD,
      serviceWorkerCacheVersion: SLOT_DEBUG_SW_VERSION,
      serviceWorkerRegisterVersion: SLOT_DEBUG_BUILD,
      env: config.NODE_ENV,
      nodeVersion: process.version,
      serverTime: new Date().toISOString(),
      request: {
        id: request.id,
        userAgent: request.headers['user-agent'] ?? null,
        host: request.headers.host ?? null,
      },
    };
    if (debugRequested) {
      request.log.info({ payload }, '[slot-debug] client build debug requested');
    }
    return payload;
  });

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
  await server.register(blackjackRoutes, { prefix: '/api/games/blackjack' });
  await server.register(chickenRoadRoutes, { prefix: '/api/games/chicken-road' });
  await server.register(crashRoutes, { prefix: '/api/games/crash' });
  server.log.info('[crash] Solo crash API enabled; shared countdown rooms disabled');

  return server;
}
