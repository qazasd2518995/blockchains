import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const bundle = fs.readFileSync(
  new URL('../public/games/h5-slot-collection/assets/main/index.9d2e3r1.js', import.meta.url),
  'utf8',
);
const html = fs.readFileSync(
  new URL('../public/games/h5-slot-collection/index.html', import.meta.url),
  'utf8',
);
assert.ok(html.includes("window._CCSettings.bundleVers.main = '9d2e3r1'"));
function method(begin, end, from = 0) {
  const a = bundle.indexOf(begin, from),
    b = bundle.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return bundle.slice(a + begin.indexOf('function'), b);
}
const valid = (object) => !!object && object.valid !== false;
const callbacks = [],
  loaded = [],
  warnings = [];
const progress = { progress: 0 },
  label = { string: '' };
const textNode = { getComponent: () => label };
const bar = { getComponent: () => progress };
const loading = { getChildByName: () => bar };
const canvas = { getChildByName: () => loading };
const cc = {
  isValid: valid,
  ProgressBar: function () {},
  Label: function () {},
  find: (name) => (name === 'Canvas' ? canvas : textNode),
  director: {
    preloadScene: (...args) => callbacks.push(args),
    loadScene: (...args) => loaded.push(args),
  },
  audioEngine: { stopAll() {} },
  warn: (...args) => warnings.push(args),
};
const changeScene = vm.runInNewContext(
  '(' +
    method('QieHuanScene_normal:function', ',updateMessageBoxConfirmButtonClick_Function') +
    ')',
  { cc },
);
const owner = {};
changeScene.call(owner, 'first');
callbacks[0][1](1, 2);
assert.equal(label.string, '50%');
bar.valid = false;
textNode.valid = false;
assert.doesNotThrow(() => callbacks[0][1](2, 2));
assert.equal(label.string, '50%');
changeScene.call(owner, 'second');
callbacks[0][2]();
assert.equal(loaded.length, 0);
callbacks[1][2](Error('missing scene'));
assert.equal(loaded.length, 0);
changeScene.call(owner, 'third');
callbacks[2][2]();
assert.equal(loaded[0][0], 'third');
changeScene.call(owner, 'fourth');
owner.valid = false;
callbacks[3][1](1, 1);
callbacks[3][2]();
assert.equal(loaded.length, 1);

const requests = [];
cc.resources = { load: (...args) => requests.push(args) };
cc.SpriteAtlas = function () {};
cc.SpriteFrame = function () {};
const from = bundle.indexOf('i18n_spriteByName:[');
const changeLanguage = vm.runInNewContext(
  '(' + method('ChangeLanguage:function', '}),cc._RF.pop()', from) + ')',
  { cc },
);
for (const isAtlas of [false, true]) {
  requests.length = 0;
  const sprite = { node: {}, spriteFrame: 'original' };
  const component = {
    node: {},
    Sprite: sprite,
    language: 'cht',
    address: 'game/',
    SpriteName: 'name',
    spAtlasName: 'atlas',
    isAtlas,
  };
  changeLanguage.call(component);
  component.language = 'fr';
  changeLanguage.call(component);
  const asset = (frame) => (isAtlas ? { getSpriteFrame: () => frame } : frame);
  requests[0][2](null, asset('stale'));
  assert.equal(sprite.spriteFrame, 'original');
  requests[1][2](Error('missing'), null);
  assert.ok(requests[2][0].includes('/en/'));
  requests[2][2](null, asset('fallback'));
  assert.equal(sprite.spriteFrame, 'fallback');
  changeLanguage.call(component);
  sprite.valid = false;
  assert.doesNotThrow(() => requests[3][2](null, asset('after destroy')));
  assert.equal(sprite.spriteFrame, 'fallback');
  component.Sprite = null;
  assert.doesNotThrow(() => changeLanguage.call(component));
}
console.log(
  'H5 lifecycle: missing/destroyed nodes, stale scenes/languages, fallback and cache version passed',
);
