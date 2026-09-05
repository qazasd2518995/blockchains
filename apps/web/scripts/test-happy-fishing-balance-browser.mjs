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
  balance: '72299.42',
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
  const readLayout = () =>
    page.evaluate(() => {
      const win = document.querySelector('iframe').contentWindow,
        cc = win.cc;
      const panel = cc.find('Canvas/GameNode/ControlGround/player0/userML');
      const background = panel.getChildByName('userInfoBG');
      const moneyNode = panel.getChildByName('money');
      const money = moneyNode.getComponent(cc.Label);
      const canvasRect = win.document.querySelector('#GameCanvas').getBoundingClientRect();
      const design = cc.view.getDesignResolutionSize();
      const worldRect = panel.getBoundingBoxToWorld();
      const bounds = (node) => ({
        left: node.x - node.width * node.anchorX,
        right: node.x + node.width * (1 - node.anchorX),
        bottom: node.y - node.height * node.anchorY,
        top: node.y + node.height * (1 - node.anchorY),
      });
      return {
        duplicateHud: Boolean(win.document.getElementById('yachiyo-fish-balance')),
        text: money.string,
        panelScale: panel.scaleX,
        background: { width: background.width, x: background.x, bounds: bounds(background) },
        moneyNode: {
          width: moneyNode.width,
          height: moneyNode.height,
          bounds: bounds(moneyNode),
        },
        label: {
          fontSize: money.fontSize,
          actualFontSize: money._actualFontSize,
          lineHeight: money.lineHeight,
          overflow: money.overflow,
          shrinkOverflow: cc.Label.Overflow.SHRINK,
          wrap: money.enableWrapText,
        },
        effectiveFontSize:
          (money._actualFontSize || money.fontSize) *
          panel.scaleX *
          Math.min(canvasRect.width / design.width, canvasRect.height / design.height),
        worldRect: {
          x: worldRect.x,
          y: worldRect.y,
          width: worldRect.width,
          height: worldRect.height,
        },
        viewport: { width: win.innerWidth, height: win.innerHeight },
        design,
      };
    });
  const assertLayout = (layout, name) => {
    assert.equal(layout.duplicateHud, false, `${name}: do not add a second HTML balance display`);
    assert.equal(layout.text, '72,299.42', `${name}: retain the exact fractional balance`);
    assert.equal(layout.panelScale, 1.65, `${name}: keep the authored player panel enlarged`);
    assert.deepEqual(
      { x: layout.background.x, width: layout.background.width },
      { x: -76.5, width: 220 },
      `${name}: extend the original frame toward the balance only`,
    );
    assert.equal(layout.moneyNode.width, 115, `${name}: reserve a bounded balance area`);
    assert.equal(layout.moneyNode.height, 32, `${name}: keep the glyphs inside the frame height`);
    assert.equal(
      layout.label.overflow,
      layout.label.shrinkOverflow,
      `${name}: long balances must shrink`,
    );
    assert.equal(layout.label.wrap, false, `${name}: balances must stay on one line`);
    assert.ok(
      layout.moneyNode.bounds.left >= layout.background.bounds.left,
      `${name}: balance starts outside the original frame`,
    );
    assert.ok(
      layout.moneyNode.bounds.right <= layout.background.bounds.right,
      `${name}: balance ends outside the original frame`,
    );
    assert.ok(
      layout.moneyNode.bounds.bottom >= layout.background.bounds.bottom &&
        layout.moneyNode.bounds.top <= layout.background.bounds.top,
      `${name}: balance exceeds the frame vertically`,
    );
    assert.ok(layout.worldRect.x >= -1, `${name}: player panel exceeds the canvas left edge`);
    assert.ok(
      layout.worldRect.x + layout.worldRect.width <= layout.design.width,
      `${name}: player panel exceeds the canvas right edge`,
    );
    assert.equal(
      layout.design.width,
      1920,
      `${name}: do not reduce game resolution for larger text`,
    );
  };

  const landscape = await readLayout();
  assertLayout(landscape, 'landscape');
  assert.ok(
    landscape.effectiveFontSize >= 13,
    `landscape effective font size was ${landscape.effectiveFontSize}`,
  );
  if (process.env.FISH_LANDSCAPE_SCREENSHOT) {
    await page.screenshot({ path: process.env.FISH_LANDSCAPE_SCREENSHOT });
  }

  await page.setViewportSize({ width: 390, height: 665 });
  await page.waitForTimeout(500);
  const portrait = await readLayout();
  assertLayout(portrait, 'portrait');
  console.log(
    'PASS Happy Fishing: original wallet fits its frame in landscape and rotated portrait layouts',
  );
  if (process.env.FISH_SCREENSHOT) await page.screenshot({ path: process.env.FISH_SCREENSHOT });
} finally {
  await context.close();
  await browser.close();
}
