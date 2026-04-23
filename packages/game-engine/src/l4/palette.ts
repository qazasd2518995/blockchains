/**
 * L4 Pixi 場景共用配色 — 對齊平台深藍 + 金 + teal 設計語言。
 *
 * 平台 Tailwind preset 的對應：
 *   #0F172A  ink-900       BG_DARK_TOP
 *   #111C2E  深藍中段       BG_DARK_MID
 *   #0B1322  深藍底層       BG_DARK_BOTTOM
 *   #F3D67D  亮金           ACCENT_GOLD_BRIGHT
 *   #E8D48A  柔金           ACCENT_GOLD_MUTED
 *   #C9A247  低調金         ACCENT_GOLD_DEEP
 *   #266F85  teal           ACCENT_TEAL
 *   #186073  深 teal        ACCENT_TEAL_DEEP
 *   #5EE0FF  冰藍 highlight ACCENT_ICE
 *   #1E7A4F  勝綠           STATE_WIN
 *   #D4574A  警示紅         STATE_LOSS
 *   #FCA5A5  柔紅 hint      STATE_LOSS_SOFT
 *   #0A0806  墨黑           INK
 *   0xFFFFFF white          WHITE
 */
export const PALETTE = {
  BG_DARK_TOP: 0x0F172A,
  BG_DARK_MID: 0x111C2E,
  BG_DARK_BOTTOM: 0x0B1322,

  ACCENT_GOLD_BRIGHT: 0xF3D67D,
  ACCENT_GOLD_MUTED: 0xE8D48A,
  ACCENT_GOLD_DEEP: 0xC9A247,

  ACCENT_TEAL: 0x266F85,
  ACCENT_TEAL_DEEP: 0x186073,
  ACCENT_ICE: 0x5EE0FF,

  STATE_WIN: 0x1E7A4F,
  STATE_LOSS: 0xD4574A,
  STATE_LOSS_SOFT: 0xFCA5A5,

  INK: 0x0A0806,
  WHITE: 0xFFFFFF,
} as const;
