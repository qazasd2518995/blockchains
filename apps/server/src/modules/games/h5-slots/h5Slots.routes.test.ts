import { describe, expect, it } from 'vitest';
import {
  H5_FISH_FREEZE_DURATION_MS,
  getH5BuyFreeCostMultiplier,
  getH5EnhancedBetMultiplier,
  getH5FishFreezeSkillCost,
} from './h5Slots.routes.js';

describe('H5 slot buy-free pricing', () => {
  it('matches the prices shown by Caishen Wins and Gates of Olympus', () => {
    expect(getH5BuyFreeCostMultiplier('278')).toBe(50);
    expect(getH5BuyFreeCostMultiplier('321')).toBe(75);
  });

  it('does not treat Fortune Gems enhanced betting as a free-spin purchase', () => {
    expect(getH5BuyFreeCostMultiplier('302')).toBeUndefined();
    expect(getH5EnhancedBetMultiplier('302')).toBe(1.5);
    expect(getH5EnhancedBetMultiplier('278')).toBeUndefined();
  });
});

describe('H5 fish skill pricing', () => {
  it('charges the original 10x room bet for freeze in every imported fish game', () => {
    expect(getH5FishFreezeSkillCost('2')).toBe(100);
    expect(getH5FishFreezeSkillCost('12')).toBe(100);
    expect(getH5FishFreezeSkillCost('13')).toBe(100);
    expect(getH5FishFreezeSkillCost('14')).toBe(100);
    expect(H5_FISH_FREEZE_DURATION_MS).toBe(5_000);
  });

  it('does not expose fish skills in slot scenes', () => {
    expect(getH5FishFreezeSkillCost('113')).toBeUndefined();
    expect(getH5FishFreezeSkillCost('278')).toBeUndefined();
  });
});
