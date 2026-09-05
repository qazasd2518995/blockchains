// Start the Qmoney Vite app with VITE_PLATFORM_REALM=qmoney, then run with Playwright:
// GAME_TEST_URL=http://127.0.0.1:5192 PLAYWRIGHT_MODULE=playwright node scripts/test-blackjack-mobile-ux-browser.mjs
import assert from 'node:assert/strict';

const origin = new URL(process.env.GAME_TEST_URL || 'http://127.0.0.1:5192').origin;
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Local app only');

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader'] });
const user = {
  id: 'blackjack-mobile-ux-test',
  username: 'testplayer',
  role: 'PLAYER',
  balance: '72294.42',
  bettingLimits: {},
};

const score = (total, soft = false) => ({
  total,
  soft,
  isBust: total > 21,
  isBlackjack: total === 21,
});
const card = (rank, suit) => ({ rank, suit });

function blackjackRound(tableId, split = false) {
  const hands = split
    ? [
        {
          id: 'hand-a',
          cards: [card(1, 3), card(2, 1), card(8, 0)],
          bet: '10.00',
          status: 'PLAYING',
          score: score(21, true),
          doubled: false,
          splitAces: false,
        },
        {
          id: 'hand-b',
          cards: [card(1, 2), card(9, 3), card(2, 0)],
          bet: '10.00',
          status: 'PLAYING',
          score: score(12, true),
          doubled: false,
          splitAces: false,
        },
      ]
    : [
        {
          id: 'hand-a',
          cards: [card(1, 3), card(2, 1), card(10, 0)],
          bet: '10.00',
          status: 'PLAYING',
          score: score(13, true),
          doubled: false,
          splitAces: false,
        },
      ];

  return {
    roundId: `blackjack-mobile-${tableId}-${split ? 'split' : 'single'}`,
    tableId,
    status: 'ACTIVE',
    dealerCards: [card(10, 2)],
    dealerScore: score(10),
    dealerHoleHidden: true,
    playerHands: hands,
    activeHandIndex: 0,
    amount: '10.00',
    totalBetAmount: split ? '20.00' : '10.00',
    potentialPayout: split ? '40.00' : '20.00',
    canHit: true,
    canStand: true,
    canDouble: false,
    canSplit: false,
    deckIndex: 7,
    nonce: 1,
    serverSeedHash: 'blackjack-mobile-ux-test',
  };
}

const errors = [];
const themeSamples = new Map();
let checks = 0;

