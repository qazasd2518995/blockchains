import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { __towerServiceTestHooks } from './tower.service.js';

describe('Tower control helpers', () => {
  it('allows forced loss from the first picked level', () => {
    expect(__towerServiceTestHooks.canForceTowerLossAtLevel(0)).toBe(true);
    expect(__towerServiceTestHooks.canForceTowerLossAtLevel(1)).toBe(true);
  });

  it('forces late expert/master picks to lose without visually locking levels', () => {
    expect(__towerServiceTestHooks.mustForceTowerLateLevelLoss('expert', 4)).toBe(false);
    expect(__towerServiceTestHooks.mustForceTowerLateLevelLoss('expert', 5)).toBe(true);
    expect(__towerServiceTestHooks.mustForceTowerLateLevelLoss('master', 3)).toBe(false);
    expect(__towerServiceTestHooks.mustForceTowerLateLevelLoss('master', 4)).toBe(true);
    expect(__towerServiceTestHooks.mustForceTowerLateLevelLoss('hard', 8)).toBe(false);
  });

  it('does not record overridden win controls when the late-level risk limit forces loss', () => {
    const shapedControl = {
      won: true,
      multiplier: new Prisma.Decimal(9.5),
      payout: new Prisma.Decimal(950),
      controlled: true,
      flipReason: 'win_control',
      controlId: 'control-1',
    };
    const result = __towerServiceTestHooks.resolveTowerEffectiveControl(shapedControl, {
      rawSafe: true,
      isSafe: false,
      lateLevelForcedLoss: true,
    });
    expect(result.controlled).toBe(false);
    expect(result.flipReason).toBeUndefined();
    expect(result.controlId).toBeUndefined();
  });
});
