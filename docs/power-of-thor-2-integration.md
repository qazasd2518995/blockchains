# Power of Thor II integration

## Scope

The local game is an observed-rules implementation of **Power of Thor II: Thunder Storm**. It uses the preserved client rules, visuals, audio cues and two bounded one-credit feature-buy observations. It does not claim to reproduce the provider's private RNG or payout server.

The captured source archive lives under `apps/web/public/games/power-of-thor-2/original/` and remains read-only. The React game only loads the semantic runtime subset under `ui/`; the archive currently contains 472 files, including all 94 captured MP3 cues and five Cocos bundles.

The local runtime does not execute the captured vendor Cocos scene runner: its bootstrap depends on wrapper globals and a private provider socket protocol that are not present in the static capture. The playable integration therefore uses the original symbol/help artwork, nine original event-matched audio cues and a local React/CSS animation sequence for spin, drop, cascade, multiplier collection, multiplier upgrade and win presentation. The remaining captured scenes and audio are preserved for reference, but are not represented as wired runtime events. This distinction prevents the local presentation from being described as a pixel-identical clone of the provider client.

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

At a base bet of 1.00, the local API charges 100.00 for Regular, 500.00 for Super and 4,000.00 for Lucky Strike. A one-credit Lucky Strike was observed directly: 12,829.45 was debited to 8,829.45, the single spin showed only 1,000× multiplier balls, did not form a payable eight-symbol group and settled at zero. The purchase debit is visible immediately. Feature payout is kept in a deferred wallet settlement until every stored round has been animated and acknowledged in order.

Progress only advances one round at a time. On reconnect, `/api/games/thor2/session` returns the pending feature and cursor; the client resumes from that cursor. `/feature/complete` rejects settlement before the final stored round.

The final deterministic verification sample covered 100,000 base spins and 10,000 runs of each paid mode. Paid-mode mean payouts at a one-credit base were 102.4660, 490.1789 and 3,902.5000 respectively; every result stayed within 25,000×. The Lucky sample contained 1,561 max wins and 8,439 zero wins, with no intermediate payout, for a 15.61% observed max-win rate versus the displayed 15.53% target. These figures validate the local model's broad payout profile, not the provider's undisclosed RNG implementation.

## Main implementation files

- Shared API types: `packages/shared/src/dto/thor2.ts`
- Deterministic engine: `packages/provably-fair/src/thor2.ts`
- Wallet/control service: `apps/server/src/modules/games/thor2/`
- React presentation: `apps/web/src/pages/games/PowerOfThor2Page.tsx`
- Asset integrity test: `apps/web/scripts/test-thor2-assets.mjs`
