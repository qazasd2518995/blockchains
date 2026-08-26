import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/storm-of-seth-2-v115/src/seth2-local-adapter.js', import.meta.url),
);
const source = fs.readFileSync(adapterPath, 'utf8');
const shellSource = fs.readFileSync(
  fileURLToPath(new URL('../src/pages/games/Seth2Page.tsx', import.meta.url)),
  'utf8',
);
assert.equal(source.includes('yachiyo-seth2-entry-gate'), false);
assert.equal(source.includes('audio.getAudioInfo()'), false);
assert.equal(source.includes("['pointerdown', 'touchend', 'mouseup', 'keydown']"), true);
assert.equal(source.includes('resumeCapturedAudioContexts();'), true);
assert.equal(shellSource.includes("type: 'seth2:shell-capabilities'"), true);
assert.equal(shellSource.includes("payload.type === 'seth2:table-change-request'"), true);
assert.equal(shellSource.includes("payload.type === 'seth2:recovery-request'"), true);
assert.equal(
  shellSource.includes("requestIframeRemount(currentViewModeRef.current, 'recovery')"),
  true,
);
assert.equal(shellSource.includes('MAX_AUTOMATIC_RECOVERIES = 2'), true);
assert.equal(
  shellSource.includes("requestIframeRemount(currentViewModeRef.current, 'table')"),
  true,
);
assert.equal(shellSource.includes("query.set('table', '1')"), true);
assert.equal(shellSource.includes('setTableSelectionConfirmed(true)'), true);
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

  removeItem(key) {
    values.delete(key);
  }

  clear() {
    values.clear();
  }
}
const storage = new TestStorage();
const parentMessages = [];
const zeroTimers = [];
const longTimers = [];
const windowListeners = new Map();
const requests = [];
const responseQueue = [];
let audioContextResumeCount = 0;
class TestAudioContext {
  constructor() {
    this.state = 'suspended';
  }

