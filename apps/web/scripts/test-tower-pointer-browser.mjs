// Physical pointer regression: rendered Pixi cells, never .emit('pointertap').
import assert from 'node:assert/strict';
const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5192').origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.connectOverCDP(
  process.env.BROWSER_CDP_URL || 'http://127.0.0.1:9346',
);
try {
  for (const mobile of [true, false])
    for (const restored of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        isMobile: mobile,
        hasTouch: mobile,
        serviceWorkers: 'block',
      });
      const user = {
        id: 'pointer-fixture',
        username: 'fixture',
        role: 'PLAYER',
        balance: '1000.37',
        bettingLimits: {},
      };
      const initialRound = {
        roundId: 'pointer-round',
        status: 'ACTIVE',
        amount: '10',
        currentMultiplier: '1',
        nextMultiplier: '1.1',
        potentialPayout: '10',
        picks: [],
        currentLevel: 0,
        totalLevels: 9,
        cols: 4,
        difficulty: 'easy',
        nonce: 1,
        serverSeedHash: 'fixture',
        createdAt: '2026-09-05T00:00:00Z',
      };
      let round = restored ? { ...initialRound, currentLevel: 2, picks: [0, 1] } : null;
      let picks = 0;
      let expectedPick;
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
        if (path === '/src/games/tower/TowerScene.ts') {
          const response = await route.fetch();
          return route.fulfill({
            response,
            body:
              (await response.text()) +
              '\nconst originalSetup = TowerScene.prototype.setup; TowerScene.prototype.setup = function(...args) { window.__pointerScene = this; return originalSetup.apply(this,args); };',
          });
        }
        if (!path.startsWith('/api/')) return route.continue();
        if (path.endsWith('/tower/start')) {
          round = { ...initialRound };
          return route.fulfill({ json: round });
        }
        if (path.endsWith('/tower/pick')) {
          const body = req.postDataJSON();
          assert.equal(body.level, round.currentLevel);
          assert.equal(body.col, expectedPick.col, 'edge tap must select the intended column');
          picks++;
          round = {
            ...round,
            picks: [...round.picks, body.col],
            currentLevel: round.currentLevel + 1,
            currentMultiplier: '1.1',
            potentialPayout: '11',
          };
          return route.fulfill({ json: { state: round, hitTrap: false } });
        }
        if (req.method() !== 'GET')
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
      await page.goto(`${origin}/games/tower`);
      const start = page.getByRole('button', { name: /開始.*10/ });
      if (!restored) await start.click();
      await page.getByRole('button', { name: /領獎/ }).waitFor();
      const firstLevel = restored ? 2 : 0;
      for (let level = firstLevel; level < firstLevel + 3; level++) {
        await page.waitForFunction(() => window.__pointerScene?.inputLocked === false);
        if (level === firstLevel + 2 && mobile)
          await page.setViewportSize({ width: 430, height: 932 });
        await page.locator('canvas').first().scrollIntoViewIfNeeded();
        expectedPick = { level, col: level % 4 };
        const point = await page.evaluate(({ level, col }) => {
          const scene = window.__pointerScene,
            canvas = scene.app.canvas,
            rect = canvas.getBoundingClientRect();
          const pos = scene.cells
            .get(`${level}:${col}`)
            .container.toGlobal({
              x: level % 3 === 2 ? scene.cellDims().w / 2 - 1 : 0,
              y: level % 3 === 1 ? -scene.cellDims().h / 2 + 1 : 0,
            });
          return {
            x: rect.x + (pos.x * rect.width) / scene.width,
            y: rect.y + (pos.y * rect.height) / scene.height,
            stageMode: scene.app.stage.eventMode,
            mode: scene.cells.get(`${level}:0`).container.eventMode,
          };
        }, expectedPick);
        const response = page.waitForResponse((r) => r.url().endsWith('/tower/pick'), {
          timeout: 5000,
        });
        if (mobile) await page.touchscreen.tap(point.x, point.y);
        else await page.mouse.click(point.x, point.y);
        await response;
      }
      assert.equal(picks, 3);
      assert.deepEqual(errors, []);
      console.log(
        `PASS Tower ${mobile ? 'touch' : 'mouse'}, ${restored ? 'recovered round' : 'new round'}: center/upper/right edges, exact columns, responsive resize`,
      );
      await context.close();
    }
} finally {
  await browser.close();
}
