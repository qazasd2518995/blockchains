// Start the Qmoney Vite app locally, then run with an available Playwright module:
// GAME_TEST_URL=http://127.0.0.1:5187 PLAYWRIGHT_MODULE=playwright node scripts/test-round-exit-browser.mjs
// BROWSER_CDP_URL optionally attaches to an agent-browser session instead of launching Chromium.
import assert from 'node:assert/strict';
import {
  BACCARAT_TABLE_GAME_IDS,
  LOCAL_TABLE_GAME_IDS,
  TWENTY_ONE_HALF_GAME_IDS,
} from '@bg/shared';

const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5187').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Local app only');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = process.env.BROWSER_CDP_URL
  ? await chromium.connectOverCDP(process.env.BROWSER_CDP_URL)
  : await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const user = {
  id: 'exit-test',
  username: 'testplayer',
  role: 'PLAYER',
  balance: '5000.00',
  bettingLimits: {},
};
const score = (total) => ({ total, soft: false, isBust: false, isBlackjack: false });
const blackjack = (tableId, status = 'ACTIVE') => ({
  roundId: 'exit-round',
  tableId,
  status,
  dealerCards: [{ rank: 5, suit: 1 }],
  dealerScore: score(5),
  dealerHoleHidden: true,
  playerHands: [
    {
      id: 'hand',
      cards: [
        { rank: 6, suit: 2 },
        { rank: 10, suit: 0 },
      ],
      bet: '10',
      status: 'PLAYING',
      score: score(16),
      doubled: false,
      splitAces: false,
    },
  ],
  activeHandIndex: 0,
  amount: '10',
  totalBetAmount: '10',
  potentialPayout: '20',
  canHit: true,
  canStand: true,
  canDouble: false,
  canSplit: false,
  deckIndex: 3,
  nonce: 1,
  serverSeedHash: 'test',
});
const localRound = (gameId, status = 'ACTIVE') => {
  const kind = TWENTY_ONE_HALF_GAME_IDS.includes(gameId)
    ? 'twenty-one-half'
    : gameId.startsWith('black-dot')
      ? 'black-dot'
      : gameId.startsWith('card-war')
        ? 'card-war'
        : 'tui-tongzi';
  const piece =
    kind === 'black-dot'
      ? { kind: 'domino', id: 'test', name: 'test', pips: [3, 3] }
      : kind === 'tui-tongzi'
        ? { kind: 'tube', id: 'test', label: '三筒', value: 3, suit: 'pin' }
        : { kind: 'card', rank: '6', suit: 'hearts', label: '6', valueLabel: '6' };
  const hand = { title: 'test', pieces: [piece], scoreLabel: '6', rankLabel: 'test' };
  return {
    roundId: 'exit-round',
    gameId,
    status,
    kind,
    phase: 'PLAYER_TURN',
    stage: 'AWAIT_FIRST_REVEAL',
    roomName: 'test',
    amount: '100',
    payout: '0',
    profit: '0',
    multiplier: 1,
    player: hand,
    banker: hand,
    summary: 'exit test round',
    ruleSummary: [],
    canHit: true,
    canStand: true,
    canBankerDraw: false,
    canReveal: true,
    canSplit: false,
    nonce: 1,
    serverSeedHash: 'test',
    clientSeed: 'test',
  };
};
const hilo = (status = 'ACTIVE') => ({
  roundId: 'exit-round',
  status,
  currentCard: { rank: 5, suit: 0 },
  history: [],
  currentMultiplier: '1',
  higherMultiplier: '1.5',
  lowerMultiplier: '2',
  higherChance: 0.6,
  lowerChance: 0.4,
  amount: '10',
  potentialPayout: '10',
  skipsUsed: 0,
  maxSkips: 3,
  cardIndex: 0,
  serverSeedHash: 'test',
  nonce: 1,
});

let checks = 0;
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
await context.addInitScript((user) => {
  localStorage.setItem(
    'bg-auth',
    JSON.stringify({
      state: { user, accessToken: 'isolated-exit-test', refreshToken: null },
      version: 0,
    }),
  );
}, user);
let state = null;
let postHandler;
const writes = [];
const errors = [];
await context.route('**/api/**', async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (request.method() !== 'GET') {
    writes.push(path);
    if (postHandler) return postHandler(route);
    errors.push(`Unexpected write: ${path}`);
    return route.abort();
  }
  let body = {};
  if (path.endsWith('/active')) body = { state };
  else if (path.endsWith('/auth/me')) body = user;
  else if (path.endsWith('/wallet/balance')) body = { balance: user.balance };
  else if (path.endsWith('/history')) body = { items: [] };
  await route.fulfill({ json: body });
});
// Do not load the real static lobby or create any real account/bet.
await context.route(`${origin}/qmoney/**`, (route) =>
  route.fulfill({ contentType: 'text/html', body: '<h1>Test lobby</h1>' }),
);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const nativeDialogs = [];
page.on('dialog', async (dialog) => {
  nativeDialogs.push(dialog.type());
  await dialog.dismiss();
});
const modal = page.getByRole('dialog');
const home = page.locator('.qmoney-game-home');
const stay = () => modal.getByRole('button', { name: '繼續牌局', exact: true }).click();
const leave = () => modal.getByRole('button', { name: '確定離開', exact: true }).click();

