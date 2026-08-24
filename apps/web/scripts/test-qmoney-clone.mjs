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
  '/qmoney/app.js?v=20260824-refresh-lock-1',
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

for (const [pattern, message] of [
  [/let refreshInFlight = null;/, 'the Qmoney lobby must maintain one shared token refresh'],
  [
    /if \(refreshInFlight\) return refreshInFlight;/,
    'concurrent catalog and balance requests must join the active refresh',
  ],
  [
    /latestSession\.refreshToken === attemptedRefreshToken/,
    'a stale refresh must distinguish a newer persisted token rotation',
  ],
  [
    /state\.session\?\.refreshToken === attemptedRefreshToken\) signOut\(false\)/,
    'a stale failed refresh must not clear a newer authenticated session',
  ],
]) {
  assert.match(app, pattern, message);
}

{
  const refreshFunctions = app.slice(
    app.indexOf('function adoptRotatedStoredSession'),
    app.indexOf('async function apiRequest'),
  );
  assert.ok(refreshFunctions.includes('function refreshTokens()'));
  const buildRefreshHarness = new Function(
    'state',
    'readStoredSession',
    'persistSession',
    'rawRequest',
    `let refreshInFlight = null;\n${refreshFunctions}\nreturn { refreshTokens };`,
  );

  const state = {
    session: { user: { username: 'testplayer4' }, accessToken: 'expired', refreshToken: 'old' },
  };
  let resolveRefresh;
  let refreshRequestCount = 0;
  const pendingRefresh = new Promise((resolve) => {
    resolveRefresh = resolve;
  });
  const harness = buildRefreshHarness(
    state,
    () => state.session,
    (session) => {
      state.session = session;
    },
    () => {
      refreshRequestCount += 1;
      return pendingRefresh;
    },
  );
  const catalogRefresh = harness.refreshTokens();
  const balanceRefresh = harness.refreshTokens();
  assert.equal(catalogRefresh, balanceRefresh, 'parallel lobby requests must await one promise');
  assert.equal(refreshRequestCount, 1, 'parallel lobby requests must issue one refresh request');
  resolveRefresh({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
  await Promise.all([catalogRefresh, balanceRefresh]);
  assert.equal(state.session.refreshToken, 'fresh-refresh');

  const rotatedSession = {
    user: { username: 'testplayer4' },
    accessToken: 'iframe-access',
    refreshToken: 'iframe-refresh',
  };
  const staleState = {
    session: { user: rotatedSession.user, accessToken: 'expired', refreshToken: 'stale-refresh' },
  };
  const staleHarness = buildRefreshHarness(
    staleState,
    () => rotatedSession,
    (session) => {
      staleState.session = session;
    },
    () => Promise.reject(new Error('stale refresh rejected')),
  );
  const adopted = await staleHarness.refreshTokens();
  assert.equal(adopted.refreshToken, 'iframe-refresh');
  assert.equal(staleState.session.refreshToken, 'iframe-refresh');
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
