import { buildServer } from './server.js';
import { config } from './config.js';

async function main(): Promise<void> {
  const server = await buildServer();

  try {
    await server.listen({ port: config.PORT, host: config.HOST });
    server.log.info(`🚀 Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

void main();
