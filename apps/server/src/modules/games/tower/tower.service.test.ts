import { describe, expect, it } from 'vitest';
import { __towerServiceTestHooks } from './tower.service.js';

describe('Tower control helpers', () => {
  it('allows forced loss from the first picked level', () => {
    expect(__towerServiceTestHooks.canForceTowerLossAtLevel(0)).toBe(true);
    expect(__towerServiceTestHooks.canForceTowerLossAtLevel(1)).toBe(true);
  });
});
