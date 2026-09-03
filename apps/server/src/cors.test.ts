import Fastify from 'fastify';
import cors from '@fastify/cors';
import { afterEach, describe, expect, it } from 'vitest';

import { config } from './config.js';
import { CORS_PREFLIGHT_MAX_AGE_SECONDS, corsOptions } from './cors.js';

describe('CORS preflight caching', () => {
  const servers: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
  });

  it('allows the browser to reuse a successful game API preflight', async () => {
    const server = Fastify();
    servers.push(server);
    await server.register(cors, corsOptions);
    server.post('/api/games/probe/spin', async () => ({ ok: true }));

    const response = await server.inject({
      method: 'OPTIONS',
      url: '/api/games/probe/spin',
      headers: {
        origin: config.CORS_ORIGIN[0]!,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-max-age']).toBe(
      String(CORS_PREFLIGHT_MAX_AGE_SECONDS),
    );
  });
});
