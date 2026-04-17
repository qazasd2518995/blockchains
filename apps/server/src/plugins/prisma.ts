import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

async function pluginFn(fastify: FastifyInstance): Promise<void> {
  const prisma = new PrismaClient({
    log: fastify.log.level === 'debug' ? ['query', 'error', 'warn'] : ['error'],
  });
  await prisma.$connect();
  fastify.decorate('prisma', prisma);
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export const prismaPlugin = fp(pluginFn, { name: 'prisma' });
