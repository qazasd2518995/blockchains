import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { thor2Spin } from '@bg/provably-fair';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const publicRoot = path.join(webRoot, 'public');
const gameRoot = path.join(publicRoot, 'games/power-of-thor-2');
const originalRoot = path.join(gameRoot, 'original');
const files = walk(originalRoot);

assert.equal(files.length, 548, 'Thor 2 read-only source archive must retain all 548 files');
assert.equal(
  files.filter((file) => file.endsWith('.mp3')).length,
  94,
  'Thor 2 source archive must retain all 94 audio cues',
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(gameRoot, 'documentation/asset-manifest.json'), 'utf8'),
);
assert.equal(manifest.files.length, 548, 'Thor 2 asset manifest must cover every archived file');
assert.equal(manifest.summary.fileCount, files.length, 'Thor 2 manifest summary is stale');
const manifestByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
for (const file of files) {
  const relativePath = path.relative(originalRoot, file).split(path.sep).join('/');
  const entry = manifestByPath.get(`static-mirror/${relativePath}`);
  assert.ok(entry, `Thor 2 manifest is missing ${relativePath}`);
  const contents = fs.readFileSync(file);
  assert.equal(entry.bytes, contents.byteLength, `Thor 2 byte count changed: ${relativePath}`);
  assert.equal(
    entry.sha256,
    createHash('sha256').update(contents).digest('hex'),
    `Thor 2 checksum changed: ${relativePath}`,
  );
}
assert.equal(
  manifest.capture.wageredSpins,
  2,
  'capture metadata must include both one-credit spins',
);
assert.equal(manifest.capture.totalBet, 2, 'capture metadata must retain the bounded spend');

const spineWasmPath = path.join(
  originalRoot,
  'gameresource3.rsgaming955.com/WebUI3/content/PowerOfThor2/cocos-js/assets/spine-CC34fKUR.wasm',
);
const spineWasm = fs.readFileSync(spineWasmPath);
assert.equal(spineWasm.byteLength, 205175, 'Thor 2 original Spine runtime has the wrong size');
await WebAssembly.compile(spineWasm);

for (const relativePath of [
  'original-runtime/index.html',
  'original-runtime/thor2-runtime-compat.js',
  'original-runtime/thor2-original-adapter.js',
  'original-runtime/record/PowerOfThor2/version.json',
  'documentation/rules-zh-TW.json',
  'documentation/rules-en-US.json',
  'documentation/cocos-asset-catalog.json',
]) {
  assert.ok(fs.statSync(path.join(gameRoot, relativePath)).size > 0, `${relativePath} is missing`);
}

const pageSource = fs.readFileSync(
  path.join(webRoot, 'src/pages/games/PowerOfThor2Page.tsx'),
  'utf8',
);
assert.ok(
  pageSource.includes('/games/power-of-thor-2/original-runtime/index.html'),
  'The route must mount the archived original Cocos runtime',
);
for (const forbidden of [
  'Thor2Cascade',
  'SymbolCell',
  'base-reference.png',
  'PowerOfThor2Page.css',
]) {
  assert.ok(
    !pageSource.includes(forbidden),
    `React reconstruction leaked into the route: ${forbidden}`,
  );
}

const viteSource = fs.readFileSync(path.join(webRoot, 'vite.config.ts'), 'utf8');
assert.ok(
  viteSource.includes("process.env.VITE_DEV_API_TARGET ?? 'http://localhost:3000'"),
  'The local original-client bridge must default to the project API server',
);

const runtimeHtml = fs.readFileSync(path.join(gameRoot, 'original-runtime/index.html'), 'utf8');
for (const originalBootAsset of [
  'thor2-runtime-compat.js?v=20260826-mobile-1',
  'thor2-original-adapter.js?v=20260827-jackpot-cycle-cap-1',
  'common/js/jsStart-cocos.js',
  'content/PowerOfThor2/src/polyfills.bundle.js',
  'content/PowerOfThor2/src/system.bundle.js',
  'content/PowerOfThor2/src/import-map.json',
  "System.import(CONTENT + '/index.js')",
]) {
  assert.ok(
    runtimeHtml.includes(originalBootAsset),
    `Original Cocos boot asset missing: ${originalBootAsset}`,
  );
}
assert.ok(
  runtimeHtml.includes('display: none !important'),
  'The unrelated provider splash must stay hidden while the native Thor canvas boots',
);
assert.ok(
  !runtimeHtml.includes('logo_RSG.webp'),
  'The unrelated RSG splash logo leaked into Thor II',
);

