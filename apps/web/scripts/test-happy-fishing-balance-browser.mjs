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
    const panel = cc.find('Canvas/GameNode/ControlGround/player0/userML');
    const moneyNode = panel.getChildByName('money');
    const money = moneyNode.getComponent(cc.Label);
    const canvasRect = win.document.querySelector('#GameCanvas').getBoundingClientRect();
    const design = cc.view.getDesignResolutionSize();
    const worldRect = panel.getBoundingBoxToWorld();
    return {
      duplicateHud: Boolean(win.document.getElementById('yachiyo-fish-balance')),
      text: money.string,
      panelScale: panel.scaleX,
      effectiveFontSize: money.fontSize * panel.scaleX * (canvasRect.width / design.width),
      worldRect: { x: worldRect.x, y: worldRect.y, width: worldRect.width, height: worldRect.height },
      viewportWidth: win.innerWidth,
      design,
    };
  });
  assert.equal(measurements.duplicateHud, false, 'do not add a second HTML balance display');
  assert.equal(measurements.text, '32,157.37');
  assert.equal(measurements.panelScale, 1.65, 'enlarge the authored lower-left player panel');
  assert.ok(measurements.effectiveFontSize >= 13, 'the authored wallet text must remain readable');
  assert.ok(measurements.worldRect.x >= -1);
  assert.ok(measurements.worldRect.x + measurements.worldRect.width <= measurements.design.width);
  assert.equal(measurements.design.width, 1920, 'do not reduce game resolution for larger text');
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForTimeout(300);
  const resized = await page.evaluate(() => {
    const win = document.querySelector('iframe').contentWindow,
      cc = win.cc,
      panel = cc.find('Canvas/GameNode/ControlGround/player0/userML'),
      money = panel.getChildByName('money').getComponent(cc.Label),
      canvasRect = win.document.querySelector('#GameCanvas').getBoundingClientRect(),
      design = cc.view.getDesignResolutionSize();
    return {
      duplicateHud: Boolean(win.document.getElementById('yachiyo-fish-balance')),
      text: money.string,
      panelScale: panel.scaleX,
      effectiveFontSize: money.fontSize * panel.scaleX * (canvasRect.width / design.width),
    };
  });
  assert.deepEqual(
    { duplicateHud: resized.duplicateHud, text: resized.text, panelScale: resized.panelScale },
    { duplicateHud: false, text: '32,157.37', panelScale: 1.65 },
  );
  assert.ok(
    resized.effectiveFontSize >= 13,
    `resized effective font size was ${resized.effectiveFontSize}`,
  );
  console.log(
    'PASS Happy Fishing: original lower-left wallet enlarged, fractional balance synced, no duplicate HUD',
  );
  if (process.env.FISH_SCREENSHOT) await page.screenshot({ path: process.env.FISH_SCREENSHOT });
} finally {
  await context.close();
  await browser.close();
}