for (const viewport of [
  { width: 390, height: 844 },
  { width: 390, height: 665 },
]) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await context.addInitScript((authenticatedUser) => {
    localStorage.setItem(
      'bg-auth',
      JSON.stringify({
        state: { user: authenticatedUser, accessToken: 'blackjack-mobile-ux-test' },
        version: 0,
      }),
    );
  }, user);

  let activeRound = null;
  let activeRoundGate = null;
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() !== 'GET') return route.abort();
    if (pathname.endsWith('/games/blackjack/active')) {
      const state = activeRound;
      const gate = activeRoundGate;
      if (gate) await gate;
      return route.fulfill({ json: { state } });
    }
    if (pathname.endsWith('/auth/me')) return route.fulfill({ json: user });
    if (pathname.endsWith('/wallet/balance')) {
      return route.fulfill({ json: { balance: user.balance } });
    }
    if (pathname.endsWith('/history')) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ json: {} });
  });

  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));

  activeRound = blackjackRound('royal');
  let releaseActiveRound;
  activeRoundGate = new Promise((resolve) => {
    releaseActiveRound = resolve;
  });
  await page.goto(`${origin}/games/blackjack?returnTo=/qmoney/`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('.blackjack-round-restoring').waitFor({ state: 'visible' });
  assert.equal(
    await page.locator(".qmoney-game-shell--table[data-game-id='blackjack']").count(),
    1,
    'Blackjack mobile UX test requires the Qmoney platform realm',
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const restoringLayout = await page.evaluate(() => {
    const stage = document.querySelector('.blackjack-table-stage');
    const controls = document.querySelector('.blackjack-control-card');
    if (!(stage instanceof HTMLElement) || !(controls instanceof HTMLElement)) {
      throw new Error('Blackjack restoring layout did not render');
    }
    return {
      stageHeight: stage.getBoundingClientRect().height,
      controlsTop: controls.getBoundingClientRect().top,
      controlsHeight: controls.getBoundingClientRect().height,
      betControlsHeight:
        controls.querySelector('.bet-controls')?.getBoundingClientRect().height ?? 0,
      actionGridHeight:
        controls.querySelector('.blackjack-action-grid')?.getBoundingClientRect().height ?? 0,
      dealButtons: controls.querySelectorAll('.blackjack-new-round-btn, .blackjack-action-btn')
        .length,
    };
  });
  releaseActiveRound();
  activeRoundGate = null;
  await page.locator('.blackjack-card-shell').first().waitFor();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const restoredLayout = await page.evaluate(() => {
    const stage = document.querySelector('.blackjack-table-stage');
    const controls = document.querySelector('.blackjack-control-card');
    if (!(stage instanceof HTMLElement) || !(controls instanceof HTMLElement)) {
      throw new Error('Blackjack restored layout did not render');
    }
    return {
      stageHeight: stage.getBoundingClientRect().height,
      controlsTop: controls.getBoundingClientRect().top,
      controlsHeight: controls.getBoundingClientRect().height,
      betControlsHeight:
        controls.querySelector('.bet-controls')?.getBoundingClientRect().height ?? 0,
      actionGridHeight:
        controls.querySelector('.blackjack-action-grid')?.getBoundingClientRect().height ?? 0,
    };
  });
  assert.equal(restoringLayout.dealButtons, 0, 'Restoring round exposed game actions early');
  assert.ok(
    Math.abs(restoredLayout.stageHeight - restoringLayout.stageHeight) <= 1 &&
      Math.abs(restoredLayout.controlsTop - restoringLayout.controlsTop) <= 1,
    `Restored round shifted the mobile table at ${viewport.height}px: ${JSON.stringify({ restoringLayout, restoredLayout })}`,
  );
  for (const [gameId, tableId] of [
    ['blackjack', 'royal'],
    ['blackjack-table-2', 'classic'],
  ]) {
    for (const split of [false, true]) {
      activeRound = blackjackRound(tableId, split);
      await page.goto(`${origin}/games/${gameId}?returnTo=/qmoney/`, {
        waitUntil: 'domcontentloaded',
      });
      await page.locator('.blackjack-card-shell').first().waitFor();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );

      const result = await page.evaluate(() => {
        const stage = document.querySelector('.blackjack-table-stage');
        const body = document.querySelector('.blackjack-table-body');
        const root = document.querySelector('.blackjack-page');
        const home = document.querySelector('.qmoney-game-home');
        const audio = document.querySelector('.qmoney-game-audio');
        const entry = document.querySelector('.blackjack-control-card .bet-controls__entry');
        if (
          !(stage instanceof HTMLElement) ||
          !(body instanceof HTMLElement) ||
          !(root instanceof HTMLElement)
        ) {
          throw new Error('Blackjack mobile layout did not render');
        }

        const stageRect = stage.getBoundingClientRect();
        const homeRect = home instanceof HTMLElement ? home.getBoundingClientRect() : null;
        const audioRect = audio instanceof HTMLElement ? audio.getBoundingClientRect() : null;
        const cards = [...document.querySelectorAll('.blackjack-card-shell')].map((node) => {
          const rect = node.getBoundingClientRect();
          const intersectsHome = homeRect
            ? !(
                rect.right <= homeRect.left ||
                rect.left >= homeRect.right ||
                rect.bottom <= homeRect.top ||
                rect.top >= homeRect.bottom
              )
            : false;
          return {
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            intersectsHome,
          };
        });
        const actions = [...document.querySelectorAll('.blackjack-action-btn')].map(
          (node) => node.getBoundingClientRect().height,
        );
        const textBlocks = [
          ...document.querySelectorAll(
            '.blackjack-table-label__title, .blackjack-table-label__value, .blackjack-score-tile__label, .blackjack-score-tile__value, .blackjack-hand-bet-pill',
          ),
        ].map((node) => ({
          text: node.textContent?.trim() ?? '',
          clippedX: node.scrollWidth > node.clientWidth + 1,
          clippedY: node.scrollHeight > node.clientHeight + 1,
        }));
        const scoreValue = document.querySelector('.blackjack-score-tile__value');
        const stageStatus = document.querySelector('.blackjack-round-state');
        const stageStatusRect = stageStatus?.getBoundingClientRect();

        return {
          tableId: root.dataset.blackjackTable,
          rootClassName: root.className,
          felt: getComputedStyle(root).getPropertyValue('--blackjack-felt').trim(),
          stageBackground: getComputedStyle(stage).backgroundColor,
          bodyFits: body.scrollHeight <= body.clientHeight + 1,
          cardsFit: cards.every(
            (rect) =>
              rect.width > 0 &&
              rect.height > 0 &&
              rect.top >= stageRect.top - 1 &&
              rect.left >= stageRect.left - 1 &&
              rect.right <= stageRect.right + 1 &&
              rect.bottom <= stageRect.bottom + 1,
          ),
          cardsClearOfHome: cards.every((rect) => !rect.intersectsHome),
          stageStatusClearOfAudio:
            !audioRect ||
            !stageStatusRect ||
            stageStatusRect.right <= audioRect.left ||
            stageStatusRect.left >= audioRect.right ||
            stageStatusRect.bottom <= audioRect.top ||
            stageStatusRect.top >= audioRect.bottom,
          actionTargetsFit: actions.length === 4 && actions.every((height) => height >= 44),
          activeStakeEditorHidden:
            entry instanceof HTMLElement && getComputedStyle(entry).display === 'none',
          textFits: textBlocks.every((block) => !block.clippedX && !block.clippedY),
          scoreFontSize: scoreValue ? Number.parseFloat(getComputedStyle(scoreValue).fontSize) : 0,
          pageFits: document.documentElement.scrollWidth <= window.innerWidth,
          stageHeight: Math.round(stageRect.height),
        };
      });

      const viewportChromeStability = await page.evaluate(async () => {
        const viewport = window.visualViewport;
        const shell = document.querySelector('.qmoney-game-shell');
        const stage = document.querySelector('.blackjack-table-stage');
        const controls = document.querySelector('.blackjack-control-card');
        if (
          !viewport ||
          !(shell instanceof HTMLElement) ||
          !(stage instanceof HTMLElement) ||
          !(controls instanceof HTMLElement)
        ) {
          throw new Error('Blackjack viewport stability targets did not render');
        }

        const snapshot = () => ({
          shellHeight: shell.getBoundingClientRect().height,
          stageHeight: stage.getBoundingClientRect().height,
          controlsTop: controls.getBoundingClientRect().top,
        });
        const before = snapshot();
        const ownHeightDescriptor = Object.getOwnPropertyDescriptor(viewport, 'height');
        Object.defineProperty(viewport, 'height', {
          configurable: true,
          get: () => before.shellHeight + 47,
        });
        viewport.dispatchEvent(new Event('resize'));
        viewport.dispatchEvent(new Event('scroll'));
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const after = snapshot();
        if (ownHeightDescriptor) {
          Object.defineProperty(viewport, 'height', ownHeightDescriptor);
        } else {
          delete viewport.height;
        }

        return {
          shellStable: Math.abs(after.shellHeight - before.shellHeight) <= 0.5,
          stageStable: Math.abs(after.stageHeight - before.stageHeight) <= 0.5,
          controlsStable: Math.abs(after.controlsTop - before.controlsTop) <= 0.5,
        };
      });

      assert.equal(result.tableId, tableId);
      assert.equal(result.bodyFits, true, `${tableId} body overflowed at ${viewport.height}px`);
      assert.equal(result.cardsFit, true, `${tableId} cards were cropped at ${viewport.height}px`);
      assert.equal(
        result.cardsClearOfHome,
        true,
        `${tableId} cards were covered by the lobby button at ${viewport.height}px`,
      );
      assert.equal(
        result.stageStatusClearOfAudio,
        true,
        `${tableId} round status was covered by the audio menu at ${viewport.height}px`,
      );
      assert.equal(result.actionTargetsFit, true, `${tableId} actions lost 44px touch targets`);
      assert.equal(
        result.activeStakeEditorHidden,
        true,
        `${tableId} retained disabled stake controls`,
      );
      assert.equal(result.textFits, true, `${tableId} text was clipped at ${viewport.height}px`);
      assert.ok(result.scoreFontSize <= 16, `${tableId} score type became oversized`);
      assert.equal(result.pageFits, true, `${tableId} created horizontal page overflow`);
      assert.ok(result.stageHeight >= 300, `${tableId} stage became too short`);
      assert.equal(
        viewportChromeStability.shellStable &&
          viewportChromeStability.stageStable &&
          viewportChromeStability.controlsStable,
        true,
        `${tableId} layout followed dynamic mobile browser toolbar events`,
      );
      if (process.env.BLACKJACK_UX_SCREENSHOT_PREFIX && viewport.height === 844 && !split) {
        await page.screenshot({
          path: `${process.env.BLACKJACK_UX_SCREENSHOT_PREFIX}-${tableId}.png`,
          fullPage: false,
        });
      }
      themeSamples.set(tableId, `${result.felt}:${result.stageBackground}`);
      if (process.env.DEBUG_BLACKJACK_UX) console.log(viewport, split, result);
      checks += 1;
    }
  }

  await context.close();
}

assert.notEqual(
  themeSamples.get('royal'),
  themeSamples.get('classic'),
  'Royal and Classic Blackjack must have visibly distinct table palettes',
);
assert.deepEqual(errors, [], errors.join('\n'));

await browser.close();
console.log(`Blackjack mobile UX: ${checks} active single/split layouts passed.`);