const compatSource = fs.readFileSync(
  path.join(gameRoot, 'original-runtime/thor2-runtime-compat.js'),
  'utf8',
);
const compatWindow = {
  navigator: {
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/149.0.0.0 Mobile Safari/537.36 OPR/100.0.0.0',
  },
  isIPad: false,
};
vm.runInNewContext(compatSource, { window: compatWindow, Number, Math, Boolean, String });
const runtimeCompat = compatWindow.__QmoneyThor2RuntimeCompatTest;
assert.ok(runtimeCompat, 'The Thor 2 mobile runtime compatibility layer is unavailable');
assert.equal(
  runtimeCompat.detectIOSVersion(compatWindow.navigator.userAgent, false),
  Number.POSITIVE_INFINITY,
  'Android must not enter an archived iOS fullscreen workaround',
);
assert.equal(
  compatWindow.getIOSVersion(),
  Number.POSITIVE_INFINITY,
  'The archived runtime global must be available before Cocos bootstraps',
);
assert.equal(
  runtimeCompat.detectIOSVersion(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    false,
  ),
  15.5,
  'iPhone fullscreen workarounds require the real iOS version',
);
assert.equal(
  runtimeCompat.detectIOSVersion(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17.4 Mobile/15E148 Safari/604.1',
    true,
  ),
  17.4,
  'Desktop-mode iPad must retain its Safari version fallback',
);

const adapterSource = fs.readFileSync(
  path.join(gameRoot, 'original-runtime/thor2-original-adapter.js'),
  'utf8',
);
for (const contract of [
  "authorizedFetch('/session'",
  "authorizedFetch('/spin'",
  "authorizedFetch('/feature/progress'",
  "authorizedFetch('/feature/complete'",
  'PlayerReqestLogin',
  'PlayerRequestBuyFeature',
  "return Number(request.ExtraBetFeatureID) === 0 ? 'extra' : 'spin'",
  'ServerResponseGameStart',
  'AutoCompleteStatesResponse',
  'RecoverableDataResponse',
  "system.get('chunks:///_virtual/lz-string.min.js')",
  'entry.freeRound === 0 || entry.freeRound <= cursor',
  'CryptoJS.DES.encrypt',
  'CryptoJS.DES.decrypt',
  "Type: 'WalletUpdate'",
  'var incomingDrop = cascadeIndex > 0 ? deriveDrop(cascades[cascadeIndex - 1]) : null',
  'var finalDrop = deriveDrop(lastCascade, finalOriginGrid)',
  'var settlementDelta = Math.max(0, settledRoundWin - roundWinOrigin) + finalBonus',
  'appendLegacyMultiplierRound(queue, round, options)',
  'assertDropAlignment(rng, multiple, dropScreen, dropMultiple)',
  'Win: Number(data.spinWin || 0) * 20',
  'baseGrid = ensureFreeTriggerGrid(',
  'bonusCount < 4',
  'JackpotDisplayEnabled: true',
  "PoolName: ['GRAND', 'MAJOR', 'MINOR', 'MINI']",
  "Type: 'ServerRequestJackpotInfo'",
  'jackpotTickerId = window.setInterval',
  'syncJackpotSnapshot(socket, result.jackpotPools)',
  'isUseJackpot: true',
  "Type: 'AddFreeGame'",
  'AddFreeSpinTime: Math.max(0, Number(spins) || 0)',
  'enterFreeSpins: entersFree ? feature.spinsAwarded : 0',
  'normalizeMultiplierMatrix(rng, data.multiple)',
  'return entry.freeRound > activeSequence.progressCursor',
  'BetList: [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]',
]) {
  assert.ok(
    adapterSource.includes(contract),
    `Original-client adapter contract is missing: ${contract}`,
  );
}
for (const forbidden of [
  'base-reference.png',
  '/ui/',
  'ReactDOM',
  'fallbackGrid',
  'FreeSpinTimesSelect: -1',
]) {
  assert.ok(
    !adapterSource.includes(forbidden),
    `Reconstructed fallback leaked into adapter: ${forbidden}`,
  );
}

