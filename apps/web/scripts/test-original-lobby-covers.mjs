import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = path.join(webRoot, 'public');
const coverSource = fs.readFileSync(path.join(webRoot, 'src/lib/gameCoverAssets.ts'), 'utf8');

const expectedCovers = [
  ['storm-of-seth-2', 'game-art/original/storm-of-seth-2-cover-v1.webp'],
  ['h5-fire-88', 'game-art/original/h5-individual/h5-fire-88-cover-v1.webp'],
  ['h5-lucky-777', 'game-art/original/h5-individual/h5-lucky-777-cover-v1.webp'],
  ['h5-fortune-ox', 'game-art/original/h5-individual/h5-fortune-ox-cover-v1.webp'],
  ['h5-mahjong-ways', 'game-art/original/h5-individual/h5-mahjong-ways-cover-v1.webp'],
  ['h5-mahjong-ways-2', 'game-art/original/h5-individual/h5-mahjong-ways-2-cover-v1.webp'],
  ['h5-dragon-hatch', 'game-art/original/h5-individual/h5-dragon-hatch-cover-v1.webp'],
  [
    'h5-captains-bounty',
    'game-art/original/h5-individual/h5-captains-bounty-cover-v1.webp',
  ],
  ['h5-caishen-wins', 'game-art/original/h5-individual/h5-caishen-wins-cover-v1.webp'],
  [
    'h5-queen-of-bounty',
    'game-art/original/h5-individual/h5-queen-of-bounty-cover-v1.webp',
  ],
];

for (const [gameId, relativePath] of expectedCovers) {
  const publicPath = `/${relativePath}`;
  assert.ok(
    coverSource.includes(`'${gameId}'`) && coverSource.includes(`'${publicPath}'`),
    `${gameId} must use its stable original-art lobby cover`,
  );

  const data = fs.readFileSync(path.join(publicRoot, relativePath));
  assert.ok(data.byteLength >= 20_000, `${relativePath} is unexpectedly small`);
  assert.equal(data.subarray(0, 4).toString('ascii'), 'RIFF', `${relativePath} is not RIFF`);
  assert.equal(data.subarray(8, 12).toString('ascii'), 'WEBP', `${relativePath} is not WebP`);

  const parsed = path.parse(relativePath);
  for (const width of [480, 960]) {
    const optimizedRelativePath = path.join(
      '_optimized',
      parsed.dir,
      `${parsed.name}@${width}.webp`,
    );
    const optimizedData = fs.readFileSync(path.join(publicRoot, optimizedRelativePath));
    assert.ok(
      optimizedData.byteLength >= 10_000,
      `${optimizedRelativePath} is unexpectedly small`,
    );
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

console.log('Original Seth 2 and nine H5 lobby cover contracts passed.');
