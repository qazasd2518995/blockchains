import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qmoneyRoot = path.join(webRoot, 'public', 'qmoney');
const [html, css, app, integrationText, walletRoutes, publicAnnouncements, adminAnnouncements] = await Promise.all([
  readFile(path.join(qmoneyRoot, 'index.html'), 'utf8'),
  readFile(path.join(qmoneyRoot, 'styles.css'), 'utf8'),
  readFile(path.join(qmoneyRoot, 'app.js'), 'utf8'),
  readFile(path.join(qmoneyRoot, 'integration.json'), 'utf8'),
  readFile(path.join(webRoot, '..', 'server', 'src', 'modules', 'wallet', 'wallet.routes.ts'), 'utf8'),
  readFile(path.join(webRoot, '..', 'server', 'src', 'modules', 'public', 'announcements.routes.ts'), 'utf8'),
  readFile(path.join(webRoot, '..', 'server', 'src', 'modules', 'admin', 'announcements', 'announcement.routes.ts'), 'utf8'),
]);

// Parse the browser script without executing DOM-dependent code.
new Function(app);

for (const marker of [
  'data-category="熱門"',
  'data-category="拉霸"',
  'data-category="捕魚"',
  'data-category="棋牌"',
  'data-action="notices"',
  'id="heroTrack"',
  '/qmoney/app.js?v=20260904-performance-1',
  'class="is-booting"',
  'id="bootView"',
  '金寶寶｜遊戲大廳',
  '熱門拉霸、捕魚與棋牌精彩集結。登入金寶寶，開啟專屬娛樂時光。',
  'property="og:title" content="金寶寶｜精彩遊戲，一站暢玩"',
  'property="og:description"',
  'name="twitter:description"',
  'https://bg-qmoney-production.up.railway.app/qmoney/assets/brand/jin-baobao-social.png?v=20260903',
  '精彩遊戲即將登場…',
  '/qmoney/assets/brand/jin-baobao-avatar.webp',
]) {
  assert.ok(html.includes(marker), `missing lobby marker: ${marker}`);
}

assert.ok(!html.includes('正在返回遊戲大廳'), 'link previews must not expose navigation status copy');

for (const removedShell of [
  'id="lineLogin"',
  'class="bottom-nav"',
  'id="jackpotDigits"',
  'data-action="check-in"',
  'data-action="jackpot"',
  'data-action="profile"',
  'data-footer=',
  'data-category="全部"',
  'data-category="電子"',
  'data-category="加密遊戲"',
  'data-category="最愛"',
  'id="providerStrip"',
]) {
  assert.ok(!html.includes(removedShell), `retired shell must be absent: ${removedShell}`);
}

for (const fakeCopy of ['每日續存', '電子救援金', '完成任務送好禮', '封鎖名單', 'VIP等級', '幸運彩池']) {
  assert.ok(!`${html}\n${app}`.includes(fakeCopy), `unsupported lobby copy must be removed: ${fakeCopy}`);
}

assert.ok(!`${html}\n${css}\n${app}`.includes('錢女友'), 'legacy Qmoney display name must be fully replaced');
assert.ok(!app.includes('獨立 Qmoney'), 'player-facing copy must not display the retired Qmoney name');
assert.ok(!app.includes('Qmoney API'), 'player-facing errors must use the Jin Baobao service name');
assert.ok(!app.includes('Qmoney 後台'), 'player-facing copy must use the Jin Baobao admin name');
for (const internalLabel of ['JBB GAMES', 'JBB 棋牌', 'ATG', 'RSG', 'MEGA SLOT', 'MEGASLOT', '原版 H5']) {
  assert.ok(!app.includes(internalLabel), `internal provider label must not be player-facing: ${internalLabel}`);
}
assert.ok(!app.includes('game.provider'), 'the player lobby must not render or search internal provider metadata');
assert.ok(!css.includes('game-card-provider'), 'provider labels must not reserve space on game cards');

