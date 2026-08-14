import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/storm-of-seth-2-v115/src/seth2-local-adapter.js', import.meta.url),
);
const source = fs.readFileSync(adapterPath, 'utf8');
const values = new Map([
  ['bg-auth', JSON.stringify({ state: { accessToken: 'test-access', refreshToken: 'test-refresh' } })],
  ['bg.bgm.prefs', JSON.stringify({ muted: false, volume: 0.25 })],
  ['bg.sfx.prefs', JSON.stringify({ muted: true, volume: 0.75 })],
]);
class TestStorage {
  getItem(key) {
    return values.get(key) ?? null;
  }

  setItem(key, value) {
    values.set(key, value);
  }

  clear() {
    values.clear();
  }
}
const storage = new TestStorage();
const parentMessages = [];
const zeroTimers = [];
const requests = [];
const response = {
  status: 200,
  engine: { gameState: [{}] },
  platform: {
    player: {
      balance: { amount: 123.45 },
      settings: {
        advancedSettings: {
          sounds: { background: true, backgroundVolume: 1, effect: true, effectVolume: 1 },
        },
      },
    },
  },
};
const context = {
  URLSearchParams,
  AbortController,
  Storage: TestStorage,
  console,
  location: { origin: 'https://example.test', search: '' },
  localStorage: storage,
  parent: { localStorage: storage, postMessage: (message) => parentMessages.push(message) },
  addEventListener: () => {},
  setTimeout: (callback, delay) => {
    if (delay === 0) zeroTimers.push(callback);
    return 1;
  },
  clearTimeout: () => {},
  fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => structuredClone(response) };
  },
  io: { Manager: function Manager() {}, connect: function remoteConnect() {} },
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

storage.setItem('source-client-temporary-key', 'discard-me');
storage.clear();
assert.equal(storage.getItem('bg-auth')?.includes('test-access'), true);
assert.equal(storage.getItem('bg.bgm.prefs')?.includes('0.25'), true);
assert.equal(storage.getItem('bg.sfx.prefs')?.includes('0.75'), true);
assert.equal(storage.getItem('source-client-temporary-key'), null);

const { LocalSocket, applyAudioPreferences, publicError } =
  context.__YachiyoSeth2SourceAdapterTest;
assert.equal(typeof context.io.connect, 'function');
assert.equal(String(context.io.connect).includes('LocalSocket'), true);
assert.equal(typeof context.__YachiyoOriginalIo.Manager, 'function');
assert.equal(
  publicError({ code: 'INTERNAL', message: 'Invalid prisma.bet.create invocation' }, 'fallback'),
  '遊戲結算暫時失敗，請稍後再試',
);

const audioResponse = structuredClone(response);
applyAudioPreferences(audioResponse);
assert.equal(audioResponse.platform.player.settings.advancedSettings.sounds.backgroundVolume, 0.25);
assert.equal(audioResponse.platform.player.settings.advancedSettings.sounds.effect, false);
assert.equal(audioResponse.platform.player.settings.advancedSettings.sounds.effectVolume, 0);

const socket = new LocalSocket();
let connected = false;
socket.on('connect', () => {
  connected = true;
});
zeroTimers.shift()();
assert.equal(socket.connected, true);
assert.equal(connected, true);

const result = await new Promise((resolve) => {
  socket.emit('spin', { stakeValue: 1, ratioValue: 0.1 }, resolve);
});
assert.equal(result.status, 200);
assert.equal(requests[0].url, 'https://example.test/api/games/seth2/source');
assert.equal(requests[0].options.headers.Authorization, 'Bearer test-access');
const requestBody = JSON.parse(requests[0].options.body);
assert.equal(requestBody.event, 'spin');
assert.equal(requestBody.data.machineId, 1);
assert.equal(parentMessages.at(-1).type, 'seth2:balance');
assert.equal(parentMessages.at(-1).balance, 123.45);

socket.close();
assert.equal(socket.connected, false);
console.log('Seth2 v1.1.5 Socket.IO bridge and audio contract tests passed.');