async function load(gameId, round, returnTo = '/qmoney/') {
  state = round;
  const response = page.waitForResponse((r) => r.url().includes('/active'));
  await page.goto(`${origin}/games/${gameId}?returnTo=${encodeURIComponent(returnTo)}`, {
    waitUntil: 'domcontentloaded',
  });
  await response;
  await page.waitForFunction(() => document.querySelector('.unfinished-round-exit'));
  // Ensure active-round restoration has committed before clicking exit.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

try {
  const games = [
    ['blackjack', () => blackjack('royal')],
    ['blackjack-table-2', () => blackjack('classic')],
    ...LOCAL_TABLE_GAME_IDS.map((gameId) => [gameId, () => localRound(gameId)]),
    ['hilo', () => hilo()],
  ];
  for (const [gameId, fixture] of games) {
    await load(gameId, fixture());
    const beforeBalance = await page.evaluate(
      () => JSON.parse(localStorage.getItem('bg-auth')).state.user.balance,
    );
    const beforeWrites = writes.length;
    const url = page.url();
    await home.click();
    await modal.waitFor({ state: 'visible' });
    assert.ok((await modal.innerText()).includes('牌局尚未結束'));
    assert.equal(
      await modal
        .getByRole('button', { name: '繼續牌局' })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await stay();
    await modal.waitFor({ state: 'hidden' });
    assert.equal(page.url(), url);
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('bg-auth')).state.user.balance),
      beforeBalance,
    );
    await home.click();
    await leave();
    await page.waitForURL(`${origin}/qmoney/`);
    assert.equal(writes.length, beforeWrites, 'Confirm/cancel must not mutate game or wallet');
    checks++;
  }
  console.log(`Active rounds: ${games.length} game variants passed.`);

  // Idle and settled tables must not display a confirmation or native unload prompt.
  for (const [gameId, fixture] of games) {
    for (const finished of [false, true]) {
      const round = finished
        ? { ...fixture(), status: LOCAL_TABLE_GAME_IDS.includes(gameId) ? 'SETTLED' : 'CASHED_OUT' }
        : null;
      await load(gameId, round);
      await home.click();
      await page.waitForURL(`${origin}/qmoney/`);
      checks++;
    }
  }
  console.log('Idle and settled rounds passed.');

  // All baccarat rooms: the start request and card reveal remain protected.
  for (const gameId of BACCARAT_TABLE_GAME_IDS) {
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    postHandler = async (route) => {
      assert.ok(route.request().url().endsWith('/games/baccarat/bet'));
      await pending;
      await route
        .fulfill({ status: 400, json: { code: 'TEST_ONLY', message: 'isolated test' } })
        .catch(() => {});
    };
    await page.goto(`${origin}/games/${gameId}?returnTo=/qmoney/`, {
      waitUntil: 'domcontentloaded',
    });
    await page.locator('.unfinished-round-exit').waitFor({ state: 'attached' });
    await page.locator('.baccarat-submit-button').click();
    await home.click();
    await modal.waitFor({ state: 'visible' });
    await stay();
    await home.click();
    const beforeWrites = writes.length;
    await leave();
    await page.waitForURL(`${origin}/qmoney/`);
    release();
    assert.equal(writes.length, beforeWrites);
    checks++;
  }
  postHandler = undefined;

  // A real response arriving while the prompt is open must not cause an exit,
  // hold settlement hostage, or leave a stale guard after the reveal completes.
  const baccaratGame = BACCARAT_TABLE_GAME_IDS[0];
  const baccaratCard = { rank: 4, suit: 1, label: '4', value: 4 };
  const baccaratHand = { cards: [baccaratCard, baccaratCard], points: 8, drewThirdCard: false };
  postHandler = (route) =>
    route.fulfill({
      json: {
        betId: 'exit-test-bet',
        gameId: baccaratGame,
        kind: 'baccarat',
        roomName: 'test',
        betSide: 'player',
        betLabel: '閒',
        outcome: 'TIE',
        outcomeLabel: '和',
        result: 'PUSH',
        resultLabel: '和',
        natural: true,
        amount: '100',
        payout: '100',
        profit: '0',
        multiplier: 1,
        player: baccaratHand,
        banker: baccaratHand,
        playerCards: baccaratHand.cards,
        bankerCards: baccaratHand.cards,
        playerPoints: 8,
        bankerPoints: 8,
        summary: 'test',
        ruleSummary: [],
        controlled: false,
        newBalance: '5000.00',
        nonce: 1,
        serverSeedHash: 'test',
        clientSeed: 'test',
      },
    });
  await page.goto(`${origin}/games/${baccaratGame}?returnTo=/qmoney/`);
  await page.locator('.baccarat-submit-button').click();
  await home.click();
  await modal.getByRole('heading', { name: '牌局尚未結束' }).waitFor();
  await modal.getByRole('heading', { name: '返回大廳確認' }).waitFor();
  assert.ok(page.url().includes(baccaratGame));
  await stay();
  const beforeWrites = writes.length;
  assert.equal(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ),
    true,
  );
  await home.click();
  await page.waitForURL(`${origin}/qmoney/`);
  assert.equal(writes.length, beforeWrites);
  assert.equal(
    await page.evaluate(() => JSON.parse(localStorage.getItem('bg-auth')).state.user.balance),
    '5000.00',
  );
  postHandler = undefined;
  checks++;

  // Focus trap, Escape and mobile/landscape readability.
  await load('blackjack', blackjack('royal'));
  await home.click();
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await modal.waitFor({ state: 'visible' });
    assert.equal(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    const box = await modal.boundingBox();
    assert.ok(
      box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
    );
    checks++;
  }
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.EXIT_SCREENSHOT) await page.screenshot({ path: process.env.EXIT_SCREENSHOT });
  await page.keyboard.press('Tab');
  assert.equal(
    await modal
      .getByRole('button', { name: '確定離開' })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.keyboard.press('Escape');
  await modal.waitFor({ state: 'hidden' });
  assert.equal(await home.evaluate((el) => el === document.activeElement), true);

  // Existing settlement cancellation must still win even after confirmation.
  await home.click();
  await page.evaluate(() => {
    window.testSettlementGuard = (event) => event.preventDefault();
    window.addEventListener('qmoney:before-game-exit', window.testSettlementGuard);
  });
  await leave();
  await modal.waitFor({ state: 'hidden' });
  assert.ok(page.url().includes('/games/blackjack'));
  await page.evaluate(() =>
    window.removeEventListener('qmoney:before-game-exit', window.testSettlementGuard),
  );
  await home.click();
  await stay();
  checks++;

  // Native unload warning exists only for a live round (dispatch without leaving).
  assert.equal(
    await page.evaluate(() =>
      window.dispatchEvent(new Event('beforeunload', { cancelable: true })),
    ),
    false,
  );

  // The normal GameHeader link is routed via the same confirmation.
  await page.locator('.game-header a').evaluate((el) => el.click());
  await modal.waitFor({ state: 'visible' });
  await stay();
  await page.locator('.game-header a').evaluate((el) => el.click());
  await leave();
  await page.getByRole('heading', { name: 'Test lobby' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/qmoney/index.html');
  checks++;

  // Browser back within SPA history: cancel stays; confirm continues original destination.
  const nextTable = '/games/blackjack-table-2?returnTo=/qmoney/';
  await load('blackjack', null, nextTable);
  state = blackjack('classic');
  const restored = page.waitForResponse((r) => r.url().includes('/blackjack/active'));
  await page.locator('.game-header a').evaluate((el) => el.click());
  await restored;
  await page.waitForTimeout(100);
  await page.evaluate(() => history.back());
  await modal.waitFor({ state: 'visible' });
  await stay();
  assert.ok(page.url().includes('blackjack-table-2'));
  await page.evaluate(() => history.back());
  await modal.waitFor({ state: 'visible' });
  state = blackjack('royal');
  await leave();
  await page.waitForURL(/\/games\/blackjack\?/);
  await page.waitForTimeout(100);
  // Guard must reset on a different table, not keep the previous leave approval.
  await home.click();
  await modal.waitFor({ state: 'visible' });
  state = null;
  await leave();
  await page.waitForURL(`${origin}${nextTable}`);
  await page.locator('.unfinished-round-exit').waitFor({ state: 'attached' });
  await home.click();
  await page.waitForURL(`${origin}/qmoney/`);
  checks++;

  assert.deepEqual(nativeDialogs, [], 'Explicit exit must not show a second browser warning');
  assert.deepEqual(errors, []);
  console.log(
    `Round-exit browser regression passed: ${checks} cases; no unintended game/wallet requests.`,
  );
} finally {
  await context.close();
  await browser.close();
}