const storage = new Map();
const fakeStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
const browserWindow = {
  location: { search: '', origin: 'https://qmoney.test' },
  localStorage: fakeStorage,
  sessionStorage: fakeStorage,
  addEventListener() {},
  postMessage() {},
  setTimeout,
  clearTimeout,
  WebSocket: function NativeWebSocket() {},
};
browserWindow.parent = browserWindow;
vm.runInNewContext(adapterSource, {
  window: browserWindow,
  URLSearchParams,
  console,
  fetch: () => Promise.reject(new Error('network is disabled in the adapter contract test')),
  AbortController,
  CryptoJS: {},
  setTimeout,
  clearTimeout,
});
const adapter = browserWindow.__QmoneyThor2OriginalAdapterTest;
assert.ok(adapter, 'The original-client adapter test surface is unavailable');
assert.equal(
  adapter.requestAction({ Type: 'PlayerRequestGameStart', ExtraBet: false, ExtraBetFeatureID: 0 }),
  'extra',
  'The original +25% toggle is identified by ExtraBetFeatureID, not the always-false ExtraBet flag',
);
assert.equal(
  adapter.requestAction({ Type: 'PlayerRequestGameStart', ExtraBet: false, ExtraBetFeatureID: -1 }),
  'spin',
);
assert.equal(adapter.requestAmount({ Bet: 200, BetLevel: 10, Denom: 0.05 }), 10);
assert.deepEqual(
  Array.from(
    adapter.normalizedJackpotAmounts({
      grand: 200000,
      major: 70000,
      minor: 13000,
      mini: 1600,
    }),
  ),
  [200000, 70000, 13000, 1600],
  'Thor II must forward all four authoritative jackpot pools in provider order',
);

const sixBonusGrid = Array.from({ length: 30 }, (_, index) => ({
  symbol: index < 6 ? 1 : 13,
}));
assert.equal(
  adapter.ensureFreeTriggerGrid(sixBonusGrid, true).filter((cell) => cell.symbol === 1).length,
  4,
  'A purchased feature entry must show exactly four BONUS symbols',
);
assert.equal(
  adapter.ensureFreeTriggerGrid(sixBonusGrid, false).filter((cell) => cell.symbol === 1).length,
  6,
  'A natural 5/6-BONUS trigger must preserve its real pay tier',
);

const makeGrid = () =>
  Array.from({ length: 30 }, (_, index) => ({ symbol: [3, 4, 5, 6, 9, 10][index % 6] }));
