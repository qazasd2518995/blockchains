// Local Vite + real archived Cocos runtime; API replies use isolated fixtures.
// GAME_TEST_URL=http://127.0.0.1:5189 PLAYWRIGHT_MODULE=playwright node scripts/test-fruit-mary-browser.mjs
// BROWSER_CDP_URL may attach to an agent-browser session.
import assert from 'node:assert/strict';
import { fruitMaryOutcomeForPresentation, FRUIT_MARY_PAYOUT_POSITIONS } from '@bg/provably-fair';
const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5189').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.BROWSER_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL)
  : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  serviceWorkers: 'block',
});
let balance = 9.99;
let mode = 'loss';
let presentation = null;
let checks = 0;
const requests = [];
const receipts = new Map();
const failures = [];
const diagnostics = [];
await context.addInitScript(() => {
  if (!localStorage.getItem('bg-auth'))
    localStorage.setItem(
      'bg-auth',
      JSON.stringify({
        state: {
          accessToken: 'isolated',
          refreshToken: 'isolated',
          user: { id: 'fixture', username: 'fixture', balance: '9.99' },
        },
        version: 0,
      }),
    );
  window.__fruitMessages = [];
  window.addEventListener('message', (event) => window.__fruitMessages.push(event.data));
});
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  if (!url.pathname.startsWith('/api/')) return route.continue();
  const path = url.pathname;
  let payload;
  if (path.endsWith('/session'))
    payload = {
      code: '200',
      data: {
        info: { uid: 'fixture', gold: balance, nickname: 'fixture' },
        nickname: 'fixture',
        avatar: '',
      },
    };
  else if (path.endsWith('/room'))
    payload = { code: '200', data: { multiple: 10, minBet: 10, maxBet: 5000 } };
  else if (path.endsWith('/spin') || path.endsWith('/gamble')) {
    const body = route.request().postDataJSON();
    requests.push({ path, body });
    assert.match(body.operationId, /^[\da-f-]{36}$/i);
    if (mode === 'reject')
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' }),
      });
    if (receipts.has(body.operationId)) payload = receipts.get(body.operationId);
    else {
      if (path.endsWith('/spin')) {
        const outcome = presentation
          ? fruitMaryOutcomeForPresentation(
              presentation.type,
              presentation.positions,
              body.fruits.map(([fruitId, units]) => ({
                fruitId: Number(fruitId),
                units: Number(units),
              })),
            )
          : null;
        const payout = outcome
          ? outcome.totalPayoutUnits * 10
          : mode === 'win' || mode === 'lost-response'
            ? 50
            : 0;
        balance = Math.round((balance - body.money * 10 + payout) * 100) / 100;
        payload = {
          code: 1,
          data: {
            data: outcome
              ? {
                  type: outcome.legacyType,
                  pos: { pos: outcome.positions[0], luck: outcome.positions.slice(1) },
                }
              : { type: 0, pos: payout ? 5 : 10 },
            money: outcome ? outcome.payoutByPosition : [payout / 10],
          },
          balance,
          spinId: `spin-${receipts.size}`,
        };
      } else {
        const won = mode === 'gamble-win';
        balance =
          Math.round(
            (balance - Number(body.balance) + (won ? Number(body.balance) * 2 : 0)) * 100,
          ) / 100;
        payload = {
          code: 1,
          data: won ? (Number(body.size) === 1 ? 7 : 8) : Number(body.size) === 1 ? 8 : 7,
          balance,
          spinId: `gamble-${receipts.size}`,
        };
      }
      receipts.set(body.operationId, payload);
      if (mode === 'lost-response') return route.abort('failed');
    }
  } else if (path.endsWith('/auth/me'))
    payload = {
      id: 'fixture',
      username: 'fixture',
      role: 'PLAYER',
      balance: balance.toFixed(2),
      bettingLimits: {},
    };
  else if (path.endsWith('/wallet/balance')) payload = { balance: balance.toFixed(2) };
  else payload = { code: 1, data: {} };
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
});
const page = await context.newPage();
page.on('pageerror', (error) => failures.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') diagnostics.push(message.text());
});
page.on('response', (response) => {
  if (response.status() >= 400) diagnostics.push(`${response.status()} ${response.url()}`);
});
const gameUrl = `${origin}/games/fruit-mary/index.html?apiBase=${encodeURIComponent(origin + '/api')}&token=qmoney-session&room_id=1&window_type=web`;
async function load(amount) {
  balance = amount;
  await page.goto(gameUrl);
  await page
    .waitForFunction(
      () => {
        const menu = window.cc?.find('Canvas')?.getComponent('MenuLogic');
        return menu?.__yachiyoAllocationControls && window.cc.vv.UserInfo?.userId === 'fixture';
      },
      null,
      { timeout: 45000 },
    )
    .catch(async (error) => {
      console.log(
        JSON.stringify({
          failures,
          diagnostics,
          runtime: await page.evaluate(() => ({
            scene: window.cc?.director?.getScene()?.name,
            user: window.cc?.vv?.UserInfo,
            messages: window.__fruitMessages,
          })),
        }),
      );
      await page.screenshot({ path: '/tmp/fruit-mary-browser-failure.png' });
      throw error;
    });
}
async function state() {
  return page.evaluate(() => {
    const menu = cc.find('Canvas').getComponent('MenuLogic');
    const play = cc.find('Canvas').getComponent('PlayLogic');
    return {
      balance: cc.vv.UserInfo.balance,
      displayed: Number(menu.shuziyue.getComponent('ShuziBoxLogic').getNum()),
      current: Number(menu.shuzibenlun.getComponent('ShuziBoxLogic').getNum()),
      units: menu.numNode.children.map((node) =>
        Number(node.getComponent('ShuziBoxLogic').getNum()),
      ),
      start: menu.startBt.interactable,
      gamble: menu.daBt.interactable,
      collecting: menu._kaishiBiDdaxiao_bool,
      playing: play._playing,
      auto: menu.isAutoPut_bool,
      allAdd: menu.allAddBt.interactable,
    };
  });
}
async function invoke(method, ...args) {
  return page.evaluate(
    ({ method, args }) =>
      cc
        .find('Canvas')
        .getComponent('MenuLogic')
        [method](...args),
    { method, args },
  );
}
async function addApple() {
  await page.evaluate(() => {
    const menu = cc.find('Canvas').getComponent('MenuLogic');
    menu._local_index_int = 8;
    menu.kaishi();
  });
}
async function waitIdle() {
  await page.waitForFunction(
    () => {
      const m = cc.find('Canvas').getComponent('MenuLogic');
      return m.startBt.interactable && !cc.find('Canvas').getComponent('PlayLogic')._playing;
    },
    null,
    { timeout: 50000 },
  );
}
async function waitGamble() {
  await page.waitForFunction(
    () => {
      const m = cc.find('Canvas').getComponent('MenuLogic');
      return m._kaishiBiDdaxiao_bool && m.daBt.interactable;
    },
    null,
    { timeout: 50000 },
  );
}

