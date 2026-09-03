import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const gameRoot = path.join(webRoot, 'public/games/storm-of-seth-2-v115');
const frameworkRoot = path.join(
  webRoot,
  'public/slotFramework/40401f29702686de9cfed69b217641b6029834f7',
);
const manifest = JSON.parse(fs.readFileSync(path.join(gameRoot, 'asset-manifest.json'), 'utf8'));
const gameLabelsSource = fs.readFileSync(path.join(webRoot, 'src/i18n/gameLabels.ts'), 'utf8');
const sethPageSource = fs.readFileSync(path.join(webRoot, 'src/pages/games/Seth2Page.tsx'), 'utf8');
const gameDocument = fs.readFileSync(path.join(gameRoot, 'index.html'), 'utf8');
const portraitLoadingPrefab = fs.readFileSync(
  path.join(
    gameRoot,
    'assets/resources/import/3e/3e8965eb-cf9e-4542-b1f5-93891a50a8c9.json',
  ),
  'utf8',
);
const sharedGamesSource = fs.readFileSync(
  path.resolve(webRoot, '../../packages/shared/src/games.ts'),
  'utf8',
);

for (const source of [gameLabelsSource, sethPageSource, sharedGamesSource]) {
  assert.doesNotMatch(source, /黃金賽特|黄金赛特/, 'the incorrect Golden Seth name must not return');
}
assert.match(gameLabelsSource, /戰神賽特 II：覺醒之力/);
assert.match(gameLabelsSource, /战神赛特 II：觉醒之力/);
assert.match(gameLabelsSource, /Storm of Seth 2 – Awakening/);
assert.match(sethPageSource, /title="戰神賽特 II：覺醒之力"/);
assert.match(sharedGamesSource, /nameZh: '戰神賽特 II：覺醒之力'/);
assert.ok(
  portraitLoadingPrefab.includes('[5,105.42,30.24],[0,0.5,0.5]'),
  'the portrait loading label must use a centered anchor',
);
assert.ok(
  portraitLoadingPrefab.includes(
    '[1,"b9hPePgi1BG5zkUKjQc93w",null,null,null,1,0],[1,0,-604.88,0]',
  ),
  'the portrait loading label must be positioned on the progress bar center line',
);
assert.match(
  gameDocument,
  /3e8965eb-cf9e-4542-b1f5-93891a50a8c9\.json[\s\S]*20260904-loading-center-1/,
  'the corrected immutable prefab must use a revised request URL',
);

assert.deepEqual(manifest.source, {
  gameRevision: '361d567d94ac569664c82068a30b762e8d8438b8',
  gameVersion: '1.1.5',
  frameworkRevision: '40401f29702686de9cfed69b217641b6029834f7',
  frameworkVersion: '1.1.2_1',
  cocosCreator: '3.7.2',
});
assert.ok(manifest.gameFiles.length >= 2_500, 'the complete game build must be present');
assert.ok(manifest.frameworkFiles.length >= 320, 'the complete slot framework must be present');
assert.ok(
  manifest.gameFiles.some((entry) => entry.path === 'public/bg_blur.jpg'),
  'the full-resolution startup background must be captured',
);
assert.deepEqual(
  manifest.bundleSummary.map((bundle) => bundle.name),
  ['internal', 'main', 'resources', 'g1005', 'slotFramework'],
  'every Cocos project bundle must be captured',
);

function filesUnder(root, ignored = new Set()) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(root, absolute).split(path.sep).join('/');
        if (!ignored.has(relative)) files.push(relative);
      }
    }
  }
  visit(root);
  return files.sort();
}

function verifyManifest(root, entries, ignored = new Set()) {
  const listed = entries.map((entry) => entry.path).sort();
  assert.deepEqual(
    filesUnder(root, ignored),
    listed,
    `${root} contains an untracked or missing asset`,
  );
  for (const entry of entries) {
    const absolute = path.join(root, entry.path);
    const data = fs.readFileSync(absolute);
    assert.equal(data.byteLength, entry.bytes, `${entry.path} size differs from its manifest`);
    assert.equal(
      createHash('sha256').update(data).digest('hex'),
      entry.sha256,
      `${entry.path} hash differs from its manifest`,
    );
    assert.ok(entry.bytes < 50 * 1024 * 1024, `${entry.path} is too large for reliable deployment`);
  }
}

