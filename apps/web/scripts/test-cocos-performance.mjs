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
    minimumPreloads: 6,
    cocos3: false,
  },
];

for (const build of builds) {
  const buildRoot = path.join(webRoot, 'public/games', build.folder);
  const html = fs.readFileSync(path.join(buildRoot, 'index.html'), 'utf8');
  const preloadTags = Array.from(
    html.matchAll(/<link\b(?=[^>]*\brel="preload")(?=[^>]*\bhref="([^"]+)")[^>]*>/g),
  );
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
    assert.match(applicationSource, /maxRequestsPerFrame = requestsPerFrame/);
    assert.match(applicationSource, /isLowEndDevice/);
    assert.match(applicationSource, /isLowEndDevice \? 10 : 14/);
    assert.match(appSource, /cocosHasTakenOver/);
    assert.match(appSource, /SETH2_BOOT_ASSETS/);
    assert.match(appSource, /priority: 'low'/);
    assert.match(appSource, /connection\.saveData/);
    const bootAssetBlock = appSource.slice(
      appSource.indexOf('const SETH2_BOOT_ASSETS'),
      appSource.indexOf('let seth2BootWarmupStarted'),
    );
    const bootAssetPaths = Array.from(
      bootAssetBlock.matchAll(/'([0-9a-f]{2}\/[0-9a-f-]+\.(?:astc|jpg|mp3|png))'/g),
      (match) => match[1],
    );
    assert.ok(bootAssetPaths.length >= 40, 'Seth II should warm the measured first-screen hot set');
    for (const assetPath of bootAssetPaths) {
      assert.ok(
        fs.existsSync(path.join(buildRoot, 'assets/g1005/native', assetPath)),
        `Seth II warmup target is missing: ${assetPath}`,
      );
    }
    assert.match(
      appSource,
      /requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(finishHandoff\)\)/,
    );
    assert.match(appSource, /setTimeout\(showLoadingRetry, 45000\)/);
    assert.match(appSource, /type: 'seth2:recovery-request'/);
    assert.match(appSource, /Date\.now\(\) - lastResourceProgressAt < 30000/);
    assert.match(appSource, /setTimeout\(reportBootstrapStall, 75000\)/);
    assert.match(appSource, /重新載入/);
    assert.doesNotMatch(appSource, /setTimeout\(hideLogo, 500\)/);
    assert.match(html, /assets\/g1005\/config\.json/);
    assert.match(html, /assets\/g1005\/index\.js/);
    assert.match(html, /slotFramework\/40401f29702686de9cfed69b217641b6029834f7\/config\.json/);
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
    assert.match(mainSource, /getForegroundLoadOptions/);
    assert.match(mainSource, /navigator\.hardwareConcurrency/);
    assert.match(mainSource, /connection\.saveData/);
    assert.match(mainSource, /bundle\.loadScene\(launchScene, foregroundLoadOptions/);
  }
}

const renderBlueprint = fs.readFileSync(path.join(workspaceRoot, 'render.yaml'), 'utf8');
for (const build of builds) {
  const matches = renderBlueprint.match(new RegExp(`/games/${build.folder}/assets/\\*`, 'g')) ?? [];
  assert.equal(matches.length, 2, `${build.folder} cache rules should cover both static sites`);
}
assert.match(renderBlueprint, /\/slotFramework\/40401f29702686de9cfed69b217641b6029834f7\/\*/);
assert.equal(
  (
    renderBlueprint.match(
      /\/games\/power-of-thor-2\/original\/gameresource3\.rsgaming955\.com\/WebUI3\/content\/PowerOfThor2\/remote\/\*\/native\/\*/g,
    ) ?? []
  ).length,
  2,
  'Thor II native asset cache rules should cover both static sites',
);
for (const fingerprintedAsset of ['_virtual_cc-\\*.js', 'spine-\\*.js']) {
  assert.equal(
    (
      renderBlueprint.match(
        new RegExp(
          `/games/power-of-thor-2/original/gameresource3\\.rsgaming955\\.com/WebUI3/content/PowerOfThor2/cocos-js/${fingerprintedAsset}`,
          'g',
        ),
      ) ?? []
    ).length,
    2,
    `Thor II ${fingerprintedAsset} cache rules should cover both static sites`,
  );
}

const gameManifestSource = fs.readFileSync(
  path.join(webRoot, 'src/lib/gameAssetManifest.ts'),
  'utf8',
);
const routerSource = fs.readFileSync(path.join(webRoot, 'src/router.tsx'), 'utf8');
const gameRouteSource = routerSource.slice(
  routerSource.indexOf('function gameRoute'),
  routerSource.indexOf('function RouteViewportReset'),
);
assert.match(gameRouteSource, /warmGameAssets\(gameId\)/);
assert.doesNotMatch(
  gameRouteSource,
  /await preloadGameAssets\(gameId\)/,
  'route rendering must not wait for image decoding before mounting the game page',
);
assert.match(gameManifestSource, /yachiyo-adapter\.js\?v=50/);
assert.match(gameManifestSource, /fruit-mary-adapter\.js\?v=18/);
assert.match(gameManifestSource, /seth2-local-adapter\.js\?v=20260905-split-completion-2/);
assert.match(gameManifestSource, /thor2-original-adapter\.js\?v=20260901-auth-recovery-1/);
assert.match(gameManifestSource, /main\.649de\.js\?v=5/);
assert.match(gameManifestSource, /THOR2_SHELL_ASSETS/);
assert.match(gameManifestSource, /FRUIT_MARY_SHELL_ASSETS/);

const thor2PageSource = fs.readFileSync(
  path.join(webRoot, 'src/pages/games/PowerOfThor2Page.tsx'),
  'utf8',
);
assert.match(thor2PageSource, /holdWalletBalanceRefresh/);
assert.match(thor2PageSource, /contain: 'layout paint'/);

const proactiveRefreshSource = fs.readFileSync(
  path.join(webRoot, 'src/hooks/useProactiveGameTokenRefresh.ts'),
  'utf8',
);
for (const shellFile of ['QmoneyGameShell.tsx', 'GameFullscreenShell.tsx']) {
  const shellSource = fs.readFileSync(
    path.join(webRoot, 'src/components/layout', shellFile),
    'utf8',
  );
  assert.match(
    shellSource,
    /useProactiveGameTokenRefresh\(\)/,
    `${shellFile} must refresh authentication before a game request receives a 401`,
  );
}
assert.match(proactiveRefreshSource, /visibilitychange/);
assert.match(proactiveRefreshSource, /refreshAccessTokenProactively/);

console.log('Cocos preload, adaptive mobile rendering, and cache contracts passed.');
