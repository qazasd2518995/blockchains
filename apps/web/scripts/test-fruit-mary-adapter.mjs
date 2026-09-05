import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/fruit-mary/fruit-mary-adapter.js', import.meta.url),
);
const pagePath = fileURLToPath(new URL('../src/pages/games/FruitMaryPage.tsx', import.meta.url));
const indexPath = fileURLToPath(new URL('../public/games/fruit-mary/index.html', import.meta.url));
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const bootSource = fs.readFileSync(new URL('../public/games/fruit-mary/main.b4cc7.js', import.meta.url), 'utf8');
assert.match(bootSource, /enableAutoFullScreen\(window\.parent === window &&/,
  'an embedded cabinet cannot hide the platform lobby or recovery controls in iframe fullscreen');
assert.match(indexSource, /main\.b4cc7\.js\?v=5/);
assert.match(
  indexSource,
  /fruit-mary-adapter\.js\?v=18/,
  'Fruit Mary must load the settlement-safe adapter revision',
);
assert.match(
  adapterSource,
  /getExtension\(['"]WEBGL_lose_context['"]\)/,
  'Fruit Mary route changes must release the old Cocos WebGL context',
);
assert.match(
  pageSource,
  /qmoney:before-game-exit/,
  'Fruit Mary must wait for an accepted settlement before returning to the lobby',
);
assert.match(
  pageSource,
  /payload\.type === ['"]fruit-mary:fatal['"]/,
  'Fruit Mary shell must rebuild a failed source-game iframe',
);
assert.match(
  adapterSource,
  /FRUIT_MARY_SPIN_PAUSE_MS = 650/,
  'Fruit Mary must pause briefly before accepting the next paid round',
);
assert.match(
  adapterSource,
  /audioCompletionTimeoutMs = 7000/,
  'Fruit Mary must release source animations whose audio completion callback is lost',
);
assert.match(
  adapterSource,
  /missAnimationCompletionTimeoutMs = 12000/,
  'Fruit Mary must promptly release the Android type-9 miss animation',
);
assert.match(
  adapterSource,
  /!collectingWin && \(settlementInFlight \|\| Date\.now\(\) < nextFruitMarySpinAt\)/,
  'Fruit Mary must ignore repeated start taps without blocking win collection',
);
assert.match(
  adapterSource,
  /!collectingWin && playLogic && playLogic\._playing/,
  'Fruit Mary must never start another paid round while the previous presentation is active',
);
assert.match(
  pageSource,
  /__YachiyoDisposeFruitMaryGame/,
  'Fruit Mary shell must dispose the source game before removing its iframe',
);
assert.match(
  pageSource,
  /payload\.type === ['"]fruit-mary:exit['"]/,
  'Fruit Mary source exit must return through the platform game shell',
);
assert.doesNotMatch(
  pageSource,
  /fruit-mary:health-check|setInterval\(checkFrameHealth/,
  'Fruit Mary shell must not rebuild the iframe from transient source-scene animation states',
);
assert.doesNotMatch(
  adapterSource,
  /fruit-mary:health-check|fruit-mary:health['"]/,
  'Fruit Mary adapter must not classify temporary Cocos node changes as a disconnect',
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
assert.match(
  adapterSource,
  /attemptedRefreshToken[\s\S]{0,850}latest\.refreshToken !== attemptedRefreshToken/,
  'Fruit Mary must adopt tokens rotated concurrently by the platform shell',
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
  crypto: webcrypto,
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
  fruitMaryBetIsWithinLimit,
  fruitMaryBetIsAffordable,
  fruitMaryPayoutMultiplier,
  fruitMarySettlementRoundAmount,
  normalizeFruitMaryGambleAllocation,
  normalizeFruitMaryAllocation,
  patchFruitMaryAudioManager,
  patchFruitMaryMenuLogic,
  patchFruitMaryPlayLogic,
  reconcilePendingFruitMaryBalance,
  missAnimationCompletionTimeoutMs,
  restoreFruitMaryAutoButtonState,
  shortBonusCompletionIndex,
  updateFruitMaryBetLimits,
} = context.__YachiyoFruitMaryAdapterTest;

assert.equal(
  fruitMarySettlementRoundAmount(
    'spin',
    { data: { money: [10, 4] } },
    JSON.stringify({ fruits: [[4, 1]], money: 1 }),
  ),
  140,
  'the authoritative spin allocation is derived from the credited payout',
);
assert.equal(
  fruitMarySettlementRoundAmount('gamble', { data: 8 }, JSON.stringify({ balance: 40, size: 2 })),
  80,
  'a winning gamble keeps exactly the doubled wager in the current-round display',
);
assert.equal(
  fruitMarySettlementRoundAmount('gamble', { data: 7 }, JSON.stringify({ balance: 40, size: 2 })),
  0,
  'a losing gamble clears the current-round display',
);

assert.equal(
  missAnimationCompletionTimeoutMs,
  12000,
  'the miss presentation watchdog must recover before the player assumes the cabinet froze',
);

assert.equal(fruitMaryPayoutMultiplier(4, 100), 120, 'BAR follows the visible 120x table');
assert.equal(fruitMaryPayoutMultiplier(16, 20), 40, '77 follows the visible 40x table');
assert.equal(fruitMaryPayoutMultiplier(14, 10), 20, 'bell follows the visible 20x table');
assert.equal(fruitMaryPayoutMultiplier(7, 10), 15, 'lemon follows the visible 15x table');
assert.equal(fruitMaryPayoutMultiplier(99, 7), 7, 'unknown source positions keep their fallback');

assert.equal(normalizeFruitMaryAllocation(40, 60, 70).currentRound, 70);
assert.equal(normalizeFruitMaryAllocation(40, 60, 70).balance, 30);
assert.equal(normalizeFruitMaryAllocation(40, 60, 999).currentRound, 100);
assert.equal(normalizeFruitMaryAllocation(40, 60, -5).currentRound, 0);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-round', 1).currentRound, 41);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-round', 1).balance, 59);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-balance', 1).currentRound, 39);
assert.equal(adjustFruitMaryAllocation(40, 60, 'to-balance', 1).balance, 61);
assert.equal(normalizeFruitMaryAllocation(40, 60.37, 70).balance, 30.37,
  'moving whole points must preserve the fractional wallet remainder');
assert.equal(normalizeFruitMaryAllocation(40, 0.37, 999).currentRound, 40,
  'the fractional remainder cannot be allocated as another whole point');
assert.equal(normalizeFruitMaryAllocation(40, 0.37, 999).balance, 0.37);
assert.equal(normalizeFruitMaryAllocation(40, 60.37, 0).total, 100.37);

updateFruitMaryBetLimits({ multiple: 10, minBet: 10, maxBet: 50 });
assert.equal(normalizeFruitMaryGambleAllocation(40, 60, 999).currentRound, 50);
assert.equal(normalizeFruitMaryGambleAllocation(40, 60, 999).balance, 50);
updateFruitMaryBetLimits({ multiple: 10, minBet: 10, maxBet: 5000 });

context.cc = {
  vv: {
    Logic: { addPopBox() {} },
    UserInfo: { balance: 3 },
  },
};
assert.equal(
  fruitMaryBetIsAffordable({ numNode: { children: [numberNode(1)] } }, false),
  false,
  'a remainder below the 10-point denomination cannot fund a visible bet',
);
context.cc.vv.UserInfo.balance = 13;
assert.equal(
  fruitMaryBetIsAffordable({ numNode: { children: [numberNode(1)] } }, false),
  true,
  'a balance with a non-denomination remainder can fund only the affordable whole bet',
);

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

const insufficientNotices = [];
context.cc.vv.Logic = { addPopBox: (message) => insufficientNotices.push(message) };

const remainderBetNodes = Array.from({ length: 8 }, () => numberNode(0));
const remainderRoundNode = numberNode(0);
const remainderBalanceNode = numberNode(3);
let remainderOriginalIncrements = 0;
const remainderMenuLogic = {
  _kaishiBiDdaxiao_bool: false,
  shuzibenlun: remainderRoundNode,
  shuziyue: remainderBalanceNode,
  numNode: { children: remainderBetNodes },
  node: { getComponent: () => ({ _playing: false }) },
  putButtons: [],
  startBt: { node: { active: true, opacity: 255 }, interactable: true },
  unStartBt: { node: { active: false, opacity: 255 }, interactable: false },
  isAutoPut_bool: false,
  unschedule() {},
  getAllPut() {},
  initButton() {},
  setBidaxiao() {},
  clickCancelAuto() {
    this.isAutoPut_bool = false;
  },
  clickKaishi() {},
  kaishi() {
    remainderOriginalIncrements += 1;
    remainderBetNodes[0].box.setNum(remainderBetNodes[0].box.getNum() + 1);
  },
};
context.cc.vv.UserInfo.balance = 3;
assert.equal(patchFruitMaryMenuLogic(remainderMenuLogic), true);
remainderMenuLogic.kaishi();
assert.equal(remainderOriginalIncrements, 1);
assert.equal(
  remainderBetNodes[0].box.getNum(),
  0,
  'the adapter rolls back the archived client\'s unaffordable first increment',
);
assert.match(insufficientNotices.at(-1), /餘額不足/);

const audioFallbackCallbacks = [];
context.setTimeout = (callback) => {
  audioFallbackCallbacks.push(callback);
  return audioFallbackCallbacks.length;
};
context.clearTimeout = () => {};
let lostAudioCompletion = 0;
const stalledAudioManager = {
  playSFX() {},
};
assert.equal(patchFruitMaryAudioManager(stalledAudioManager), true);
stalledAudioManager.playSFX('sounds/test', false, () => {
  lostAudioCompletion += 1;
});
audioFallbackCallbacks.at(-1)();
assert.equal(lostAudioCompletion, 1, 'a missing audio callback cannot freeze the wheel animation');
audioFallbackCallbacks.at(-1)();
assert.equal(lostAudioCompletion, 1, 'the audio fallback callback is idempotent');
context.setTimeout = () => 1;
context.clearTimeout = () => {};

function numberNode(initialValue) {
  const box = {
    value: initialValue,
    getNum() {
      return this.value;
    },
    setNum(value) {
      this.value = Number(value);
    },
  };
  return {
    box,
    listeners: {},
    getComponent(name) {
      return name === 'ShuziBoxLogic' ? box : null;
    },
    on(type, listener) {
      this.listeners[type] = listener;
    },
  };
}

updateFruitMaryBetLimits({ multiple: 10, minBet: 10, maxBet: 50 });
assert.equal(
  fruitMaryBetIsWithinLimit({ numNode: { children: [numberNode(5)] } }),
  true,
  'the visible fruit allocation may reach the account maximum',
);
assert.equal(
  fruitMaryBetIsWithinLimit({ numNode: { children: [numberNode(6)] } }),
  false,
  'the source client must stop an over-limit spin before it reaches the API',
);
updateFruitMaryBetLimits({ multiple: 10, minBet: 10, maxBet: 5000 });

const currentRoundNode = numberNode(40);
const balanceNode = numberNode(60);
let collectCalls = 0;
let animatedWin = 0;
let setAllNoCalls = 0;
const menuPlayLogic = { _playing: false };
const queuedAutoplay = [];
const menuLogic = {
  _kaishiBiDdaxiao_bool: true,
  shuzibenlun: currentRoundNode,
  shuziyue: balanceNode,
  node: { getComponent: (name) => (name === 'PlayLogic' ? menuPlayLogic : null) },
  unscheduled: [],
  unschedule(callback) {
    this.unscheduled.push(callback);
  },
  updateTime() {},
  scheduleOnce(callback) { queuedAutoplay.push(callback); },
  kaishi() {},
  clickCancelAuto() {
    this.startBt.node.active = true;
    this.unStartBt.node.active = false;
    this.isAutoPut_bool = false;
  },
  initButton() {},
  setBidaxiao() {},
  setAllNo() {
    setAllNoCalls += 1;
  },
  startBt: { node: { active: true, opacity: 255 }, interactable: true },
  unStartBt: { node: { active: false, opacity: 255 }, interactable: false },
  clickKaishi() {
    collectCalls += 1;
  },
  getPosPutNum() {
    return 1;
  },
  getPosBeishu(position) {
    return position === 20 ? 20 : 10;
  },
  yueAdd(value) {
    animatedWin += value;
  },
  addWinNum(position) {
    this.yueAdd(this.getPosPutNum(position) * this.getPosBeishu(position));
  },
};
assert.equal(patchFruitMaryMenuLogic(menuLogic), true);
menuLogic._kaishiBiDdaxiao_bool = false;
menuPlayLogic._playing = true;
menuLogic.clickKaishi();
assert.equal(collectCalls, 0, 'a running presentation blocks a second paid round');
menuPlayLogic._playing = false;
menuLogic._kaishiBiDdaxiao_bool = true;
menuLogic.addWinNum(1);
assert.equal(animatedWin, 100, 'animated score uses the same room denomination as settlement');
menuLogic.addWinNum(20);
assert.equal(animatedWin, 400, 'the visible 30x star pays 30 units instead of the obsolete 20x');
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
menuLogic.isAutoPut_bool = true;
let queuedPaidSpins = 0;
menuLogic.scheduleOnce(() => { queuedPaidSpins++; }, 0.5);
const queuedPaidSpin = queuedAutoplay.at(-1);
let delayedRecoveryCalls = 0;
menuLogic.scheduleOnce(() => { delayedRecoveryCalls++; }, 2);
const delayedRecovery = queuedAutoplay.at(-1);
restoreFruitMaryAutoButtonState(menuLogic);
assert.equal(menuLogic.startBt.node.active, false, 'autoplay keeps the start control hidden');
assert.equal(menuLogic.unStartBt.node.active, true, 'autoplay keeps its stop control visible');
menuLogic.clickCancelAuto();
queuedPaidSpin();
delayedRecovery();
assert.equal(queuedPaidSpins, 0, 'Stop must cancel an already queued anonymous autoplay spin');
assert.equal(delayedRecoveryCalls, 1, 'Stop must not cancel unrelated delayed recovery work');
assert.equal(menuLogic.isAutoPut_bool, false, 'the stop control clears autoplay immediately');
assert.equal(menuLogic.startBt.node.active, true, 'stopping autoplay restores the start control');
assert.equal(menuLogic.unStartBt.node.active, false, 'stopping autoplay hides the stop control');
assert.equal(menuLogic.unscheduled.includes(menuLogic.kaishi), true);
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
  node: { getComponent: () => menuLogic },
  clickExit() {},
  reportGameEnd() {},
  showSixiShan() {
    normalHandlerCalls += 1;
  },
  play() {},
};
patchFruitMaryPlayLogic(longBonus);
longBonus.showSixiShan([10, 23, 11, 5, 17], { index_int: 0 }, () => {});
assert.equal(normalHandlerCalls, 1, 'four-happiness keeps its original presentation');
longBonus.clickExit();
assert.equal(
  parentMessages.some((message) => message.type === 'fruit-mary:exit'),
  true,
  'the archived exit button must return to the platform lobby even during autoplay',
);

const scheduledCallbacks = [];
context.setTimeout = (callback, delay) => {
  scheduledCallbacks.push({ callback, delay });
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
assert.equal(scheduledCallbacks.at(-1).delay, 45000);
scheduledCallbacks.at(-1).callback();
assert.equal(watchdogStops, 1);
assert.equal(watchdogCompletions, 1, 'animation watchdog must release a missing source callback');
assert.equal(stalledAnimation.mask.active, false);

scheduledCallbacks.length = 0;
watchdogCompletions = 0;
watchdogStops = 0;
const stalledMissAnimation = {
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
patchFruitMaryPlayLogic(stalledMissAnimation);
stalledMissAnimation.play(-1, [22], false, () => {
  watchdogCompletions += 1;
});
assert.equal(
  scheduledCallbacks.at(-1).delay,
  missAnimationCompletionTimeoutMs,
  'type-9 misses use the prompt mobile-safe watchdog',
);
scheduledCallbacks.at(-1).callback();
assert.equal(watchdogStops, 1);
assert.equal(watchdogCompletions, 1, 'a missing miss-audio callback must restore the controls');
assert.equal(stalledMissAnimation.mask.active, false);

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
assert.equal(pendingFetches[0].args[1].keepalive, true);
assert.equal(
  parentMessages.some((message) => message.type === 'fruit-mary:busy' && message.busy === true),
  true,
  'the platform shell must know that a Fruit Mary settlement is pending',
);
assert.equal(JSON.parse(second.responseText).code, 0);
assert.match(JSON.parse(second.responseText).message, /仍在結算/);
menuLogic.initButton();
assert.equal(setAllNoCalls, 1, 'the source timeout cannot unlock buttons during settlement');

pendingFetches[0].resolve({
  ok: true,
  status: 200,
  json: async () => ({ code: 1, data: { data: { type: 0, pos: 4 }, money: [10] }, balance: 100 }),
});
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(JSON.parse(first.responseText).code, 1);
menuLogic.setBidaxiao();
assert.equal(reconcilePendingFruitMaryBalance(menuLogic), false);
assert.equal(currentRoundNode.box.getNum(), 100);
assert.equal(balanceNode.box.getNum(), 0);
assert.equal(
  currentRoundNode.box.getNum() + balanceNode.box.getNum(),
  100,
  'source-game score boxes must equal the authoritative server balance after a spin',
);
assert.equal(
  parentMessages.some((message) => message.type === 'fruit-mary:balance'),
  true,
);
assert.equal(
  parentMessages.some((message) => message.type === 'fruit-mary:busy' && message.busy === false),
  true,
  'the platform shell must be released after Fruit Mary settlement',
);

const losingGamble = createBridgeXHR();
losingGamble.open('POST', 'https://legacy.test/index/game/size');
losingGamble.send(JSON.stringify({ balance: 40, size: 2 }));
await new Promise((resolve) => setTimeout(resolve, 0));
pendingFetches[1].resolve({
  ok: true,
  status: 200,
  json: async () => ({ code: 1, data: 7, balance: 60, spinId: 'gamble-loss' }),
});
await new Promise((resolve) => setTimeout(resolve, 0));
menuLogic.initButton();
assert.equal(reconcilePendingFruitMaryBalance(menuLogic), false);
assert.equal(currentRoundNode.box.getNum(), 0);
assert.equal(balanceNode.box.getNum(), 60);
assert.equal(context.cc.vv.UserInfo.balance, 60);

const winningGamble = createBridgeXHR();
winningGamble.open('POST', 'https://legacy.test/index/game/size');
winningGamble.send(JSON.stringify({ balance: 40, size: 2 }));
await new Promise((resolve) => setTimeout(resolve, 0));
pendingFetches[2].resolve({
  ok: true,
  status: 200,
  json: async () => ({ code: 1, data: 8, balance: 140, spinId: 'gamble-win' }),
});
await new Promise((resolve) => setTimeout(resolve, 0));
menuLogic.setBidaxiao();
assert.equal(reconcilePendingFruitMaryBalance(menuLogic), false);
assert.equal(currentRoundNode.box.getNum(), 80);
assert.equal(balanceNode.box.getNum(), 60);
assert.equal(
  currentRoundNode.box.getNum() + balanceNode.box.getNum(),
  140,
  'winning gamble display must equal the authoritative server balance',
);

const recoveryRound = numberNode(0);
const recoveryBalance = numberNode(10.37);
const recoveryPlay = { _playing: false };
let paidStarts = 0;
let gambleStarts = 0;
const recoveryMenu = {
  shuzibenlun: recoveryRound, shuziyue: recoveryBalance,
  numNode: { children: [numberNode(1)] },
  node: { getComponent: () => recoveryPlay },
  startBt: { node: { active: true }, interactable: true },
  unStartBt: { node: { active: false }, interactable: false },
  allAddBt: { interactable: true },
  _kaishiBiDdaxiao_bool: false,
  initButton() { this._kaishiBiDdaxiao_bool = false; this.startBt.interactable = true; this.allAddBt.interactable = true; },
  setBidaxiao() { this._kaishiBiDdaxiao_bool = true; this.startBt.interactable = true; },
  setAllNo() { this.startBt.interactable = false; this.allAddBt.interactable = false; },
  clickCancelAuto() { this.isAutoPut_bool = false; },
  clickDaOrXiao() { gambleStarts++; this.setAllNo(); },
  clickKaishi() { paidStarts++; },
};
context.cc.find = () => ({ getComponent: (name) => name === 'MenuLogic' ? recoveryMenu : recoveryPlay });
context.cc.vv.PrefabFactory = {};
context.cc.vv.UserInfo.balance = 10.37;
patchFruitMaryMenuLogic(recoveryMenu);
const rejectedSpin = createBridgeXHR();
rejectedSpin.open('POST', 'https://legacy.test/index/game/get_gift');
rejectedSpin.send(JSON.stringify({ fruits: [[4, 1]], money: 1 }));
recoveryMenu.initButton();
assert.equal(recoveryMenu.startBt.interactable, false);
pendingFetches.at(-1).resolve({ ok: false, status: 400, json: async () => ({ code: 'INSUFFICIENT_FUNDS', message: '餘額不足' }) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.match(pendingFetches.at(-1).args[0], /\/session$/);
pendingFetches.at(-1).resolve({ ok: true, status: 200, json: async () => ({ data: { info: { gold: 0.37 } } }) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(recoveryMenu.startBt.interactable, true, 'release the request lock BEFORE restoring buttons');
assert.equal(recoveryMenu.allAddBt.interactable, true, 'all bet controls recover, not just Start');
assert.equal(recoveryBalance.box.getNum(), 0.37, 'rejected stale funds are refreshed from the wallet');

recoveryRound.box.setNum(40);
recoveryBalance.box.setNum(60.37);
recoveryPlay._playing = true;
recoveryMenu.setBidaxiao();
recoveryMenu.clickDaOrXiao();
recoveryMenu.initButton(); // The archived response callback does this before its number animation finishes.
assert.equal(recoveryMenu._kaishiBiDdaxiao_bool, true);
assert.equal(recoveryMenu.startBt.interactable, false);
recoveryMenu.clickDaOrXiao(); recoveryMenu.clickZuo(); recoveryMenu.clickKaishi();
assert.equal(gambleStarts, 1, 'gamble presentation prevents repeated requests');
assert.equal(paidStarts, 0, 'a pending gamble cannot be collected or start another spin');
assert.equal(recoveryRound.box.getNum(), 40, 'allocation cannot change during a pending gamble');
recoveryMenu.setBidaxiao(); // Real animation completion.
assert.equal(recoveryMenu.startBt.interactable, true);

const retrySpin = createBridgeXHR();
retrySpin.open('POST', 'https://legacy.test/index/game/get_gift');
retrySpin.send(JSON.stringify({ fruits: [[4, 1]], money: 1 }));
const firstAttempt = pendingFetches.at(-1);
firstAttempt.reject(new TypeError('Network response lost'));
await new Promise((resolve) => setTimeout(resolve, 0));
const secondAttempt = pendingFetches.at(-1);
assert.notEqual(firstAttempt, secondAttempt);
assert.match(firstAttempt.args[0], /\/operations\/spin$/, 'an older API must reject, not silently ignore the operation key');
assert.equal(secondAttempt.args[1].body, firstAttempt.args[1].body, 'retry must reuse the exact operation and stake');
assert.match(JSON.parse(secondAttempt.args[1].body).operationId, /^[\da-f-]{36}$/i);
secondAttempt.resolve({ ok: true, status: 200, json: async () => ({ code: 1, data: { data: { type: 0, pos: 10 }, money: [0] }, balance: 0.37, spinId: 'same-receipt' }) });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(JSON.parse(retrySpin.responseText).spinId, 'same-receipt');

console.log('Fruit Mary settlement and animation recovery tests passed.');
