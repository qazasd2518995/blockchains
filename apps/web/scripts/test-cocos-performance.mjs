import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const workspaceRoot = path.resolve(webRoot, '../..');
const builds = [
  {
    folder: 'storm-of-seth-2-v115',
    main: 'index.js',
    minimumPreloads: 1,
    cocos3: true,
  },
  {
    folder: 'h5-slot-collection',
    main: 'main.649de.js',
    minimumPreloads: 3,
    cocos3: false,
  },
  {
    folder: 'fruit-mary',
    main: 'main.b4cc7.js',
    minimumPreloads: 0,
    cocos3: false,
  },
];

for (const build of builds) {
  const buildRoot = path.join(webRoot, 'public/games', build.folder);
  const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8');
  const preloadTags = Array.from(html.matchAll(/<link rel="preload" href="([^"]+)"[^>]*>/g));
  const preloadPaths = preloadTags.map((match) => match[1]);

  assert.ok(
    preloadPaths.length >= build.minimumPreloads,
    `${build.folder} should preload its Cocos shell`,
  );
  for (const relativePath of preloadPaths) {
    assert.ok(
      fs.existsSync(path.join(buildRoot, relativePath)),
      `${build.folder} preload target is missing: ${relativePath}`,
    );
  }
  for (const match of preloadTags) {
    if (match[1].includes('/assets/')) {
      assert.match(match[0], /crossorigin="anonymous"/);
    }
  }

  if (build.cocos3) {
    assert.match(html, /System\.import\('\.\/index\.js'\)/);
    assert.match(html, /src\/seth2-local-adapter\.js/);
    assert.match(html, /id="loadingMsg"[^>]*>遊戲載入中…<\/div>/);
    const applicationSource = fs.readFileSync(path.join(buildRoot, 'application.js'), 'utf8');
    const appSource = fs.readFileSync(path.join(buildRoot, 'app.js'), 'utf8');
    assert.match(applicationSource, /frameRate:\s*60/);
    assert.match(applicationSource, /view_mode == "portrait"/);
    assert.match(applicationSource, /this\.showFPS = false/);
    assert.match(applicationSource, /debugMode:\s*cc\.DebugMode\.ERROR/);
    assert.match(applicationSource, /maxConcurrency = concurrency/);
    assert.match(applicationSource, /maxRequestsPerFrame = concurrency/);
    assert.match(appSource, /cocosHasTakenOver/);
    assert.match(appSource, /requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(finishHandoff\)\)/);
    assert.match(appSource, /setTimeout\(showLoadingRetry, 45000\)/);
    assert.match(appSource, /重新載入/);
    assert.doesNotMatch(appSource, /setTimeout\(hideLogo, 500\)/);
    assert.match(html, /assets\/g1005\/config\.json/);
    assert.match(html, /assets\/g1005\/index\.js/);
  } else {
    assert.match(html, new RegExp(`<script src="${build.main.replace('.', '\\.')}`));
    const mainSource = fs.readFileSync(path.join(buildRoot, build.main), 'utf8');
    const onStartSource = mainSource.slice(
      mainSource.indexOf('var onStart'),
      mainSource.indexOf('var option'),
    );
    assert.match(onStartSource, /cc\.view\.enableRetina\(true\)/);
    assert.match(
      onStartSource,
      /cc\.view\._maxPixelRatio = Math\.min\(1\.5, window\.devicePixelRatio/,
    );
    assert.match(onStartSource, /mobile-balanced-retina/);
    assert.match(
      onStartSource,
      /cc\.macro\.CLEANUP_IMAGE_CACHE = false/,
      `${build.folder} must retain decoded images so iOS can rebuild partially lost WebGL textures`,
    );
  }
}

const renderBlueprint = fs.readFileSync(path.join(workspaceRoot, 'render.yaml'), 'utf8');
for (const build of builds.filter((entry) => entry.folder !== 'fruit-mary')) {
  assert.match(renderBlueprint, new RegExp(`/games/${build.folder}/assets/\\*`));
}
assert.match(renderBlueprint, /\/slotFramework\/40401f29702686de9cfed69b217641b6029834f7\/\*/);

console.log('Cocos preload, adaptive mobile rendering, and cache contracts passed.');
