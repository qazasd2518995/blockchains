export const SETH2_GAME_CODE = 'storm-of-seth-2' as const;
export const SETH2_RTP = 96.89;
export const SETH2_MAX_WIN_MULTIPLIER = 81_000;
export const SETH2_BUY_FEATURE_MULTIPLIER = 200;
export const SETH2_BUY_FEATURE_MULTIPLIERS = [200, 500, 2_000] as const;
// Source v1.1.5 opens natural and purchased free-game features with 15 games.
export const SETH2_FREE_SPINS = 15;
export const SETH2_MAX_FREE_SPINS = 100;
export const SETH2_MACHINE_PAGES = 8;
export const SETH2_MACHINES_PER_PAGE = 500;
export const SETH2_MACHINE_COUNT = SETH2_MACHINE_PAGES * SETH2_MACHINES_PER_PAGE;

export const SETH2_ALLOWED_BETS = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 60, 64, 72, 80, 100, 120, 140,
  160, 180, 200, 240, 280, 300, 320, 360, 400, 420, 480, 500, 540, 560, 600, 640, 700, 720, 800,
  840, 900, 960, 980, 1000, 1080, 1120, 1200, 1260, 1280, 1400, 1440, 1660, 1800, 2000,
] as const;

export type Seth2FeatureMode = 'none' | 'standard' | 'awakening';
export type Seth2SpinMode = 'base' | 'standard_free' | 'awakening_free' | 'buy';

export interface Seth2Cell {
  type: number;
  mul: number;
  mul_type?: number;
  /** Zero-based board slot used by the imported skill animations. */
  code?: number;
}

export interface Seth2MultiplierUpgrade {
  mul: number;
  new_mul: number;
  mul_type?: number;
  type?: number;
  code?: number;
}

export interface Seth2CascadeRound {
  start_data: Seth2Cell[];
  remove_type: number[];
  round_data: Seth2Cell[];
  scoreList: number[];
  upgrade_mul_list: Seth2MultiplierUpgrade[];
  total_mul: number;
  score: number;
  total_gold: number;
  remove_count: number;
  is_over: number;
}

export interface Seth2ReturnData {
  list: Seth2CascadeRound[];
  featureMode: Seth2FeatureMode;
  gameModelType: 0 | 1;
  is_sjc: 0 | 1;
  freeGameCount: number;
  addGameCiShu: number;
  type17_mul_list: Seth2Cell[];
  type17_beishu: Seth2Cell | null;
  type18_start_mul_list: Seth2Cell[];
  type18_mul_count: number;
  JPtype: number;
  JPGold: number;
  score: number;
  total_gold: number;
  multiplierBankBefore: number;
  multiplierBankAdded: number;
  multiplierBankAfter: number;
}

export interface Seth2ProtocolRequest {
  type: string;
  page?: number;
  machineId?: number;
  yazhu?: number;
  isFreeModel?: number;
  gameModelType?: number;
}

export interface Seth2ProtocolResponse {
  type: string;
  data: unknown;
}

export type Seth2SourceEvent =
  | 'initial'
  | 'spin'
  | 'closeSpin'
  | 'updateSettings'
  | 'getBetRecords'
  | 'getUserReport'
  | 'getSlotTables'
  | 'getSlotTableDetail'
  | 'updateSlotTable'
  | 'lockSlotTable';

export interface Seth2SourceRequest {
  event: Seth2SourceEvent;
  data: Record<string, unknown>;
}
