#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const GAME_REVISION = '361d567d94ac569664c82068a30b762e8d8438b8';
const FRAMEWORK_REVISION = '40401f29702686de9cfed69b217641b6029834f7';
const GAME_BASE = `https://play.godeebxp.com/egames/${GAME_REVISION}/game`;
const FRAMEWORK_BASE = `https://play.godeebxp.com/slotFramework/${FRAMEWORK_REVISION}`;
const argumentsList = process.argv.slice(2);
const manifestOnly = argumentsList.includes('--manifest-only');
const positionalArguments = argumentsList.filter((value) => value !== '--manifest-only');
const outputRoot = positionalArguments[0] ?? 'apps/web/public/games/storm-of-seth-2-v115';
const publicRoot = positionalArguments[1] ?? 'apps/web/public';
const MAX_CONCURRENCY = 8;

const coreFiles = [
  'app.js',
  'application.js',
  'atg.json',
  'cocos-js/cc.js',
  'game.css',
  'index.js',
  'public/apple-touch-icon.png',
  'public/atg.png',
  'public/bg_blur.jpg',
  'public/favicon-16x16.png',
  'public/favicon-32x32.png',
  'public/favicon.ico',
  'public/safari-pinned-tab.svg',
  'src/assets/scripts/framework/core/net/socketIO/socket.io.js',
  'src/assets/scripts/framework/plugin/Extentions.js',
  'src/assets/scripts/plugin/CryptoJS.js',
  'src/assets/scripts/plugin/MotionPathPlugin.min.js',
  'src/assets/scripts/plugin/forge.min.js',
  'src/assets/scripts/plugin/gsap.min.js',
  'src/assets/scripts/plugin/mobile-detect.min.js',
  'src/assets/scripts/plugin/pako.min.js',
  'src/assets/scripts/plugin/protobuf.min.js',
  'src/chunks/bundle.js',
  'src/import-map.json',
  'src/polyfills.bundle.js',
  'src/settings.json',
  'src/system.bundle.js',
  'style.css',
];

const bundles = [
  {
    name: 'internal',
    source: `${GAME_BASE}/assets/internal`,
    destination: join(outputRoot, 'assets/internal'),
    nativeTypes: new Map(),
  },
  {
    name: 'main',
    source: `${GAME_BASE}/assets/main`,
    destination: join(outputRoot, 'assets/main'),
    nativeTypes: new Map(),
    probeAllNativeExtensions: ['.png', '.jpg', '.pem'],
  },
  {
    name: 'resources',
    source: `${GAME_BASE}/assets/resources`,
    destination: join(outputRoot, 'assets/resources'),
    nativeTypes: new Map([
      [1, ['.pem']],
      [3, ['.png', '.jpg']],
      [8, ['.png', '.jpg']],
    ]),
    probeAllNativeExtensions: ['.png', '.jpg', '.pem'],
  },
  {
    name: 'g1005',
    source: `${GAME_BASE}/assets/g1005`,
    destination: join(outputRoot, 'assets/g1005'),
    nativeTypes: new Map([
      [2, ['.plist']],
      [5, ['.fnt']],
      [6, ['.png', '.jpg', '.astc']],
      [9, ['.mp3']],
      [10, ['.atlas']],
    ]),
    probeAllNativeExtensions: ['.png', '.jpg', '.astc'],
  },
  {
    name: 'slotFramework',
    source: FRAMEWORK_BASE,
    destination: join(publicRoot, 'slotFramework', FRAMEWORK_REVISION),
    nativeTypes: new Map([
      [4, ['.png', '.jpg', '.astc']],
      [7, ['.atlas']],
    ]),
    probeAllNativeExtensions: ['.png', '.jpg', '.astc'],
  },
];

const downloaded = new Map();

