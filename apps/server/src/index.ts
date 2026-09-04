import { buildServer } from './server.js';
import { config } from './config.js';
import { cleanupExpiredAuthTokens } from './utils/tokenCleanup.js';

const AUTH_TOKEN_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const server = await buildServer();

  try {
    await server.listen({ port: config.PORT, host: config.HOST });
    server.log.info(`🚀 Server listening on http://${config.HOST}:${config.PORT}`);
    const cleanup = async () => {
      try {
        const removed = await cleanupExpiredAuthTokens(server.prisma);
        if (removed.memberTokens > 0 || removed.adminTokens > 0) {
          server.log.info({ removed }, 'Expired authentication tokens removed');
        }
      } catch (error) {
        server.log.warn({ err: error }, 'Expired authentication token cleanup failed');
      }
    };
    void cleanup();
    setInterval(() => void cleanup(), AUTH_TOKEN_CLEANUP_INTERVAL_MS).unref();
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

void main();
