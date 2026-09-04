import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenePaths = [
  'src/games/crash/CrashScene.ts',
  'src/games/dice/DiceScene.ts',
  'src/games/hilo/HiLoScene.ts',
  'src/games/hotline/HotlineScene.ts',
  'src/games/keno/KenoScene.ts',
  'src/games/mines/MinesScene.ts',
  'src/games/plinko/PlinkoScene.ts',
  'src/games/roulette/RouletteScene.ts',
  'src/games/tower/TowerScene.ts',
  'src/games/wheel/WheelScene.ts',
];

for (const scenePath of scenePaths) {
  const source = fs.readFileSync(path.join(webRoot, scenePath), 'utf8');
  assert.match(
    source,
    /^import ['"]pixi\.js\/unsafe-eval['"];?/,
    `${scenePath} must install Pixi's CSP-safe shader adapter before creating an Application`,
  );
}

for (const pagePath of ['src/pages/games/MinesPage.tsx', 'src/pages/games/TowerPage.tsx']) {
  const source = fs.readFileSync(path.join(webRoot, pagePath), 'utf8');
  assert.match(
    source,
    /scene initialization failed/,
    `${pagePath} must report scene initialization failures instead of leaving an empty board`,
  );
}

console.log('Pixi CSP regression tests passed.');
