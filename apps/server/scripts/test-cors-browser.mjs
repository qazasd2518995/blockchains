// Two local origins + the actual Fastify CORS options; no production writes.
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import cors from '@fastify/cors';
process.env.DATABASE_URL = 'postgresql://isolated:isolated@127.0.0.1:1/unused';
process.env.JWT_SECRET = 'isolated-browser-test-secret-not-used';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://127.0.0.1:5222';
const { corsOptions } = await import('../dist/cors.js');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP(
  process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9346',
);
const api = Fastify(),
  web = Fastify();
const observed = [];
try {
  await api.register(cors, corsOptions);
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'])
    api.route({
      method,
      url: '/api/admin/controls/fixture',
      handler: (req, reply) => {
        assert.equal(req.headers.authorization, 'Bearer isolated');
        observed.push(req.method);
        return reply.code(204).send();
      },
    });
  web.get('/', (_, reply) =>
    reply.type('text/html').send('<!doctype html><title>Isolated CORS check</title>'),
  );
  await api.listen({ host: '127.0.0.1', port: 5221 });
  await web.listen({ host: '127.0.0.1', port: 5222 });
  const context = await browser.newContext();
  await context.route('**/*', (route) =>
    ['http://127.0.0.1:5221', 'http://127.0.0.1:5222'].includes(
      new URL(route.request().url()).origin,
    )
      ? route.continue()
      : route.abort(),
  );
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5222');
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const status = await page.evaluate(
      async (method) =>
        (
          await fetch('http://127.0.0.1:5221/api/admin/controls/fixture', {
            method,
            credentials: 'include',
            headers: {
              Authorization: 'Bearer isolated',
              ...(method === 'DELETE' ? {} : { 'Content-Type': 'application/json' }),
            },
            ...(method === 'DELETE' ? {} : { body: '{}' }),
          })
        ).status,
      method,
    );
    assert.equal(status, 204);
  }
  assert.deepEqual(observed, ['POST', 'PATCH', 'PUT', 'DELETE']);
  console.log(
    'PASS: real browser cross-origin authenticated POST/PATCH/PUT/DELETE all reach Fastify',
  );
  await context.close();
} finally {
  await Promise.all([api.close(), web.close(), browser.close()]);
}