  resume() {
    audioContextResumeCount += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}
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
  AudioContext: TestAudioContext,
  parent: { localStorage: storage, postMessage: (message) => parentMessages.push(message) },
  addEventListener: (type, listener) => windowListeners.set(type, listener),
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
const capturedAudioContext = new context.AudioContext();
assert.equal(capturedAudioContext instanceof TestAudioContext, true);

storage.setItem('source-client-temporary-key', 'discard-me');
storage.clear();
assert.equal(storage.getItem('bg-auth')?.includes('test-access'), true);
assert.equal(storage.getItem('bg.bgm.prefs')?.includes('0.25'), true);
assert.equal(storage.getItem('bg.sfx.prefs')?.includes('0.75'), true);
assert.equal(storage.getItem('source-client-temporary-key'), null);

const {
  LocalSocket,
  advanceActiveSpinProgress,
  applyStoredResumeProgress,
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
  machineReferenceStats,
  machineHasSimulatedPlayer,
  repairTerminalFemaleGuarantee,
  simulatedMarqueeMessage,
  startSimulatedMarquee,
  stopSimulatedMarquee,
  readActiveSpin,
  rememberNewSpin,
  applyTableReferenceStats,
  tableMachineId,
  patchRotateScreenButtons,
  requestViewMode,
  disposeGameForRemount,
  syncRunningAudioWhenReady,
  watchOriginalGameEntry,
} = context.__YachiyoSeth2SourceAdapterTest;
assert.equal(typeof context.io.connect, 'function');
assert.equal(String(context.io.connect).includes('LocalSocket'), true);
assert.equal(typeof context.__YachiyoOriginalIo.Manager, 'function');
assert.equal(tableMachineId({ table: { roomId: 42 } }, 1), 42);
assert.equal(tableMachineId('17', 1), 17);
assert.equal(tableMachineId({}, 9), 9);
assert.equal(
  publicError({ code: 'INTERNAL', message: 'Invalid prisma.bet.create invocation' }, 'fallback'),
  '遊戲結算暫時失敗，請稍後再試',
);

const terminalWin = {
  view: [[1]],
  action: 'freeSpin',
  freeGameCount: 0,
  currentTimes: 16,
  femaleTotemLevel: 0,
  maleTotemLevel: 0,
  winSymbols: [{ symbol: 9, winnings: 2.5, symbolPos: [0] }],
  timesSymbols: [{ symbol: 10, symbolPos: 0, times: 500, lock: 0 }],
  totalWinnings: 367.5,
};
const malformedTerminalWoman = {
  view: [[18]],
  action: 'freeSpin',
  freeGameCount: 0,
  currentTimes: 16,
  femaleTotemLevel: 1,
  maleTotemLevel: 0,
  winSymbols: [{ symbol: 18, winnings: 0, symbolPos: [0] }],
  timesSymbols: [{ symbol: 13, symbolPos: 0, times: 2, lock: 2 }],
  totalWinnings: 367.5,
};
const terminalSettlement = {
  view: [[2]],
  action: 'freeSpin',
  freeGameCount: 0,
  currentTimes: 16,
  femaleTotemLevel: 0,
  maleTotemLevel: 0,
  winSymbols: [],
  timesSymbols: [{ symbol: 13, symbolPos: 0, times: 2, lock: 2 }],
  roundWinnings: 5190,
  totalWinnings: 5555,
};
const repairedTerminal = repairTerminalFemaleGuarantee([
  terminalWin,
  malformedTerminalWoman,
  terminalSettlement,
]);
assert.equal(repairedTerminal.length, 2);
assert.equal(repairedTerminal[0], terminalWin);
assert.equal(repairedTerminal[1].totalWinnings, 5555);
assert.deepEqual(structuredClone(repairedTerminal[1].view), terminalWin.view);
assert.deepEqual(structuredClone(repairedTerminal[1].timesSymbols), terminalWin.timesSymbols);
assert.deepEqual(structuredClone(repairedTerminal[1].winSymbols), []);

const referenceNow = 1_800_000_000_000;
const marqueeMessages = Array.from({ length: 64 }, (_, sequence) =>
  structuredClone(simulatedMarqueeMessage(sequence, referenceNow + sequence * 6000)),
);
assert.ok(new Set(marqueeMessages.map((message) => message.data.player)).size >= 48);
assert.ok(new Set(marqueeMessages.map((message) => message.data.winType)).size >= 8);
assert.ok(marqueeMessages.every((message) => message.type === 'system'));
assert.ok(marqueeMessages.every((message) => message.data.simulated === true));
assert.ok(marqueeMessages.every((message) => message.data.gameCode === 'golden-seth'));
assert.ok(marqueeMessages.every((message) => /^.+\*\*\*\d{4}$/.test(message.data.player)));
assert.ok(
  marqueeMessages.every(
    (message) => message.data.roomNumber >= 1 && message.data.roomNumber <= 4000,
  ),
);
assert.ok(marqueeMessages.every((message) => /^\d{1,3}(,\d{3})*\.\d{2}$/.test(message.data.win)));

const simulatedNotifications = [];
const simulatedSocket = {
  connected: true,
  dispatch(event, payload) {
    simulatedNotifications.push({ event, payload });
  },
};
const timerCountBeforeMarquee = longTimers.length;
assert.equal(startSimulatedMarquee(simulatedSocket), true);
const firstMarqueeTimer = longTimers
  .slice(timerCountBeforeMarquee)
  .find((timer) => timer.delay === 2500);
assert.ok(firstMarqueeTimer);
firstMarqueeTimer.callback();
assert.equal(simulatedNotifications.length, 1);
assert.equal(simulatedNotifications[0].event, 'notify');
assert.equal(simulatedNotifications[0].payload.data.simulated, true);
assert.ok(
  longTimers
    .slice(timerCountBeforeMarquee + 1)
    .some((timer) => timer.delay >= 5000 && timer.delay < 7500),
);
stopSimulatedMarquee(simulatedSocket);
assert.equal(simulatedSocket.simulatedMarqueeTimer, 0);

const occupiedTables = Array.from({ length: 500 }, (_, index) => index + 1).filter((machineId) =>
  machineHasSimulatedPlayer(machineId, referenceNow),
);
assert.ok(occupiedTables.length >= 375);
assert.ok(occupiedTables.length <= 425);
const referenceStats = structuredClone(machineReferenceStats(45, referenceNow));
const nextReferenceStats = structuredClone(machineReferenceStats(45, referenceNow + 5_000));
assert.ok(referenceStats.todayBet > 100);
assert.ok(referenceStats.dayBet > referenceStats.todayBet);
assert.ok(referenceStats.mgCounts.every((count) => count > 0));
assert.ok(nextReferenceStats.todayBet > referenceStats.todayBet);
assert.ok(
  Math.abs(
    nextReferenceStats.todayWin / nextReferenceStats.todayBet -
      referenceStats.todayWin / referenceStats.todayBet,
  ) < 0.002,
  'the simulated reference rate must drift smoothly between refreshes',
);

const referenceItem = {
  tableVO: {
    roomId: 45,
    number: 45,
    bet: 0,
    win: 0,
    today: { bet: 0, win: 0 },
    status: 'Empty',
    user: null,
  },
  setData(table) {
    this.tableVO = table;
  },
};
const referenceView = {
  slotTableMap: new Map([[45, referenceItem]]),
  selectRoomId: 45,
  detail: null,
  setTableInfo(event) {
    this.detail = event.data.detail;
  },
};
assert.equal(applyTableReferenceStats(referenceView, referenceNow), true);
assert.equal(referenceItem.tableVO.today.bet, referenceView.detail.todayBet);
assert.equal(referenceItem.tableVO.today.win, referenceView.detail.todayWin);
assert.deepEqual(structuredClone(referenceView.detail.mgCounts), referenceStats.mgCounts);
assert.equal(
  referenceItem.tableVO.status,
  machineHasSimulatedPlayer(45, referenceNow) ? 'Full' : 'Empty',
);
assert.equal(
  referenceItem.tableVO.user?.simulated ?? false,
  machineHasSimulatedPlayer(45, referenceNow),
);

const currentPlayer = { userId: 'real-player' };
const currentReferenceItem = {
  tableVO: {
    roomId: 46,
    number: 46,
    bet: 0,
    win: 0,
    today: { bet: 0, win: 0 },
    status: 'Full',
    user: currentPlayer,
  },
  setData(table) {
    this.tableVO = table;
  },
};
const currentReferenceView = {
  slotTableMap: new Map([[46, currentReferenceItem]]),
  currentRoomId: 46,
  selectRoomId: 46,
  setTableInfo() {},
};
assert.equal(applyTableReferenceStats(currentReferenceView, referenceNow), true);
assert.equal(currentReferenceItem.tableVO.status, 'Full');
assert.equal(currentReferenceItem.tableVO.user, currentPlayer);

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

const animationOrder = [];
const orderedDispatch = wrapFrameworkDispatch((eventName, event) => {
  animationOrder.push(eventName);
  if (eventName === 'GameEvent:SHOW_SYMBOLS_IN_ANIM') event.complete();
});
orderedDispatch('GameEvent:SHOW_CHARACTER_FIRE', { data: null });
assert.deepEqual(animationOrder, [], 'character throw waits until multiplier balls have landed');
orderedDispatch('GameEvent:SHOW_SYMBOLS_IN_ANIM', {
  complete: () => animationOrder.push('landing-complete'),
});
assert.deepEqual(animationOrder, [
  'GameEvent:SHOW_SYMBOLS_IN_ANIM',
  'GameEvent:SHOW_CHARACTER_FIRE',
  'landing-complete',
]);

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

responseQueue.push({ status: 200, table: { roomId: 7, number: 7 } });
const standaloneTableResult = await new Promise((resolve) => {
  socket.emit('updateSlotTable', { roomId: 7 }, resolve);
});
assert.equal(standaloneTableResult.status, 200);
assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
  event: 'updateSlotTable',
  data: { roomId: 7 },
});

