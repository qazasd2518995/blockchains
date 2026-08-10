import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/fruit-mary/fruit-mary-adapter.js', import.meta.url),
);
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
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

const { patchFruitMaryPlayLogic, shortBonusCompletionIndex, createBridgeXHR } =
  context.__YachiyoFruitMaryAdapterTest;

assert.equal(shortBonusCompletionIndex([22, 5]), 1);
assert.equal(shortBonusCompletionIndex([10, 23, 11, 5, 17]), 4);
assert.equal(shortBonusCompletionIndex([]), 0);

const audioCalls = [];
context.cc = {
  vv: {
    AudioMgr: {
      playSFX: (...args) => audioCalls.push(args),
    },
  },
};
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
