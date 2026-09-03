import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverScript = fileURLToPath(new URL('../../../scripts/railway-static.mjs', import.meta.url));
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'bg-static-route-'));
const sourceRoot = path.join(fixtureRoot, 'games', 'storm-of-seth-2');
let child;

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  const { port } = address;
  server.close();
  await once(server, 'close');
  return port;
}

async function waitUntilReady(url) {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw lastError ?? new Error('static server did not become ready');
}

try {
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(path.join(fixtureRoot, 'index.html'), '<title>PLATFORM_SPA</title>');
  await writeFile(path.join(sourceRoot, 'index.html'), '<title>SOURCE_ENGINE</title>');
  await writeFile(path.join(sourceRoot, 'engine.js'), 'globalThis.sourceEngine = true;');

  const port = await reservePort();
  child = spawn(process.execPath, [serverScript, fixtureRoot, 'index.html'], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitUntilReady(`${baseUrl}/healthz`);

  for (const playerRoute of ['/games/storm-of-seth-2', '/games/storm-of-seth-2/']) {
    const response = await fetch(`${baseUrl}${playerRoute}`, {
      headers: { Accept: 'text/html' },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /PLATFORM_SPA/);
    assert.equal(response.headers.get('cache-control'), 'no-store, no-cache, must-revalidate');
  }

  const sourceDocument = await fetch(`${baseUrl}/games/storm-of-seth-2/index.html`);
  assert.equal(sourceDocument.status, 200);
  assert.match(await sourceDocument.text(), /SOURCE_ENGINE/);

  const sourceAsset = await fetch(`${baseUrl}/games/storm-of-seth-2/engine.js`);
  assert.equal(sourceAsset.status, 200);
  assert.match(await sourceAsset.text(), /sourceEngine/);

  const missingAsset = await fetch(`${baseUrl}/games/storm-of-seth-2/missing.js`);
  assert.equal(missingAsset.status, 404);
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  await rm(fixtureRoot, { recursive: true, force: true });
}

console.log('railway static route tests passed');
