import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [page, styles] = await Promise.all([
  readFile(path.join(webRoot, 'src/pages/games/LocalTablePage.tsx'), 'utf8'),
  readFile(path.join(webRoot, 'src/styles/global.css'), 'utf8'),
]);

for (const marker of [
  'const stagePanelRef = useRef<HTMLElement>(null)',
  'ref={stagePanelRef}',
  "tenHalfState.phase === 'BANKER_TURN' ? 'banker' : 'player'",
  'stage.scrollBy({',
  'local-table-control-stack--active',
  'local-table-control-card',
]) {
  assert.ok(page.includes(marker), `missing local-table mobile layout marker: ${marker}`);
}

assert.match(
  styles,
  /data-game-id\^='twenty-one-half'[\s\S]{0,180}local-table-stage-panel[\s\S]{0,220}overflow-y:\s*auto\s*!important/,
  'ten-and-a-half stage must remain vertically scrollable on mobile',
);
assert.match(
  styles,
  /local-table-control-card[\s\S]{0,240}overflow-y:\s*auto\s*!important/,
  'local-table controls must preserve access on short mobile viewports',
);
assert.match(
  styles,
  /local-table-control-stack--active[\s\S]{0,100}local-table-main-button[\s\S]{0,80}display:\s*none\s*!important/,
  'an active table round must hide the redundant disabled main bet button on mobile',
);

console.log('Local-table mobile layout contract passed');
