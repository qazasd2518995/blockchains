import type { FastifyInstance } from 'fastify';
import { seth2ProtocolSchema, seth2SourceSchema } from './seth2.schema.js';
import { Seth2Service } from './seth2.service.js';

export async function seth2Routes(fastify: FastifyInstance): Promise<void> {
  const service = new Seth2Service(fastify.prisma);
  fastify.addHook('preHandler', fastify.authenticate);

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
