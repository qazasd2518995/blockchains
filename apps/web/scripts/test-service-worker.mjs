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
const deletedCaches = [];

const context = {
  URL,
  console: { info() {} },
  fetch: async () => {
    throw new Error('fetch is not expected during activation');
  },
  caches: {
    async keys() {
      return ['yachiyo-assets-v7-access-refresh-20260817:images', 'unrelated-cache'];
    },
    async delete(key) {
      deletedCaches.push(key);
      return true;
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

console.log('Service worker activation test passed.');