verifyManifest(gameRoot, manifest.gameFiles, new Set(['asset-manifest.json']));
verifyManifest(frameworkRoot, manifest.frameworkFiles);

const frameworkRuntime = fs.readFileSync(path.join(frameworkRoot, 'index.js'), 'utf8');
for (const referenceRateLabel of [
  '模擬參考率',
  '模拟参考率',
  'Simulated rate',
  'Tỷ lệ mô phỏng',
  'อัตราจำลอง',
  'Simülasyon oranı',
]) {
  assert.ok(
    frameworkRuntime.includes(`slotTableRtp:"${referenceRateLabel}"`),
    `the simulated rate label is missing: ${referenceRateLabel}`,
  );
}

const gameConfig = JSON.parse(
  fs.readFileSync(path.join(gameRoot, 'assets/g1005/config.json'), 'utf8'),
);
const internalConfig = JSON.parse(
  fs.readFileSync(path.join(gameRoot, 'assets/internal/config.json'), 'utf8'),
);
assert.equal(internalConfig.name, 'internal');
assert.equal(internalConfig.uuids.length, 29);
assert.equal(Object.keys(internalConfig.packs).length, 1);
const logicalPaths = Object.values(gameConfig.paths).map((entry) => entry[0]);
assert.equal(logicalPaths.length, 3_455);
assert.equal(gameConfig.uuids.length, 3_501);
assert.equal(Object.keys(gameConfig.packs).length, 27);

const orientations = ['portrait', 'landscape'];
const locales = ['en', 'th', 'tr', 'vn', 'zh-cn', 'zh-tw'];
for (const orientation of orientations) {
  assert.ok(
    logicalPaths.filter((value) => value.includes(`/${orientation}/`)).length > 1_500,
    `${orientation} art is incomplete`,
  );
  for (const locale of locales) {
    assert.ok(
      logicalPaths.some((value) => value.includes(`/locale/${orientation}/${locale}/`)),
      `${orientation}/${locale} localized art is missing`,
    );
  }
  for (let feature = 1; feature <= 3; feature += 1) {
    assert.ok(
      logicalPaths.includes(
        `assets/texture/common/${orientation}/buy_feature_board_icon_${feature}`,
      ),
      `${orientation} purchase feature ${feature} artwork is missing`,
    );
  }
  assert.ok(
    logicalPaths.includes(`assets/spine/${orientation}/characterA/StormOfSet_characterA`),
    `${orientation} Seth character animation is missing`,
  );
  assert.ok(
    logicalPaths.includes(`assets/spine/${orientation}/characterB/StormOfSet_characterB`),
    `${orientation} goddess character animation is missing`,
  );
}

const audioPaths = logicalPaths.filter((value) => value.startsWith('assets/music/'));
const nativeAudio = filesUnder(path.join(gameRoot, 'assets/g1005/native')).filter((value) =>
  value.endsWith('.mp3'),
);
assert.equal(audioPaths.length, 94, 'the source audio catalog must contain all 94 cues');
assert.equal(nativeAudio.length, 94, 'all source audio files must be locally deployed');
assert.ok(audioPaths.includes('assets/music/bgm/bgm_mg'));
assert.ok(audioPaths.includes('assets/music/bgm/bgm_golden_fg'));
assert.ok(audioPaths.includes('assets/music/btm/btm_ch_male'));
assert.ok(audioPaths.includes('assets/music/btm/btm_ch_female'));

console.log(
  `Seth 2 v1.1.5 asset integrity passed: ${manifest.gameFiles.length} game files, ` +
    `${manifest.frameworkFiles.length} framework files, 94 audio cues, 2 orientations, 6 locales.`,
);
