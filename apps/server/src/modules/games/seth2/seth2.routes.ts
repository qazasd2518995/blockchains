import type { FastifyInstance } from 'fastify';
import { config } from '../../../config.js';
import { ApiError } from '../../../utils/errors.js';
import { isImportedGameAccessUsername } from '../_common/importedGameAccess.js';
import { seth2ProtocolSchema, seth2SourceSchema } from './seth2.schema.js';
import { Seth2Service } from './seth2.service.js';

interface Seth2RouteOptions {
  platformRealm?: 'legacy' | 'qmoney';
}

export async function seth2Routes(
  fastify: FastifyInstance,
  options: Seth2RouteOptions = {},
): Promise<void> {
  const service = new Seth2Service(fastify.prisma);
  const platformRealm = options.platformRealm ?? config.PLATFORM_REALM;
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request) => {
    if (!isImportedGameAccessUsername(request.authenticatedUsername, platformRealm)) {
      throw new ApiError('FORBIDDEN', '會員身份無法使用賽特 2');
    }
  });

  fastify.post('/session', async (request) => service.session(request.userId));
  fastify.post('/protocol', async (request) => {
    const body = seth2ProtocolSchema.parse(request.body);
    return service.protocol(request.userId, body);
  });
  fastify.post('/source', async (request) => {
    const body = seth2SourceSchema.parse(request.body);
    return service.source(request.userId, body);
  });
  fastify.get('/history', async (request) => service.history(request.userId));
}