windowListeners.get('message')({
  origin: 'https://example.test',
  source: context.parent,
  data: { type: 'seth2:shell-capabilities', tableChangeRemount: true },
});
responseQueue.push({ status: 200, table: { roomId: 42, number: 42 } });
parentMessages.length = 0;
let shellTableCallbackCalled = false;
socket.emit('updateSlotTable', { roomId: 42 }, () => {
  shellTableCallbackCalled = true;
});
await socket.queue;
assert.equal(
  shellTableCallbackCalled,
  false,
  'the shell remount replaces the source iframe reload',
);
assert.deepEqual(structuredClone(parentMessages.at(-1)), {
  type: 'seth2:table-change-request',
  machineId: 42,
});

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
  musicResumeCount: 0,
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
  resumeMusic: () => {
    audioState.musicResumeCount += 1;
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
const gameAudioGesture = windowListeners.get('pointerdown');
assert.equal(typeof gameAudioGesture, 'function');
assert.equal(gameAudioGesture(), false);
assert.equal(audioContextResumeCount, 1, 'the real gesture must resume Cocos Web Audio');
assert.equal(capturedAudioContext.state, 'running');
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
assert.equal(context.__YachiyoSeth2UnlockAudio(), true);
assert.equal(audioState.musicResumeCount, 1, 'an unlocked game resumes the active source music');
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
assert.equal(requestBody.data.machineId, 42);
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

responseQueue.push({
  status: 200,
  engine: { gameState: { spinId: 'super-main-entry' }, spinId: 'super-main-entry' },
  platform: { player: { balance: { amount: 80_000 } } },
});
parentMessages.length = 0;
const superPurchase = await new Promise((resolve) => {
  socket.emit(
    'spin',
    {
      action: 'buyFeature',
      featureIndex: 2,
      stakeIndex: 4,
      stakeValue: 1,
      ratioIndex: 3,
      ratioValue: 1,
    },
    resolve,
  );
});
assert.equal(superPurchase.platform.player.balance.amount, 80_000);
assert.deepEqual(structuredClone(parentMessages.at(-1)), {
  type: 'seth2:balance',
  balance: 80_000,
});

responseQueue.push({
  status: 200,
  engine: {
    spinId: 'super-main-entry',
    gameState: [
      {
        spinId: 'super-main-entry',
        action: 'superSpin',
        startFreeGame: false,
        freeGameCount: 0,
        currentView: 0,
        totalViews: 1,
      },
    ],
  },
  platform: { player: { balance: { amount: 80_000 } } },
});
const superReplay = await new Promise((resolve) => {
  socket.emit('spin', { spinId: 'super-main-entry' }, resolve);
});
assert.equal(superReplay.platform.player.balance.amount, 80_000);
assert.equal(superReplay.engine.gameState[0].action, 'superSpin');

responseQueue.push({
  status: 200,
  platform: { player: { balance: { amount: 102_000 } } },
});
parentMessages.length = 0;
await new Promise((resolve) => {
  socket.emit('closeSpin', {}, resolve);
});
assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
  event: 'closeSpin',
  data: { spinId: 'super-main-entry' },
});
assert.deepEqual(structuredClone(parentMessages.at(-1)), {
  type: 'seth2:balance',
  balance: 102_000,
});

