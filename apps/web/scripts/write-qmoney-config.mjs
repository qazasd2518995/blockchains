import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetDirectory = path.join(webRoot, 'dist', 'qmoney');
const targetFile = path.join(targetDirectory, 'config.js');
const apiOrigin = String(process.env.VITE_API_BASE || '').replace(/\/$/, '');

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
