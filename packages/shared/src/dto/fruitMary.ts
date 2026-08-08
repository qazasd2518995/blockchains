export const FRUIT_MARY_GAME_CODE = 'fruit-mary' as const;
export const FRUIT_MARY_RTP = 0.96;
export const FRUIT_MARY_ROOM_ID = 1;
export const FRUIT_MARY_MAX_UNITS_PER_FRUIT = 99;

export const FRUIT_MARY_BET_IDS = [4, 16, 20, 8, 2, 19, 13, 5] as const;
export type FruitMaryBetId = (typeof FRUIT_MARY_BET_IDS)[number];

export interface FruitMaryBetSelection {
  fruitId: FruitMaryBetId;
  units: number;
}

export interface FruitMaryOutcome {
  /** Original client event index: 0 normal; 1..9 bonus/fail presentations. */
  legacyType: number;
  positions: number[];
  payoutByPosition: number[];
  totalPayoutUnits: number;
  presentation:
    | 'normal'
    | 'small-triple'
    | 'big-triple'
    | 'four-happiness'
    | 'flower-rain'
    | 'eight-dragons'
    | 'stumble'
    | 'train'
    | 'grand-slam'
    | 'fail';
}

export interface FruitMaryLegacySpinResponse {
  code: 1;
  data: {
    data: {
      type: number;
      pos: number | { pos: number; luck: number[] };
    };
    money: number[];
  };
  balance: number;
  spinId: string;
}
