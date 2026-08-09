import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = path.resolve(webRoot, '../..');
const builds = [
  {
    folder: 'storm-of-seth-2',
    main: 'main.47d5a.js',
  },
  {
    folder: 'h5-slot-collection',
    main: 'main.649de.js',
  },
];

for (const build of builds) {
  const buildRoot = path.join(webRoot, 'public/games', build.folder);
  const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8');
  const preloadTags = Array.from(html.matchAll(/<link rel="preload" href="([^"]+)"[^>]*>/g));
  const preloadPaths = preloadTags.map((match) => match[1]);

  assert.ok(preloadPaths.length >= 5, `${build.folder} should preload its Cocos shell`);
  for (const relativePath of preloadPaths) {
    assert.ok(
      fs.existsSync(path.join(buildRoot, relativePath)),
      `${build.folder} preload target is missing: ${relativePath}`,
    );
  }
  for (const match of preloadTags) {
    if (match[1].startsWith('assets/')) {
      assert.match(match[0], /crossorigin="anonymous"/);
    }
  }

  assert.match(html, new RegExp(`<script src="${build.main.replace('.', '\\.')}`));
  const mainSource = fs.readFileSync(path.join(buildRoot, build.main), 'utf8');
  const onStartSource = mainSource.slice(
    mainSource.indexOf('var onStart'),
    mainSource.indexOf('var option'),
  );
  assert.match(onStartSource, /cc\.view\.enableRetina\(true\)/);
  assert.doesNotMatch(onStartSource, /devicePixelRatio|mobile-balanced|CLEANUP_IMAGE_CACHE/);
}

const renderBlueprint = fs.readFileSync(path.join(workspaceRoot, 'render.yaml'), 'utf8');
for (const build of builds) {
  assert.match(
    renderBlueprint,
    new RegExp(`/games/${build.folder}/${build.main.replace('.', '\\.')}`),
  );
  assert.match(renderBlueprint, new RegExp(`/games/${build.folder}/assets/\\*`));
}

console.log('Cocos preload, full-quality rendering, and cache contracts passed.');
