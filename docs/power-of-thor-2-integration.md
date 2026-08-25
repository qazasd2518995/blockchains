# Power of Thor II integration

## Scope

The Qmoney route executes the archived original **Power of Thor II: Thunder Storm** Cocos client. The scene graph, layouts, rule panels, symbols, Spine effects, control widgets and audio are loaded from the preserved build instead of being reconstructed in React. It does not claim to reproduce the provider's private RNG or payout server; authentication, wallet settlement and deterministic outcomes remain local Qmoney services.

The captured source archive lives under `apps/web/public/games/power-of-thor-2/original/` and remains read-only. It contains 548 files, including all 94 captured MP3 cues, five Cocos bundles, and the authenticated launch-only packs/textures requested by the original client. `original-runtime/index.html` recreates the original wrapper DOM and boots that archive. `thor2-original-adapter.js` implements the original encrypted Royal Slot WebSocket messages against the Qmoney HTTP API.

The old semantic React/CSS reconstruction is no longer connected to the game route and there is no automatic fallback to it. If the Cocos archive cannot boot or the protocol mapping fails, the shell reports an error over `postMessage` while keeping the original canvas in place.

## Confirmed contracts

- 6 reels × 5 rows, anywhere-pays at 8, 10 and 12 matching symbols.
- Legal multiplier ladder: 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500 and 1,000.
- 4, 5 or 6 Bonus symbols pay 3×, 5× or 100× and start 15 free spins.
- Free-game retriggers add 5 spins, capped at 100 total spins.
- One to four Super Bonus symbols alongside a trigger pay 100×, 500×, 5,000× or 25,000×.
- Regular, Super and Lucky Strike buys cost 100×, 500× and 4,000× the base bet.
- Lucky Strike is exactly one spin. Every multiplier ball is 1,000× and the observed buy screen specifies a no-win-or-max-win outcome with a 1-in-6.44 max-win chance.
- Extra Bet costs 1.25× and doubles the modeled feature-entry chance; payout still uses the base bet.
- The presentation and settlement both stop at 25,000× the base bet.

## One-credit economics

The original client's Qmoney bet menu starts at the platform limit of 10.00 and exposes values through 5,000.00. Feature prices retain the original 100×, 500× and 4,000× cost ratios. A one-credit Lucky Strike was observed directly during the authorized source study: 12,829.45 was debited to 8,829.45, the single spin showed only 1,000× multiplier balls, did not form a payable eight-symbol group and settled at zero. The purchase debit is visible immediately. Feature payout is kept in a deferred wallet settlement until every stored round has been animated and acknowledged in order.

Progress only advances one round at a time. On reconnect, `/api/games/thor2/session` returns the pending feature and cursor; the client resumes from that cursor. `/feature/complete` rejects settlement before the final stored round.

The final deterministic verification sample covered 100,000 base spins and 10,000 runs of each paid mode. Paid-mode mean payouts at a one-credit base were 102.4660, 490.1789 and 3,902.5000 respectively; every result stayed within 25,000×. The Lucky sample contained 1,561 max wins and 8,439 zero wins, with no intermediate payout, for a 15.61% observed max-win rate versus the displayed 15.53% target. These figures validate the local model's broad payout profile, not the provider's undisclosed RNG implementation.

## Main implementation files

- Shared API types: `packages/shared/src/dto/thor2.ts`
- Deterministic engine: `packages/provably-fair/src/thor2.ts`
- Wallet/control service: `apps/server/src/modules/games/thor2/`
- Original-client host: `apps/web/public/games/power-of-thor-2/original-runtime/`
- React iframe shell: `apps/web/src/pages/games/PowerOfThor2Page.tsx`
- Asset integrity test: `apps/web/scripts/test-thor2-assets.mjs`
