import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [sceneSource, pageSource, manifestSource, themesSource] = await Promise.all([
  readFile(new URL('../src/games/hotline/HotlineScene.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/games/HotlinePage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/gameAssetManifest.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/slotThemes.ts', import.meta.url), 'utf8'),
]);

assert.match(
  sceneSource,
  /preference:\s*\['webgl', 'canvas'\]/,
  'Slot renderer must keep WebGL ahead of the Canvas compatibility renderer.',
);
assert.doesNotMatch(
  sceneSource,
  /shouldPreferCanvasRenderer|\['canvas', 'webgl'\]/,
  'Mobile devices must not be forced onto the reduced Canvas renderer.',
);
assert.match(
  sceneSource,
  /private canUseShaderEffects\(\): boolean \{\s*return this\.rendererKind !== 'canvas';/,
  'WebGL mobile sessions must retain the full particle, glow, and filter effects.',
);
assert.match(
  sceneSource,
  /themeSymbolImage\(this\.theme, symbolIndex\), 960/,
  'Slot symbols must load the high-resolution cached variants.',
);
assert.doesNotMatch(
  sceneSource,
  /THEME_TEXTURE_BATCH_SIZE|for \(let start = 0; start < this\.theme\.symbols\.length/,
  'Critical slot art must load in parallel without a symbol-batch waterfall.',
);
assert.match(
  sceneSource,
  /themeSpecialImage\(this\.theme, 'scatter'\), 960/,
  'Mega scatter art must be ready before the playable scene is exposed.',
);
assert.match(
  sceneSource,
  /themeSpecialImage\(this\.theme, 'multiplier'\), 960/,
  'Mega multiplier art must be ready before the playable scene is exposed.',
);

assert.doesNotMatch(
  pageSource,
  /<MegaFallbackGrid|<SlotCanvasFallbackGrid|className="mega-slot-fallback-grid"/,
  'The simplified fallback grid must never replace the authored slot canvas.',
);
assert.match(
  pageSource,
  /!sceneReady && \(\s*<div className="mega-slot-loading"/,
  'Mega slots must keep the themed loading layer while the full scene initializes.',
);

const megaThemeCount = (themesSource.match(/reels:\s*6,\s*\n\s*rows:\s*5,/g) ?? []).length;
assert.equal(
  megaThemeCount,
  5,
  'All five 6x5 Mega Slot themes must share the restored scene path.',
);

assert.match(
  manifestSource,
  /replace\(\/symbols\\\.png\$\/, `symbol-\$\{index\}\.png`\),\s*960/,
  'The asset warmer must request the same 960px reel symbols used by the scene.',
);
assert.match(
  manifestSource,
  /replace\(\/symbols\\\.png\$\/, 'scatter\.png'\),\s*960/,
  'The asset warmer must request the same 960px scatter used by the scene.',
);
assert.match(
  manifestSource,
  /replace\(\/symbols\\\.png\$\/, 'multiplier\.png'\),\s*960/,
  'The asset warmer must request the same 960px multiplier used by the scene.',
);

console.log('Slot full-quality renderer, assets, and no-mini-UI contracts passed.');