const firstBefore = makeGrid();
const firstAfter = makeGrid();
firstAfter[0] = { symbol: 15, multiplier: 2 };
const secondAfter = makeGrid();
secondAfter[0] = { symbol: 15, multiplier: 3 };
secondAfter[5] = { symbol: 15, multiplier: 4 };
const sequence = adapter.buildSequence({
  grid: secondAfter,
  cascades: [
    {
      before: firstBefore,
      after: firstAfter,
      wins: [{ symbol: 3, count: 8, positions: [0, 1, 2, 3, 4, 5, 6, 7], payMultiplier: 0.2 }],
      baseWinMultiplier: 0.2,
      collectedMultiplier: 0,
      accumulatedMultiplier: 0,
      payoutMultiplier: 0,
      upgrades: [],
    },
    {
      before: firstAfter,
      after: secondAfter,
      wins: [{ symbol: 4, count: 8, positions: [5, 6, 7, 8, 9, 10, 11, 12], payMultiplier: 0.5 }],
      baseWinMultiplier: 0.5,
      collectedMultiplier: 7,
      accumulatedMultiplier: 7,
      payoutMultiplier: 4.9,
      upgrades: [{ position: 0, from: 2, to: 3, level: 1 }],
    },
  ],
  totalMultiplier: 4.9,
  maxWinReached: false,
});
assert.equal(
  sequence.queue.length,
  3,
  'Two wins require two score packets and one drop-final packet',
);
const packets = sequence.queue.map((entry) => JSON.parse(JSON.stringify(entry.payload)));
assert.deepEqual(
  packets[0].ExtraData.Extra.DropScreen,
  [[], [], [], [], [], []],
  'The initial winning screen cannot claim that its own replacement symbols already dropped',
);
assert.equal(
  packets[1].ExtraData.RNG[0][0],
  15,
  'The second packet must present the refilled screen',
);
assert.equal(packets[1].ExtraData.Extra.DropMultiple[0][0], 2, 'The dropped 2x ball was lost');
assert.equal(
  packets[1].ExtraData.Extra.TriggerUpgrade,
  false,
  'Multiplier upgrade cannot run before the tumble chain has ended',
);
assert.equal(
  packets[1].ExtraData.Extra.Features[0].AddMultiple,
  0,
  'Multiplier balls cannot be collected during an intermediate tumble',
);
assert.equal(
  packets[2].ExtraData.WinLines.length,
  0,
  'The terminal drop packet must not replay a win',
);
assert.equal(packets[2].ExtraData.Extra.MultipleOrigin[0][0], 2, 'Upgrade origin must stay at 2x');
assert.equal(packets[2].ExtraData.Extra.Multiple[0][0], 3, 'Upgrade result must advance to 3x');
assert.equal(packets[2].ExtraData.Extra.DropMultiple[1][0], 4, 'The last refill ball was lost');
assert.equal(
  packets[2].ExtraData.Extra.Features[0].AddMultiple,
  7,
  'The terminal collect must include every final-screen multiplier ball',
);
assert.equal(packets[2].ExtraData.Extra.Features[0].Multiple, 7);
assert.equal(packets[2].ExtraData.Extra.Features[1].TumblingWinOrigin, 14);
assert.equal(packets[2].ExtraData.Extra.Features[1].TumblingWin, 98);
assert.equal(
  packets[2].ExtraData.Extra.TriggerUpgrade,
  true,
  'The original lightning upgrade must run on the terminal collection packet',
);
assert.equal(
  packets[2].ExtraData.Extra.SubFlowEnd,
  1,
  'The terminal drop packet must close cascading',
);
assert.equal(packets[2].ExtraData.FlowEnd, 1, 'The terminal packet must close the base spin flow');

const legacySequence = adapter.buildSequence({
  modelVersion: 'thor2-observed-rules-v2',
  grid: secondAfter,
  cascades: [
    {
      before: firstBefore,
      after: firstAfter,
      wins: [{ symbol: 3, count: 8, positions: [0, 1, 2, 3, 4, 5, 6, 7], payMultiplier: 0.2 }],
      baseWinMultiplier: 0.2,
      collectedMultiplier: 0,
      accumulatedMultiplier: 0,
      payoutMultiplier: 0.2,
      upgrades: [],
    },
    {
      before: firstAfter,
      after: secondAfter,
      wins: [{ symbol: 4, count: 8, positions: [5, 6, 7, 8, 9, 10, 11, 12], payMultiplier: 0.5 }],
      baseWinMultiplier: 0.5,
      collectedMultiplier: 3,
      accumulatedMultiplier: 3,
      payoutMultiplier: 1.5,
      upgrades: [{ position: 0, from: 2, to: 3, level: 1 }],
    },
  ],
  totalMultiplier: 1.7,
  maxWinReached: false,
});
const legacyPackets = legacySequence.queue.map((entry) => entry.payload);
assert.equal(
  legacyPackets.length,
  3,
  'Stored v2 rounds must remain recoverable after the v3 rollout',
);
assert.equal(
  legacyPackets[1].ExtraData.Extra.TriggerUpgrade,
  true,
  'A stored v2 round must preserve its already-settled upgrade timing',
);
assert.equal(legacyPackets[1].ExtraData.Extra.Features[0].AddMultiple, 3);
assert.equal(legacyPackets[2].ExtraData.Extra.DropMultiple[1][0], 4);
assert.equal(legacyPackets[2].ExtraData.Extra.SubFlowEnd, 1);

