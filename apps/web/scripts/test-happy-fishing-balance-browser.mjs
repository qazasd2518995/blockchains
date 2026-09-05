// Real Cocos wallet labels at phone resolution, using local API fixtures only.
import assert from 'node:assert/strict';
const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5192').origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP(
  process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9346',
);
const context = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
});
const user = {
  id: 'fish-fixture',
  username: 'fixture',
  role: 'PLAYER',
  balance: '32157.37',
  bettingLimits: {},
};
try {
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
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    if (url.origin !== origin) return route.abort();
    if (!path.startsWith('/api/')) return route.continue();
    if (req.method() !== 'GET')
      return route.fulfill({ status: 503, json: { code: 'ISOLATED_TEST' } });
    return route.fulfill({
      json: path.endsWith('/h5-slots/session')
        ? {
            code: 1,
            user: { ...user, nickname: 'fixture', balance: Number(user.balance) },
            jackpot: {},
          }
        : path.endsWith('/auth/me')
          ? user
          : path.endsWith('/wallet/balance')
            ? { balance: user.balance }
            : { items: [] },
    });
  });
  const page = await context.newPage();
  await page.goto(`${origin}/games/h5-happy-fishing`);
  await page.waitForFunction(
    () =>
      document.querySelector('iframe')?.contentWindow?.cc?.director?.getScene()?.name ===
      'FishkuailebuyuMain',
    null,
    { timeout: 45000 },
  );
  await page.waitForTimeout(3500);
  const measurements = await page.evaluate(() => {
    const win = document.querySelector('iframe').contentWindow,
      cc = win.cc;
    const hud = win.document.getElementById('yachiyo-fish-balance');
    return {
      text: hud?.textContent,
      fontSize: hud && parseFloat(win.getComputedStyle(hud).fontSize),
      pointerEvents: hud && win.getComputedStyle(hud).pointerEvents,
      rect: hud?.getBoundingClientRect().toJSON(),
      viewportWidth: win.innerWidth,
      design: cc.view.getDesignResolutionSize(),
    };
  });
  assert.equal(measurements.text, '餘額 32,157.37');
  assert.ok(
    measurements.fontSize >= 20,
    'wallet size is measured in screen CSS pixels, not design pixels',
  );
  assert.equal(measurements.pointerEvents, 'none', 'wallet must not swallow aiming gestures');
  assert.ok(measurements.rect.x >= 0 && measurements.rect.right <= measurements.viewportWidth);
  assert.equal(measurements.design.width, 1920, 'do not reduce game resolution for larger text');
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForTimeout(300);
  assert.equal(
    await page.evaluate(() => {
      const win = document.querySelector('iframe').contentWindow;
      return win.getComputedStyle(win.document.getElementById('yachiyo-fish-balance')).fontSize;
    }),
    '20px',
  );
  console.log(
    'PASS Happy Fishing: readable 20px wallet with fractional balance at 844px and 667px, aiming unobstructed',
  );
  if (process.env.FISH_SCREENSHOT) await page.screenshot({ path: process.env.FISH_SCREENSHOT });
} finally {
  await context.close();
  await browser.close();
}
