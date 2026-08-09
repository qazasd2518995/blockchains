import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/h5-slot-collection/yachiyo-adapter.js', import.meta.url),
);
const adapterSource = fs.readFileSync(adapterPath, 'utf8');

function loadAdapter(gameCode) {
  const storage = { getItem: () => null, setItem: () => {} };
  const context = {
    URL,
    URLSearchParams,
    AbortController,
    fetch: () => Promise.reject(new Error('network disabled in adapter unit tests')),
    console: { info: () => {}, warn: () => {}, error: () => {}, log: () => {} },
    XMLHttpRequest: function XMLHttpRequest() {},
    location: {
      origin: 'https://example.test',
      href: `https://example.test/game?gameId=${gameCode}`,
      search: `?gameId=${gameCode}`,
    },
    localStorage: storage,
    parent: { localStorage: storage, postMessage: () => {} },
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(adapterSource, context, { filename: adapterPath });
  return context.__YachiyoH5AdapterTest;
}

function grid(reels, rows, offset = 0) {
  return Array.from({ length: reels }, (_, reel) =>
    Array.from({ length: rows }, (_, row) => (offset + reel + row) % 8),
  );
}

function classicLine(row = 1) {
  return {
    path: [row, row, row, row, row],
    startReel: 0,
    direction: 'ltr',
    row,
    symbol: 1,
    count: 3,
    payout: 2,
  };
}

function clusterLine() {
  return {
    positions: [
      { reel: 0, row: 0 },
      { reel: 0, row: 1 },
      { reel: 1, row: 0 },
      { reel: 1, row: 1 },
      { reel: 2, row: 0 },
      { reel: 2, row: 1 },
      { reel: 3, row: 0 },
      { reel: 3, row: 1 },
    ],
    symbol: 2,
    count: 8,
    payout: 2,
  };
}

{
  const adapter = loadAdapter('113');
  const [queued] = adapter.buildLotteryResponses({
    grid: grid(5, 3),
    lines: [classicLine(1)],
    cascades: [],
    multiplier: 2,
    amount: '10.00',
    baseAmount: '10.00',
    payout: '20.00',
    newBalance: '120.00',
  });
  const view = queued.response.ResultData.viewarray;
  assert.deepEqual(Array.from(view.nWinLinesDetail[0]), [5, 6, 7]);
  assert.equal(view.nWinCards[5], true);
  assert.equal(view.nWinCards[6], true);
  assert.equal(view.nWinCards[7], true);
  assert.equal(view.winscore, 20);
}

{
  const adapter = loadAdapter('276');
  const initial = grid(5, 3);
  const final = grid(5, 3, 3);
  const [queued] = adapter.buildLotteryResponses({
    grid: final,
    lines: [classicLine(0)],
    cascades: [
      {
        index: 0,
        grid: initial,
        lines: [classicLine(0)],
        multiplier: 2,
        removed: [],
      },
    ],
    amount: '10.00',
    baseAmount: '10.00',
    payout: '20.00',
    newBalance: '120.00',
  });
  const steps = queued.response.ResultData.viewarray;
  assert.equal(steps.length, 2);
  assert.equal(steps[0].nWinLinesDetail.length, 1);
  assert.equal(steps[0].win, 20);
  assert.equal(steps[1].nWinLinesDetail.length, 0);
}

{
  const adapter = loadAdapter('321');
  const first = grid(6, 5);
  const second = grid(6, 5, 2);
  const final = grid(6, 5, 4);
  const line = clusterLine();
  const responses = adapter.buildLotteryResponses({
    grid: final,
    lines: [line, line],
    cascades: [
      { index: 0, grid: first, lines: [line], multiplier: 2, removed: line.positions },
      { index: 1, grid: second, lines: [line], multiplier: 1, removed: line.positions },
    ],
    amount: '10.00',
    baseAmount: '10.00',
    payout: '30.00',
    newBalance: '130.00',
  });
  assert.equal(responses.length, 3);
  assert.equal(responses[0].response.ResultData.viewarray.nst, 2);
  assert.ok(Object.keys(responses[0].response.ResultData.viewarray.wp).length > 0);
  assert.equal(responses[0].response.ResultData.viewarray.nWinCards.some(Boolean), false);
  assert.equal(responses[0].response.ResultData.viewarray.nWinLinesDetail.length, 0);
  assert.equal(responses[1].response.ResultData.viewarray.nst, 2);
  assert.equal(responses[2].response.ResultData.viewarray.nst, 1);
  assert.equal(Object.keys(responses[2].response.ResultData.viewarray.wp).length, 0);
}

{
  const adapter = loadAdapter('321');
  const triggerGrid = grid(6, 5);
  const freeGrid = grid(6, 5, 2);
  const line = clusterLine();
  const responses = adapter.buildLotteryResponses({
    grid: triggerGrid,
    lines: [],
    cascades: [],
    amount: '500.00',
    baseAmount: '10.00',
    payout: '20.00',
    newBalance: '520.00',
    features: {
      baseTotalMultiplier: 0,
      scatterSymbols: [],
      freeSpinsAwarded: 1,
      freeSpinMultiplierBank: 2,
      freeSpinRounds: [
        {
          initialGrid: freeGrid,
          finalGrid: freeGrid,
          cascades: [
            {
              index: 0,
              grid: freeGrid,
              lines: [line],
              multiplier: 2,
              removed: line.positions,
            },
          ],
          lines: [line],
          totalMultiplier: 2,
          appliedMultiplier: 2,
          scatterSymbols: [],
        },
      ],
    },
  });
  const freeResponses = responses.slice(1);
  assert.ok(freeResponses.length >= 2);
  assert.equal(freeResponses[0].startsFreeSpin, true);
  assert.equal(
    freeResponses.every((queued) => queued.response.ResultData.viewarray.fs?.s === 1),
    true,
  );
}

{
  const adapter = loadAdapter('278');
  const baseGrid = grid(6, 5);
  const freeGridA = grid(6, 5, 1);
  const freeGridB = grid(6, 5, 2);
  const responses = adapter.buildLotteryResponses({
    grid: baseGrid,
    lines: [],
    cascades: [],
    amount: '500.00',
    baseAmount: '10.00',
    payout: '20.00',
    newBalance: '520.00',
    features: {
      baseTotalMultiplier: 0,
      scatterSymbols: [
        { reel: 0, row: 0, type: 'scatter' },
        { reel: 1, row: 0, type: 'scatter' },
        { reel: 2, row: 0, type: 'scatter' },
        { reel: 3, row: 0, type: 'scatter' },
      ],
      freeSpinsAwarded: 2,
      freeSpinMultiplierBank: 1,
      freeSpinRounds: [
        {
          initialGrid: freeGridA,
          finalGrid: freeGridA,
          cascades: [],
          lines: [],
          totalMultiplier: 1,
          appliedMultiplier: 1,
          scatterSymbols: [],
        },
        {
          initialGrid: freeGridB,
          finalGrid: freeGridB,
          cascades: [],
          lines: [],
          totalMultiplier: 1,
          appliedMultiplier: 1,
          scatterSymbols: [],
        },
      ],
    },
  });
  assert.equal(responses.length, 3);
  assert.equal(responses[0].response.ResultData.getFreeTime.bFlag, true);
  assert.equal(responses[0].response.ResultData.getFreeTime.nFreeTime, 2);
  assert.equal(responses[0].response.ResultData.viewarray.at(-1).nHandCards.includes(12), true);
  assert.equal(responses[1].startsFreeSpin, true);
  assert.equal(responses[2].startsFreeSpin, true);
  assert.equal(responses[2].response.ResultData.freeCount, 1);
}

console.log('H5 adapter response and animation contract tests passed.');