storage.setItem(
  'bg.seth2.active-spin',
  JSON.stringify({ spinId: 'resume-one', cursor: 2, totalViews: 3, durable: true }),
);
responseQueue.push({
  ...structuredClone(response),
  isResuming: true,
  resumeKind: 'feature',
  resumeCursor: 0,
  resumeTotalViews: 3,
  engine: {
    spinId: 'resume-one',
    gameState: [0, 1, 2].map((currentView) => ({
      spinId: 'resume-one',
      sourceView: currentView,
      action: 'superSpin',
      startFreeGame: false,
      freeGameCount: 0,
      currentView,
      totalViews: 3,
    })),
  },
});
const resumedTail = await new Promise((resolve) => {
  socket.emit('initial', {}, resolve);
});
assert.equal(resumedTail.isResuming, true);
assert.equal(resumedTail.engine.gameState.length, 2);
assert.deepEqual(
  resumedTail.engine.gameState.map((state) => [
    state.sourceView,
    state.currentView,
    state.totalViews,
  ]),
  [
    [1, 0, 2],
    [2, 1, 2],
  ],
);
assert.deepEqual(structuredClone(readActiveSpin()), {
  spinId: 'resume-one',
  cursor: 1,
  totalViews: 3,
  durable: true,
});

responseQueue.push({
  status: 200,
  platform: { player: { balance: { amount: 102_000 } } },
});
await new Promise((resolve) => {
  socket.emit('closeSpin', {}, resolve);
});
assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
  event: 'closeSpin',
  data: { spinId: 'resume-one' },
});
assert.equal(readActiveSpin(), null);

