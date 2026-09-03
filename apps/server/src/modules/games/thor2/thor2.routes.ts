import type { FastifyInstance } from 'fastify';
import { config } from '../../../config.js';
import { ApiError } from '../../../utils/errors.js';
import { isImportedGameAccessUsername } from '../_common/importedGameAccess.js';
import {
  thor2FeatureCompleteSchema,
  thor2FeatureProgressSchema,
  thor2SpinSchema,
} from './thor2.schema.js';
import { Thor2Service } from './thor2.service.js';

interface Thor2RouteOptions {
  platformRealm?: 'legacy' | 'qmoney';
}

export async function thor2Routes(
  fastify: FastifyInstance,
  options: Thor2RouteOptions = {},
): Promise<void> {
  const service = new Thor2Service(fastify.prisma);
  const platformRealm = options.platformRealm ?? config.PLATFORM_REALM;
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request) => {
    if (!isImportedGameAccessUsername(request.authenticatedUsername, platformRealm)) {
      throw new ApiError('FORBIDDEN', '會員身份無法使用雷神之錘 2');
    }
  });

  fastify.get('/session', async (request) => service.session(request.userId));
  fastify.post('/spin', async (request) =>
    service.spin(request.userId, thor2SpinSchema.parse(request.body)),
  );
  fastify.post('/feature/progress', async (request) => {
    const input = thor2FeatureProgressSchema.parse(request.body);
    return service.updateProgress(request.userId, input.betId, input.cursor);
  });
  fastify.post('/feature/complete', async (request) => {
    const input = thor2FeatureCompleteSchema.parse(request.body);
    return service.complete(request.userId, input.betId);
  });
  fastify.get('/history', async (request) => service.history(request.userId));
}
