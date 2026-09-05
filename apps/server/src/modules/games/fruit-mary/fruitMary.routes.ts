import type { FastifyInstance } from 'fastify';
import {
  fruitMaryGambleSchema,
  fruitMaryHistorySchema,
  fruitMarySpinSchema,
} from './fruitMary.schema.js';
import { FruitMaryService } from './fruitMary.service.js';

export async function fruitMaryRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new FruitMaryService(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/session', async (request) => service.session(request.userId));
  fastify.get('/room', async (request) => service.room(request.userId));
  fastify.post('/authorize', async (request) => service.authorize(request.userId));
  fastify.post('/noop', async (request) => service.noop(request.userId));
  fastify.post('/disabled', async (request) => service.disabled(request.userId));
  fastify.post('/spin', async (request) =>
    service.spin(request.userId, fruitMarySpinSchema.parse(request.body)),
  );
  fastify.post('/gamble', async (request) =>
    service.gamble(request.userId, fruitMaryGambleSchema.parse(request.body)),
  );
  // Separate paths keep new-client retries safe during a rolling deployment:
  // an older API must return 404, never silently strip operationId and bet twice.
  fastify.post('/operations/spin', async (request) =>
    service.spin(
      request.userId,
      fruitMarySpinSchema.required({ operationId: true }).parse(request.body),
    ),
  );
  fastify.post('/operations/gamble', async (request) =>
    service.gamble(
      request.userId,
      fruitMaryGambleSchema.required({ operationId: true }).parse(request.body),
    ),
  );
  fastify.post('/history', async (request) =>
    service.history(request.userId, fruitMaryHistorySchema.parse(request.body ?? {})),
  );
}
