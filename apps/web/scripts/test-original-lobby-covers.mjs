import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = path.join(webRoot, 'public');
const coverSource = [
  fs.readFileSync(path.join(webRoot, 'src/lib/gameCoverAssets.ts'), 'utf8'),
  fs.readFileSync(path.join(webRoot, '../../packages/shared/src/newCasino.ts'), 'utf8'),
].join('\n');

const expectedCovers = [
  ['storm-of-seth-2', 'game-art/lobby/qmoney77/storm-of-seth-2.webp'],
  ['power-of-thor-2', 'game-art/lobby/qmoney77/power-of-thor-2.webp'],
  ['h5-fire-88', 'game-art/original/h5-individual/h5-fire-88-cover-v1.webp'],
  ['h5-lucky-777', 'game-art/original/h5-individual/h5-lucky-777-cover-v1.webp'],
  ['h5-fortune-ox', 'game-art/lobby/richpanda/fortune-ox.png'],
  ['h5-mahjong-ways', 'game-art/original/h5-individual/h5-mahjong-ways-cover-v1.webp'],
  ['h5-mahjong-ways-2', 'game-art/original/h5-individual/h5-mahjong-ways-2-cover-v1.webp'],
  ['h5-dragon-hatch', 'game-art/original/h5-individual/h5-dragon-hatch-cover-v1.webp'],
  ['h5-captains-bounty', 'game-art/original/h5-individual/h5-captains-bounty-cover-v1.webp'],
  ['h5-caishen-wins', 'game-art/original/h5-individual/h5-caishen-wins-cover-v1.webp'],
  ['h5-queen-of-bounty', 'game-art/lobby/qmoney77/queen-of-bounty.webp'],
  ['blackjack', 'game-art/lobby/qmoney77/royal-blackjack.webp'],
  ['blackjack-table-2', 'game-art/lobby/qmoney77/classic-blackjack.webp'],
  ['mines', 'game-art/lobby/qmoney77/mines.webp'],
  ['tower', 'game-art/lobby/qmoney77/tower-rush.webp'],
];

for (const [gameId, relativePath] of expectedCovers) {
  const publicPath = `/${relativePath}`;
  assert.ok(
    coverSource.includes(`'${publicPath}'`),
    `${gameId} must use its verified lobby cover`,
  );

  const data = fs.readFileSync(path.join(publicRoot, relativePath));
  assert.ok(data.byteLength >= 20_000, `${relativePath} is unexpectedly small`);
  const isPng = data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP';
  assert.ok(isPng || isWebp, `${relativePath} is not PNG or WebP`);

  const parsed = path.parse(relativePath);
  for (const width of [480, 960]) {
    const optimizedRelativePath = path.join(
      '_optimized',
      parsed.dir,
      `${parsed.name}@${width}.webp`,
    );
    const optimizedData = fs.readFileSync(path.join(publicRoot, optimizedRelativePath));
    assert.ok(optimizedData.byteLength >= 10_000, `${optimizedRelativePath} is unexpectedly small`);
    assert.equal(
      optimizedData.subarray(0, 4).toString('ascii'),
      'RIFF',
      `${optimizedRelativePath} is not RIFF`,
    );
    assert.equal(
      optimizedData.subarray(8, 12).toString('ascii'),
      'WEBP',
      `${optimizedRelativePath} is not WebP`,
    );
  }
}

console.log('Verified first-party and source-matched lobby cover contracts passed.');
