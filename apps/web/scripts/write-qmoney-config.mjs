import { copyFile, mkdir, writeFile } from 'node:fs/promises';
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
  await copyFile(path.join(distDirectory, 'index.html'), path.join(distDirectory, 'platform.html'));
  await copyFile(path.join(targetDirectory, 'index.html'), path.join(distDirectory, 'index.html'));
  console.log('Qmoney root entry enabled; React game shell written to platform.html');
}
