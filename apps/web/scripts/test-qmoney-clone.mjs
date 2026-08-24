import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qmoneyRoot = path.join(webRoot, 'public', 'qmoney');
const [html, css, app, integrationText] = await Promise.all([
  readFile(path.join(qmoneyRoot, 'index.html'), 'utf8'),
  readFile(path.join(qmoneyRoot, 'styles.css'), 'utf8'),
  readFile(path.join(qmoneyRoot, 'app.js'), 'utf8'),
  readFile(path.join(qmoneyRoot, 'integration.json'), 'utf8'),
]);

// Parse the browser script without executing DOM-dependent code.
new Function(app);

for (const marker of [
  'data-category="全部"',
  'data-category="最愛"',
  'data-action="notices"',
  'id="jackpotDigits"',
  'class="bottom-nav"',
]) {
  assert.ok(html.includes(marker), `missing lobby marker: ${marker}`);
}

for (const marker of [
  'lobbypopframebg.webp',
  'lobbypopbg.webp',
  'footer-bg.webp',
  'jp_${character}.webp',
  '/auth/login',
  '/games/catalog',
  '/wallet/balance',
  'TEST_PLAYER_PATTERN',
]) {
  assert.ok(`${html}\n${css}\n${app}`.includes(marker), `missing integration marker: ${marker}`);
}

assert.ok(!`${html}\n${css}\n${app}`.includes('/Users/justin/qmoney77-frontend-archive'));

const referencedAssets = new Set();
for (const source of [html, css]) {
  for (const match of source.matchAll(/\/qmoney\/assets\/([^"')\s]+)/g)) {
    referencedAssets.add(decodeURIComponent(match[1]));
  }
}
for (const match of app.matchAll(/["`](imgs_soc\/[^"`$]+\.(?:webp|png|gif|svg|mp3))["`]/g)) {
  referencedAssets.add(match[1]);
}

for (const relativePath of referencedAssets) {
  await access(path.join(qmoneyRoot, 'assets', relativePath));
}

const integration = JSON.parse(integrationText);
assert.equal(integration.authStorageKey, 'bg-auth');
assert.equal(integration.gameRoutePrefix, '/games/');
assert.ok(integration.assetCount >= referencedAssets.size);

console.log(`Qmoney clone contract passed (${referencedAssets.size} referenced assets checked)`);
