import { spawn } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const publicRoot = path.join(appRoot, 'public');
const outputRoot = path.join(publicRoot, '_optimized');
const widths = [480, 960, 1600];
const sourceExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const dryRun = args.has('--dry-run');
const concurrency = Number(process.env.IMAGE_OPTIMIZE_CONCURRENCY ?? 3);
const manifest = {
  generatedAt: new Date().toISOString(),
  widths,
  format: 'webp',
  assets: {},
};

const sources = await collectImages(publicRoot);
let converted = 0;
let skipped = 0;

await runQueue(
  sources.flatMap((source) => widths.map((width) => ({ source, width }))),
  async ({ source, width }) => {
    const relative = path.relative(publicRoot, source);
    const parsed = path.parse(relative);
    const output = path.join(outputRoot, parsed.dir, `${parsed.name}@${width}.webp`);
    const publicOutput = `/_optimized/${path
      .join(parsed.dir, `${parsed.name}@${width}.webp`)
      .split(path.sep)
      .join('/')}`;

    manifest.assets[`/${relative.split(path.sep).join('/')}`] ??= {};
    manifest.assets[`/${relative.split(path.sep).join('/')}`][width] = publicOutput;

    if (!force && (await isFresh(source, output))) {
      skipped += 1;
      return;
    }

    if (dryRun) {
      converted += 1;
      return;
    }

    await mkdir(path.dirname(output), { recursive: true });
    await magick([
      source,
      '-auto-orient',
      '-resize',
      `${width}x>`,
      '-strip',
      '-quality',
      qualityFor(relative),
      '-define',
      'webp:method=5',
      output,
    ]);
    converted += 1;
  },
);

if (!dryRun) {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(
  `Image optimization complete: ${sources.length} sources, ${converted} converted, ${skipped} skipped.`,
);

async function collectImages(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_optimized' || entry.name === 'dist' || entry.name.startsWith('.')) {
        continue;
      }
      found.push(...(await collectImages(absolute)));
      continue;
    }

    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (sourceExtensions.has(ext)) found.push(absolute);
  }

  return found;
}

async function isFresh(source, output) {
  try {
    const [sourceStat, outputStat] = await Promise.all([stat(source), stat(output)]);
    return outputStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

function qualityFor(relative) {
  if (/\/(?:background|big-win|hero|card)\./i.test(relative)) return '82';
  if (/\/(?:cover|sprites|symbols)\./i.test(relative)) return '80';
  return '78';
}

function magick(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('magick', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`magick exited with ${code}: ${stderr.trim()}`));
    });
  });
}

async function runQueue(items, worker) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(workers);
}