function decodeUuid(value) {
  const source = value.split('@')[0];
  if (source.length !== 22) return value;
  const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const hex = '0123456789abcdef';
  const positions = [];
  for (let index = 0; index < 36; index += 1) {
    if (![8, 13, 18, 23].includes(index)) positions.push(index);
  }
  const output = Array(36).fill('');
  output[8] = output[13] = output[18] = output[23] = '-';
  output[0] = source[0];
  output[1] = source[1];
  let cursor = 2;
  for (let index = 2; index < 22; index += 2) {
    const first = base64.indexOf(source[index]);
    const second = base64.indexOf(source[index + 1]);
    if (first < 0 || second < 0) return value;
    output[positions[cursor++]] = hex[first >> 2];
    output[positions[cursor++]] = hex[((first & 3) << 2) | (second >> 4)];
    output[positions[cursor++]] = hex[second & 15];
  }
  return value.replace(source, output.join(''));
}

async function fetchBuffer(url, optional = false) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      // The upstream static origin responds with either 404 or 500 for a
      // missing extension candidate, depending on which cache node handled it.
      if (optional && (response.status === 404 || response.status === 500)) return null;
      if (![429, 502, 503, 504].includes(response.status) || attempt === 3) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
      }
    } catch (error) {
      if (attempt === 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw new Error(`Unable to download ${url}`);
}

async function save(url, destination, optional = false) {
  if (downloaded.has(destination)) return downloaded.get(destination);
  const result = (async () => {
    try {
      if ((await stat(destination)).size > 0) return true;
    } catch (_error) {
      // Continue with the source download.
    }
    const data = await fetchBuffer(url, optional);
    if (!data) return false;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
    return true;
  })();
  downloaded.set(destination, result);
  return result;
}

async function runConcurrent(tasks) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(MAX_CONCURRENCY, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const task = tasks[cursor++];
      await task();
    }
  });
  await Promise.all(workers);
}

function importExtensions(config, index) {
  const extensions = [];
  for (const [extension, encodedIndexes] of Object.entries(config.extensionMap ?? {})) {
    if (Array.isArray(encodedIndexes) && encodedIndexes.includes(String(index))) {
      extensions.push(extension);
    }
  }
  return extensions.length > 0 ? [...new Set(extensions)] : ['.json'];
}

async function syncBundle(bundle) {
  const configUrl = `${bundle.source}/config.json`;
  const configPath = join(bundle.destination, 'config.json');
  await Promise.all([
    save(configUrl, configPath),
    save(`${bundle.source}/index.js`, join(bundle.destination, 'index.js')),
  ]);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const packedIndexes = new Set(
    Object.values(config.packs ?? {}).flatMap((indexes) => indexes.map((value) => Number(value))),
  );
  const packIds = new Set(Object.keys(config.packs ?? {}));
  const tasks = [];

  for (const pack of Object.keys(config.packs ?? {})) {
    tasks.push(() =>
      save(
        `${bundle.source}/import/${pack.slice(0, 2)}/${pack}.json`,
        join(bundle.destination, 'import', pack.slice(0, 2), `${pack}.json`),
      ),
    );
  }

  config.uuids.forEach((compressedUuid, index) => {
    if (packedIndexes.has(index) || packIds.has(compressedUuid)) return;
    const uuid = decodeUuid(compressedUuid);
    for (const extension of importExtensions(config, index)) {
      tasks.push(() =>
        save(
          `${bundle.source}/import/${uuid.slice(0, 2)}/${uuid}${extension}`,
          join(bundle.destination, 'import', uuid.slice(0, 2), `${uuid}${extension}`),
          true,
        ),
      );
    }
  });

  const nativeCandidates = new Map();
  for (const [rawIndex, pathInfo] of Object.entries(config.paths ?? {})) {
    const index = Number(rawIndex);
    const type = pathInfo[1];
    const extensions = bundle.nativeTypes.get(type);
    if (!extensions) continue;
    const uuid = decodeUuid(config.uuids[index]);
    nativeCandidates.set(uuid, extensions);
  }
  if (bundle.probeAllNativeExtensions) {
    config.uuids.forEach((compressedUuid) => {
      if (packIds.has(compressedUuid)) return;
      const uuid = decodeUuid(compressedUuid);
      nativeCandidates.set(
        uuid,
        [...new Set([...(nativeCandidates.get(uuid) ?? []), ...bundle.probeAllNativeExtensions])],
      );
    });
  }
  for (const [uuid, extensions] of nativeCandidates) {
    for (const extension of extensions) {
      tasks.push(() =>
        save(
          `${bundle.source}/native/${uuid.slice(0, 2)}/${uuid}${extension}`,
          join(bundle.destination, 'native', uuid.slice(0, 2), `${uuid}${extension}`),
          true,
        ),
      );
    }
  }

  await runConcurrent(tasks);
  return {
    name: bundle.name,
    logicalPathCount: Object.keys(config.paths ?? {}).length,
    uuidCount: config.uuids.length,
    packCount: Object.keys(config.packs ?? {}).length,
  };
}

