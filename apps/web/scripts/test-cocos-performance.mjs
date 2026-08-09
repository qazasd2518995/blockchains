import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = path.resolve(webRoot, '../..');
const builds = [
  {
    folder: 'storm-of-seth-2',
    main: 'main.71ab9.js',
  },
  {
    folder: 'h5-slot-collection',
    main: 'main.5ee37.js',
  },
];

for (const build of builds) {
  const buildRoot = path.join(webRoot, 'public/games', build.folder);
  const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8');
  const preloadPaths = Array.from(
    html.matchAll(/<link rel="preload" href="([^"]+)"/g),
    (match) => match[1],
  );

  assert.ok(preloadPaths.length >= 5, `${build.folder} should preload its Cocos shell`);
  for (const relativePath of preloadPaths) {
    assert.ok(
      fs.existsSync(path.join(buildRoot, relativePath)),
      `${build.folder} preload target is missing: ${relativePath}`,
    );
  }

  assert.match(html, new RegExp(`<script src="${build.main.replace('.', '\\.')}`));
  const mainSource = fs.readFileSync(path.join(buildRoot, build.main), 'utf8');
  assert.match(mainSource, /devicePixelRatio <= 1\.5/);
  assert.match(mainSource, /data-cocos-render-quality/);
  assert.doesNotMatch(mainSource, /cc\.view\.enableRetina\(true\)/);
}

const renderBlueprint = fs.readFileSync(path.join(workspaceRoot, 'render.yaml'), 'utf8');
for (const build of builds) {
  assert.match(
    renderBlueprint,
    new RegExp(`/games/${build.folder}/${build.main.replace('.', '\\.')}`),
  );
  assert.match(renderBlueprint, new RegExp(`/games/${build.folder}/assets/\\*`));
}

console.log('Cocos preload, adaptive rendering, and cache contracts passed.');
