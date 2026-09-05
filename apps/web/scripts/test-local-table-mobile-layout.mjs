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
  'local-table-result-card__eyebrow',
  'local-table-result-card__message',
  'aria-live="polite"',
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
assert.doesNotMatch(
  qmoneyShell,
  /visualViewport/,
  'Qmoney game shell must not mirror dynamic browser-toolbar viewport events into layout height',
);
assert.match(
  styles,
  /\.qmoney-game-shell\s*\{[\s\S]{0,220}height:\s*100svh;[\s\S]{0,100}min-height:\s*100svh;/,
  'Qmoney game shell must use the stable small viewport height',
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
assert.match(
  styles,
  /data-game-id='blackjack'[\s\S]{0,180}game-control-stack[\s\S]{0,180}max-height:\s*none\s*!important/,
  'Qmoney Blackjack controls must size to their full content instead of clipping or scrolling',
);
assert.match(
  styles,
  /data-game-id='blackjack'[\s\S]{0,220}game-side-card:first-child[\s\S]{0,180}overflow:\s*hidden\s*!important/,
  'Qmoney Blackjack control card must not expose an internal vertical scroller',
);
assert.match(
  styles,
  /local-table-result-card__message[\s\S]{0,100}color:\s*#172033/,
  'local-table result copy must keep high contrast on the light result surface',
);
assert.match(
  styles,
  /local-table-result-card\s+\.local-table-profit--push[\s\S]{0,100}color:\s*#334155/,
  'zero-value local-table results must remain legible on the light result surface',
);
assert.ok(
  blackjackPage.includes('blackjack-score-tile--${tone}') &&
    blackjackPage.includes('blackjack-control-card--active'),
  'Blackjack score and active-round controls must expose stable mobile layout hooks',
);
const blackjackScoreTile = blackjackPage.slice(
  blackjackPage.indexOf('function BlackjackScoreTile('),
  blackjackPage.indexOf('function EmptySeat('),
);
assert.doesNotMatch(
  blackjackScoreTile,
  /\b(?:truncate|text-ellipsis|line-clamp-\d+|whitespace-nowrap)\b/,
  'Blackjack score tiles must never abbreviate scores or payout amounts',
);
for (const part of ['label', 'value']) {
  assert.match(
    blackjackScoreTile,
    new RegExp(
      `blackjack-score-tile__${part}[^\\n]+whitespace-normal[^\\n]+\\[overflow-wrap:anywhere\\]`,
    ),
    `Blackjack score ${part} must wrap long text and unbroken amounts`,
  );
}
for (const selector of [
  '.game-fullscreen-shell .blackjack-table-label > div:last-child',
  '.game-fullscreen-shell .blackjack-player-hand-header > div:last-child',
]) {
  const start = styles.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `missing Blackjack mobile rule: ${selector}`);
  const rule = styles.slice(start, styles.indexOf('}', start));
  assert.match(rule, /overflow-wrap:\s*anywhere/, `${selector} must wrap long text`);
  assert.match(rule, /white-space:\s*normal/, `${selector} must allow multiple lines`);
  assert.doesNotMatch(rule, /ellipsis|overflow:\s*hidden/, `${selector} must not clip text`);
}
assert.match(
  styles,
  /blackjack-scoreboard[\s\S]{0,100}blackjack-score-tile[\s\S]{0,100}blackjack-score-tile__label[\s\S]{0,500}font-size:\s*9px\s*!important[\s\S]{0,180}text-shadow:\s*none\s*!important/,
  'Qmoney Blackjack score labels must remain compact, clear and high contrast',
);
assert.match(
  styles,
  /blackjack-scoreboard[\s\S]{0,100}blackjack-score-tile[\s\S]{0,100}blackjack-score-tile__value[\s\S]{0,500}font-size:\s*clamp\(13px,\s*3\.8vw,\s*16px\)\s*!important[\s\S]{0,260}text-shadow:\s*none\s*!important/,
  'Qmoney Blackjack score values must stay readable without overwhelming the cards',
);
assert.match(
  styles,
  /blackjack-control-card--active[\s\S]{0,520}bet-controls__entry[\s\S]{0,520}display:\s*none\s*!important/,
  'An active Blackjack round must hide the disabled stake editor on mobile',
);
assert.ok(
  blackjackPage.includes('blackjack-control-card--restoring') &&
    blackjackPage.includes('正在同步牌局…') &&
    blackjackPage.includes('disabled={restoringRound ||'),
  'Blackjack must reserve and disable its control dock while restoring an active round',
);
assert.match(
  styles,
  /blackjack-stage-divider[\s\S]{0,120}blackjack-stage-subtitle[\s\S]{0,180}game-activity-heat[\s\S]{0,80}display:\s*none\s*!important/,
  'The mobile Blackjack title bar must remove duplicated metadata',
);
assert.match(
  styles,
  /\.blackjack-page\s*\{[\s\S]{0,220}--blackjack-felt:\s*#08231f[\s\S]{0,500}\.blackjack-page--royal\s+\.blackjack-table-stage/,
  'Royal Blackjack must expose its own green-and-gold table theme',
);
assert.match(
  styles,
  /\.blackjack-page\[data-blackjack-table='classic'\]\s*\{[\s\S]{0,220}--blackjack-felt:\s*#0b1730[\s\S]{0,500}\.blackjack-page--classic\s+\.blackjack-table-stage/,
  'Classic Blackjack must expose its own blue-and-silver table theme',
);

console.log('Local-table mobile layout contract passed');
