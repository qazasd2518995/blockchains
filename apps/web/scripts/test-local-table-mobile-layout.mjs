import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [page, blackjackPage, styles, qmoneyShell, betControls] = await Promise.all([
  readFile(path.join(webRoot, 'src/pages/games/LocalTablePage.tsx'), 'utf8'),
  readFile(path.join(webRoot, 'src/pages/games/BlackjackPage.tsx'), 'utf8'),
  readFile(path.join(webRoot, 'src/styles/global.css'), 'utf8'),
  readFile(path.join(webRoot, 'src/components/layout/QmoneyGameShell.tsx'), 'utf8'),
  readFile(path.join(webRoot, 'src/components/game/BetControls.tsx'), 'utf8'),
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

assert.ok(
  qmoneyShell.includes("isTableGame ? 'qmoney-game-shell--table' : ''"),
  'Qmoney table routes must expose an accessibility layout hook',
);
assert.ok(
  betControls.includes('bet-controls__balance') && betControls.includes('t.bet.balance'),
  'Qmoney bet controls must expose the current game balance',
);
assert.match(
  styles,
  /qmoney-game-shell--table[\s\S]{0,260}bet-controls__header[\s\S]{0,120}display:\s*flex\s*!important/,
  'Qmoney table controls must keep the balance header visible on mobile',
);
assert.match(
  styles,
  /qmoney-game-shell--table[\s\S]{0,220}blackjack-action-btn[\s\S]{0,120}min-height:\s*44px/,
  'Qmoney Blackjack actions must preserve a 44px mobile touch target',
);
assert.ok(
  blackjackPage.includes('blackjack-score-tile--${tone}'),
  'Blackjack score tiles must expose stable tone hooks for accessible contrast',
);
assert.match(
  styles,
  /blackjack-scoreboard[\s\S]{0,100}blackjack-score-tile[\s\S]{0,100}blackjack-score-tile__label[\s\S]{0,500}font-size:\s*12px\s*!important[\s\S]{0,180}text-shadow:\s*none\s*!important/,
  'Qmoney Blackjack score labels must remain clear and high contrast',
);
assert.match(
  styles,
  /blackjack-scoreboard[\s\S]{0,100}blackjack-score-tile[\s\S]{0,100}blackjack-score-tile__value[\s\S]{0,500}font-size:\s*22px\s*!important[\s\S]{0,260}text-shadow:\s*none\s*!important/,
  'Qmoney Blackjack score values must use clear tabular numerals without blur effects',
);

console.log('Local-table mobile layout contract passed');
