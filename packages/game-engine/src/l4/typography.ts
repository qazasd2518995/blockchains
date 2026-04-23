/**
 * L4 共用字體常數 — 所有 Pixi Scene 內的 Text 都從這裡取，
 * 跟平台 (Tailwind preset) 一致：Inter + Noto Sans TC，乾淨無襯線。
 *
 * 數字（倍率、金額、roll）用同一份 stack 即可，
 * 不再使用 serif / Bodoni / Didot / system-ui 雜混。
 */
export const GAME_FONT =
  'Inter, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, -apple-system, "Helvetica Neue", sans-serif';

/** 數字專用（等寬感較強的 fallback，但仍以 Inter 為主） */
export const GAME_FONT_NUM =
  'Inter, "SF Pro Display", "Helvetica Neue", system-ui, sans-serif';
