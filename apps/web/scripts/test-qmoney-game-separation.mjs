import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(webRoot, relativePath), 'utf8');

const [
  shell,
  router,
  main,
  qmoneyApp,
  buildScript,
  renderBlueprint,
  fruitHtml,
  h5Html,
  sethPage,
  thorPage,
  fruitPage,
  h5Page,
  baccaratPage,
  newCasinoCatalog,
] = await Promise.all([
  read('src/components/layout/QmoneyGameShell.tsx'),
  read('src/router.tsx'),
  read('src/main.tsx'),
  read('public/qmoney/app.js'),
  read('scripts/write-qmoney-config.mjs'),
  read('../../render.yaml'),
  read('public/games/fruit-mary/index.html'),
  read('public/games/h5-slot-collection/index.html'),
  read('src/pages/games/Seth2Page.tsx'),
  read('src/pages/games/PowerOfThor2Page.tsx'),
  read('src/pages/games/FruitMaryPage.tsx'),
  read('src/pages/games/H5SlotCollectionPage.tsx'),
  read('src/pages/games/BaccaratPage.tsx'),
  read('../../packages/shared/src/newCasino.ts'),
]);

for (const marker of [
  'data-platform-realm="qmoney"',
  'qmoney-game-stage',
  'qmoney-game-home',
  'qmoney-game-audio',
  '<AudioMenu variant="dark" />',
  '<span>回大廳</span>',
  'document.title = `金寶寶｜${game.title}`',
  'window.location.replace(returnTarget.to)',
  "new Event('qmoney:before-game-exit', { cancelable: true })",
]) {
  assert.ok(shell.includes(marker), `missing Qmoney game-shell marker: ${marker}`);
}

for (const [name, page] of [
  ['Fruit Mary', fruitPage],
  ['H5 collection', h5Page],
]) {
  assert.ok(
    page.includes("window.addEventListener('qmoney:before-game-exit'"),
    `${name} must block lobby navigation while a settlement is pending`,
  );
}

for (const [name, page] of [
  ['Fruit Mary', fruitPage],
  ['H5 collection', h5Page],
  ['Seth 2', sethPage],
  ['Thor 2', thorPage],
]) {
  assert.ok(
    page.includes('holdWalletBalanceRefresh'),
    `${name} must prevent background polling from overwriting adapter settlement balances`,
  );
}

assert.ok(
  router.includes('isQmoneyRealm ? <QmoneyGameShell /> : <GameFullscreenShell />'),
  'game routes must select a shell by platform realm',
);
assert.ok(
  router.includes("isQmoneyRealm\n        ? [{ path: '*', element: <QmoneyStaticEntry /> }]"),
  'every non-game Qmoney route must return to the Qmoney static lobby',
);
assert.ok(
  router.includes("isQmoneyRealm && pathname.startsWith('/games/')"),
  'Qmoney game routes must suppress the legacy platform BGM',
);
assert.ok(
  main.includes('{!isQmoneyRealm && <AddToHomeScreenPrompt />}'),
  'Qmoney must not render the legacy PWA prompt',
);
assert.ok(
  main.includes("'serviceWorker' in navigator && import.meta.env.PROD"),
  'both realms should register the same-origin public-asset service worker',
);
assert.ok(
  !main.includes('import.meta.env.PROD && !isQmoneyRealm'),
  'Qmoney must not be excluded from the realm-neutral game asset cache',
);
assert.ok(
  qmoneyApp.includes('syncGameAudioPreferences()'),
  'Qmoney lobby preferences must drive the embedded games audio preferences',
);
assert.ok(
  qmoneyApp.includes('game.category !== state.category'),
  'Jin Baobao categories must use the curated backend category directly',
);
assert.ok(
  !qmoneyApp
    .slice(qmoneyApp.indexOf('function showGame'), qmoneyApp.indexOf('function toggleFavorite'))
    .includes('data-modal-action="launch-game"'),
  'Qmoney game cards must launch directly without a second confirmation dialog',
);
assert.ok(
  buildScript.includes('qmoney-game-boot'),
  'Qmoney game routes need a branded boot loader',
);
assert.ok(
  buildScript.includes("throw new Error('Qmoney platform shell still contains"),
  'Qmoney build must fail if a visible legacy brand remains in its HTML shell',
);
assert.match(renderBlueprint, /VITE_PLATFORM_REALM\s*\n\s*value: qmoney/);
const embeddedGameTitles = [fruitHtml, h5Html]
  .map((html) => html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '')
  .join('\n');
assert.doesNotMatch(embeddedGameTitles, /八千代|Yachiyo/i);
assert.ok(
  baccaratPage.includes("isQmoneyRealm ? '金寶寶' : '八千代'"),
  'the Qmoney baccarat frame must not expose the legacy casino name',
);
for (const page of [sethPage, fruitPage, h5Page]) {
  assert.ok(
    page.includes("isQmoneyRealm ? 'qmoney"),
    'embedded games must receive Qmoney-specific public launch identifiers',
  );
}

for (const marker of [
  'id: GameId.POWER_OF_THOR_2',
  "route: '/games/power-of-thor-2'",
  "cover: '/game-art/lobby/qmoney77/power-of-thor-2.webp'",
  'restricted: true',
]) {
  assert.ok(newCasinoCatalog.includes(marker), `missing Qmoney Thor II catalog marker: ${marker}`);
}
assert.ok(
  router.includes("gameRoute('/games/power-of-thor-2', GameId.POWER_OF_THOR_2"),
  'Qmoney Thor II catalog route must resolve to a guarded React game route',
);
assert.ok(
  thorPage.includes(
    "const ORIGINAL_GAME_PATH = '/games/power-of-thor-2/original-runtime/index.html'",
  ),
  'Qmoney Thor II route must mount the original Cocos runtime',
);
assert.ok(
  thorPage.includes("payload.type === 'thor2:close'"),
  'the original Thor II home action must return through the parent game shell',
);
assert.doesNotMatch(
  thorPage,
  /PowerOfThor2Page\.css|base-reference\.png|Thor2Cascade|SymbolCell/,
  'Qmoney Thor II route must not retain the reconstructed React fallback',
);
await access(path.join(webRoot, 'public/game-art/original/power-of-thor-2-cover-v1.png'));

console.log('Qmoney game separation contract passed');
