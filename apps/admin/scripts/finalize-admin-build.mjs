import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const appRoot = process.cwd();
const distRoot = path.join(appRoot, 'dist');
const realm = process.env.VITE_ADMIN_REALM === 'qmoney' ? 'qmoney' : 'legacy';

if (realm === 'qmoney') {
  await Promise.all([
    removeGenerated('backgrounds'),
    removeGenerated('banners'),
    removeGenerated('brand/yachiyo-emblem.png'),
    removeGenerated('brand/yachiyo-logo.png'),
  ]);

  await assertIndexContains([
    '<title>金寶寶代理後台</title>',
    '<html lang="zh-Hant">',
    '<meta name="description" content="金寶寶專屬代理營運中心，整合帳號管理、點數轉帳、報表統計與營運設定。" />',
    '<meta property="og:title" content="金寶寶代理後台｜營運管理中心" />',
    '<meta property="og:description" content="金寶寶專屬代理營運中心，整合帳號管理、點數轉帳、報表統計與營運設定。" />',
    'https://bg-qmoney-admin-production.up.railway.app/brand/jin-baobao-social.png?v=20260903',
    '/brand/jin-baobao-avatar.webp',
  ]);
  await assertNoForbiddenText([/八千代/u, /錢女友/u, /yachiyo/iu]);
} else {
  await Promise.all([
    removeGenerated('brand/jin-baobao-avatar.webp'),
    removeGenerated('brand/jin-baobao-mascot.webp'),
    removeGenerated('brand/jin-baobao-social.png'),
  ]);
  await assertIndexContains(['<title>八千代代理後台</title>', '/brand/yachiyo-emblem.png']);
}

console.log(`[admin-build] ${realm} realm assets and copy verified.`);

async function removeGenerated(relativePath) {
  const target = path.resolve(distRoot, relativePath);
  if (!target.startsWith(`${distRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside dist: ${target}`);
  }
  await rm(target, { force: true, recursive: true });
}

async function assertIndexContains(needles) {
  const html = await readFile(path.join(distRoot, 'index.html'), 'utf8');
  for (const needle of needles) {
    if (!html.includes(needle)) {
      throw new Error(`Admin ${realm} build is missing required index marker: ${needle}`);
    }
  }
}

async function assertNoForbiddenText(patterns) {
  const files = await listTextFiles(distRoot);
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        throw new Error(
          `Qmoney admin build contains forbidden legacy copy ${pattern} in ${path.relative(distRoot, file)}`,
        );
      }
    }
  }
}

async function listTextFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listTextFiles(absolute)));
      continue;
    }
    if (/\.(?:css|html|js|json)$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}
