import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/storm-of-seth-2-v115/src/seth2-local-adapter.js', import.meta.url),
);
const source = fs.readFileSync(adapterPath, 'utf8');
const values = new Map([
  [
    'bg-auth',
    JSON.stringify({ state: { accessToken: 'test-access', refreshToken: 'test-refresh' } }),
  ],
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
const longTimers = [];
const requests = [];
const responseQueue = [];
const response = {
  status: 200,
  engine: { gameState: [{}] },
  platform: {
    jackpotPools: {
      'jp-mini': 1600.01,
      'jp-minor': 13000.02,
      'jp-major': 70000.03,
      'jp-grand': 200000.04,
    },
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
  sessionStorage: storage,
  parent: { localStorage: storage, postMessage: (message) => parentMessages.push(message) },
  addEventListener: () => {},
  setTimeout: (callback, delay) => {
    if (delay === 0) zeroTimers.push(callback);
    else longTimers.push({ callback, delay });
    return 1;
  },
  clearTimeout: () => {},
  fetch: async (url, options) => {
    requests.push({ url, options });
    const nextResponse = responseQueue.length > 0 ? responseQueue.shift() : response;
    return { ok: true, status: 200, json: async () => structuredClone(nextResponse) };
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

const {
  LocalSocket,
  applyAudioPreferences,
  prefetchInitialResponse,
  publicError,
  guardBigwinClass,
  wrapFrameworkDispatch,
} = context.__YachiyoSeth2SourceAdapterTest;
assert.equal(typeof context.io.connect, 'function');
assert.equal(String(context.io.connect).includes('LocalSocket'), true);
assert.equal(typeof context.__YachiyoOriginalIo.Manager, 'function');
assert.equal(
  publicError({ code: 'INTERNAL', message: 'Invalid prisma.bet.create invocation' }, 'fallback'),
  '遊戲結算暫時失敗，請稍後再試',
);

let zeroTotalWinCompletions = 0;
let dispatchedZeroTotalWin;
const guardedDispatch = wrapFrameworkDispatch((_eventName, event) => {
  dispatchedZeroTotalWin = event;
});
guardedDispatch('SlotFrameworkEvent:UPDATE_TOTAL_WINNINGS', {
  data: { value: 0, needComplete: true },
  complete: () => {
    zeroTotalWinCompletions += 1;
  },
});
assert.equal(zeroTotalWinCompletions, 0);
zeroTimers.shift()();
assert.equal(zeroTotalWinCompletions, 1);

let originalBigwinCloses = 0;
let completedBigwins = 0;
function BigwinView() {
  this.showWinStatus = 2;
  this.completedCB = () => {
    completedBigwins += 1;
    this.showWinStatus = 4;
    this.onClose();
  };
}
BigwinView.prototype.onClose = function () {
  originalBigwinCloses += 1;
};
BigwinView.prototype.showBigwin = function () {};
assert.equal(guardBigwinClass(BigwinView), true);
const manuallyClosedBigwin = new BigwinView();
manuallyClosedBigwin.onClose();
assert.equal(completedBigwins, 1);
assert.equal(originalBigwinCloses, 1);

const watchedBigwin = new BigwinView();
watchedBigwin.showBigwin();
const watchdog = longTimers.find((timer) => timer.delay === 35000);
assert.ok(watchdog);
watchdog.callback();
assert.equal(completedBigwins, 2);
assert.equal(originalBigwinCloses, 2);
dispatchedZeroTotalWin.complete();
assert.equal(zeroTotalWinCompletions, 1);

const audioResponse = structuredClone(response);
applyAudioPreferences(audioResponse);
assert.equal(audioResponse.platform.player.settings.advancedSettings.sounds.backgroundVolume, 0.25);
assert.equal(audioResponse.platform.player.settings.advancedSettings.sounds.effect, false);
assert.equal(audioResponse.platform.player.settings.advancedSettings.sounds.effectVolume, 0);

const socket = new LocalSocket();
let connected = false;
let latestJackpotNotification;
socket.on('connect', () => {
  connected = true;
});
socket.on('notify', (notification) => {
  if (notification.type === 'jackpotUpdate') latestJackpotNotification = notification;
});
zeroTimers.shift()();
assert.equal(socket.connected, true);
assert.equal(connected, true);

const requestCountBeforeInitial = requests.length;
prefetchInitialResponse();
const initialResult = await new Promise((resolve) => {
  socket.emit('initial', {}, resolve);
});
assert.equal(initialResult.status, 200);
assert.equal(requests.length - requestCountBeforeInitial, 1);
assert.equal(JSON.parse(requests.at(-1).options.body).event, 'initial');
assert.equal(parentMessages.at(-1).type, 'seth2:ready');
assert.equal(latestJackpotNotification.type, 'jackpotUpdate');
assert.deepEqual(structuredClone(latestJackpotNotification.data), response.platform.jackpotPools);
requests.length = 0;
parentMessages.length = 0;

const result = await new Promise((resolve) => {
  socket.emit('spin', { stakeValue: 1, ratioValue: 0.1 }, resolve);
});
assert.equal(result.status, 200);
assert.equal(requests[0].url, 'https://example.test/api/games/seth2/source');
assert.equal(requests[0].options.headers.Authorization, 'Bearer test-access');
const requestBody = JSON.parse(requests[0].options.body);
assert.equal(requestBody.event, 'spin');
assert.equal(requestBody.data.machineId, 1);
assert.equal(typeof requestBody.data.operationId, 'string');
assert.ok(requestBody.data.operationId.length >= 16);
assert.equal(parentMessages.at(-1).type, 'seth2:balance');
assert.equal(parentMessages.at(-1).balance, 123.45);

await new Promise((resolve) => {
  socket.emit('updateSettings', { type: 'game', data: { turbo: true } }, resolve);
});
const settingsRequest = JSON.parse(requests.at(-1).options.body);
assert.deepEqual(settingsRequest, {
  event: 'updateSettings',
  data: { settings: { type: 'game', data: { turbo: true } } },
});

responseQueue.push(
  {
    ...structuredClone(response),
    engine: {
      spinId: 'feature-entry',
      gameState: [
        {
          spinId: 'feature-entry',
          action: 'spin',
          startFreeGame: true,
          freeGameCount: 2,
          currentView: 0,
          totalViews: 1,
        },
      ],
    },
  },
  {
    ...structuredClone(response),
    engine: {
      spinId: 'free-2',
      gameState: [
        {
          spinId: 'free-1',
          action: 'freeSpin',
          startFreeGame: false,
          freeGameCount: 1,
          currentView: 0,
          totalViews: 1,
        },
        {
          spinId: 'free-2',
          action: 'freeSpin',
          startFreeGame: false,
          freeGameCount: 0,
          currentView: 0,
          totalViews: 1,
        },
      ],
    },
  },
);
const requestCountBeforeFeature = requests.length;
const featureResult = await new Promise((resolve) => {
  socket.emit(
    'spin',
    { spinId: 'feature-entry', stakeIndex: 0, stakeValue: 1, ratioIndex: 0, ratioValue: 0.1 },
    resolve,
  );
});
assert.equal(requests.length - requestCountBeforeFeature, 2);
assert.equal(featureResult.engine.gameState.length, 3);
assert.deepEqual(
  featureResult.engine.gameState.map((state) => [
    state.currentView,
    state.totalViews,
    state.startFreeGame,
    state.freeGameCount,
  ]),
  [
    [0, 3, true, 2],
    [1, 3, false, 1],
    [2, 3, false, 0],
  ],
);
const prefetchedRequest = JSON.parse(requests.at(-1).options.body);
assert.equal(prefetchedRequest.event, 'collectFeatureSequence');
assert.equal(prefetchedRequest.data.sequenceId, 'feature-entry');
assert.equal(prefetchedRequest.data.stakeValue, undefined);
assert.equal(prefetchedRequest.data.ratioValue, undefined);

socket.close();
assert.equal(socket.connected, false);
console.log('Seth2 v1.1.5 Socket.IO bridge and audio contract tests passed.');
