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
      const user = (req as unknown as { user: { sub?: string } }).user;
      if (!user?.sub) throw new Error('missing sub');
      (req as unknown as { userId: string }).userId = user.sub;
    } catch {
      throw new ApiError('UNAUTHORIZED', 'Authentication required');
    }
  });
}

export const authPlugin = fp(pluginFn, { name: 'auth', dependencies: [] });
