import type { FastifyInstance } from 'fastify';
import { ApiError } from '../../../utils/errors.js';
import { isImportedGameAccessUsername } from '../_common/importedGameAccess.js';
import {
  thor2FeatureCompleteSchema,
  thor2FeatureProgressSchema,
  thor2SpinSchema,
} from './thor2.schema.js';
import { Thor2Service } from './thor2.service.js';

export async function thor2Routes(fastify: FastifyInstance): Promise<void> {
  const service = new Thor2Service(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);
  fastify.addHook('preHandler', async (request) => {
    if (!isImportedGameAccessUsername(request.authenticatedUsername)) {
      throw new ApiError('FORBIDDEN', '雷神之錘 2 目前僅開放指定測試帳號');
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