try {
  if (!process.env.FRUIT_REVIEW_SHELL_ONLY) {
    for (const remainder of [0.37, 3, 9.99]) {
      await load(remainder);
      assert.equal((await state()).balance, remainder, 'session must not parseInt the wallet');
      await addApple();
      await invoke('clickKaishi');
      const s = await state();
      assert.equal(
        s.units.reduce((a, b) => a + b, 0),
        0,
      );
      assert.equal(s.start, true);
      assert.equal(s.allAdd, true);
      assert.equal(s.auto, false);
      assert.equal(requests.length, 0, 'insufficient denomination never reaches spin API');
      checks++;
    }
    await load(10.37);
    await addApple();
    assert.equal((await state()).displayed, 0.37, 'reserved whole bet leaves precise cents');
    await invoke('clickKaishi');
    await invoke('clickKaishi');
    await waitIdle();
    assert.equal(requests.length, 1);
    assert.equal((await state()).balance, 0.37);
    await invoke('clickKaishi');
    assert.equal(requests.length, 1, 'stored repeat-bet cannot spend the fractional remainder');
    await page.screenshot({ path: '/tmp/fruit-mary-remainder.png' });
    checks++;

    await load(100.37);
    mode = 'reject';
    await addApple();
    await invoke('clickKaishi');
    await page.waitForFunction(() =>
      window.__fruitMessages.some((m) => m.type === 'fruit-mary:error'),
    );
    await waitIdle();
    assert.equal((await state()).allAdd, true, 'failed request restores all betting controls');
    checks++;

    mode = 'lost-response';
    const requestCount = requests.length;
    await invoke('clickKaishi');
    await waitGamble();
    assert.equal(requests.length, requestCount + 2, 'only the lost-response operation is retried');
    assert.equal(requests.at(-1).body.operationId, requests.at(-2).body.operationId);
    assert.equal((await state()).current, 50);
    assert.equal((await state()).balance, 90.37);
    await invoke('clickZuo');
    await invoke('clickYou');
    assert.equal((await state()).balance, 90.37, 'allocation controls retain cents');
    await page.evaluate(() =>
      cc.find('Canvas').getComponent('MenuLogic').shuzibenlun.emit(cc.Node.EventType.TOUCH_END),
    );
    await page.locator('[data-fruit-mary-allocation-input]').fill('40');
    await page.locator('[data-action="apply"]').click();
    assert.equal((await state()).current, 40);
    assert.equal((await state()).balance, 100.37);
    checks++;

    mode = 'gamble-win';
    await invoke('clickDaOrXiao', null, '1');
    await page.waitForFunction(
      () =>
        window.__fruitMessages.filter((m) => m.type === 'fruit-mary:busy' && !m.busy).length >= 3,
    );
    await invoke('clickZuo');
    await invoke('clickDaOrXiao', null, '2');
    await invoke('clickKaishi');
    await waitGamble();
    assert.equal((await state()).current, 80);
    assert.equal((await state()).balance, 100.37);
    checks++;

    mode = 'gamble-loss';
    await invoke('clickDaOrXiao', null, '1');
    await waitIdle();
    assert.equal((await state()).balance, 100.37);
    assert.equal((await state()).current, 0);
    assert.equal((await state()).allAdd, true);
    checks++;

    mode = 'win';
    await addApple();
    await invoke('clickKaishi');
    await waitGamble();
    const beforeCollectRequests = requests.length;
    await invoke('clickKaishi');
    await invoke('clickKaishi');
    await waitIdle();
    assert.equal(
      requests.length,
      beforeCollectRequests,
      'double collect cannot start another paid spin',
    );
    assert.equal((await state()).balance, balance);
    checks++;
    console.log('Core wallet, last bet, gamble and collection cases passed.');

    await load(100.37);
    const beforeStoppedAutoplay = requests.length;
    await addApple();
    await page.evaluate(() => {
      const menu = cc.find('Canvas').getComponent('MenuLogic');
      menu.isAutoPut_bool = true;
      menu.scheduleOnce(function () {
        this.clickKaishi();
      }, 0.5);
      menu.clickCancelAuto();
      menu.scheduleOnce(() => {
        window.__autoplayStopChecked = true;
      }, 0.6);
    });
    await page.waitForFunction(() => window.__autoplayStopChecked);
    assert.equal(requests.length, beforeStoppedAutoplay, 'Stop cancels a queued anonymous spin');
    assert.equal((await state()).auto, false);
    checks++;

    await load(10.37);
    mode = 'loss';
    const beforeLastAutoplay = requests.length;
    await addApple();
    await page.evaluate(() => {
      const menu = cc.find('Canvas').getComponent('MenuLogic');
      menu.isAutoPut_bool = true;
      menu.clickKaishi();
    });
    await page.waitForFunction(() => !cc.find('Canvas').getComponent('MenuLogic').isAutoPut_bool);
    await waitIdle();
    assert.equal(requests.length, beforeLastAutoplay + 1, 'autoplay stops before spending cents');
    assert.equal((await state()).balance, 0.37);
    checks++;
    console.log('Queued autoplay cancellation and fractional last-spin cases passed.');

    await load(10000.37);
    mode = 'bonus';
    for (const [type, positions] of process.env.FRUIT_REVIEW_BONUSES === '0'
      ? []
      : [
          [1, [10, 6, 12, 24]],
          [2, [22, 5, 1, 2]],
          [3, [10, 23, 11, 5, 17]],
          [4, [22, 9, 15, 18]],
          [5, [10, 8, 16, 20]],
          [6, [22, 21, 12, 6]],
          [7, [10, 7, 13, 19]],
          [8, [10, ...FRUIT_MARY_PAYOUT_POSITIONS]],
          [9, [22]],
        ]) {
      presentation = { type, positions };
      await page.evaluate(() => {
        const menu = cc.find('Canvas').getComponent('MenuLogic');
        menu._local_index_int = 9;
        menu.kaishi();
      });
      const before = requests.length;
      await invoke('clickKaishi');
      await page.waitForFunction(() => cc.find('Canvas').getComponent('PlayLogic')._playing);
      // Delayed legacy timeout callbacks and stale taps cannot change the bets
      // used by the light animations once a paid spin has started.
      await invoke('initButton');
      await invoke('clickAllClear');
      assert.equal((await state()).allAdd, false);
      if (type === 9) await waitIdle();
      else {
        await waitGamble();
        const displayed = await state();
        assert.equal(Math.round((displayed.current + displayed.balance) * 100) / 100, balance);
        await invoke('clickKaishi');
        await waitIdle();
      }
      assert.equal(requests.length, before + 1);
      assert.equal((await state()).balance, balance);
      checks++;
      console.log(`Original presentation ${type} completed with matching wallet.`);
    }
  }
  await context.route(`${origin}/qmoney/**`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Isolated lobby</h1>' }),
  );
  await page.goto(`${origin}/games/fruit-mary?returnTo=/qmoney/`);
  await page.waitForSelector('iframe[title="歡樂水果機"]');
  let frame = await page
    .locator('iframe[title="歡樂水果機"]')
    .elementHandle()
    .then((el) => el.contentFrame());
  await frame.waitForFunction(() => window.cc?.vv?.UserInfo?.userId === 'fixture');
  await page.evaluate(() => {
    window.__originalFruitFrame = document.querySelector('iframe');
  });
  await frame.evaluate(() => {
    parent.postMessage({ type: 'fruit-mary:busy', busy: true }, location.origin);
    parent.postMessage(
      { type: 'fruit-mary:fatal', message: 'Isolated render recovery' },
      location.origin,
    );
  });
  await page
    .getByRole('button', { name: '重新載入', exact: true })
    .click({ timeout: 5000 })
    .catch(async (error) => {
      console.log('fullscreen', await page.evaluate(() => document.fullscreenElement?.tagName));
      console.log(
        await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(
            (b) => b.textContent === '重新載入',
          );
          const f = document.querySelector('iframe');
          return [b, b?.parentElement, f, f?.parentElement].map(
            (e) =>
              e && {
                tag: e.tagName,
                cls: e.className,
                rect: e.getBoundingClientRect().toJSON(),
                z: getComputedStyle(e).zIndex,
                position: getComputedStyle(e).position,
              },
          );
        }),
      );
      await page.screenshot({ path: '/tmp/fruit-mary-shell-failure.png' });
      throw error;
    });
  assert.equal(
    await page.evaluate(() => document.querySelector('iframe') === window.__originalFruitFrame),
    true,
    'reload cannot dispose the iframe during an accepted settlement',
  );
  await frame.evaluate(() =>
    parent.postMessage({ type: 'fruit-mary:busy', busy: false }, location.origin),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('iframe') &&
      document.querySelector('iframe') !== window.__originalFruitFrame,
  );
  checks++;
  frame = await page
    .locator('iframe[title="歡樂水果機"]')
    .elementHandle()
    .then((el) => el.contentFrame());
  await frame.waitForFunction(() => window.cc?.vv?.UserInfo?.userId === 'fixture');
  await frame.evaluate(() => {
    parent.postMessage({ type: 'fruit-mary:busy', busy: true }, location.origin);
    parent.postMessage({ type: 'fruit-mary:ready', balance: 0.37 }, location.origin);
  });
  await page.locator('.qmoney-game-home').click();
  assert.ok(
    page.url().includes('/games/fruit-mary'),
    'a session-ready message must not clear an active settlement lock',
  );
  const releasedAt = Date.now();
  await frame.evaluate(() => {
    parent.postMessage({ type: 'fruit-mary:balance', balance: 0.37 }, location.origin);
    parent.postMessage({ type: 'fruit-mary:busy', busy: false }, location.origin);
  });
  await page.waitForURL(`${origin}/qmoney/`);
  assert.ok(
    Date.now() - releasedAt < 2000,
    'lobby exit follows the receipt without waiting for a wheel animation',
  );
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('bg-auth')).state.user.balance),
    '0.37',
  );
  checks++;
  assert.deepEqual(failures, []);
  console.log(
    JSON.stringify({
      checks,
      settlements: receipts.size,
      requests: requests.length,
      realCocos: true,
      fixtureWalletOnly: true,
    }),
  );
} finally {
  await context.close();
  await browser.close();
}
