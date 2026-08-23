import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/fruit-mary/fruit-mary-adapter.js', import.meta.url),
);
const pagePath = fileURLToPath(new URL('../src/pages/games/FruitMaryPage.tsx', import.meta.url));
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');
assert.match(
  adapterSource,
  /getExtension\(['"]WEBGL_lose_context['"]\)/,
  'Fruit Mary route changes must release the old Cocos WebGL context',
);
assert.match(
  pageSource,
  /payload\.type === ['"]fruit-mary:fatal['"]/,
  'Fruit Mary shell must rebuild a failed source-game iframe',
);
assert.match(
  pageSource,
  /__YachiyoDisposeFruitMaryGame/,
  'Fruit Mary shell must dispose the source game before removing its iframe',
);
assert.match(
  pageSource,
  /setInterval\(checkFrameHealth, 5_000\)/,
  'Fruit Mary shell must detect partial renderer loss while the page remains visible',
);
assert.doesNotMatch(
  adapterSource,
  /getImageData|canvasDetailScore|fruitMaryCanvasHasDetail/,
  'Fruit Mary health checks must not read back WebGL pixels on Mobile Safari',
);
assert.match(
  pageSource,
  /RECOVERY_STABILITY_WINDOW_MS = 60_000/,
  'Fruit Mary automatic recovery must require a stable minute before resetting its circuit breaker',
);
assert.doesNotMatch(
  pageSource,
  /payload\.type === ['"]fruit-mary:ready['"][\s\S]{0,160}automaticRecoveryAttemptsRef\.current = 0/,
  'Fruit Mary ready events must not immediately re-arm automatic iframe recovery',
);
const storedValues = {
  'bg-auth': JSON.stringify({
    state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
    version: 0,
  }),
};
const storage = {
  getItem: (key) => storedValues[key] ?? null,
  setItem: (key, value) => {
    storedValues[key] = value;
  },
};
const parentMessages = [];
const pendingFetches = [];
const context = {
  URL,
  URLSearchParams,
  AbortController,
  console: { info: () => {}, warn: () => {}, error: () => {}, log: () => {} },
  fetch: (...args) =>
    new Promise((resolve, reject) => {
      pendingFetches.push({ args, resolve, reject });
    }),
  XMLHttpRequest: function XMLHttpRequest() {},
  location: {
    origin: 'https://example.test',
    href: 'https://example.test/games/fruit-mary/index.html',
    search: '',
  },
  localStorage: storage,
  parent: { localStorage: storage, postMessage: (message) => parentMessages.push(message) },
  setTimeout: () => 1,
  clearTimeout: () => {},
};
context.window = context;
vm.runInNewContext(adapterSource, context, { filename: adapterPath });

const {
  adjustFruitMaryAllocation,
  createBridgeXHR,
  normalizeFruitMaryAllocation,
  patchFruitMaryMenuLogic,
  patchFruitMaryPlayLogic,
  shortBonusCompletionIndex,
} = context.__YachiyoFruitMaryAdapterTest;

assert.equal(normalizeFruitMaryAllocation(40, 60, 70).currentRound, 70);
assert.equal(normalizeFruitMaryAllocation(40, 60, 70).balance, 30);
assert.equal(normalizeFruitMaryAllocation(40, 60, 999).currentRound, 100);
assert.equal(normalizeFruitMaryAllocation(40, 60, -5).currentRound, 0);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-round', 1).currentRound, 41);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-round', 1).balance, 59);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-balance', 1).currentRound, 39);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-balance', 1).balance, 61);

assert.equal(shortBonusCompletionIndex([22, 5]), 1);
assert.equal(shortBonusCompletionIndex([10, 23, 11, 5, 17]), 4);
assert.equal(shortBonusCompletionIndex([]), 0);

const audioCalls = [];
context.cc = {
  Node: { EventType: { TOUCH_END: 'touchend' } },
  vv: {
    AudioMgr: {
      playSFX: (...args) => audioCalls.push(args),
    },
    UserInfo: { balance: 60 },
  },
};

function numberNode(initialValue) {
  const box = {
    value: initialValue,
    getNum() { return this.value; },
    setNum(value) { this.value = Number(value); },
  };
  return {
    box,
    listeners: {},
    getComponent(name) { return name === 'ShuziBoxLogic' ? box : null; },
    on(type, listener) { this.listeners[type] = listener; },
  };
}

