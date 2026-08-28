import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(webRoot, 'dist');
const targetDirectory = path.join(distDirectory, 'qmoney');
const targetFile = path.join(targetDirectory, 'config.js');
const apiOrigin = String(process.env.VITE_API_BASE || '').replace(/\/$/, '');
const qmoneyRoot = process.env.QMONEY_ROOT === 'true';

if (apiOrigin) {
  const parsed = new URL(apiOrigin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== apiOrigin) {
    throw new Error('VITE_API_BASE must be an absolute HTTP(S) origin without a path');
  }
}

await mkdir(targetDirectory, { recursive: true });
await writeFile(
  targetFile,
  `// Generated during the player frontend build.\nwindow.__QMONEY_CONFIG__ = Object.freeze(${JSON.stringify(
    { apiOrigin },
  )});\n`,
);
console.log(`Qmoney API origin: ${apiOrigin || '(same origin)'}`);

if (qmoneyRoot) {
  // A Render Static Site serves an existing root index before applying a
  // rewrite. Preserve the React shell for client-side game routes, then make
  // the separately deployed Qmoney service open its own lobby at `/`.
  const sourcePlatformHtml = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
  const qmoneyBootStyle = `<style id="qmoney-game-boot-style">
      html,body,#root{width:100%;height:100%;min-height:100dvh;margin:0;overflow:hidden;background:#000}
      .qmoney-game-boot{position:fixed;inset:0;display:grid;place-items:center;background:rgba(255,255,255,.62);backdrop-filter:blur(12px);font-family:system-ui,-apple-system,sans-serif;color:#1a467c}
      .qmoney-game-boot__content{display:flex;flex-direction:column;align-items:center}
      .qmoney-game-boot img{width:92px;height:92px;object-fit:contain}
      .qmoney-game-boot span{margin-top:7px;color:#ff5796;font-size:14px;font-weight:800}
    </style>`;
  const qmoneyBootMarkup = `<div id="root"><div class="qmoney-game-boot" role="status" aria-label="遊戲載入中"><div class="qmoney-game-boot__content"><img src="/qmoney/assets/imgs_soc/media/loading.gif" alt=""><span>載入中...</span></div></div></div>`;
  const qmoneyPlatformHtml = sourcePlatformHtml
    .replace('<html lang="zh-CN">', '<html lang="zh-Hant" data-platform-realm="qmoney">')
    .replace('<body class="font-sans">', '<body class="font-sans" data-platform-realm="qmoney">')
    .replace(
      '<meta name="theme-color" content="#050A13" />',
      '<meta name="theme-color" content="#000000" />',
    )
    .replace(
      '<meta name="apple-mobile-web-app-title" content="八千代娛樂城" />',
      '<meta name="apple-mobile-web-app-title" content="金寶寶" />',
    )
    .replace('<title>八千代娛樂城 · 電子遊戲殿堂</title>', '<title>金寶寶｜遊戲載入中</title>')
    .replace(/\s*<link rel="manifest" href="\/manifest\.webmanifest" \/>/, '')
    .replace(
      /<link rel="icon" type="image\/png" href="\/favicon\.png\?v=\d+" \/>/,
      '<link rel="icon" href="/qmoney/assets/favicon.ico" />',
    )
    .replace(/\s*<link rel="shortcut icon" href="\/favicon\.ico\?v=\d+" \/>/, '')
    .replace(
      /<link rel="apple-touch-icon" href="\/favicon\.png\?v=\d+" \/>/,
      '<link rel="apple-touch-icon" href="/qmoney/assets/imgs_soc/footer/store.webp" />',
    )
    .replace('</head>', `${qmoneyBootStyle}\n  </head>`)
    .replace('<div id="root"></div>', qmoneyBootMarkup);

  if (/八千代|Yachiyo/i.test(qmoneyPlatformHtml)) {
    throw new Error('Qmoney platform shell still contains a legacy casino brand marker');
  }

  await writeFile(path.join(distDirectory, 'platform.html'), qmoneyPlatformHtml);
  await copyFile(path.join(targetDirectory, 'index.html'), path.join(distDirectory, 'index.html'));
  console.log('Qmoney root entry enabled; React game shell written to platform.html');
}
