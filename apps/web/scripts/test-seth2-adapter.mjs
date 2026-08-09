import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/storm-of-seth-2/seth2-adapter.js', import.meta.url),
);
const source = fs.readFileSync(adapterPath, 'utf8');
const storage = { getItem: () => null, setItem: () => {} };
const context = {
  URLSearchParams,
  console,
  location: { origin: 'https://example.test', search: '' },
  localStorage: storage,
  parent: { localStorage: storage, postMessage: () => {} },
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

const { publicGameError } = context.__YachiyoSeth2AdapterTest;
assert.equal(
  publicGameError(
    {
      code: 'INTERNAL',
      message: 'Invalid `prisma.bet.create()` invocation: Error occurred during query execution',
    },
    'fallback',
  ),
  '遊戲結算暫時失敗，請稍後再試',
);
assert.equal(
  publicGameError({ message: 'ConnectorError: PostgreSQL failure' }, 'fallback'),
  '遊戲結算暫時失敗，請稍後再試',
);
assert.equal(publicGameError({ message: '餘額不足' }, 'fallback'), '餘額不足');

console.log('Seth2 adapter public error contract tests passed.');