const legalMultipliers = new Set([2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500, 1000]);
for (const mode of [undefined, 'regular', 'super', 'lucky']) {
  for (let nonce = 0; nonce < 24; nonce += 1) {
    const engine = thor2Spin('adapter-sequence-server', `adapter-${mode ?? 'base'}`, nonce, {
      ...(mode ? { buyFeature: mode } : {}),
    });
    let generated;
    try {
      generated = adapter.buildSequence(engine);
    } catch (error) {
      throw new Error(
        `${mode ?? 'base'} nonce ${nonce} failed original-client sequence validation: ${error.message}`,
        { cause: error },
      );
    }
    assert.ok(generated.queue.length > 0, `${mode ?? 'base'} produced an empty presentation queue`);
    const lastPacket = generated.queue.at(-1).payload;
    assert.equal(
      lastPacket.ExtraData.Extra.SubFlowEnd,
      1,
      `${mode ?? 'base'} did not end cascading`,
    );
    for (const { payload } of generated.queue) {
      const screenMultiple = payload.ExtraData.Extra.Features.find(
        (feature) => feature.Type === 'ScreenMultiple',
      );
      if (payload.ExtraData.Extra.SubFlowEnd === 0) {
        assert.equal(
          screenMultiple?.AddMultiple ?? 0,
          0,
          `${mode ?? 'base'} collected a multiplier before the tumble ended`,
        );
        assert.equal(
          payload.ExtraData.Extra.TriggerUpgrade,
          false,
          `${mode ?? 'base'} played lightning before the tumble ended`,
        );
      }
      if ((screenMultiple?.AddMultiple ?? 0) > 0) {
        assert.equal(
          payload.ExtraData.Extra.SubFlowEnd,
          1,
          `${mode ?? 'base'} must collect final-screen multipliers on the terminal packet`,
        );
        assert.equal(
          payload.ExtraData.WinLines.filter((line) => line.WinType === 0).length,
          0,
          `${mode ?? 'base'} terminal multiplier settlement must not replay symbol wins`,
        );
      }
      const rng = payload.ExtraData.RNG;
      const multipliers = payload.ExtraData.Extra.Multiple;
      const drop = payload.ExtraData.Extra.DropScreen;
      const dropMultipliers = payload.ExtraData.Extra.DropMultiple;
      for (let reel = 0; reel < 6; reel += 1) {
        const rngFeatureCount = rng[reel].filter((symbol) => symbol >= 15 && symbol <= 19).length;
        assert.equal(
          multipliers[reel].length,
          rngFeatureCount,
          `${mode ?? 'base'} RNG multiplier count drifted on reel ${reel}`,
        );
        assert.ok(
          multipliers[reel].every((value) => legalMultipliers.has(value)),
          `${mode ?? 'base'} generated an illegal RNG multiplier`,
        );
        const dropFeatureCount = drop[reel].filter((symbol) => symbol >= 15 && symbol <= 19).length;
        assert.equal(
          dropMultipliers[reel].length,
          dropFeatureCount,
          `${mode ?? 'base'} drop multiplier count drifted on reel ${reel}`,
        );
        assert.ok(
          dropMultipliers[reel].every((value) => legalMultipliers.has(value)),
          `${mode ?? 'base'} generated an illegal drop multiplier`,
        );
      }
    }
  }
}

const recoverableEngine = thor2Spin('adapter-recovery-server', 'adapter-recovery-client', 7, {
  buyFeature: 'regular',
});
adapter.prepareRecovery({
  ...recoverableEngine,
  action: 'regular',
  baseBet: '10.00',
  featureCursor: 2,
});
const recovery = adapter.getRecoveryState();
assert.equal(recovery.activeSequence.progressCursor, 2, 'Recovery cursor was not retained');
assert.ok(
  recovery.activeSequence.queue.every((entry) => entry.freeRound > 2),
  'Recovery replayed an already acknowledged free round',
);
assert.equal(recovery.recoverySnapshot.GameStartType, 'PlayerRequestBuyFeature');
assert.equal(recovery.recoverySnapshot.BetLevel, 10);
assert.ok(recovery.recoverySnapshot.ExtraDatas.length > 0, 'Recovery history is empty');
assert.equal(
  recovery.recoverySnapshot.GameSNs.length,
  recovery.recoverySnapshot.ExtraDatas.length,
  'Recovery serial numbers and responses are not aligned',
);

const cover = fs.readFileSync(
  path.join(publicRoot, 'game-art/original/power-of-thor-2-cover-v1.png'),
);
assert.deepEqual([...cover.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
for (const width of [480, 960, 1600]) {
  const optimized = fs.readFileSync(
    path.join(publicRoot, `_optimized/game-art/original/power-of-thor-2-cover-v1@${width}.webp`),
  );
  assert.equal(optimized.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(optimized.subarray(8, 12).toString('ascii'), 'WEBP');
}

console.log('Thor 2 original Cocos runtime, archive, cover and local adapter contracts passed.');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}