const currentRoundNode = numberNode(40);
const balanceNode = numberNode(60);
let collectCalls = 0;
let animatedWin = 0;
const menuLogic = {
  _kaishiBiDdaxiao_bool: true,
  shuzibenlun: currentRoundNode,
  shuziyue: balanceNode,
  node: { getComponent: () => ({ _playing: false }) },
  unschedule() {},
  clickKaishi() { collectCalls += 1; },
  getPosPutNum() { return 1; },
  getPosBeishu() { return 10; },
  yueAdd(value) { animatedWin += value; },
  addWinNum(position) { this.yueAdd(this.getPosPutNum(position) * this.getPosBeishu(position)); },
};
assert.equal(patchFruitMaryMenuLogic(menuLogic), true);
menuLogic.addWinNum(1);
assert.equal(animatedWin, 100, 'animated score uses the same room denomination as settlement');
menuLogic.clickZuo();
assert.equal(currentRoundNode.box.getNum(), 41, 'left adds one point to the round');
assert.equal(balanceNode.box.getNum(), 59, 'left removes the same point from balance');
menuLogic.clickYou();
assert.equal(currentRoundNode.box.getNum(), 40, 'right returns one point from the round');
assert.equal(balanceNode.box.getNum(), 60, 'right restores the same point to balance');
currentRoundNode.box.setNum(1);
balanceNode.box.setNum(99);
menuLogic.clickYou();
assert.equal(currentRoundNode.box.getNum(), 0);
assert.equal(balanceNode.box.getNum(), 100);
assert.equal(collectCalls, 1, 'returning the final point collects the round');
audioCalls.length = 0;
const blinkedPositions = [];
let originalShortHandlerCalls = 0;
let completedAnimations = 0;
const shortBonus = {
  _playing: false,
  _result_pos_arr: [22, 5],
  mask: { active: true },
  changeNumTo24: (value) => ((value - 1 + 24) % 24) + 1,
  setPosShan(position, _interval, _count, callback) {
    blinkedPositions.push(position);
    if (callback) callback(3);
  },
  showSixiShan() {
    originalShortHandlerCalls += 1;
  },
  play(_type, _positions, _isWin, done) {
    this._playing = true;
    this.showSixiShan(undefined, { index_int: 0 }, done);
  },
};
patchFruitMaryPlayLogic(shortBonus);
shortBonus.play(5555, [22, 5], true, () => {
  completedAnimations += 1;
});
assert.equal(originalShortHandlerCalls, 0, 'two-position bonuses must use the repaired handler');
assert.equal(completedAnimations, 1, 'small/big triple animation must always reach its callback');
assert.equal(audioCalls.length, 3, 'the repaired presentation keeps all three light cycles');
assert.equal(blinkedPositions.includes(5), true);

let normalHandlerCalls = 0;
const longBonus = {
  _playing: false,
  showSixiShan() {
    normalHandlerCalls += 1;
  },
  play() {},
};
patchFruitMaryPlayLogic(longBonus);
longBonus.showSixiShan([10, 23, 11, 5, 17], { index_int: 0 }, () => {});
assert.equal(normalHandlerCalls, 1, 'four-happiness keeps its original presentation');

const scheduledCallbacks = [];
context.setTimeout = (callback) => {
  scheduledCallbacks.push(callback);
  return scheduledCallbacks.length;
};
context.clearTimeout = () => {};
let watchdogCompletions = 0;
let watchdogStops = 0;
const stalledAnimation = {
  _playing: false,
  mask: { active: true },
  showSixiShan() {},
  stopAllAni() {
    watchdogStops += 1;
  },
  play() {
    this._playing = true;
  },
};
patchFruitMaryPlayLogic(stalledAnimation);
stalledAnimation.play(9999, [10, 1], true, () => {
  watchdogCompletions += 1;
});
scheduledCallbacks.at(-1)();
assert.equal(watchdogStops, 1);
assert.equal(watchdogCompletions, 1, 'animation watchdog must release a missing source callback');
assert.equal(stalledAnimation.mask.active, false);

context.setTimeout = setTimeout;
context.clearTimeout = clearTimeout;
const first = createBridgeXHR();
first.open('POST', 'https://legacy.test/index/game/get_gift');
first.send(JSON.stringify({ fruits: [[4, 1]], money: 1 }));
const second = createBridgeXHR();
second.open('POST', 'https://legacy.test/index/game/get_gift');
second.send(JSON.stringify({ fruits: [[4, 1]], money: 1 }));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(pendingFetches.length, 1, 'only one settlement request may be in flight');
assert.equal(JSON.parse(second.responseText).code, 0);
assert.match(JSON.parse(second.responseText).message, /仍在結算/);

pendingFetches[0].resolve({
  ok: true,
  status: 200,
  json: async () => ({ code: 1, data: { data: { type: 0, pos: 4 }, money: [10] }, balance: 100 }),
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(JSON.parse(first.responseText).code, 1);
assert.equal(parentMessages.some((message) => message.type === 'fruit-mary:balance'), true);

console.log('Fruit Mary settlement and animation recovery tests passed.');
