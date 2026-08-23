import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const adapterPath = fileURLToPath(
  new URL('../public/games/h5-slot-collection/yachiyo-adapter.js', import.meta.url),
);
const collectionPath = fileURLToPath(
  new URL('../public/games/h5-slot-collection/', import.meta.url),
);
const pagePath = fileURLToPath(
  new URL('../src/pages/games/H5SlotCollectionPage.tsx', import.meta.url),
);
const adapterSource = fs.readFileSync(adapterPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');

assert.match(
  adapterSource,
  /if \(!audioBridge\) syncCocosAudio\(\)/,
  'input gestures must not re-apply every active audio volume after the bridge is installed',
);
assert.match(
  adapterSource,
  /typeof window\.PointerEvent === 'function'/,
  'touch devices with Pointer Events must not install duplicate touchstart and pointerdown work',
);
assert.match(
  adapterSource,
  /getExtension\(['"]WEBGL_lose_context['"]\)/,
  'route changes must explicitly release the old Cocos WebGL context',
);
assert.match(
  adapterSource,
  /reportFatalRenderFailure\(\s*['"]slot-ui-stalled['"]/,
  'settled spins must recover when the source controls remain hidden',
);
assert.match(
  pageSource,
  /payload\.type === ['"]h5-slots:fatal['"]/,
  'the platform shell must rebuild a failed source-game iframe',
);
assert.match(
  pageSource,
  /__YachiyoDisposeH5Game/,
  'the shell must release the source game before removing its iframe',
);

{
  const originalLanguageCodes = {
    'zh-Hant': 'cht',
    'zh-Hans': 'zh',
    en: 'en',
    th: 'th',
    vi: 'vn',
  };
  for (const [platformLocale, originalCode] of Object.entries(originalLanguageCodes)) {
    assert.match(
      pageSource,
      new RegExp(`['"]?${platformLocale}['"]?\\s*:\\s*['"]${originalCode}['"]`),
      `${platformLocale} must select the original Cocos ${originalCode} language assets`,
    );
  }
  assert.match(pageSource, /language:\s*ORIGINAL_LANGUAGE_BY_PLATFORM_LOCALE\[locale\]/);
  assert.doesNotMatch(
    pageSource,
    /language:\s*['"]zh['"]/,
    'the source games must not be forced to Simplified Chinese',
  );
}

{
  const bridgedSourceSocketEvents = [
    'login',
    'LoginGame',
    'LoginRoom',
    'fishShoot',
    'fishHit',
    'boomFishHit',
    'changePower',
    'changeCannon',
    'useSKill',
    'guessFree',
    'LoginfreeCount',
    'history',
    'lottery',
    'freeTimeType',
    'cleanLineOut',
  ];
  for (const event of bridgedSourceSocketEvents) {
    assert.match(
      adapterSource,
      new RegExp(`event === ['"]${event}['"]`),
      `${event} must have an explicit local socket handler`,
    );
  }
}

function loadAdapter(gameCode, storedValues = {}, options = {}) {
  const storage = {
    getItem: (key) => storedValues[key] ?? null,
    setItem: (key, value) => {
      storedValues[key] = value;
    },
  };
  const context = {
    URL,
    URLSearchParams,
    AbortController,
    fetch:
      options.fetch ?? (() => Promise.reject(new Error('network disabled in adapter unit tests'))),
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

{
  const classic = loadAdapter('113');
  const waterMargin = loadAdapter('116');
  const diamondStrike = loadAdapter('135');
  const yuPuTuan = loadAdapter('155');
  const fruitLittleMary = loadAdapter('160');
  const aztecGems = loadAdapter('161');
  const fire88 = loadAdapter('188');
  const lucky777 = loadAdapter('232');
  const caishenFa = loadAdapter('244');
  const flyingTogether = loadAdapter('252');
  const caishen = loadAdapter('278');
  const goldenEmpire = loadAdapter('301');
  const fortuneOx = loadAdapter('264');
  const fortuneGems = loadAdapter('302');
  const mahjongWays = loadAdapter('269');
  const mahjongWays2 = loadAdapter('271');
  const captain = loadAdapter('276');
  const queen = loadAdapter('281');
  assert.equal(classic.shouldHideLegacyButtonHandler('onCLick_buyCoin'), true);
  assert.equal(classic.shouldHideLegacyButtonHandler('onBtnBuyFreeShow'), false);
  assert.equal(classic.shouldHideLegacyButtonHandler('onBtnGuess'), false);
  assert.deepEqual(
    {
      standardSymbols: classic.shape.standardSymbols,
      seven: classic.shape.seven,
      jackpotChest: classic.shape.jackpotChest,
      freeDiamond: classic.shape.freeDiamond,
      bar: classic.shape.bar,
    },
    { standardSymbols: 14, seven: 11, jackpotChest: 12, freeDiamond: 13, bar: 14 },
  );
  assert.deepEqual(
    {
      standardSymbols: waterMargin.shape.standardSymbols,
      bonusDragon: waterMargin.shape.bonusDragon,
    },
    { standardSymbols: 9, bonusDragon: 9 },
  );
  assert.deepEqual(
    {
      standardSymbols: diamondStrike.shape.standardSymbols,
      seven: diamondStrike.shape.seven,
      scatter: diamondStrike.shape.scatter,
      wild: diamondStrike.shape.wild,
      goldenSeven: diamondStrike.shape.goldenSeven,
    },
    { standardSymbols: 9, seven: 6, scatter: 7, wild: 8, goldenSeven: 9 },
  );
  assert.deepEqual(
    {
      standardSymbols: yuPuTuan.shape.standardSymbols,
      scatter: yuPuTuan.shape.scatter,
      wild: yuPuTuan.shape.wild,
      reels: yuPuTuan.shape.reels,
      rows: yuPuTuan.shape.rows,
    },
    { standardSymbols: 13, scatter: 10, wild: 9, reels: 5, rows: 4 },
  );
  assert.deepEqual(
    {
      standardSymbols: fruitLittleMary.shape.standardSymbols,
      bonus: fruitLittleMary.shape.bonus,
      scatter: fruitLittleMary.shape.scatter,
      wild: fruitLittleMary.shape.wild,
      featureTrigger: fruitLittleMary.shape.featureTrigger,
    },
    { standardSymbols: 11, bonus: 9, scatter: 10, wild: 11, featureTrigger: 9 },
  );
  assert.deepEqual(
    {
      standardSymbols: aztecGems.shape.standardSymbols,
      wild: aztecGems.shape.wild,
      multiplierWheel: aztecGems.shape.multiplierWheel,
    },
    { standardSymbols: 8, wild: 8, multiplierWheel: true },
  );
  assert.deepEqual(
    {
      standardSymbols: fire88.shape.standardSymbols,
      wild: fire88.shape.wild,
      jackpot88: fire88.shape.jackpot88,
    },
    { standardSymbols: 8, wild: 7, jackpot88: 8 },
  );
  assert.deepEqual(
    {
      standardSymbols: caishenFa.shape.standardSymbols,
      scatter: caishenFa.shape.scatter,
      featureTrigger: caishenFa.shape.featureTrigger,
      blueWild: caishenFa.shape.blueWild,
      redWild: caishenFa.shape.redWild,
      caishenFaFaFa: caishenFa.shape.caishenFaFaFa,
    },
    {
      standardSymbols: 11,
      scatter: 9,
      featureTrigger: 9,
      blueWild: 10,
      redWild: 11,
      caishenFaFaFa: true,
    },
  );
  assert.deepEqual(
    {
      standardSymbols: flyingTogether.shape.standardSymbols,
      wild: flyingTogether.shape.wild,
      reels: flyingTogether.shape.reels,
      rows: flyingTogether.shape.rows,
    },
    { standardSymbols: 13, wild: 13, reels: 5, rows: 3 },
  );
  assert.deepEqual(
    {
      standardSymbols: lucky777.shape.standardSymbols,
      wild: lucky777.shape.wild,
      featureTrigger: lucky777.shape.featureTrigger,
      reels: lucky777.shape.reels,
      rows: lucky777.shape.rows,
    },
    { standardSymbols: 9, wild: 9, featureTrigger: 9, reels: 3, rows: 3 },
  );
  assert.equal(caishen.shouldHideLegacyButtonHandler('onBtnGuess'), false);
  assert.equal(caishen.shouldHideLegacyButtonHandler('onBtnBuyFreeShow'), false);
  assert.deepEqual(
    {
      standardSymbols: caishen.shape.standardSymbols,
      scatter: caishen.shape.scatter,
      wild: caishen.shape.wild,
    },
    { standardSymbols: 7, scatter: 12, wild: 11 },
  );
  assert.equal(classic.shouldHideFishSeatNode('noPlayer0'), false);
  assert.equal(classic.shouldHideFishSeatNode('noPlayer1'), true);
  assert.equal(classic.shouldHideFishSeatNode('noPlayer2'), true);
  assert.equal(classic.shouldHideFishSeatNode('noPlayer3'), true);
  assert.equal(classic.shouldHideFishSeatNode('player1'), false);
  assert.deepEqual(
    {
      standardSymbols: captain.shape.standardSymbols,
      scatter: captain.shape.scatter,
      wild: captain.shape.wild,
    },
    { standardSymbols: 7, scatter: 8, wild: 9 },
  );
  assert.deepEqual(
    {
      standardSymbols: queen.shape.standardSymbols,
      scatter: queen.shape.scatter,
      wild: queen.shape.wild,
    },
    { standardSymbols: 7, scatter: 8, wild: 9 },
  );
  assert.deepEqual(
    {
      reelRows: Array.from(fortuneOx.shape.reelRows),
      rowOffsets: Array.from(fortuneOx.shape.rowOffsets),
      blankSymbol: fortuneOx.shape.blankSymbol,
      wild: fortuneOx.shape.wild,
    },
    { reelRows: [3, 4, 3], rowOffsets: [1, 0, 1], blankSymbol: 8, wild: 7 },
  );
  assert.deepEqual(
    { standardSymbols: fortuneGems.shape.standardSymbols, wild: fortuneGems.shape.wild },
    { standardSymbols: 8, wild: 8 },
  );
  assert.deepEqual(
    {
      standardSymbols: mahjongWays.shape.standardSymbols,
      scatter: mahjongWays.shape.scatter,
      wild: mahjongWays.shape.wild,
    },
    { standardSymbols: 8, scatter: 9, wild: 10 },
  );
  assert.deepEqual(
    {
      standardSymbols: mahjongWays2.shape.standardSymbols,
      scatter: mahjongWays2.shape.scatter,
      wild: mahjongWays2.shape.wild,
      reelRows: Array.from(mahjongWays2.shape.reelRows),
      blankSymbol: mahjongWays2.shape.blankSymbol,
    },
    { standardSymbols: 9, scatter: 10, wild: 11, reelRows: [4, 5, 5, 5, 4], blankSymbol: 12 },
  );

  const fruitGrid = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [1, 2, 3],
    [4, 5, 6],
  ];
  const fruitResponses = fruitLittleMary.buildLotteryResponses({
    payout: '1000.00',
    newBalance: '2000.00',
    baseAmount: '90.00',
    multiplier: 100 / 9,
    grid: fruitGrid,
    lines: [],
    cascades: [],
    features: {
      scatterSymbols: [],
      scatterCount: 0,
      freeSpinsAwarded: 0,
      freeSpinsPlayed: 0,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 100 / 9,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: 100 / 9,
      sourceMiniGame: {
        type: 'fruit-little-mary',
        attempts: 1,
        rounds: [
          { reelSymbols: [5, 0, 1, 2], stopIndex: 14, lineBetMultiplier: 100 },
          { reelSymbols: [3, 2, 5, 6], stopIndex: 9, lineBetMultiplier: 0 },
        ],
        lineBetMultiplier: 100,
        payoutMultiplier: 100 / 9,
      },
    },
  });
  const fruitOpenBox = fruitResponses[0].response.ResultData.viewarray.getOpenBox;
  assert.equal(fruitOpenBox.bFlag, true);
  assert.equal(fruitOpenBox.win, 1000);
  assert.equal(fruitOpenBox.user_score, 2000);
  assert.equal(fruitOpenBox.cishu, 1);
  assert.equal(fruitOpenBox.chouma, 10);
  assert.deepEqual(
    Array.from(fruitOpenBox.gameList, (round) => Array.from(round)),
    [
      [5, 0, 1, 2],
      [3, 2, 5, 6],
    ],
  );
  assert.deepEqual(Array.from(fruitOpenBox.roundList), [14, 9]);
  assert.deepEqual(Array.from(fruitOpenBox.scoreList), [1000, 0]);

  const fruitJackpotGrid = fruitGrid.map((column) => Array.from(column));
  fruitJackpotGrid[0][0] = 9;
  fruitJackpotGrid[2][1] = 9;
  fruitJackpotGrid[4][2] = 9;
  const fruitJackpotResponses = fruitLittleMary.buildLotteryResponses({
    payout: '250000.00',
    newBalance: '300000.00',
    baseAmount: '5000.00',
    multiplier: 50,
    grid: fruitJackpotGrid,
    lines: [],
    cascades: [],
    features: {
      scatterSymbols: [],
      scatterCount: 0,
      freeSpinsAwarded: 0,
      freeSpinsPlayed: 0,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 50,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: 50,
      sourceJackpot: {
        type: 'fruit-little-mary-jackpot',
        positions: [
          { reel: 0, row: 0 },
          { reel: 2, row: 1 },
          { reel: 4, row: 2 },
        ],
        payoutMultiplier: 50,
      },
    },
  });
  const fruitJackpotData = fruitJackpotResponses[0].response.ResultData.viewarray;
  assert.equal(fruitJackpotData.winscore, 250000);
  assert.deepEqual(
    Array.from(fruitJackpotData.nWinCards)
      .map((winning, index) => (winning ? index : -1))
      .filter((index) => index >= 0),
    [0, 7, 14],
  );
  assert.equal(fruitJackpotData.getOpenBox.bFlag, false);

  const aztecResponses = aztecGems.buildLotteryResponses({
    payout: '50.00',
    newBalance: '1000.00',
    baseAmount: '50.00',
    multiplier: 1,
    grid: [
      [0, 1, 2],
      [7, 3, 4],
      [0, 5, 6],
    ],
    lines: [
      {
        lineIndex: 1,
        path: [0, 0, 0],
        positions: [
          { reel: 0, row: 0 },
          { reel: 1, row: 0 },
          { reel: 2, row: 0 },
        ],
        startReel: 0,
        direction: 'ltr',
        symbol: 0,
        count: 3,
        payout: 1,
      },
    ],
    cascades: [],
    sourceFeature: {
      type: 'aztec-gems-multiplier',
      multiplierIndex: 3,
      multiplier: 5,
    },
  });
  const aztecData = aztecResponses[0].response.ResultData.viewarray;
  assert.equal(aztecData.fMultiple, 5);
  assert.deepEqual(Array.from(aztecData.nWinLines), [1]);
  assert.deepEqual(Array.from(aztecData.nWinDetail), [50]);
  assert.equal(aztecData.winscore, 50);

  const fireGrid = [
    [6, 0, 1],
    [2, 6, 3],
    [4, 5, 0],
  ];
  const fireFreeGrid = [
    [0, 1, 2],
    [2, 3, 4],
    [4, 5, 0],
  ];
  const fireFreeResponses = fire88.buildLotteryResponses({
    payout: '0.00',
    newBalance: '1000.00',
    baseAmount: '70.00',
    multiplier: 0,
    grid: fireGrid,
    lines: [],
    cascades: [],
    features: {
      scatterSymbols: [
        { reel: 0, row: 0, type: 'scatter' },
        { reel: 1, row: 1, type: 'scatter' },
      ],
      scatterCount: 0,
      freeSpinsAwarded: 1,
      freeSpinsPlayed: 1,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds: [
        {
          index: 0,
          initialGrid: fireFreeGrid,
          finalGrid: fireFreeGrid,
          cascades: [],
          lines: [],
          baseMultiplier: 0,
          scatterSymbols: [],
          multiplierSymbols: [],
          multiplierTotal: 0,
          appliedMultiplier: 1,
          totalMultiplier: 0,
          extraFreeSpinsAwarded: 0,
        },
      ],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: 0,
    },
  });
  assert.equal(fireFreeResponses.length, 2);
  assert.equal(fireFreeResponses[0].response.ResultData.viewarray.getFreeTime.bFlag, true);
  assert.equal(fireFreeResponses[0].response.ResultData.viewarray.getFreeTime.nFreeTime, 1);

  const fireJackpotResponses = fire88.buildLotteryResponses({
    payout: '6160.00',
    newBalance: '7000.00',
    baseAmount: '70.00',
    multiplier: 88,
    grid: [
      [7, 0, 1],
      [2, 7, 3],
      [4, 5, 7],
    ],
    lines: [],
    cascades: [],
    features: {
      scatterSymbols: [],
      scatterCount: 3,
      freeSpinsAwarded: 0,
      freeSpinsPlayed: 0,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 88,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: 88,
      sourceJackpot: {
        type: 'fire-88-jackpot',
        tierMultiplier: 88,
        picks: [88, 888, 88, 38, 88],
        payoutMultiplier: 88,
      },
    },
  });
  const fireOpenBox = fireJackpotResponses[0].response.ResultData.viewarray.getOpenBox;
  assert.equal(fireJackpotResponses[0].response.ResultData.userscore, 840);
  assert.equal(fireOpenBox.bFlag, true);
  assert.equal(fireOpenBox.win_card, 88);
  assert.equal(fireOpenBox.win, 6160);
  assert.deepEqual(Array.from(fireOpenBox.win_list), [88, 888, 88, 38, 88]);

  const nineLineGrid = [
    [10, 11, 12],
    [13, 0, 1],
    [2, 3, 4],
    [5, 6, 7],
    [8, 9, 10],
  ];
  const nineLineFree = classic.buildLotteryResponses({
    payout: '10.00',
    newBalance: '100.00',
    baseAmount: '10.00',
    multiplier: 1,
    grid: nineLineGrid,
    lines: [],
    cascades: [],
    features: {
      scatterSymbols: [],
      scatterCount: 3,
      freeSpinsAwarded: 1,
      freeSpinsPlayed: 1,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds: [
        {
          index: 0,
          initialGrid: nineLineGrid,
          finalGrid: nineLineGrid,
          cascades: [],
          lines: [],
          baseMultiplier: 1,
          scatterSymbols: [],
          multiplierSymbols: [],
          multiplierTotal: 0,
          appliedMultiplier: 1,
          totalMultiplier: 1,
          extraFreeSpinsAwarded: 0,
        },
      ],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 1,
      totalMultiplier: 1,
    },
  });
  assert.equal(nineLineFree.length, 2);
  assert.equal(nineLineFree[0].response.ResultData.viewarray.getFreeTime.bFlag, true);
  assert.equal(nineLineFree[0].response.ResultData.viewarray.getFreeTime.nFreeTime, 1);
  assert.equal(nineLineFree[1].startsFreeSpin, true);
  assert.equal(nineLineFree[0].response.ResultData.viewarray.nHandCards.includes(14), true);

  const waterGrid = [
    [0, 1, 2],
    [1, 2, 3],
    [2, 3, 8],
    [3, 4, 8],
    [4, 5, 8],
  ];
  const waterFreeGrid = waterGrid.map((column) =>
    column.map((symbol) => (symbol === 8 ? 0 : symbol)),
  );
  const waterResponses = waterMargin.buildLotteryResponses({
    payout: '0.00',
    newBalance: '100.00',
    baseAmount: '10.00',
    multiplier: 0,
    grid: waterGrid,
    lines: [
      {
        lineIndex: 2,
        path: [2, 2, 2, 2, 2],
        positions: [
          { reel: 2, row: 2 },
          { reel: 3, row: 2 },
          { reel: 4, row: 2 },
        ],
        startReel: 2,
        direction: 'rtl',
        symbol: 8,
        count: 3,
        payout: 0,
      },
    ],
    cascades: [],
    features: {
      scatterSymbols: [],
      scatterCount: 3,
      freeSpinsAwarded: 1,
      freeSpinsPlayed: 1,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds: [
        {
          index: 0,
          initialGrid: waterFreeGrid,
          finalGrid: waterFreeGrid,
          cascades: [],
          lines: [],
          baseMultiplier: 0,
          scatterSymbols: [],
          multiplierSymbols: [],
          multiplierTotal: 0,
          appliedMultiplier: 1,
          totalMultiplier: 0,
          extraFreeSpinsAwarded: 0,
        },
      ],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: 0,
    },
  });
  assert.equal(waterResponses.length, 2);
  assert.equal(waterResponses[0].response.ResultData.viewarray.getFreeTime.bFlag, true);
  assert.equal(waterResponses[0].response.ResultData.viewarray.getFreeTime.nFreeTime, 1);
  assert.equal(waterResponses[0].response.ResultData.viewarray.nHandCards.includes(9), true);
  assert.equal(waterResponses[1].startsFreeSpin, true);
  assert.equal(waterResponses[1].response.ResultData.viewarray.nHandCards.includes(9), false);

  const diamondGrid = [
    [8, 0, 1],
    [1, 8, 2],
    [2, 3, 8],
    [3, 4, 5],
    [4, 5, 0],
  ];
  const diamondResponses = diamondStrike.buildLotteryResponses({
    payout: '100.00',
    newBalance: '1100.00',
    baseAmount: '10.00',
    multiplier: 10,
    grid: diamondGrid,
    lines: [],
    cascades: [],
    features: {
      scatterSymbols: [],
      scatterCount: 0,
      freeSpinsAwarded: 0,
      freeSpinsPlayed: 0,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 10,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 0,
      totalMultiplier: 10,
      sourceJackpot: {
        type: 'diamond-strike-jackpot',
        tierMultiplier: 10,
        picks: [10, 10, 10],
        payoutMultiplier: 10,
      },
    },
  });
  const diamondView = diamondResponses[0].response.ResultData.viewarray;
  assert.equal(diamondView.nHandCards.includes(9), true);
  assert.deepEqual(
    {
      ...diamondView.getOpenBox,
      win_list: Array.from(diamondView.getOpenBox.win_list),
    },
    {
      bFlag: true,
      win_list: [10, 10, 10],
      win_card: 10,
      win: 100,
    },
  );

  const mahjongWays2Grid = [
    [0, 1, 2, 3],
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6],
    [3, 4, 5, 6, 7],
    [4, 5, 6, 7],
  ];
  const mahjongWays2Cards = Array.from(
    mahjongWays2.flattenSymbols(mahjongWays2Grid, mahjongWays2.shape),
  );
  assert.equal(mahjongWays2Cards.length, 25);
  assert.deepEqual(mahjongWays2Cards.slice(20), [12, 6, 7, 8, 12]);
  const mahjongResponses = mahjongWays2.buildLotteryResponses({
    payout: '1.00',
    newBalance: '101.00',
    baseAmount: '10.00',
    multiplier: 0.1,
    grid: mahjongWays2Grid,
    finalGoldPositions: [{ reel: 2, row: 4 }],
    lines: [],
    cascades: [
      {
        index: 0,
        grid: mahjongWays2Grid,
        lines: [],
        multiplier: 0.1,
        removed: [],
        goldPositions: [
          { reel: 1, row: 0 },
          { reel: 3, row: 2 },
        ],
      },
    ],
  });
  assert.deepEqual(
    Array.from(mahjongResponses[0].response.ResultData.viewarray[0].goldCards),
    [1, 13],
  );
  assert.deepEqual(
    Array.from(mahjongResponses[0].response.ResultData.viewarray[1].goldCards),
    [22],
  );

  const fortuneOxGrid = [
    [0, 1, 2],
    [3, 4, 5, 6],
    [0, 1, 2],
  ];
  assert.deepEqual(
    Array.from(fortuneOx.flattenSymbols(fortuneOxGrid, fortuneOx.shape)),
    [8, 4, 8, 1, 5, 1, 2, 6, 2, 3, 7, 3],
  );
  const fortuneOxWins = fortuneOx.winFields(
    [{ lineIndex: 1, path: [0, 1, 0], startReel: 0, count: 3, payout: 0.3 }],
    fortuneOx.shape,
    10,
  );
  assert.deepEqual(Array.from(fortuneOxWins.nWinLinesDetail[0]), [3, 4, 5]);

  const fortuneOxResponses = fortuneOx.buildLotteryResponses({
    payout: '3.00',
    newBalance: '103.00',
    baseAmount: '10.00',
    multiplier: 0.3,
    grid: fortuneOxGrid,
    lines: [{ lineIndex: 1, path: [0, 1, 0], startReel: 0, count: 3, payout: 0.3 }],
    cascades: [],
    sourceFeature: {
      type: 'fortune-ox-respin',
      triggered: true,
      respins: 2,
      fullScreenMultiplier: 1,
    },
  });
  assert.deepEqual(
    { ...fortuneOxResponses[0].response.ResultData.viewarray.getBigWin },
    { bFlag: true, isStart: true },
  );

  const caishenStackGrid = Array.from({ length: 6 }, (_, reel) => [
    reel % 7,
    reel % 7,
    (reel + 1) % 7,
    (reel + 1) % 7,
    (reel + 2) % 7,
  ]);
  const caishenSteps = caishen.buildLotteryResponses({
    payout: '0.00',
    newBalance: '100.00',
    baseAmount: '10.00',
    multiplier: 0,
    grid: caishenStackGrid,
    lines: [],
    cascades: [],
  })[0].response.ResultData.viewarray;
  assert.equal(caishenSteps[0].sr.length, 12, '2-cell Caishen symbols must use large prefabs');
  assert.equal(
    caishenSteps[0].sr.every((positions) => positions.length === 2),
    true,
  );
  assert.equal(
    caishenSteps[0].srd.every((state) => state.bt === 0 && state.ls === 0),
    true,
  );
  assert.notDeepEqual(Array.from(caishenSteps[0].trl), [1, 2, 3, 4]);

  assert.equal(goldenEmpire.shape.standardSymbols, 10);
  assert.equal(goldenEmpire.shape.scatter, 11);
  assert.equal(goldenEmpire.shape.wild, 12);
  const goldenGrid = grid(6, 5, 2);
  const goldenFinalGrid = grid(6, 5, 3);
  goldenFinalGrid[2][0] = 11;
  goldenFinalGrid[2][1] = 11;
  const goldenSteps = goldenEmpire.buildLotteryResponses({
    payout: '1.00',
    newBalance: '101.00',
    baseAmount: '10.00',
    multiplier: 0.1,
    grid: goldenFinalGrid,
    lines: [],
    cascades: [
      {
        index: 0,
        grid: goldenGrid,
        lines: [],
        multiplier: 0.1,
        removed: [
          { reel: 2, row: 0 },
          { reel: 2, row: 1 },
        ],
        sourceStacks: [
          {
            id: 7,
            symbol: 2,
            positions: [
              { reel: 2, row: 0 },
              { reel: 2, row: 1 },
            ],
            state: 'gold',
          },
        ],
      },
    ],
    finalSourceStacks: [
      {
        id: 7,
        symbol: 11,
        positions: [
          { reel: 2, row: 0 },
          { reel: 2, row: 1 },
        ],
        state: 'wild',
        remaining: 2,
      },
    ],
  })[0].response.ResultData.viewarray;
  assert.deepEqual(Array.from(goldenSteps[0].sr[7]), [2, 8]);
  assert.deepEqual({ ...goldenSteps[0].srd[7] }, { bt: 1, ls: 2, r: 3 });
  assert.deepEqual(Array.from(goldenSteps[1].sr[7]), [2, 8]);
  assert.deepEqual({ ...goldenSteps[1].srd[7] }, { bt: 1, ls: 3, r: 12, times: 2 });
  assert.notDeepEqual(Array.from(goldenSteps[0].trl), [1, 2, 3, 4]);
}

{
  const captain = loadAdapter('276');
  const opening = grid(5, 3);
  opening[1][1] = 8;
  const final = grid(5, 3, 3);
  const responses = captain.buildLotteryResponses({
    payout: '1.50',
    newBalance: '101.50',
    baseAmount: '10.00',
    multiplier: 0.15,
    grid: final,
    features: {
      scatterSymbols: [
        { reel: 0, row: 0, type: 'scatter' },
        { reel: 3, row: 1, type: 'scatter' },
        { reel: 4, row: 2, type: 'scatter' },
      ],
      freeSpinsAwarded: 10,
      freeSpinRounds: [],
      baseTotalMultiplier: 0.15,
      sourceFreeModeType: 1,
    },
    lines: [],
    cascades: [
      {
        index: 0,
        grid: opening,
        lines: [classicLine(1)],
        multiplier: 0.15,
        removed: [
          { reel: 0, row: 1 },
          { reel: 1, row: 1 },
          { reel: 2, row: 1 },
        ],
      },
    ],
  });
  const steps = responses[0].response.ResultData.viewarray;
  assert.equal(steps[0].nHandCards[0], 8, 'Scatter must appear on the opening reel result');
  assert.equal(steps[0].nHandCards[6], 9, 'Wild must preserve the source symbol ID');
  assert.notEqual(
    steps.at(-1).nHandCards[0],
    8,
    'Scatter must not be copied onto the final tumble',
  );
  assert.equal(steps[0].combo_num, 0);
  assert.equal(steps.at(-1).combo_num, 1);
}

{
  const adapter = loadAdapter('2');
  assert.equal(adapter.calculateCannonAimAngle({ x: 100, y: 0 }, { x: 100, y: 200 }, 0), 0);
  assert.ok(adapter.calculateCannonAimAngle({ x: 100, y: 0 }, { x: 300, y: 200 }, 0) < 0);
  assert.ok(adapter.calculateCannonAimAngle({ x: 100, y: 400 }, { x: -100, y: 200 }, 3) > 0);
  assert.equal(adapter.calculateCannonAimAngle({ x: 100, y: 0 }, { x: 100, y: -20 }, 0), null);

  const spawns = Array.from({ length: 512 }, (_, index) => adapter.buildFishSpawn(index + 1));
  assert.ok(new Set(spawns.map((spawn) => spawn.fishPath)).size > 35);
  assert.ok(spawns.some((spawn) => spawn.fishPath < 14));
  assert.ok(spawns.some((spawn) => spawn.fishPath >= 14 && spawn.fishPath < 28));
  assert.ok(spawns.some((spawn) => spawn.fishLineup > 0 && spawn.fishCount > 1));
  assert.ok(spawns.some((spawn) => spawn.fishType === 0));
  assert.ok(spawns.some((spawn) => spawn.fishType >= 20));
  assert.ok(spawns.some((spawn) => spawn.fishLineup === 4 && spawn.fishCount === 6));
  assert.equal(
    spawns.every(
      (spawn) =>
        spawn.fishType >= 0 &&
        spawn.fishType < 24 &&
        spawn.fishCount >= 1 &&
        spawn.fishCount <= 6 &&
        spawn.fishId.length === spawn.fishCount,
    ),
    true,
  );
  assert.ok(spawns.filter((spawn) => spawn.fishCount > 1).length > spawns.length / 3);
  assert.equal(
    spawns.every(
      (spawn) =>
        spawn.fishPath >= 0 && spawn.fishPath < 43 && spawn.fishId.length === spawn.fishCount,
    ),
    true,
  );
  const spawnDelays = spawns.map((_, index) => adapter.getFishSpawnDelay(index + 1));
  assert.ok(new Set(spawnDelays).size > 20);
  assert.ok(spawnDelays.every((delay) => delay >= 420 && delay < 900));

  for (const [gameCode, typeCount] of [
    ['2', 24],
    ['12', 28],
    ['13', 24],
    ['14', 34],
  ]) {
    const gameAdapter = loadAdapter(gameCode);
    const gameSpawns = Array.from({ length: 512 }, (_, index) =>
      gameAdapter.buildFishSpawn(index + 1),
    );
    assert.equal(
      gameSpawns.every((spawn) => spawn.fishType >= 0 && spawn.fishType < typeCount),
      true,
    );
    assert.ok(
      gameSpawns.some((spawn) => spawn.fishType >= typeCount - 4),
      `${gameCode} must use its recovered boss prefabs`,
    );
  }
  assert.equal(adapter.isFishHitReady({ result: {}, hit: null }), false);
  assert.equal(adapter.isFishHitReady({ result: null, hit: {} }), false);
  assert.equal(adapter.isFishHitReady({ result: {}, hit: {} }), true);

  const explosion = adapter.buildFishExplosionResult(
    {
      fishId: 'bomb',
      fishIdList: ['bomb', 'fish-1', 'fish-1', 'missing', 'fish-2', 'fish-3'],
    },
    { userId: 'player-1', hitSocre: 12.5 },
    ['fish-1', 'fish-2', 'fish-3'],
  );
  assert.deepEqual(
    {
      ...explosion,
      ResultData: { ...explosion.ResultData, fishList: Array.from(explosion.ResultData.fishList) },
    },
    {
      ResultCode: 1,
      ResultData: {
        userId: 'player-1',
        fishList: ['fish-1', 'fish-2', 'fish-3'],
        hitSocre: 12.5,
      },
    },
  );
}

{
  const adapter = loadAdapter('244');
  assert.match(adapter.sourceFontFallback('url("/native/FZY4JW--GB1-0.ttf")'), /PingFang TC/);
  assert.match(adapter.sourceFontFallback('url("/native/BRLNSDB.ttf")'), /Arial Black/);
  assert.match(adapter.sourceFontFallback('url("/native/arialbd_0.ttf")'), /Arial Bold/);
  assert.match(adapter.sourceFontFallback('url("/native/TTF_BasicFont_Bold.ttf")'), /Arial Bold/);
  assert.match(adapter.sourceFontFallback('url("/native/TTF_BasicFont_Normal.ttf")'), /Arial/);
  assert.equal(adapter.sourceFontFallback('url("/native/original-present-font.ttf")'), null);
  assert.equal(adapter.isLegacyBrandWebViewUrl('/pglogo/indexlogo.html'), true);
  assert.equal(
    adapter.isLegacyBrandWebViewUrl('https://legacy.test/pglogo/indexlogo.html?v=1'),
    true,
  );
  assert.equal(adapter.isLegacyBrandWebViewUrl('/games/help/index.html'), false);
  assert.equal(
    adapter.rewriteMissingSourceFontStyle(
      "@font-face { font-family:'legacy'; src:url('/native/FZY4JW--GB1-0.ttf');}",
    ),
    '@font-face { font-family:\'legacy\'; src:local("PingFang TC"), local("Microsoft JhengHei"), local("Arial Unicode MS"), local("Arial");}',
  );
  assert.equal(
    adapter.rewriteMissingSourceFontStyle(
      "@font-face { font-family:'original'; src:url('/native/original-present-font.ttf');}",
    ),
    "@font-face { font-family:'original'; src:url('/native/original-present-font.ttf');}",
  );

  const fullScreen = adapter.buildLotteryResponses({
    grid: Array.from({ length: 5 }, () => Array(3).fill(7)),
    lines: [
      {
        lineId: 'full-screen',
        symbol: 7,
        count: 15,
        payout: 2500,
        positions: Array.from({ length: 5 }, (_, reel) =>
          Array.from({ length: 3 }, (_, row) => ({ reel, row })),
        ).flat(),
      },
    ],
    cascades: [],
    multiplier: 1,
    amount: '1.00',
    baseAmount: '1.00',
    payout: '2500.00',
    newBalance: '2600.00',
  });
  assert.deepEqual(
    { ...fullScreen[0].response.ResultData.viewarray.getAllSame },
    { bFlag: true, color: 7 },
  );

  const freeFeature = adapter.buildLotteryResponses({
    grid: [
      [8, 0, 1],
      [2, 8, 3],
      [4, 5, 8],
      [6, 7, 0],
      [1, 2, 3],
    ],
    lines: [],
    cascades: [],
    amount: '1.00',
    baseAmount: '1.00',
    payout: '5000.00',
    newBalance: '5100.00',
    features: {
      scatterSymbols: [
        { reel: 0, row: 0, type: 'scatter' },
        { reel: 1, row: 1, type: 'scatter' },
        { reel: 2, row: 2, type: 'scatter' },
      ],
      freeSpinsAwarded: 10,
      freeSpinsPlayed: 1,
      baseTotalMultiplier: 0,
      sourceFreeWinMultiplier: 1,
      freeSpinRounds: [
        {
          initialGrid: Array.from({ length: 5 }, () => Array(3).fill(10)),
          finalGrid: Array.from({ length: 5 }, () => Array(3).fill(10)),
          lines: [
            {
              lineId: 'full-screen',
              symbol: 10,
              count: 15,
              payout: 5000,
              positions: Array.from({ length: 5 }, (_, reel) =>
                Array.from({ length: 3 }, (_, row) => ({ reel, row })),
              ).flat(),
            },
          ],
          cascades: [],
          totalMultiplier: 5000,
          extraFreeSpinsAwarded: 0,
          scatterSymbols: [],
          multiplierSymbols: [],
          appliedMultiplier: 1,
        },
      ],
    },
  });
  assert.equal(freeFeature[0].response.ResultData.viewarray.getFreeTime.bFlag, true);
  assert.equal(freeFeature[0].response.ResultData.viewarray.getFreeTime.nFreeTime, 10);
  assert.deepEqual(
    { ...freeFeature[1].response.ResultData.viewarray.getAllSame },
    { bFlag: true, color: 9 },
  );
  assert.equal(
    Array.from(freeFeature[1].response.ResultData.viewarray.nHandCards).every(
      (symbol) => symbol === 11,
    ),
    true,
  );
}

{
  const requests = [];
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const adapter = loadAdapter('2', storedValues, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ResultCode: 1,
          userId: 'player-1',
          skillId: 1,
          cost: 100,
          durationMs: 5000,
          balance: 900,
        }),
      };
    },
  });
  const socket = adapter.createFakeSocket();
  let result = null;
  socket.on('useSkillResult', (payload) => {
    result = payload;
  });
  socket.emit('useSKill', JSON.stringify({ uid: 'player-1', sid: 1 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.test/api/games/h5-slots/fish/skill');
  assert.equal(requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(requests[0].init.body), { gameCode: '2', skillId: 1 });
  assert.deepEqual({ ...result }, { ResultCode: 1, uid: 'player-1', sid: 1, cost: 100 });
}

{
  const requests = [];
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const adapter = loadAdapter('278', storedValues, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          betId: 'buy-free-test',
          grid: grid(6, 5),
          lines: [],
          cascades: [],
          multiplier: 0,
          amount: '10.00',
          baseAmount: '10.00',
          payout: '0.00',
          newBalance: '1000.00',
        }),
      };
    },
  });
  const socket = adapter.createFakeSocket();
  let lotteryResult = null;
  socket.on('lotteryResult', (payload) => {
    lotteryResult = payload;
  });
  socket.emit('lottery', JSON.stringify({ nBetList: [10], isBuyFree: 1 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.test/api/games/h5-slots/spin');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    gameCode: '278',
    amount: 10,
    isBuyFree: true,
  });
  assert.equal(lotteryResult.ResultCode, 1);
}

{
  const requests = [];
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const triggerGrid = grid(6, 5);
  const scatterSymbols = [0, 1, 2, 3].map((reel) => ({
    reel,
    row: 0,
    type: 'scatter',
  }));
  const freeRounds = Array.from({ length: 10 }, (_, index) => ({
    index,
    initialGrid: grid(6, 5, index + 1),
    finalGrid: grid(6, 5, index + 1),
    cascades: [],
    lines: [],
    baseMultiplier: 0,
    scatterSymbols: [],
    multiplierSymbols: [],
    multiplierTotal: 0,
    appliedMultiplier: 1,
    totalMultiplier: 0,
    extraFreeSpinsAwarded: 0,
  }));
  const adapter = loadAdapter('278', storedValues, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (url.endsWith('/caishen/gamble-free')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            guessResult: 1,
            freeCount: 10,
            freeMul: 8,
            newBalance: '500.00',
          }),
        };
      }
      if (url.endsWith('/caishen/collect-free')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            betId: 'caishen-pending-1',
            grid: triggerGrid,
            lines: [],
            cascades: [],
            multiplier: 0,
            amount: '500.00',
            baseAmount: '10.00',
            payout: '0.00',
            newBalance: '500.00',
            caishenFreeContinuation: true,
            features: {
              scatterSymbols,
              freeSpinsAwarded: 10,
              freeSpinMultiplierBank: 0,
              sourceFreeWinMultiplier: 8,
              baseTotalMultiplier: 0,
              freeSpinRounds: freeRounds,
            },
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          betId: 'caishen-pending-1',
          grid: triggerGrid,
          lines: [],
          cascades: [],
          multiplier: 0,
          amount: '500.00',
          baseAmount: '10.00',
          payout: '0.00',
          newBalance: '500.00',
          requiresCaishenFreeDecision: true,
          features: {
            scatterSymbols,
            freeSpinsAwarded: 8,
            freeSpinMultiplierBank: 0,
            sourceFreeWinMultiplier: 8,
            baseTotalMultiplier: 0,
            freeSpinRounds: [],
          },
        }),
      };
    },
  });
  const socket = adapter.createFakeSocket();
  const lotteryResults = [];
  let guessResult = null;
  socket.on('lotteryResult', (payload) => lotteryResults.push(payload));
  socket.on('guessFreeResult', (payload) => {
    guessResult = payload;
  });

  socket.emit('lottery', JSON.stringify({ nBetList: [10], isBuyFree: 1 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(lotteryResults[0].ResultData.getFreeTime.bFlag, true);
  socket.emit('guessFree', JSON.stringify({ type: 0 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(
    {
      guessResult: guessResult.guessResult,
      freeCount: guessResult.freeCount,
      freeMul: guessResult.freeMul,
    },
    { guessResult: 1, freeCount: 10, freeMul: 8 },
  );
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    gameCode: '278',
    betId: 'caishen-pending-1',
    type: 0,
  });

  socket.emit('lottery', JSON.stringify({ nBetList: [10] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests[2].url, 'https://example.test/api/games/h5-slots/caishen/collect-free');
  assert.deepEqual(JSON.parse(requests[2].init.body), {
    gameCode: '278',
    betId: 'caishen-pending-1',
  });
  assert.equal(lotteryResults.at(-1).ResultData.freeCount, 10);

  socket.emit('lottery', JSON.stringify({ nBetList: [10] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 3, 'queued Caishen rounds must not place another paid bet');
}

{
  const requests = [];
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const triggerGrid = grid(5, 3);
  const scatterSymbols = [0, 1, 2].map((reel) => ({
    reel,
    row: 0,
    type: 'scatter',
  }));
  const freeRounds = Array.from({ length: 5 }, (_, index) => ({
    index,
    initialGrid: grid(5, 3, index + 1),
    finalGrid: grid(5, 3, index + 1),
    cascades: [],
    lines: [],
    baseMultiplier: 0,
    scatterSymbols: [],
    multiplierSymbols: [],
    multiplierTotal: 0,
    appliedMultiplier: 1,
    totalMultiplier: 0,
    extraFreeSpinsAwarded: 0,
  }));
  const adapter = loadAdapter('281', storedValues, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      const selecting = url.endsWith('/select-free-mode');
      return {
        ok: true,
        status: 200,
        json: async () =>
          selecting
            ? {
                betId: 'queen-pending-1',
                grid: triggerGrid,
                lines: [],
                cascades: [],
                multiplier: 0,
                amount: '10.00',
                baseAmount: '10.00',
                payout: '0.00',
                newBalance: '990.00',
                freeModeContinuation: true,
                features: {
                  scatterSymbols,
                  freeSpinsAwarded: 5,
                  freeSpinMultiplierBank: 0,
                  baseTotalMultiplier: 0,
                  sourceFreeModeType: 3,
                  freeSpinRounds: freeRounds,
                },
              }
            : {
                betId: 'queen-pending-1',
                grid: triggerGrid,
                lines: [],
                cascades: [],
                multiplier: 0,
                amount: '10.00',
                baseAmount: '10.00',
                payout: '0.00',
                newBalance: '990.00',
                requiresFreeModeSelection: true,
                features: {
                  scatterSymbols,
                  freeSpinsAwarded: 20,
                  freeSpinMultiplierBank: 0,
                  baseTotalMultiplier: 0,
                  freeSpinRounds: [],
                },
              },
      };
    },
  });
  const socket = adapter.createFakeSocket();
  const lotteryResults = [];
  let selectionResult = null;
  socket.on('lotteryResult', (payload) => lotteryResults.push(payload));
  socket.on('freeTimeTypeResult', (payload) => {
    selectionResult = payload;
  });

  socket.emit('lottery', JSON.stringify({ nBetList: [10] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 1);
  assert.equal(lotteryResults[0].ResultData.getFreeTime.bFlag, true);
  socket.emit('freeTimeType', JSON.stringify({ type: 3 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, 'https://example.test/api/games/h5-slots/select-free-mode');
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    gameCode: '281',
    betId: 'queen-pending-1',
    type: 3,
  });
  assert.deepEqual({ ...selectionResult.ResultData }, { type: 3, freeCount: 5 });

  socket.emit('lottery', JSON.stringify({ nBetList: [10] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 2, 'queued free spins must not place another paid bet');
  assert.equal(lotteryResults.at(-1).ResultData.freeCount, 5);
}

{
  const requests = [];
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const triggerGrid = [
    [8, 0, 1],
    [2, 8, 3],
    [4, 5, 8],
  ];
  const scatterSymbols = [
    { reel: 0, row: 0, type: 'scatter' },
    { reel: 1, row: 1, type: 'scatter' },
    { reel: 2, row: 2, type: 'scatter' },
  ];
  const freeRounds = Array.from({ length: 7 }, (_, index) => ({
    index,
    initialGrid: grid(3, 3),
    finalGrid: grid(3, 3),
    cascades: [],
    lines: [],
    baseMultiplier: 0,
    scatterSymbols: [],
    multiplierSymbols: [],
    multiplierTotal: 0,
    appliedMultiplier: 4,
    totalMultiplier: 0,
    extraFreeSpinsAwarded: 0,
  }));
  const adapter = loadAdapter('232', storedValues, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      const selecting = url.endsWith('/select-free-mode');
      return {
        ok: true,
        status: 200,
        json: async () =>
          selecting
            ? {
                betId: 'lucky-pending-1',
                grid: triggerGrid,
                lines: [],
                cascades: [],
                multiplier: 0,
                amount: '12.00',
                baseAmount: '12.00',
                payout: '0.00',
                newBalance: '988.00',
                freeModeContinuation: true,
                features: {
                  scatterSymbols,
                  scatterCount: 3,
                  freeSpinsAwarded: 7,
                  freeSpinMultiplierBank: 4,
                  sourceFreeWinMultiplier: 4,
                  baseTotalMultiplier: 0,
                  sourceFreeModeType: 3,
                  freeSpinRounds: freeRounds,
                },
              }
            : {
                betId: 'lucky-pending-1',
                grid: triggerGrid,
                lines: [],
                cascades: [],
                multiplier: 0,
                amount: '12.00',
                baseAmount: '12.00',
                payout: '0.00',
                newBalance: '988.00',
                requiresFreeModeSelection: true,
                features: {
                  scatterSymbols,
                  scatterCount: 3,
                  freeSpinsAwarded: 28,
                  freeSpinMultiplierBank: 0,
                  baseTotalMultiplier: 0,
                  sourceFreeModeType: 0,
                  freeSpinRounds: [],
                },
              },
      };
    },
  });
  const socket = adapter.createFakeSocket();
  const lotteryResults = [];
  let selectionResult = null;
  socket.on('lotteryResult', (payload) => lotteryResults.push(payload));
  socket.on('freeTimeTypeResult', (payload) => {
    selectionResult = payload;
  });

  socket.emit('lottery', JSON.stringify({ nBetList: [12] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(lotteryResults[0].ResultData.viewarray.getFreeTime.bFlag, true);
  assert.equal(lotteryResults[0].ResultData.viewarray.getFreeTime.nFreeType, 0);
  assert.deepEqual(
    Array.from(lotteryResults[0].ResultData.viewarray.nHandCards),
    [9, 3, 5, 1, 9, 6, 2, 4, 9],
  );

  socket.emit('freeTimeType', JSON.stringify({ type: 3 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    gameCode: '232',
    betId: 'lucky-pending-1',
    type: 3,
  });
  assert.deepEqual({ ...selectionResult.ResultData }, { type: 3, freeCount: 7 });

  socket.emit('lottery', JSON.stringify({ nBetList: [12] }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 2, 'Lucky queued free spins must not place another paid bet');
  assert.equal(lotteryResults.at(-1).ResultData.freeCount, 7);
  assert.equal(lotteryResults.at(-1).ResultData.viewarray.getFreeTime.nFreeType, 3);
}

{
  const requests = [];
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const adapter = loadAdapter('302', storedValues, {
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          betId: 'fortune-gems-extra-bet',
          grid: [
            [7, 1, 2],
            [0, 3, 4],
            [0, 5, 6],
          ],
          lines: [{ lineIndex: 0, path: [0, 0, 0], startReel: 0, count: 3, payout: 2 }],
          cascades: [],
          multiplier: 2,
          amount: '15.00',
          baseAmount: '10.00',
          payout: '20.00',
          newBalance: '1005.00',
          sourceFeature: {
            type: 'fortune-gems-multiplier',
            multiplierIndex: 3,
            multiplier: 5,
            enhancedBet: true,
            winEx: true,
          },
        }),
      };
    },
  });
  const socket = adapter.createFakeSocket();
  let lotteryResult = null;
  socket.on('lotteryResult', (payload) => {
    lotteryResult = payload;
  });
  socket.emit('lottery', JSON.stringify({ nBetList: [10], isBuyFree: 1 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    gameCode: '302',
    amount: 10,
    isBuyFree: false,
    isEnhancedBet: true,
  });
  assert.equal(lotteryResult.ResultData.viewarray.exCard, 3);
  assert.equal(lotteryResult.ResultData.viewarray.winEx, true);
  assert.deepEqual(
    Array.from(lotteryResult.ResultData.viewarray.nHandCards).slice(0, 3),
    [8, 1, 1],
    'Fortune Gems must render source prefab 008 as Wild on a visible winning line',
  );
  assert.deepEqual(Array.from(lotteryResult.ResultData.viewarray.nWinCards).slice(0, 3), [
    true,
    true,
    true,
  ]);
}

{
  const requests = [];
  let resolveRequest;
  const storedValues = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
      version: 0,
    }),
  };
  const adapter = loadAdapter('113', storedValues, {
    fetch: (url, init) => {
      requests.push({ url, init });
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    },
  });
  const socket = adapter.createFakeSocket();
  socket.emit('lottery', JSON.stringify({ nBetList: [10] }));
  socket.emit('lottery', JSON.stringify({ nBetList: [10] }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(requests.length, 1, 'a legacy double click must create one settlement only');

  resolveRequest({
    ok: true,
    status: 200,
    json: async () => ({
      betId: 'single-flight-test',
      grid: grid(5, 3),
      lines: [],
      cascades: [],
      multiplier: 0,
      amount: '10.00',
      baseAmount: '10.00',
      payout: '0.00',
      newBalance: '990.00',
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
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
  const slotLayouts = {
    113: [5, 3, 'classic'],
    116: [5, 3, 'classic'],
    135: [5, 3, 'classic'],
    155: [5, 4, 'classic'],
    160: [5, 3, 'classic'],
    161: [3, 3, 'classic'],
    188: [3, 3, 'classic'],
    232: [3, 3, 'classic'],
    244: [5, 3, 'classic'],
    252: [5, 3, 'classic'],
    262: [3, 3, 'classic'],
    264: [3, 4, 'classic'],
    269: [5, 4, 'mahjong'],
    271: [5, 5, 'mahjong'],
    273: [5, 5, 'tumble'],
    276: [5, 3, 'step'],
    278: [6, 5, 'ways'],
    281: [5, 3, 'step'],
    301: [6, 5, 'ways'],
    302: [3, 3, 'classic'],
    321: [6, 5, 'tumble'],
  };

  for (const [code, [reels, rows, family]] of Object.entries(slotLayouts)) {
    const adapter = loadAdapter(code);
    assert.equal(adapter.shape.reels, reels, `${code} reel contract`);
    assert.equal(adapter.shape.rows, rows, `${code} row contract`);
    assert.equal(adapter.shape.family, family, `${code} response family`);
    const responses = adapter.buildLotteryResponses({
      grid: grid(reels, rows),
      lines: [],
      cascades: [],
      multiplier: 0,
      amount: '10.00',
      baseAmount: '10.00',
      payout: '0.00',
      newBalance: '100.00',
    });
    assert.ok(responses.length > 0, `${code} must produce a legacy response`);
    for (const queued of responses) {
      assert.equal(queued.response.ResultCode, 1, `${code} result code`);
      const data = queued.response.ResultData;
      assert.equal(Number.isFinite(data.userscore), true, `${code} balance`);
      if (family === 'classic') {
        assert.equal(data.viewarray.nHandCards.length, reels * rows, `${code} symbol count`);
        assert.equal(data.viewarray.nWinCards.length, reels * rows, `${code} win mask count`);
      } else if (family === 'tumble') {
        assert.equal(data.viewarray.nHandCards.length, reels * rows, `${code} tumble symbol count`);
        assert.ok(data.viewarray.nst === 1 || data.viewarray.nst === 2, `${code} tumble state`);
      } else {
        assert.ok(Array.isArray(data.viewarray), `${code} step sequence`);
        assert.equal(
          data.viewarray.at(-1).nHandCards.length,
          reels * rows,
          `${code} final step symbol count`,
        );
      }
    }
  }
}

{
  const requests = [];
  const adapter = loadAdapter(
    '321',
    {
      'bg-auth': JSON.stringify({
        state: { accessToken: 'test-access', refreshToken: 'test-refresh' },
        version: 0,
      }),
    },
    {
      fetch: async (url, init) => {
        requests.push({ url, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({ betId: 'deferred-gates-1', newBalance: '725.00' }),
        };
      },
    },
  );
  const freeRounds = Array.from({ length: 2 }, (_, index) => ({
    index,
    initialGrid: grid(6, 5, index),
    finalGrid: grid(6, 5, index + 1),
    cascades: [],
    lines: [],
    baseMultiplier: 5,
    scatterSymbols: [],
    multiplierSymbols: [],
    multiplierTotal: 0,
    appliedMultiplier: 1,
    totalMultiplier: 5,
    extraFreeSpinsAwarded: 0,
  }));
  const responses = adapter.buildLotteryResponses({
    betId: 'deferred-gates-1',
    grid: grid(6, 5),
    lines: [],
    cascades: [],
    multiplier: 0,
    amount: '750.00',
    baseAmount: '10.00',
    payout: '100.00',
    newBalance: '625.00',
    payoutDeferred: true,
    features: {
      scatterSymbols: [],
      freeSpinsAwarded: 2,
      freeSpinsPlayed: 2,
      baseTotalMultiplier: 0,
      freeSpinRounds: freeRounds,
      freeSpinMultiplierBank: 1,
      freeSpinWinMultiplier: 10,
      totalMultiplier: 10,
    },
  });

  assert.equal(
    responses.every((queued) => queued.response.ResultData.userscore === 625),
    true,
    'a deferred feature must keep the post-purchase wallet balance through every free round',
  );
  assert.equal(adapter.getPendingDeferredFeatureBetId(), 'deferred-gates-1');
  await adapter.completeDeferredFeature();
  assert.equal(requests[0].url, 'https://example.test/api/games/h5-slots/complete-feature');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    gameCode: '321',
    betId: 'deferred-gates-1',
  });
  assert.equal(adapter.getPendingDeferredFeatureBetId(), null);
}

{
  const adapter = loadAdapter('273');
  assert.equal(adapter.shape.collection, true, 'Dragon Hatch must use its collection protocol');
  const sourceGrid = grid(5, 5, 0);
  const transformedGrid = grid(5, 5, 1);
  const actionTypes = [
    ['dragon-earth', 3, 10],
    ['dragon-water', 2, 30],
    ['dragon-fire', 1, 50],
    ['dragon-queen', 0, 70],
  ];
  const responses = adapter.buildLotteryResponses({
    grid: grid(5, 5, 4),
    finalGrid: grid(5, 5, 5),
    lines: [],
    cascades: actionTypes.map(([type, _sourceType, collected], index) => ({
      index,
      sourceGrid,
      grid: transformedGrid,
      lines: [],
      multiplier: 0,
      removed: [],
      collectedSymbols: collected,
      collectedThisStep: 0,
      sourceAction: {
        type,
        positions: [
          { reel: 0, row: 0 },
          { reel: 4, row: 4 },
        ],
      },
    })),
    multiplier: 0,
    baseAmount: '10.00',
    payout: '0.00',
    newBalance: '100.00',
  });
  assert.equal(responses.length, 5);
  assert.deepEqual(
    Array.from(responses.slice(0, 4), (queued) => queued.response.ResultData.viewarray.df[0].dt),
    [3, 2, 1, 0],
  );
  assert.deepEqual(
    Array.from(responses.slice(0, 4), (queued) => queued.response.ResultData.viewarray.cb),
    [10, 30, 50, 70],
  );
  assert.deepEqual(Array.from(responses[0].response.ResultData.viewarray.df[0].p), [0, 24]);
  assert.deepEqual(
    Array.from(responses[0].response.ResultData.viewarray.orl),
    Array.from(adapter.flattenSymbols(sourceGrid, adapter.shape)),
  );
  const earthResult = Array.from(adapter.flattenSymbols(transformedGrid, adapter.shape));
  earthResult[0] = 0;
  earthResult[24] = 0;
  assert.deepEqual(Array.from(responses[0].response.ResultData.viewarray.rl), earthResult);
  assert.deepEqual(
    Array.from(responses[1].response.ResultData.viewarray.rl),
    Array.from(adapter.flattenSymbols(transformedGrid, adapter.shape)),
  );
  assert.equal(responses.at(-1).response.ResultData.viewarray.cb, 70);
  assert.deepEqual(Array.from(responses.at(-1).response.ResultData.viewarray.df), []);
}

{
  const adapter = loadAdapter('278');
  assert.deepEqual(
    Array.from(adapter.reconcilePayoutParts(0.01, [0.01, 0.01, 0])),
    [0.01, 0, 0],
    'rounding must never make animated free-spin payouts exceed settlement',
  );
  assert.deepEqual(
    Array.from(adapter.reconcilePayoutParts(0.03, [0.01, 0])),
    [0.01, 0.02],
    'the animation sequence must allocate the complete authoritative payout',
  );
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
  const adapter = loadAdapter('262');
  assert.equal(adapter.shape.standardSymbols, 9);
  assert.equal(adapter.shape.star97, true);
  const [queued] = adapter.buildLotteryResponses({
    grid: [
      [8, 8, 8],
      [1, 2, 4],
      [4, 1, 2],
    ],
    lines: [
      {
        lineId: 'line-4',
        lineIndex: 3,
        positions: [
          { reel: 0, row: 0 },
          { reel: 0, row: 1 },
          { reel: 0, row: 2 },
        ],
        path: [0, 1, 2],
        startReel: 0,
        direction: 'ltr',
        row: 0,
        symbol: 8,
        count: 3,
        payout: 50,
      },
    ],
    cascades: [],
    sourceFeature: {
      type: 'star-97-seven-multiplier',
      sevenCount: 3,
      multiplier: 5,
    },
    multiplier: 50,
    amount: '10.00',
    baseAmount: '10.00',
    payout: '500.00',
    newBalance: '600.00',
  });
  const view = queued.response.ResultData.viewarray;
  assert.equal(Math.max(...Array.from(view.nHandCards)), 9, 'Star 97 must expose red seven');
  assert.equal(view.fMultiple, 5, 'Star 97 must animate the authoritative seven multiplier');
  assert.deepEqual(Array.from(view.nWinLines), [3]);
  assert.deepEqual(Array.from(view.nWinLinesDetail[0]), [0, 3, 6]);
  assert.equal(view.nWinCards[0], true);
  assert.equal(view.nWinCards[3], true);
  assert.equal(view.nWinCards[6], true);

  const freeSequence = adapter.buildLotteryResponses({
    grid: [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 4],
    ],
    lines: [],
    cascades: [],
    features: {
      baseTotalMultiplier: 0,
      freeSpinsAwarded: 1,
      freeSpinRounds: [
        {
          initialGrid: [
            [8, 1, 2],
            [8, 2, 3],
            [8, 3, 4],
          ],
          finalGrid: [
            [8, 1, 2],
            [8, 2, 3],
            [8, 3, 4],
          ],
          lines: [],
          cascades: [],
          totalMultiplier: 50,
          appliedMultiplier: 1,
          extraFreeSpinsAwarded: 0,
          sourceFeature: {
            type: 'star-97-seven-multiplier',
            sevenCount: 3,
            multiplier: 5,
          },
        },
      ],
    },
    multiplier: 50,
    amount: '10.00',
    baseAmount: '10.00',
    payout: '500.00',
    newBalance: '600.00',
  });
  assert.equal(freeSequence.length, 2);
  assert.equal(freeSequence[1].startsFreeSpin, true);
  assert.equal(freeSequence[1].endsStar97FreeSpin, true);
  assert.equal(freeSequence[1].response.ResultData.viewarray.fMultiple, 5);
}

{
  const adapter = loadAdapter('113');
  const lineSix = {
    ...classicLine(0),
    lineId: 'line-6',
    lineIndex: 5,
    path: [1, 0, 0, 0, 1],
    count: 5,
  };
  const wins = adapter.winFields(
    [{ positions: [{ reel: 99, row: 99 }], payout: 99, lineIndex: 8 }, lineSix],
    adapter.shape,
    10,
  );

  assert.deepEqual(Array.from(wins.nWinLines), [5]);
  assert.deepEqual(Array.from(wins.nWinLinesDetail[0]), [5, 1, 2, 3, 9]);
  assert.deepEqual(Array.from(wins.nWinDetail), [20]);
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
  assert.equal(steps[0].user_score, 120);
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
              sourceAppliedMultiplier: 2,
            },
          ],
          lines: [line],
          totalMultiplier: 2,
          appliedMultiplier: 1,
          sourceMultiplierBank: 3,
          multiplierSymbols: [],
          scatterSymbols: [],
        },
      ],
    },
  });
  const freeResponses = responses.slice(1);
  assert.equal(responses[0].response.ResultData.viewarray.fs.tgm, 1);
  assert.ok(freeResponses.length >= 2);
  assert.equal(freeResponses[0].startsFreeSpin, true);
  assert.equal(
    freeResponses.every((queued) => queued.response.ResultData.viewarray.fs?.s === 1),
    true,
  );
  const multiplierStep = freeResponses.find(
    (queued) => queued.response.ResultData.viewarray.gm === 2,
  );
  assert.ok(multiplierStep);
  assert.equal(
    JSON.stringify(multiplierStep.response.ResultData.viewarray.df),
    JSON.stringify([{ idh: true, p: [0, 1, 5, 6, 10, 11, 15, 16], dt: 0, multiplier: 2 }]),
  );
  assert.equal(multiplierStep.response.ResultData.viewarray.fs.tgm, 3);
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
  assert.equal(
    responses.reduce((sum, queued) => sum + Number(queued.response.ResultData.winscore || 0), 0),
    20,
  );
  assert.equal(responses.at(-1).response.ResultData.userscore, 520);
}

{
  const defaults = loadAdapter('244').readPlatformAudioPrefs();
  assert.deepEqual(
    { ...defaults },
    {
      musicMuted: false,
      musicVolume: 0.32,
      effectsMuted: false,
      effectsVolume: 0.6,
    },
  );
}

{
  const adapter = loadAdapter('244', {
    'bg.bgm.prefs': JSON.stringify({ muted: false, volume: 0.4 }),
    'bg.sfx.prefs': JSON.stringify({ muted: false, volume: 0.5 }),
  });
  const applied = { music: -1, effects: -1 };
  const engine = {
    getMusicVolume: () => 1,
    getEffectsVolume: () => 0.8,
    setMusicVolume: (volume) => {
      applied.music = volume;
    },
    setEffectsVolume: (volume) => {
      applied.effects = volume;
    },
  };
  const bridge = adapter.installCocosAudioControls(engine);
  assert.equal(applied.music, 0.4);
  assert.equal(applied.effects, 0.4);

  engine.setMusicVolume(0.75);
  engine.setEffectsVolume(0.5);
  assert.ok(Math.abs(applied.music - 0.3) < 1e-9);
  assert.equal(applied.effects, 0.25);

  bridge.updatePrefs({
    musicMuted: true,
    musicVolume: 0.4,
    effectsMuted: true,
    effectsVolume: 0.5,
  });
  assert.equal(applied.music, 0);
  assert.equal(applied.effects, 0);

  engine.setMusicVolume(0.8);
  engine.setEffectsVolume(0.6);
  bridge.updatePrefs({
    musicMuted: false,
    musicVolume: 0.4,
    effectsMuted: false,
    effectsVolume: 0.5,
  });
  assert.ok(Math.abs(applied.music - 0.32) < 1e-9);
  assert.equal(applied.effects, 0.3);
}

{
  const adapter = loadAdapter('2');
  const calls = [];
  let nextId = 1;
  const engine = {
    _id2audio: {},
    getMusicVolume: () => 1,
    getEffectsVolume: () => 1,
    setMusicVolume: (volume) => calls.push({ method: 'music-volume', volume }),
    setEffectsVolume(volume) {
      calls.push({ method: 'effects-volume', volume });
      Object.keys(this._id2audio).forEach((id) => this.setVolume(id, volume));
    },
    setVolume: (id, volume) => calls.push({ method: 'direct-volume', id, volume }),
    play(clip, loop, volume = 1) {
      const id = nextId++;
      this._id2audio[id] = { clip };
      calls.push({ method: 'play', id, loop, volume });
      return id;
    },
    playMusic(clip, loop) {
      return this.play(clip, loop, 0.32);
    },
    playEffect(clip) {
      return this.play(clip, false, 0.6);
    },
  };
  const bridge = adapter.installCocosAudioControls(engine);
  const directMusicId = engine.play({ name: 'fish-bgm' }, true);
  const directEffectId = engine.play({ name: 'fish-shot' }, false);
  assert.equal(
    calls.find((call) => call.id === directMusicId && call.method === 'play').volume,
    0.32,
  );
  assert.equal(
    calls.find((call) => call.id === directEffectId && call.method === 'play').volume,
    0.6,
  );

  const categorizedId = engine.playMusic({ name: 'slot-bgm' }, true);
  assert.equal(
    calls.find((call) => call.id === categorizedId && call.method === 'play').volume,
    0.32,
    'playMusic must not apply the music master twice',
  );

  bridge.updatePrefs({
    musicMuted: true,
    musicVolume: 0.32,
    effectsMuted: true,
    effectsVolume: 0.6,
  });
  assert.equal(
    calls.some(
      (call) =>
        call.method === 'direct-volume' && call.id === String(directMusicId) && call.volume === 0,
    ),
    true,
  );
  assert.equal(
    calls.some(
      (call) =>
        call.method === 'direct-volume' && call.id === String(directEffectId) && call.volume === 0,
    ),
    true,
  );
  bridge.updatePrefs({
    musicMuted: false,
    musicVolume: 0.32,
    effectsMuted: false,
    effectsVolume: 0.6,
  });
  const latestDirectVolume = (id) =>
    calls.filter((call) => call.method === 'direct-volume' && call.id === String(id)).at(-1)
      ?.volume;
  assert.equal(latestDirectVolume(directMusicId), 0.32);
  assert.equal(latestDirectVolume(directEffectId), 0.6);
}

{
  const allFiles = walkFiles(collectionPath);
  const audioFiles = allFiles.filter((path) => /\.(?:mp3|ogg|wav|m4a)$/i.test(path));
  assert.equal(audioFiles.length, 471, 'every original Cocos audio clip must have its native file');
  assert.equal(
    audioFiles.every((path) => fs.statSync(path).size > 0),
    true,
    'original audio files must not be empty',
  );

  const recoveredOriginalM4a = [
    'assets/main/native/06/0697476b-4cdd-4223-a71e-0e6fe217177c.0f7c0.m4a',
    'assets/main/native/1c/1cfbcb83-3f61-4b30-94c7-8e86b80a680b.403cf.m4a',
    'assets/main/native/2d/2df21111-ceda-4b64-8333-b2470f4feb38.878cf.m4a',
    'assets/main/native/2e/2ecb3500-2086-45b7-bb46-e3a9d62e437e.878cf.m4a',
    'assets/main/native/34/34ed5789-0c1a-46ca-9c46-9fb7ab948821.0f7c0.m4a',
    'assets/main/native/47/473c7e1a-b332-497b-9d99-d369e968f4c9.cbfc1.m4a',
    'assets/main/native/48/48298216-2290-441d-886d-4b9ff782dc21.b9460.m4a',
    'assets/main/native/54/548af192-4c4e-4ad8-a64d-029504c7e344.403cf.m4a',
    'assets/main/native/6a/6aab8b26-8d29-4156-b570-7c7691a96067.b9460.m4a',
    'assets/main/native/75/75f54700-11e2-4d18-aefb-e8a674a06814.7ee58.m4a',
    'assets/main/native/9f/9f2cf1f4-c571-440b-abdb-912bf11dc850.21aae.m4a',
    'assets/main/native/a5/a5316fde-f5fc-4875-aac1-d1f436f45dea.7ee58.m4a',
    'assets/main/native/e7/e729e78f-69b3-4c38-9798-86829a7be730.62225.m4a',
  ];
  assert.equal(
    recoveredOriginalM4a.every((path) => fs.existsSync(`${collectionPath}/${path}`)),
    true,
    'the seven original voice clips and main BGM must be available under every referenced UUID',
  );
  assert.deepEqual(
    recoveredOriginalM4a.map((path) => fs.statSync(`${collectionPath}/${path}`).size),
    [11477, 9715, 9028, 9028, 11477, 23884, 7378, 9715, 7378, 10000, 6235, 10000, 221268],
    'recovered M4A files must be the original audio, not placeholder aliases',
  );

  const audioClipReferences = allFiles
    .filter((path) => path.includes('/assets/main/import/') && path.endsWith('.json'))
    .reduce((count, path) => {
      const source = fs.readFileSync(path, 'utf8');
      return count + (source.match(/"\.(?:mp3|ogg|wav)"/g)?.length ?? 0);
    }, 0);
  assert.equal(audioClipReferences, 458, 'every original audio file must have a Cocos AudioClip');

  const allAudioClipReferences = allFiles
    .filter((path) => path.includes('/assets/main/import/') && path.endsWith('.json'))
    .reduce((count, path) => {
      const source = fs.readFileSync(path, 'utf8');
      return count + (source.match(/"\.(?:mp3|ogg|wav|m4a)"/g)?.length ?? 0);
    }, 0);
  assert.equal(
    allAudioClipReferences,
    471,
    'the recovered bundle audio contract must stay stable, including original M4A entries',
  );
}

console.log('H5 adapter response, animation, and original audio contract tests passed.');
