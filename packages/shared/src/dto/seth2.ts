export const SETH2_GAME_CODE = 'storm-of-seth-2' as const;
export const SETH2_RTP = 96.89;
export const SETH2_MAX_WIN_MULTIPLIER = 81_000;
export const SETH2_BUY_FEATURE_MULTIPLIER = 200;
export const SETH2_FREE_SPINS = 15;
export const SETH2_MAX_FREE_SPINS = 100;

export const SETH2_ALLOWED_BETS = [
  2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 60, 64, 72, 80,
  100, 120, 140, 160, 180, 200, 240, 280, 300, 320, 360, 400, 420, 480, 500, 540, 560,
  600, 640, 700, 720, 800, 840, 900, 960, 980, 1000, 1080, 1120, 1200, 1260, 1280, 1400,
  1440, 1660, 1800, 2000,
] as const;

export type Seth2FeatureMode = 'none' | 'standard' | 'awakening';
export type Seth2SpinMode = 'base' | 'standard_free' | 'awakening_free' | 'buy';

export interface Seth2Cell {
  type: number;
  mul: number;
  mul_type?: number;
}

export interface Seth2CascadeRound {
  start_data: Seth2Cell[];
  remove_type: number[];
  round_data: Seth2Cell[];
  scoreList: number[];
  upgrade_mul_list: Array<{ mul: number; new_mul: number }>;
  total_mul: number;
  score: number;
  total_gold: number;
  remove_count: number;
  is_over: number;
}

export interface Seth2ReturnData {
  list: Seth2CascadeRound[];
  is_sjc: 0 | 1;
  freeGameCount: number;
  addGameCiShu: number;
  type17_mul_list: Seth2Cell[];
  type17_beishu: { mul: number };
  type18_start_mul_list: Array<{ mul: number }>;
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
  machineId?: number;
  yazhu?: number;
  isFreeModel?: number;
  gameModelType?: number;
}

export interface Seth2ProtocolResponse {
  type: string;
  data: unknown;
}
