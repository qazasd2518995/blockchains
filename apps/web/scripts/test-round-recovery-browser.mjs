// Local app + real Pixi scenes, with isolated API fixtures and injected failures.
import assert from 'node:assert/strict';
const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5192').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Local app only');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.BROWSER_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL)
  : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
let checks = 0;
try {
  for (const game of ['mines', 'tower']) {
    for (const mode of [
      'no-context',
      'initial-active-error',
      'lost-start',
      'lost-start-recovery-error',
      'wallet-error',
      'context-lost',
      ...(game === 'tower' ? ['pick-recovery-error'] : []),
    ]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'block',
      });
      let committed = false;
      let recoverable = false;
      let writes = 0;
      const errors = [];
      const user = {
        id: 'recovery-fixture',
        username: 'fixture',
        role: 'PLAYER',
        balance: '1000.37',
        bettingLimits: {},
      };
      const round = {
        roundId: 'recovery-round',
        status: 'ACTIVE',
        amount: '10',
        mineCount: 5,
        gridSize: 25,
        revealed: [],
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
        createdAt: '2026-09-05T00:00:00.000Z',
      };
      await context.addInitScript(
        ({ user, mode }) => {
          localStorage.setItem(
            'bg-auth',
            JSON.stringify({
              state: { user, accessToken: 'isolated', refreshToken: null },
              version: 0,
            }),
          );
          if (mode === 'no-context')
            HTMLCanvasElement.prototype.getContext = function () {
              return null;
            };
        },
        { user, mode },
      );
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/src/games/tower/TowerScene.ts' && mode === 'pick-recovery-error') {
          const response = await route.fetch();
          return route.fulfill({
            response,
            body:
              (await response.text()) +
              '\nconst reviewSetup = TowerScene.prototype.setup; TowerScene.prototype.setup = function (...args) { window.__reviewTowerScene = this; return reviewSetup.apply(this, args); };',
          });
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const path = url.pathname;
        const unavailable = () =>
          route.fulfill({
            status: 503,
            json: { code: 'INTERNAL_ERROR', message: 'Isolated recovery test' },
          });
        if (request.method() !== 'GET') {
          writes += 1;
          if (mode === 'pick-recovery-error' && path.endsWith('/pick')) return unavailable();
          assert.equal(path, `/api/games/${game}/start`);
          committed = true;
          if (mode === 'pick-recovery-error') return route.fulfill({ json: round });
          return unavailable();
        }
        if (path.endsWith('/active')) {
          if (
            !recoverable &&
            (mode === 'initial-active-error' ||
              (committed && mode === 'lost-start-recovery-error') ||
              (mode === 'pick-recovery-error' && writes > 1))
          )
            return unavailable();
          return route.fulfill({ json: { state: committed ? round : null } });
        }
        if (path.endsWith('/wallet/balance')) {
          if (!recoverable && mode === 'wallet-error') return unavailable();
          return route.fulfill({ json: { balance: committed ? '990.37' : user.balance } });
        }
        if (path.endsWith('/auth/me'))
          return route.fulfill({ json: { ...user, balance: committed ? '990.37' : user.balance } });
        return route.fulfill({ json: { items: [] } });
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${origin}/games/${game}`, { waitUntil: 'domcontentloaded' });
      const start = page.getByRole('button', { name: /開始.*10/ });
      const retry = page.getByRole('button', { name: '重新同步牌局與餘額', exact: true });
      if (mode === 'no-context') {
        await page.getByRole('button', { name: '重新載入遊戲', exact: true }).waitFor();
        assert.equal(await start.isDisabled(), true);
        assert.equal(writes, 0);
      } else {
        if (mode === 'initial-active-error' || mode === 'wallet-error') {
          await retry.waitFor();
          assert.equal(await start.isDisabled(), true);
          assert.equal(writes, 0);
          recoverable = true;
          await retry.click();
        }
        await page.waitForFunction(() =>
          [...document.querySelectorAll('button')].some(
            (b) => /開始.*10/.test(b.textContent) && !b.disabled,
          ),
        );
        if (mode === 'context-lost') {
          await page
            .locator('canvas')
            .first()
            .evaluate((canvas) =>
              canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })),
            );
          await page.getByRole('button', { name: '重新載入遊戲', exact: true }).waitFor();
          assert.equal(await start.isDisabled(), true);
          assert.equal(writes, 0);
        } else if (mode === 'pick-recovery-error') {
          await start.click();
          await page.getByRole('button', { name: /領獎/ }).waitFor();
          const pick = () =>
            page.evaluate(() =>
              window.__reviewTowerScene.cells.get('0:0').container.emit('pointertap'),
            );
          await pick();
          await retry.waitFor();
          await page.waitForTimeout(500); // let the failed pick's delayed lock execute
          assert.equal(await page.evaluate(() => window.__reviewTowerScene.inputLocked), true);
          recoverable = true;
          await retry.click();
          await retry.waitFor({ state: 'hidden' });
          await page.waitForFunction(() => window.__reviewTowerScene.inputLocked === false);
          assert.equal(await page.evaluate(() => window.__reviewTowerScene.inputLocked), false);
          const nextRequest = page.waitForResponse((response) =>
            response.url().endsWith('/tower/pick'),
          );
          await pick();
          await nextRequest;
          assert.equal(writes, 3, 'Recovered scene accepts another pick, not another start');
        } else if (mode.startsWith('lost-start')) {
          await start.click();
          if (mode === 'lost-start-recovery-error') {
            await retry.waitFor();
            assert.equal(await start.isDisabled(), true);
            recoverable = true;
            await retry.click();
          }
          await page.waitForFunction(
            () => JSON.parse(localStorage.getItem('bg-auth'))?.state.user.balance === '990.37',
          );
          await page.getByRole('button', { name: /領獎/ }).waitFor();
          assert.equal(await start.count(), 0, 'Committed round must not return to new-start UI');
          assert.equal(writes, 1, 'Recovery must never replay a new bet');
        }
      }
      assert.deepEqual(errors, [], `${game}/${mode} must have no unhandled page error`);
      checks += 1;
      console.log(`PASS ${game}/${mode}`);
      await context.close();
    }
  }
  console.log(`Round recovery browser: ${checks} isolated scenarios passed`);
} finally {
  await browser.close();
}
