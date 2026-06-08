import { describe, expect, it } from 'vitest';
import { __minesServiceTestHooks } from './mines.service.js';

describe('Mines control helpers', () => {
  it('allows forced loss from the first reveal', () => {
    expect(__minesServiceTestHooks.canForceMinesLossAfterRevealCount(0)).toBe(true);
    expect(__minesServiceTestHooks.canForceMinesLossAfterRevealCount(1)).toBe(true);
  });
});
