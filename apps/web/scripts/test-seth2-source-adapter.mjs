import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/storm-of-seth-2-v115/src/seth2-local-adapter.js', import.meta.url),
);
const source = fs.readFileSync(adapterPath, 'utf8');
assert.equal(source.includes('yachiyo-seth2-entry-gate'), false);
assert.equal(source.includes('audio.getAudioInfo()'), false);
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
let testNow = 1_000;
class TestDate extends Date {
  static now() {
    return testNow;
  }
}
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
  Date: TestDate,
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
  requestAnimationFrame: (callback) => {
    zeroTimers.push(callback);
    return 1;
  },
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
  findIntroView,
  bindGameCanvasRecovery,
  gameCanvasIsReady,
  guardGameViewClass,
  isGameEntryTransitionReady,
  normalizeUpdateSettings,
  patchRotateScreenButtons,
  requestViewMode,
  disposeGameForRemount,
  syncRunningAudioWhenReady,
  watchOriginalGameEntry,
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

let introTouchStarts = 0;
const introView = {
  node: { name: 'IntroView' },
  bbr: {
    emit: () => {
      introTouchStarts += 1;
    },
  },
  startGame: {},
};
let originalRotateRuns = 0;
const rotateScreenButton = {
  rotateScreenHandler: () => {
    originalRotateRuns += 1;
  },
  showConfirmAlert: () => {},
};
let gamePaused = false;
let directorPaused = false;
context.cc = {
  Component: function Component() {},
  Node: { EventType: { TOUCH_START: 'touch-start' } },
  game: {
    pause: () => {
      gamePaused = true;
    },
  },
  director: {
    getScene: () => ({ getComponentsInChildren: () => [introView, rotateScreenButton] }),
    pause: () => {
      directorPaused = true;
    },
  },
};
context.App = {
  gameLoading: {
    loadTotal: 25,
    loadedNum: 24,
    percentText: { string: '96%' },
    node: { active: true },
  },
  gameView: {
    node: { active: false, activeInHierarchy: false },
    slotUIMap: new Map([
      ['InfoBarP', {}],
      ['SpinBarP', {}],
      ['TopBarP', {}],
      ['PrizeNotify', {}],
    ]),
    gameLayer: {
      children: ['BackgroundView', 'ReelView', 'SymbolView'].map((name) => ({
        name,
        active: true,
        activeInHierarchy: true,
      })),
    },
  },
  globalAudio: { audioData: null },
};
const audioState = {
  musicVolume: 1,
  effectVolume: 1,
  isMusicOn: false,
  isEffectOn: true,
};
context.App.globalAudio.audioData = {
  setMusicVolume: (value) => {
    audioState.musicVolume = value;
  },
  setEffectVolume: (value) => {
    audioState.effectVolume = value;
  },
  setMusicStatus: (value) => {
    audioState.isMusicOn = value;
  },
  setEffectStatus: (value) => {
    audioState.isEffectOn = value;
  },
};
const gameCanvasListeners = new Map();
const gameCanvas = {
  width: 720,
  height: 1280,
  addEventListener: (type, listener) => gameCanvasListeners.set(type, listener),
  getContext: () => {
    throw new Error('entry readiness must not reacquire a mobile WebGL context');
  },
};
context.document = {
  getElementById: (id) => {
    if (id === 'GameCanvas') return gameCanvas;
    return null;
  },
};
assert.equal(findIntroView(), introView);
parentMessages.length = 0;
assert.equal(patchRotateScreenButtons(), true);
assert.equal(rotateScreenButton.__yachiyoViewModeBridge, true);
assert.equal(rotateScreenButton.rotateScreenHandler(), true);
assert.equal(originalRotateRuns, 0, 'source rotate handler must not reload the iframe directly');
assert.deepEqual(structuredClone(parentMessages.at(-1)), {
  type: 'seth2:view-mode-request',
  viewMode: 'portrait',
});
assert.equal(requestViewMode('invalid'), false);
assert.equal(bindGameCanvasRecovery(), true);
assert.equal(context.__YachiyoSeth2UnlockAudio(), false);
assert.equal(audioState.musicVolume, 1, 'audio bridge waits until the game view exists');

