import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = path.join(webRoot, 'public');
const gameRoot = path.join(publicRoot, 'games/power-of-thor-2');
const originalRoot = path.join(gameRoot, 'original');
const files = walk(originalRoot);

assert.equal(files.length, 548, 'Thor 2 read-only source archive must retain all 548 files');
assert.equal(
  files.filter((file) => file.endsWith('.mp3')).length,
  94,
  'Thor 2 source archive must retain all 94 audio cues',
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(gameRoot, 'documentation/asset-manifest.json'), 'utf8'),
);
assert.equal(manifest.files.length, 548, 'Thor 2 asset manifest must cover every archived file');
assert.equal(manifest.summary.fileCount, files.length, 'Thor 2 manifest summary is stale');
const manifestByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
for (const file of files) {
  const relativePath = path.relative(originalRoot, file).split(path.sep).join('/');
  const entry = manifestByPath.get(`static-mirror/${relativePath}`);
  assert.ok(entry, `Thor 2 manifest is missing ${relativePath}`);
  const contents = fs.readFileSync(file);
  assert.equal(entry.bytes, contents.byteLength, `Thor 2 byte count changed: ${relativePath}`);
  assert.equal(
    entry.sha256,
    createHash('sha256').update(contents).digest('hex'),
    `Thor 2 checksum changed: ${relativePath}`,
  );
}
assert.equal(
  manifest.capture.wageredSpins,
  2,
  'capture metadata must include both one-credit spins',
);
assert.equal(manifest.capture.totalBet, 2, 'capture metadata must retain the bounded spend');

const spineWasmPath = path.join(
  originalRoot,
  'gameresource3.rsgaming955.com/WebUI3/content/PowerOfThor2/cocos-js/assets/spine-CC34fKUR.wasm',
);
const spineWasm = fs.readFileSync(spineWasmPath);
assert.equal(spineWasm.byteLength, 205175, 'Thor 2 original Spine runtime has the wrong size');
await WebAssembly.compile(spineWasm);

for (const relativePath of [
  'original-runtime/index.html',
  'original-runtime/thor2-original-adapter.js',
  'original-runtime/record/PowerOfThor2/version.json',
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
assert.ok(
  pageSource.includes('/games/power-of-thor-2/original-runtime/index.html'),
  'The route must mount the archived original Cocos runtime',
);
for (const forbidden of ['Thor2Cascade', 'SymbolCell', 'base-reference.png', 'PowerOfThor2Page.css']) {
  assert.ok(!pageSource.includes(forbidden), `React reconstruction leaked into the route: ${forbidden}`);
}

const viteSource = fs.readFileSync(path.join(webRoot, 'vite.config.ts'), 'utf8');
assert.ok(
  viteSource.includes("process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3000'"),
  'The local original-client bridge must default to the project API server',
);

const runtimeHtml = fs.readFileSync(path.join(gameRoot, 'original-runtime/index.html'), 'utf8');
for (const originalBootAsset of [
  'common/js/jsStart-cocos.js',
  'content/PowerOfThor2/src/polyfills.bundle.js',
  'content/PowerOfThor2/src/system.bundle.js',
  'content/PowerOfThor2/src/import-map.json',
  "System.import(CONTENT + '/index.js')",
]) {
  assert.ok(runtimeHtml.includes(originalBootAsset), `Original Cocos boot asset missing: ${originalBootAsset}`);
}

const adapterSource = fs.readFileSync(
  path.join(gameRoot, 'original-runtime/thor2-original-adapter.js'),
  'utf8',
);
for (const contract of [
  "authorizedFetch('/session'",
  "authorizedFetch('/spin'",
  "authorizedFetch('/feature/progress'",
  "authorizedFetch('/feature/complete'",
  'PlayerReqestLogin',
  'PlayerRequestBuyFeature',
  'ServerResponseGameStart',
  'AutoCompleteStatesResponse',
  "CryptoJS.DES.encrypt",
  "CryptoJS.DES.decrypt",
  "Type: 'WalletUpdate'",
  'flowEnd: isLastCascade ? options.flowEnd : 0',
  'if (entersFree) baseGrid = ensureFreeTriggerGrid(baseGrid)',
  'bonusCount < 4',
  "Type: 'AddFreeGame'",
  'AddFreeSpinTime: Math.max(0, Number(spins) || 0)',
  'enterFreeSpins: entersFree ? feature.spinsAwarded : 0',
  'normalizeMultiplierMatrix(rng, data.multiple)',
  'return entry.freeRound > activeSequence.progressCursor',
  'BetList: [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]',
]) {
  assert.ok(adapterSource.includes(contract), `Original-client adapter contract is missing: ${contract}`);
}
for (const forbidden of [
  'base-reference.png',
  '/ui/',
  'ReactDOM',
  'fallbackGrid',
  'FreeSpinTimesSelect: -1',
]) {
  assert.ok(!adapterSource.includes(forbidden), `Reconstructed fallback leaked into adapter: ${forbidden}`);
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

console.log('Thor 2 original Cocos runtime, archive, cover and local adapter contracts passed.');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
