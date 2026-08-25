# Power of Thor II original-client integration

- `original/` is the 548-file read-only authorized capture of the original Cocos client, including all 94 audio cues and authenticated launch assets.
- `original-runtime/` provides only the hosting HTML and a same-origin protocol adapter.
- The production React route mounts the original Cocos build directly. It does not contain or fall back to the former React/CSS reconstruction.
- The adapter replaces the unavailable provider session/socket boundary with Qmoney authentication and `/api/games/thor2` settlement. Original scenes, symbols, controls, rules, effects and audio execute unchanged from the archive.
- A missing archive file or adapter failure is surfaced as an explicit error; it never switches to reconstructed artwork.
- Do not edit hashed files in `original/`; replace the archive from a newly authorized capture instead.
- Runtime settlement, recovery, idempotency and controls are implemented by `/api/games/thor2`.
