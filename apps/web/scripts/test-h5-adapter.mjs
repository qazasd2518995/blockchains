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
const adapterSource = fs.readFileSync(adapterPath, 'utf8');

function loadAdapter(gameCode, storedValues = {}) {
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
  assert.equal(calls.find((call) => call.id === directMusicId && call.method === 'play').volume, 0.32);
  assert.equal(calls.find((call) => call.id === directEffectId && call.method === 'play').volume, 0.6);

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
      (call) => call.method === 'direct-volume' && call.id === String(directMusicId) && call.volume === 0,
    ),
    true,
  );
  assert.equal(
    calls.some(
      (call) => call.method === 'direct-volume' && call.id === String(directEffectId) && call.volume === 0,
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
  assert.equal(
    audioFiles.length,
    471,
    'every original Cocos audio clip must have its native file',
  );
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
    recoveredOriginalM4a.every((path) =>
      fs.existsSync(`${collectionPath}/${path}`),
    ),
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
