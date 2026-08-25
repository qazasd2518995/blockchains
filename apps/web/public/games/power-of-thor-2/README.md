# Power of Thor II asset integration

- `original/` is the read-only static capture used for inventory and visual/audio reference.
- `ui/` contains the small, semantic runtime subset used by the local React client.
- The runtime subset wires nine original cues to local spin, base/free music, win, collection, multiplier-hit and large-win events; all 94 captured MP3 files remain preserved under `original/`.
- The local React/CSS presentation implements the playable animation sequence. The captured Cocos scene runner is reference material because its private wrapper/socket dependencies are not part of the static archive.
- The local client does not execute or depend on the captured vendor network protocol.
- Do not edit hashed files in `original/`; replace the archive from a newly authorized capture instead.
- Runtime settlement, recovery, idempotency and controls are implemented by `/api/games/thor2`.
