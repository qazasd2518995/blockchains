import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/storm-of-seth-2/seth2-adapter.js', import.meta.url),
);
const source = fs.readFileSync(adapterPath, 'utf8');
const storage = { getItem: () => null, setItem: () => {} };
const parentMessages = [];
const context = {
  URLSearchParams,
  console: { ...console, error: () => {} },
  location: { origin: 'https://example.test', search: '' },
  localStorage: storage,
  parent: { localStorage: storage, postMessage: (message) => parentMessages.push(message) },
  setInterval: () => 1,
  clearInterval: () => {},
  setTimeout: () => 1,
  clearTimeout: () => {},
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context);

const {
  officialMultiplierValues,
  machineDisplayRate,
  machinePageNumber,
  multiplierAssetName,
  multiplierVisualTier,
  publicGameError,
  recoverAnimationFailure,
  syncMultiplierBankBefore,
  featureModelType,
  formatPrizeAmount,
  installCocosAudioControls,
} = context.__YachiyoSeth2AdapterTest;
assert.equal(machinePageNumber(0), 1);
assert.equal(machinePageNumber(7), 8);
assert.equal(machinePageNumber(99), 8);
const machineRates = new Set();
for (let machineId = 1; machineId <= 4000; machineId += 1) {
  const rate = machineDisplayRate(machineId, 1_800_000_000_000, 0);
  assert.match(rate, /^\d{2,3}\.\d{2}$/);
  assert.ok(Number(rate) >= 70);
  machineRates.add(rate);
}
assert.equal(machineRates.size, 4000);
assert.notEqual(
  machineDisplayRate(3974, 1_800_000_000_000, 0),
  machineDisplayRate(3974, 1_800_000_002_500, 0),
);
assert.deepEqual(
  Array.from(officialMultiplierValues),
  [2, 3, 4, 5, 6, 8, 10, 15, 25, 50, 100, 200, 300, 500],
);
for (const [value, tier] of [
  [2, 0],
  [3, 0],
  [4, 0],
  [5, 0],
  [6, 0],
  [8, 0],
  [10, 1],
  [15, 1],
  [25, 1],
  [50, 2],
  [100, 2],
  [200, 3],
  [300, 3],
  [500, 3],
]) {
  assert.equal(multiplierVisualTier(value), tier);
  assert.equal(multiplierAssetName(value, false), `game/pic/symbol/symbol_${10 + tier}`);
  assert.equal(multiplierAssetName(value, true), `game/pic/symbol/symbol_${10 + tier}_01`);
}
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
assert.equal(featureModelType({ featureMode: 'standard', gameModelType: 0 }), 0);
assert.equal(featureModelType({ featureMode: 'awakening', gameModelType: 0 }), 1);
assert.equal(featureModelType({ featureMode: 'standard', gameModelType: 1 }), 1);
assert.equal(formatPrizeAmount(1234567.8), '1,234,567.80');

const audioState = { music: 1, effects: 1 };
const audioEngine = {
  setMusicVolume: (volume) => {
    audioState.music = volume;
  },
  setEffectsVolume: (volume) => {
    audioState.effects = volume;
  },
  getMusicVolume: () => 1,
  getEffectsVolume: () => 1,
};
const audioBridge = installCocosAudioControls(audioEngine);
audioBridge.updatePrefs({
  musicMuted: false,
  musicVolume: 0.25,
  effectsMuted: true,
  effectsVolume: 0.75,
});
assert.equal(audioState.music, 0.25);
assert.equal(audioState.effects, 0);

const emitted = [];
const eventNames = {
  GAME_END_REFRESH_MY_SCORE: 'refresh-score',
  BUY_GAME_NEXT_STEP: 'buy-next',
  FREE_GAME_NEXT_STEP: 'free-next',
};
const game = {
  colMain: { isRoll: true },
  isCanClick: false,
  isBuyGame: false,
  isFreeGame: false,
  getIsAuto: () => false,
  setBtnState: (enabled) => {
    game.buttonsEnabled = enabled;
  },
};
context.__require = (name) => {
  if (name === 'Game') return { default: { instance: game } };
  if (name === 'GameEvent') {
    return {
      GameEventName: eventNames,
      default: { getInstance: () => ({ emit: (event) => emitted.push(event) }) },
    };
  }
  throw new Error(`Unexpected module: ${name}`);
};
context.setTimeout = (callback) => {
  callback();
  return 1;
};

recoverAnimationFailure(new Error('bad cascade data'), { is_sjc: 0, freeGameCount: 0 });
assert.equal(game.colMain.isRoll, false);
assert.equal(game.isCanClick, true);
assert.equal(game.buttonsEnabled, true);
assert.deepEqual(emitted, ['refresh-score']);
assert.equal(parentMessages.at(-1)?.type, 'seth2:animation-error');

game.colMain.isRoll = true;
game.isCanClick = false;
game.isBuyGame = true;
emitted.length = 0;
recoverAnimationFailure(new Error('bad buy animation'), { is_sjc: 1, freeGameCount: 4 });
assert.equal(game.colMain.isRoll, false);
assert.equal(game.isCanClick, true);
assert.deepEqual(emitted, ['refresh-score', 'buy-next']);

const resultGame = {
  rightBeiShu: {
    cur_beishu: 0,
    ttf_beishu: { string: '0x' },
  },
};
syncMultiplierBankBefore(resultGame, { multiplierBankBefore: 218 });
assert.equal(resultGame.rightBeiShu.cur_beishu, 218);
assert.equal(resultGame.rightBeiShu.ttf_beishu.string, '218x');

console.log('Seth2 adapter public error contract tests passed.');