async function filesUnder(root) {
  const output = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) output.push(path);
    }
  }
  await visit(root);
  return output;
}

async function makeFileManifest(root) {
  const paths = (await filesUnder(root))
    .filter((path) => relative(root, path) !== 'asset-manifest.json')
    .sort();
  return Promise.all(
    paths.map(async (path) => {
      const [data, details] = await Promise.all([readFile(path), stat(path)]);
      return {
        path: relative(root, path),
        bytes: details.size,
        sha256: createHash('sha256').update(data).digest('hex'),
      };
    }),
  );
}

const bundleSummary = [];
if (manifestOnly) {
  for (const bundle of bundles) {
    const config = JSON.parse(await readFile(join(bundle.destination, 'config.json'), 'utf8'));
    bundleSummary.push({
      name: bundle.name,
      logicalPathCount: Object.keys(config.paths ?? {}).length,
      uuidCount: config.uuids.length,
      packCount: Object.keys(config.packs ?? {}).length,
    });
  }
} else {
  await runConcurrent(
    coreFiles.map((path) => () => save(`${GAME_BASE}/${path}`, join(outputRoot, path))),
  );

  // The captured development build enables Cocos' FPS/profiling overlay. Keep
  // the original rendering and 60 FPS target, but do not expose diagnostics in
  // the player-facing build.
  const applicationPath = join(outputRoot, 'application.js');
  const applicationSource = await readFile(applicationPath, 'utf8');
  await writeFile(
    applicationPath,
    applicationSource
      .replace('this.showFPS = true;', 'this.showFPS = false;')
      .replace(
        'debugMode: true ? cc.DebugMode.INFO : cc.DebugMode.ERROR',
        'debugMode: cc.DebugMode.ERROR',
      ),
  );

  for (const bundle of bundles) bundleSummary.push(await syncBundle(bundle));
}

await mkdir(join(publicRoot, 'slotFramework'), { recursive: true });
await writeFile(
  join(publicRoot, 'slotFramework', 'manifest.json'),
  `${JSON.stringify({ hash: FRAMEWORK_REVISION }, null, 2)}\n`,
);

const [gameFiles, frameworkFiles] = await Promise.all([
  makeFileManifest(outputRoot),
  makeFileManifest(join(publicRoot, 'slotFramework', FRAMEWORK_REVISION)),
]);
const manifest = {
  capturedAt: new Date().toISOString(),
  source: {
    gameRevision: GAME_REVISION,
    gameVersion: '1.1.5',
    frameworkRevision: FRAMEWORK_REVISION,
    frameworkVersion: '1.1.2_1',
    cocosCreator: '3.7.2',
  },
  bundleSummary,
  gameFiles,
  frameworkFiles,
};
await writeFile(join(outputRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const gameBytes = gameFiles.reduce((total, file) => total + file.bytes, 0);
const frameworkBytes = frameworkFiles.reduce((total, file) => total + file.bytes, 0);
console.log(
  JSON.stringify(
    {
      outputRoot,
      gameFiles: gameFiles.length,
      gameBytes,
      frameworkFiles: frameworkFiles.length,
      frameworkBytes,
      bundleSummary,
    },
    null,
    2,
  ),
);
