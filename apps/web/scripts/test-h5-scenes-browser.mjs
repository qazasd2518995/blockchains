// Real local archived Cocos bundles; API fixtures cannot contact production.
import assert from 'node:assert/strict';
import { H5_GAMES } from '@bg/shared';
const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5192').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.BROWSER_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL)
  : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const codes = ['14', '281', '276', '278', '273', '271', '269', '264'];
const games = H5_GAMES.filter((game) => codes.includes(game.code));
assert.equal(games.length, codes.length);
try {
  for (const game of games) {
    const context = await browser.newContext({
      viewport: game.code === '14' ? { width: 844, height: 390 } : { width: 390, height: 844 },
      serviceWorkers: 'block',
    });
    const user = {
      id: 'scene-fixture',
      username: 'fixture',
      balance: '1000.00',
      role: 'PLAYER',
      bettingLimits: {},
    };
    await context.addInitScript(
      (user) =>
        localStorage.setItem(
          'bg-auth',
          JSON.stringify({
            state: { user, accessToken: 'isolated', refreshToken: null },
            version: 0,
          }),
        ),
      user,
    );
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      if (request.method() !== 'GET')
        return route.fulfill({ status: 503, json: { code: 'ISOLATED_TEST' } });
      const body = url.pathname.endsWith('/auth/me')
        ? user
        : url.pathname.endsWith('/h5-slots/session')
          ? {
              code: 1,
              user: { ...user, nickname: 'fixture', balance: 1000 },
              jackpot: { grand: '10000', major: '5000', minor: '1000', mini: '500' },
            }
          : url.pathname.endsWith('/wallet/balance')
            ? { balance: user.balance }
            : { items: [] };
      await route.fulfill({ json: body });
    });
    const page = await context.newPage();
    const errors = [];
    const loadedScripts = [];
    page.on('response', (response) => {
      if (response.url().includes('index.9d2e3r1.js') && response.ok())
        loadedScripts.push(response.url());
    });
    page.on('pageerror', (e) => errors.push(e.stack || e.message));
    await page.goto(`${origin}/games/${game.gameId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      (scene) =>
        document.querySelector('iframe')?.contentWindow?.cc?.director?.getScene()?.name === scene,
      game.scene,
      { timeout: 45000 },
    );
    // Give delayed language resources time to finish, not just the scene-ready event.
    await page.waitForTimeout(3000);
    assert.ok(loadedScripts.length > 0, 'Versioned lifecycle fix must actually be loaded');
    assert.deepEqual(errors, [], `${game.gameId}: ${errors.join('\n')}`);
    console.log(`PASS H5 ${game.code}/${game.scene}: real scene + delayed resources, no pageerror`);
    await context.close();
  }
  console.log(`H5 browser: ${games.length} previously failing scenes passed (no live bets)`);
} finally {
  await browser.close();
}
