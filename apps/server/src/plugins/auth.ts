import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ApiError } from '../utils/errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    userId: string;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string };
    user: { sub: string; role: string };
  }
}

async function pluginFn(fastify: FastifyInstance): Promise<void> {
  fastify.decorate('authenticate', async (req: FastifyRequest, _reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      const tokenUser = (req as unknown as { user: { sub?: string } }).user;
      if (!tokenUser?.sub) throw new Error('missing sub');
      const user = await fastify.prisma.user.findUnique({
        where: { id: tokenUser.sub },
        select: { id: true, frozenAt: true, disabledAt: true },
      });
      if (!user || user.disabledAt) throw new Error('user disabled');
      if (
        user.frozenAt &&
        req.method !== 'GET' &&
        req.method !== 'HEAD' &&
        req.method !== 'OPTIONS'
      ) {
        throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
      }
      (req as unknown as { userId: string }).userId = user.id;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }
  });
}

export const authPlugin = fp(pluginFn, { name: 'auth', dependencies: ['prisma'] });
