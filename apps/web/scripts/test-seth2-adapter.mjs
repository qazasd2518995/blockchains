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

const { publicGameError, recoverAnimationFailure, syncMultiplierBankBefore } =
  context.__YachiyoSeth2AdapterTest;
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