storage.setItem(
  'bg.seth2.active-spin',
  JSON.stringify({ spinId: 'resume-terminal-lock', cursor: 25, totalViews: 27, durable: true }),
);
responseQueue.push({
  ...structuredClone(response),
  isResuming: true,
  resumeKind: 'feature',
  resumeCursor: 24,
  resumeTotalViews: 27,
  engine: {
    spinId: 'resume-terminal-lock',
    gameState: [terminalWin, malformedTerminalWoman, terminalSettlement].map((state) => ({
      ...structuredClone(state),
      spinId: 'resume-terminal-lock',
    })),
  },
});
const resumedTerminalLock = await new Promise((resolve) => {
  socket.emit('initial', {}, resolve);
});
assert.equal(resumedTerminalLock.engine.gameState.length, 2);
assert.equal(resumedTerminalLock.resumeCursor, 24);
assert.equal(resumedTerminalLock.resumeTotalViews, 26);
assert.deepEqual(
  resumedTerminalLock.engine.gameState.map((state) => [
    state.currentView,
    state.totalViews,
    state.totalWinnings,
  ]),
  [
    [0, 2, 367.5],
    [1, 2, 5555],
  ],
);
assert.deepEqual(structuredClone(readActiveSpin()), {
  spinId: 'resume-terminal-lock',
  cursor: 24,
  totalViews: 26,
  durable: true,
});
responseQueue.push({
  status: 200,
  platform: { player: { balance: { amount: 5_562.61 } } },
});
await new Promise((resolve) => {
  socket.emit('closeSpin', {}, resolve);
});
assert.equal(readActiveSpin(), null);

storage.setItem(
  'bg.seth2.active-spin',
  JSON.stringify({ spinId: 'resume-single', cursor: 1, totalViews: 1, durable: true }),
);
responseQueue.push({
  ...structuredClone(response),
  isResuming: true,
  resumeKind: 'feature',
  resumeCursor: 0,
  resumeTotalViews: 1,
  engine: {
    spinId: 'resume-single',
    gameState: [
      {
        spinId: 'resume-single',
        action: 'superSpin',
        startFreeGame: false,
        freeGameCount: 0,
        currentView: 0,
        totalViews: 1,
      },
    ],
  },
});
const resumedSingle = await new Promise((resolve) => {
  socket.emit('initial', {}, resolve);
});
assert.equal(resumedSingle.engine.gameState.length, 1);
responseQueue.push({
  status: 200,
  platform: { player: { balance: { amount: 102_000 } } },
});
await new Promise((resolve) => {
  socket.emit('closeSpin', {}, resolve);
});
assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
  event: 'closeSpin',
  data: { spinId: 'resume-single' },
});
assert.equal(readActiveSpin(), null);

storage.setItem(
  'bg.seth2.active-spin',
  JSON.stringify({ spinId: 'ordinary-spin', cursor: 0, totalViews: 2, durable: false }),
);
assert.equal(advanceActiveSpinProgress().cursor, 1);
assert.equal(readActiveSpin().cursor, 1);
assert.equal(typeof applyStoredResumeProgress, 'function');
assert.equal(typeof rememberNewSpin, 'function');
storage.removeItem('bg.seth2.active-spin');

storage.setItem(
  'bg.seth2.active-spin',
  JSON.stringify({ spinId: 'durable-spin', cursor: 0, totalViews: 2, durable: true }),
);
responseQueue.push({ status: 200 });
const requestCountBeforeProgress = requests.length;
advanceActiveSpinProgress();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(requests.length - requestCountBeforeProgress, 1);
assert.deepEqual(JSON.parse(requests.at(-1).options.body), {
  event: 'updateFeatureProgress',
  data: { sequenceId: 'durable-spin', completedViews: 1 },
});
storage.removeItem('bg.seth2.active-spin');

socket.close();
assert.equal(socket.connected, false);
console.log('Seth2 v1.1.5 Socket.IO bridge and audio contract tests passed.');
