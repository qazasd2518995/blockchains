import { describe, expect, it } from 'vitest';
import { __chickenRoadServiceTestHooks } from './chicken-road.service.js';

describe('Chicken Road control helpers', () => {
  it('allows forced loss from the first step', () => {
    expect(__chickenRoadServiceTestHooks.canForceChickenRoadLossAtStep(0)).toBe(true);
    expect(__chickenRoadServiceTestHooks.canForceChickenRoadLossAtStep(1)).toBe(true);
  });
});
