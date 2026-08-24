import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  fruitPage,
  h5Page,
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
  read('src/pages/games/FruitMaryPage.tsx'),
  read('src/pages/games/H5SlotCollectionPage.tsx'),
]);

for (const marker of [
  'data-platform-realm="qmoney"',
  'qmoney-game-stage',
  'qmoney-game-home',
  '<span>回大廳</span>',
  'document.title = `錢女友｜${game.title}`',
]) {
  assert.ok(shell.includes(marker), `missing Qmoney game-shell marker: ${marker}`);
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
  main.includes('import.meta.env.PROD && !isQmoneyRealm'),
  'Qmoney must not register the legacy service worker',
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
for (const page of [sethPage, fruitPage, h5Page]) {
  assert.ok(
    page.includes("isQmoneyRealm ? 'qmoney"),
    'embedded games must receive Qmoney-specific public launch identifiers',
  );
}

console.log('Qmoney game separation contract passed');
