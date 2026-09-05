// Physical mobile touch regression for all five cells in the bottom Mines row.
import assert from 'node:assert/strict';

const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5192').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Local app only');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.BROWSER_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL)
  : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });

const user = {
  id: 'mines-pointer-fixture',
  username: 'fixture',
  role: 'PLAYER',
  balance: '1000.37',
  bettingLimits: {},
};
let round = null;
let expectedCell = null;
const revealedRequests = [];

try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  });
  await context.addInitScript(
    (fixture) =>
      localStorage.setItem(
        'bg-auth',
        JSON.stringify({
          state: { user: fixture, accessToken: 'isolated', refreshToken: null },
          version: 0,
        }),
      ),
    user,
  );
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin !== origin) return route.abort();
    if (path === '/src/games/mines/MinesScene.ts') {
      const response = await route.fetch();
      return route.fulfill({
        response,
        body:
          (await response.text()) +
          '\nconst pointerInit = MinesScene.prototype.init; MinesScene.prototype.init = function (...args) { window.__pointerMinesScene = this; return pointerInit.apply(this, args); };',
      });
    }
    if (!path.startsWith('/api/')) return route.continue();
    if (path.endsWith('/mines/start')) {
      round = {
        roundId: 'mines-pointer-round',
        status: 'ACTIVE',
        amount: '10',
        mineCount: 5,
        gridSize: 25,
        revealed: [],
        currentMultiplier: '1',
        nextMultiplier: '1.1',
        potentialPayout: '10',
        serverSeedHash: 'fixture',
        nonce: 1,
        createdAt: '2026-09-06T00:00:00.000Z',
      };
      return route.fulfill({ json: round });
    }
    if (path.endsWith('/mines/reveal')) {
      const body = request.postDataJSON();
      assert.equal(body.cellIndex, expectedCell, 'touch must resolve to the intended bottom cell');
      revealedRequests.push(body.cellIndex);
      round = {
        ...round,
        revealed: [...round.revealed, body.cellIndex],
        currentMultiplier: '1.1',
        nextMultiplier: '1.2',
        potentialPayout: '11',
      };
      return route.fulfill({ json: { state: round, hitMine: false } });
    }
    if (request.method() !== 'GET')
      return route.fulfill({ status: 503, json: { code: 'ISOLATED_TEST' } });
    return route.fulfill({
      json: path.endsWith('/active')
        ? { state: round }
        : path.endsWith('/auth/me')
          ? user
          : path.endsWith('/wallet/balance')
            ? { balance: round ? '990.37' : user.balance }
            : { items: [] },
    });
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/games/mines`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__pointerMinesScene?.app);

  // Reproduce a browser-toolbar/visual-viewport contraction after Pixi booted.
  await page.setViewportSize({ width: 390, height: 665 });
  await page.waitForFunction(() => {
    const scene = window.__pointerMinesScene;
    const canvas = scene?.app?.canvas;
    const shell = canvas?.parentElement;
    return canvas && shell && scene.width === Math.round(shell.clientWidth) && scene.height === Math.round(shell.clientHeight);
  });
  await page.getByRole('button', { name: /開始.*10/ }).click();
  await page.getByRole('button', { name: /領獎/ }).waitFor();

  for (let cellIndex = 20; cellIndex < 25; cellIndex += 1) {
    expectedCell = cellIndex;
    await page.waitForFunction(() => window.__pointerMinesScene?.clickDisabled === false);
    const point = await page.evaluate((index) => {
      const scene = window.__pointerMinesScene;
      const canvas = scene.app.canvas;
      const rect = canvas.getBoundingClientRect();
      const position = scene.cells[index].container.toGlobal({ x: 0, y: 0 });
      const x = rect.x + (position.x * rect.width) / scene.width;
      const y = rect.y + (position.y * rect.height) / scene.height;
      const controlRect = document.querySelector('.bet-controls__entry')?.getBoundingClientRect();
      const shellRect = canvas.parentElement?.getBoundingClientRect();
      const stageRect = canvas.closest('.game-stage-panel')?.getBoundingClientRect();
      return {
        x,
        y,
        canvas: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        viewportHeight: window.innerHeight,
        targetTag: document.elementFromPoint(x, y)?.tagName,
        targetClass: document.elementFromPoint(x, y)?.className,
        control: controlRect && { top: controlRect.top, bottom: controlRect.bottom },
        shell: shellRect && { top: shellRect.top, bottom: shellRect.bottom },
        stage: stageRect && { top: stageRect.top, bottom: stageRect.bottom },
      };
    }, cellIndex);
    assert.ok(point.y > point.canvas.top && point.y < point.canvas.bottom);
    assert.ok(point.x > point.canvas.left && point.x < point.canvas.right);
    assert.ok(point.y < point.viewportHeight, 'bottom-row centre must remain above the viewport edge');
    assert.equal(
      point.targetTag,
      'CANVAS',
      `no control overlay may cover an active bottom-row cell: ${JSON.stringify(point)}`,
    );
    const response = page.waitForResponse((value) => value.url().endsWith('/mines/reveal'));
    await page.touchscreen.tap(point.x, point.y);
    await response;
  }

  assert.deepEqual(revealedRequests, [20, 21, 22, 23, 24]);
  assert.deepEqual(errors, []);
  console.log('PASS Mines mobile resize: bottom row 20-24 fully visible and physically touchable');
  await context.close();
} finally {
  await browser.close();
}
