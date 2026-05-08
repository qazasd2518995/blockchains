import { PrismaClient } from '@prisma/client';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const DEFAULT_CONNECT_ATTEMPTS = 8;
const DEFAULT_CONNECT_RETRY_MS = 2000;

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function connectWithRetry(prisma: PrismaClient, fastify: FastifyInstance): Promise<void> {
  const attempts = positiveInt(process.env.DB_CONNECT_ATTEMPTS, DEFAULT_CONNECT_ATTEMPTS);
  const retryMs = positiveInt(process.env.DB_CONNECT_RETRY_MS, DEFAULT_CONNECT_RETRY_MS);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await prisma.$connect();
      if (attempt > 1) {
        fastify.log.info({ attempt, attempts }, 'Database connection established after retry');
      }
      return;
    } catch (err) {
      if (attempt === attempts) {
        fastify.log.error({ err, attempts }, 'Database connection failed after all retries');
        throw err;
      }

      const retryInMs = Math.min(retryMs * attempt, 10000);
      fastify.log.warn({ err, attempt, attempts, retryInMs }, 'Database connection failed; retrying');
      await wait(retryInMs);
    }
  }
}

async function pluginFn(fastify: FastifyInstance): Promise<void> {
  const prisma = new PrismaClient({
    log: fastify.log.level === 'debug' ? ['query', 'error', 'warn'] : ['error'],
  });
  try {
    await connectWithRetry(prisma, fastify);
  } catch (err) {
    await prisma.$disconnect().catch(() => undefined);
    throw err;
  }
  fastify.decorate('prisma', prisma);
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export const prismaPlugin = fp(pluginFn, { name: 'prisma' });
