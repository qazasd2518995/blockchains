import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(webRoot, 'public', 'sw.js'), 'utf8');
const listeners = new Map();
let claimCount = 0;
let matchAllCount = 0;
let networkFetchCount = 0;
const deletedCaches = [];
const cachedGameResponse = { source: 'game-cache' };

const context = {
  URL,
  console: { info() {} },
  fetch: async () => {
    networkFetchCount += 1;
    throw new Error('cached game assets must not reach the network');
  },
  caches: {
    async keys() {
      return ['yachiyo-assets-v7-access-refresh-20260817:images', 'unrelated-cache'];
    },
    async delete(key) {
      deletedCaches.push(key);
      return true;
    },
    async open() {
      return {
        async match() {
          return cachedGameResponse;
        },
      };
    },
  },
  self: {
    location: { origin: 'https://example.test' },
    skipWaiting() {},
    clients: {
      async claim() {
        claimCount += 1;
      },
      async matchAll() {
        matchAllCount += 1;
        return [
          {
            async navigate() {
              throw new Error('activate must never navigate a client');
            },
          },
        ];
      },
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  },
};

vm.runInNewContext(source, context, { filename: 'sw.js' });

const activate = listeners.get('activate');
assert.equal(typeof activate, 'function', 'service worker must register an activate handler');

let activationWork;
activate({
  waitUntil(work) {
    activationWork = Promise.resolve(work);
  },
});

await activationWork;

assert.equal(claimCount, 1, 'activation should claim existing clients');
assert.equal(matchAllCount, 0, 'activation must not enumerate clients for forced navigation');
assert.deepEqual(deletedCaches, ['yachiyo-assets-v7-access-refresh-20260817:images']);
assert.doesNotMatch(source, /\.navigate\s*\(/, 'activation must not navigate or reload a page');
assert.match(source, /GAME_CACHE/, 'service worker should maintain a separate game asset cache');
assert.match(
  source,
  /cacheFirst\(request, GAME_CACHE, GAME_MAX_ENTRIES, event\)/,
  'repeat game visits should reuse immutable assets without a competing background download',
);
assert.match(source, /staleWhileRevalidate/, 'general lobby images should still refresh safely');
assert.match(
  source,
  /request\.headers\.get\('range'\)/,
  'partial media responses must not be stored as complete game assets',
);

const fetchHandler = listeners.get('fetch');
assert.equal(typeof fetchHandler, 'function', 'service worker must register a fetch handler');
let gameResponseWork;
fetchHandler({
  request: {
    method: 'GET',
    url: 'https://example.test/games/storm-of-seth-2-v115/assets/g1005/native/a.png',
    destination: 'image',
    headers: { get: () => null },
  },
  respondWith(work) {
    gameResponseWork = Promise.resolve(work);
  },
  waitUntil() {},
});
assert.equal(await gameResponseWork, cachedGameResponse);
assert.equal(networkFetchCount, 0, 'a cached game asset must not be re-downloaded in the background');

console.log('Service worker activation test passed.');
