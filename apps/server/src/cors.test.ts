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
    expect(response.headers['access-control-max-age']).toBe(String(CORS_PREFLIGHT_MAX_AGE_SECONDS));
  });

  it.each(['DELETE', 'PATCH', 'PUT', 'POST'])(
    'allows authenticated admin %s preflights',
    async (method) => {
      const server = Fastify();
      servers.push(server);
      await server.register(cors, corsOptions);
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/api/admin/controls/manual-detection/fixture',
        headers: {
          origin: config.CORS_ORIGIN[0]!,
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(String(response.headers['access-control-allow-methods']).split(/,\s*/)).toContain(
        method,
      );
      expect(response.headers['access-control-allow-origin']).toBe(config.CORS_ORIGIN[0]);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-headers']).toBe('authorization,content-type');
    },
  );

  it('does not grant cross-origin access to an untrusted admin site', async () => {
    const server = Fastify();
    servers.push(server);
    await server.register(cors, corsOptions);
    const response = await server.inject({
      method: 'OPTIONS',
      url: '/api/admin/controls/fixture',
      headers: {
        origin: 'https://untrusted.invalid',
        'access-control-request-method': 'DELETE',
      },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
