import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = path.join(webRoot, 'public');
const gameRoot = path.join(publicRoot, 'games/power-of-thor-2');
const originalRoot = path.join(gameRoot, 'original');
const files = walk(originalRoot);

assert.equal(files.length, 472, 'Thor 2 read-only source archive must retain all 472 files');
assert.equal(
  files.filter((file) => file.endsWith('.mp3')).length,
  94,
  'Thor 2 source archive must retain all 94 audio cues',
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(gameRoot, 'documentation/asset-manifest.json'), 'utf8'),
);
assert.equal(manifest.files.length, 472, 'Thor 2 asset manifest must cover every archived file');
assert.equal(
  manifest.capture.wageredSpins,
  2,
  'capture metadata must include both one-credit spins',
);
assert.equal(manifest.capture.totalBet, 2, 'capture metadata must retain the bounded spend');

for (const relativePath of [
  'ui/symbols/base_symbolM1.png',
  'ui/symbols/base_symbolB1.png',
  'ui/symbols/base_symbolB2.png',
  'ui/help_feature_0.png',
  'ui/base-reference.png',
  'ui/free-reference.png',
  'ui/audio/spin.mp3',
  'ui/audio/base-music.mp3',
  'ui/audio/free-music.mp3',
  'ui/audio/win.mp3',
  'ui/audio/multiplier-collect.mp3',
  'ui/audio/multiplier-hit.mp3',
  'ui/audio/big-win.mp3',
  'ui/audio/legend-win.mp3',
  'documentation/rules-zh-TW.json',
  'documentation/rules-en-US.json',
  'documentation/cocos-asset-catalog.json',
]) {
  assert.ok(fs.statSync(path.join(gameRoot, relativePath)).size > 0, `${relativePath} is missing`);
}

const pageSource = fs.readFileSync(
  path.join(webRoot, 'src/pages/games/PowerOfThor2Page.tsx'),
  'utf8',
);
for (const contract of [
  '/games/thor2/session',
  '/games/thor2/spin',
  '/games/thor2/feature/progress',
  '/games/thor2/feature/complete',
  "['regular', '免費遊戲'",
  "['super', 'Super 免費遊戲'",
  "'lucky',",
  '1/6.44',
]) {
  assert.ok(pageSource.includes(contract), `Thor 2 client contract is missing: ${contract}`);
}

const cover = fs.readFileSync(
  path.join(publicRoot, 'game-art/original/power-of-thor-2-cover-v1.png'),
);
assert.deepEqual([...cover.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
for (const width of [480, 960, 1600]) {
  const optimized = fs.readFileSync(
    path.join(publicRoot, `_optimized/game-art/original/power-of-thor-2-cover-v1@${width}.webp`),
  );
  assert.equal(optimized.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(optimized.subarray(8, 12).toString('ascii'), 'WEBP');
}

console.log('Thor 2 archive, runtime assets, cover and API client contracts passed.');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