// Cocos activates GameView before GameView.init() builds its four UI layers.
// That state must not count as a fully entered game.
const readySlotUIMap = context.App.gameView.slotUIMap;
context.App.gameLoading.node.active = false;
context.App.gameView.node.active = true;
context.App.gameView.node.activeInHierarchy = true;
context.App.gameView.slotUIMap = new Map();
assert.equal(isGameEntryTransitionReady(), false);
context.App.gameLoading.node.active = true;
context.App.gameView.node.active = false;
context.App.gameView.node.activeInHierarchy = false;
context.App.gameView.slotUIMap = readySlotUIMap;

parentMessages.length = 0;
watchOriginalGameEntry();
assert.equal(parentMessages.at(-1).type, 'seth2:intro-ready');
assert.equal(introTouchStarts, 0, 'adapter must not synthesize the original IntroView touch');
assert.equal(
  context.document.getElementById('yachiyo-seth2-entry-gate'),
  null,
  'the purple DOM entry gate is not created',
);

context.App.gameLoading.node.active = false;
context.App.gameView.node.active = true;
context.App.gameView.node.activeInHierarchy = true;
watchOriginalGameEntry();
assert.equal(gameCanvasIsReady(), true);
assert.equal(isGameEntryTransitionReady(), true);
assert.equal(parentMessages.at(-1).type, 'seth2:entered');
assert.equal(syncRunningAudioWhenReady(), true);
assert.equal(audioState.musicVolume, 0.25);
assert.equal(audioState.effectVolume, 0);
assert.equal(audioState.isMusicOn, true);
assert.equal(audioState.isEffectOn, false);
let preventedContextLoss = false;
gameCanvasListeners.get('webglcontextlost')({
  preventDefault: () => {
    preventedContextLoss = true;
  },
});
assert.equal(preventedContextLoss, true);
assert.equal(gameCanvasIsReady(), false);
assert.equal(isGameEntryTransitionReady(), false);
assert.equal(parentMessages.at(-1).type, 'seth2:error');
gameCanvasListeners.get('webglcontextrestored')();
assert.equal(gameCanvasIsReady(), true);

let lostWebGlContext = false;
gameCanvas.getContext = () => ({
  getExtension: (name) =>
    name === 'WEBGL_lose_context'
      ? {
          loseContext: () => {
            lostWebGlContext = true;
          },
        }
      : null,
});
parentMessages.length = 0;
assert.equal(disposeGameForRemount(), true);
assert.equal(gamePaused, true);
assert.equal(directorPaused, true);
assert.equal(lostWebGlContext, true);
zeroTimers.shift()();
assert.equal(parentMessages.at(-1).type, 'seth2:disposed');
assert.equal(disposeGameForRemount(), false, 'disposal is idempotent');

assert.deepEqual(
  structuredClone(
    normalizeUpdateSettings({
      request: 'updateSettings',
      type: 'game',
      data: { turbo: true, stakeIndex: 3, unsupportedSourceFlag: true },
    }),
  ),
  { type: 'game', data: { turbo: true, stakeIndex: 3 } },
);

function GuardedGameView() {}
let guardedInitializations = 0;
GuardedGameView.prototype.init = function () {
  guardedInitializations += 1;
};
assert.equal(guardGameViewClass(GuardedGameView), true);
const guardedView = new GuardedGameView();
guardedView.init();
assert.equal(guardedInitializations, 1);
assert.equal(guardedView.__yachiyoInitializationStatus, 'ready');
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
  socket.emit(
    'updateSettings',
    {
      request: 'updateSettings',
      type: 'game',
      data: { turbo: true, unsupportedSourceFlag: true },
    },
    resolve,
  );
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