assert.match(
  app,
  /if \(!state\.session\) return showLoginView\(\);\s*\/\/[^]*?activateLobbyView\(\);\s*try \{/,
  'a persisted Qmoney session must restore the lobby before awaiting /auth/me',
);
assert.match(
  css,
  /body\.is-booting \.view\s*\{\s*display:\s*none !important;/,
  'the login view must stay out of the initial paint while auth is restored',
);
assert.match(
  css,
  /\.real-login-form input\s*\{[^}]*font-size:\s*16px;/s,
  'login inputs must stay at 16px so iOS does not zoom the lobby viewport',
);
assert.match(
  css,
  /\.game-search input\s*\{[^}]*font-size:\s*16px;/s,
  'the mobile lobby search field must not trigger Safari focus zoom',
);
assert.match(
  css,
  /\.app-frame\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*0;/s,
  'the Qmoney frame must follow the live mobile viewport without forcing a tall canvas',
);
assert.match(
  app,
  /window\.innerWidth >= 768[^]*matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/,
  'mobile login must not autofocus and open the software keyboard',
);
assert.match(
  app,
  /function releaseMobileInputViewport\(\)[^]*document\.activeElement\.blur\(\)[^]*window\.scrollTo\(0, 0\)/,
  'entering the lobby must release the login focus and restore the viewport origin',
);
assert.match(
  app,
  /window\.requestAnimationFrame\(\(\) => window\.location\.assign\(target\)\)/,
  'game navigation should start after the loading overlay receives a paint opportunity',
);
assert.doesNotMatch(
  app,
  /setTimeout\(\(\) => window\.location\.assign\(target\),\s*320\)/,
  'game navigation must not include an artificial 320ms delay',
);
assert.match(
  html,
  /<script src="\/qmoney\/config\.js" defer><\/script>/,
  'the generated API configuration must not block HTML parsing',
);
assert.match(app, /decoding="async" fetchpriority="\$\{index === 0 \? "high" : "low"\}"/);
assert.match(app, /loading="lazy" decoding="async"/);

for (const marker of [
  'lobbypopframebg.webp',
  'lobbypopbg.webp',
  '/auth/login',
  '/games/catalog',
  '/wallet/balance',
  '/wallet/transactions?',
  '/wallet/bets/',
  '/public/announcements?kind=marquee',
  'TEST_PLAYER_PATTERN',
  'GAME_BGM_PREFERENCES_KEY',
  'GAME_SFX_PREFERENCES_KEY',
  'syncGameAudioPreferences',
]) {
  assert.ok(`${html}\n${css}\n${app}`.includes(marker), `missing integration marker: ${marker}`);
}

for (const marker of [
  'data-hero-game=',
  'game.cover',
  'data-modal-action="game-history"',
  'data-modal-action="history-detail"',
  'data-modal-action="history-more"',
  'function showBetDetail',
]) {
  assert.ok(app.includes(marker), `missing real lobby interaction: ${marker}`);
}

assert.doesNotMatch(
  `${html}\n${css}\n${app}`,
  /provider-strip|provider-button|providerStrip|data-provider=/,
  'category tabs must show all games directly without a provider submenu',
);
assert.match(
  css,
  /\.balance-row strong\s*\{[^}]*font-variant-numeric:\s*tabular-nums;[^}]*\}/s,
  'the lobby balance must reserve a stable full-width numeric row',
);
assert.match(
  css,
  /\.setting-row--button\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+24px;[^}]*column-gap:\s*8px;/s,
  'settings action rows should reserve one row for label, detail, and chevron',
);
assert.match(
  css,
  /\.setting-row--button::after\s*\{[^}]*grid-column:\s*3;[^}]*justify-self:\s*end;/s,
  'settings chevrons should stay in the final column',
);
assert.match(
  css,
  /\.setting-row strong\s*\{[^}]*grid-column:\s*2;[^}]*white-space:\s*nowrap;/s,
  'settings detail labels should not wrap',
);

assert.ok(walletRoutes.includes("fastify.get(\n    '/transactions'"), 'bet history must use the authenticated wallet ledger');
assert.ok(walletRoutes.includes("where: { id: betId, userId: req.userId }"), 'bet details must remain isolated to the logged-in player');
assert.ok(publicAnnouncements.includes("q.kind) where.kind = q.kind"), 'public marquee must read the configured announcement kind');
assert.ok(adminAnnouncements.includes("fastify.post(\n    '/'"), 'the admin backend must support creating marquee announcements');
assert.ok(adminAnnouncements.includes("'/:id/toggle'"), 'the admin backend must support enabling and disabling announcements');

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
    referencedAssets.add(decodeURIComponent(match[1].split(/[?#]/u, 1)[0]));
  }
}
for (const match of app.matchAll(/["`]((?:imgs_soc|brand)\/[^"`$]+\.(?:webp|png|gif|svg|mp3))["`]/g)) {
  referencedAssets.add(match[1]);
}

for (const relativePath of referencedAssets) {
  await access(path.join(qmoneyRoot, 'assets', relativePath));
}

const integration = JSON.parse(integrationText);
assert.equal(integration.name, 'jin-baobao-casino-frontend');
assert.equal(integration.authStorageKey, 'bg-auth');
assert.equal(integration.gameRoutePrefix, '/games/');
assert.ok(integration.assetCount >= referencedAssets.size);

console.log(`Qmoney clone contract passed (${referencedAssets.size} referenced assets checked)`);
