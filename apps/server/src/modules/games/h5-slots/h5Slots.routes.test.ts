import { describe, expect, it } from 'vitest';
import { getH5BuyFreeCostMultiplier } from './h5Slots.routes.js';

describe('H5 slot buy-free pricing', () => {
  it('matches the prices shown by Caishen Wins and Gates of Olympus', () => {
    expect(getH5BuyFreeCostMultiplier('278')).toBe(50);
    expect(getH5BuyFreeCostMultiplier('321')).toBe(50);
  });

  it('does not treat Fortune Gems enhanced betting as a free-spin purchase', () => {
    expect(getH5BuyFreeCostMultiplier('302')).toBeUndefined();
  });
});
