import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { ApiError } from '../utils/errors.js';
import { isImportedGameAccessUsername } from '../modules/games/_common/importedGameAccess.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
    authenticatedUsername: string;
    authenticatedFrozen: boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string; sid?: string };
    user: { sub: string; role: string; sid?: string };
  }
}

export function isGameplayRequestAllowedForRealm(
  requestUrl: string,
  username: string | null | undefined,
  realm: 'legacy' | 'qmoney',
): boolean {
  const requestPath = requestUrl.split('?')[0] || '';
  const isGameplayRequest =
    requestPath.startsWith('/api/games/') && requestPath !== '/api/games/catalog';
  return realm !== 'qmoney' || !isGameplayRequest || isImportedGameAccessUsername(username, realm);
}

async function pluginFn(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      const tokenUser = (req as unknown as { user: { sub?: string; sid?: string } }).user;
      if (!tokenUser?.sub) throw new Error('missing sub');
      const user = await fastify.prisma.user.findUnique({
        where: { id: tokenUser.sub },
        select: {
          id: true,
          username: true,
          frozenAt: true,
          disabledAt: true,
          activeSessionId: true,
        },
      });
      if (!user || user.disabledAt) throw new Error('user disabled');
      if (user.activeSessionId && user.activeSessionId !== tokenUser.sid) {
        throw new ApiError(
          'SESSION_REPLACED',
          'Logged out because this account signed in on another device',
        );
      }
      if (
        user.frozenAt &&
        req.method !== 'GET' &&
        req.method !== 'HEAD' &&
        req.method !== 'OPTIONS'
      ) {
        throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
      }
      if (
        !isGameplayRequestAllowedForRealm(req.raw.url || '', user.username, config.PLATFORM_REALM)
      ) {
        throw new ApiError('FORBIDDEN', 'This member account cannot access games');
      }
      const authenticatedRequest = req as unknown as {
        userId: string;
        authenticatedUsername: string;
        authenticatedFrozen: boolean;
      };
      authenticatedRequest.userId = user.id;
      authenticatedRequest.authenticatedUsername = user.username;
      authenticatedRequest.authenticatedFrozen = Boolean(user.frozenAt);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }
  });
}

export const authPlugin = fp(pluginFn, { name: 'auth', dependencies: ['prisma'] });
