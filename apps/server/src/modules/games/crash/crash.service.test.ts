import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { __crashServiceTestHooks, CrashSoloService } from './crash.service.js';
import type { ControlOutcome, GlobalMemberDailyWinCapGuard } from '../_common/controls.js';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('CrashSoloService controlled losses', () => {
  it('does not turn auto-balance drain losses into fixed relief wins', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const service = new CrashSoloService({} as never) as unknown as {
      tuneCrashPoint: (
        naturalCrashPoint: number,
        amount: Prisma.Decimal,
        control: ControlOutcome,
        recentControlledLosses: number,
      ) => { crashPoint: number; control: ControlOutcome };
    };
    const control: ControlOutcome = {
      won: false,
      multiplier: decimal(0),
      payout: decimal(0),
      controlled: true,
      flipReason: 'auto_balance_drain',
      controlId: 'auto-1',
    };

    const tuned = service.tuneCrashPoint(10, decimal(5000), control, 10);

    expect(tuned.control.won).toBe(false);
    expect(tuned.control.flipReason).toBe('auto_balance_drain');
    expect(tuned.control.payout.toFixed(2)).toBe('0.00');
    expect(tuned.crashPoint).toBeGreaterThanOrEqual(1.0001);
    expect(tuned.crashPoint).toBeLessThan(1.01);
  });

  it('puts controlled losses before a 1.1x auto-cashout can settle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const service = new CrashSoloService({} as never) as unknown as {
      tuneCrashPoint: (
        naturalCrashPoint: number,
        amount: Prisma.Decimal,
        control: ControlOutcome,
        recentControlledLosses: number,
      ) => { crashPoint: number; control: ControlOutcome };
    };
    const control: ControlOutcome = {
      won: false,
      multiplier: decimal(0),
      payout: decimal(0),
      controlled: true,
      flipReason: 'loss_control',
      controlId: 'loss-1',
    };

    const tuned = service.tuneCrashPoint(20, decimal(5000), control, 0);

    expect(tuned.crashPoint).toBeLessThan(1.01);
    expect(1.1 < tuned.crashPoint).toBe(false);
  });
});

describe('CrashSoloService global member win cap', () => {
  const guard = (overrides: {
    exhausted?: boolean;
    maxPayout?: string | number;
    maxMultiplier?: string | number;
  }): GlobalMemberDailyWinCapGuard => ({
    exhausted: overrides.exhausted ?? false,
    controlId: 'global-member-daily-win-cap',
    reason: 'global_member_daily_win_cap',
    maxPayout: decimal(overrides.maxPayout ?? 10000),
    maxMultiplier: decimal(overrides.maxMultiplier ?? 100),
  });

  it('crashes immediately when even the minimum crash cashout would exceed the 10000 cap', () => {
    const capGuard = guard({ maxPayout: '100.50', maxMultiplier: '1.0050' });

    expect(__crashServiceTestHooks.shouldCrashImmediatelyForGlobalCap(capGuard, decimal(100))).toBe(
      true,
    );
  });

  it('does not use the start guard as a hard loss after the daily cap is already exhausted', () => {
    const capGuard = guard({ exhausted: true, maxPayout: 0, maxMultiplier: 0 });

    expect(__crashServiceTestHooks.shouldCrashImmediatelyForGlobalCap(capGuard, decimal(100))).toBe(
      false,
    );
  });

  it('caps crash points before a cashout can exceed the remaining global win cap', () => {
    const capGuard = guard({ maxPayout: '150.00', maxMultiplier: '1.5000' });

    const tuned = __crashServiceTestHooks.capCrashPointForGlobalWinCap(
      {
        crashPoint: 10,
        control: {
          won: false,
          multiplier: decimal(0),
          payout: decimal(0),
          controlled: false,
        },
      },
      capGuard,
    );

    expect(tuned.crashPoint).toBe(1.5001);
    expect(tuned.control.controlled).toBe(true);
    expect(tuned.control.flipReason).toBe('global_member_daily_win_cap');
  });

  it('uses the reachable crash multiplier for start-time control probes', () => {
    const service = new CrashSoloService({} as never) as unknown as {
      startControlProbeMultiplier: (
        naturalCrashPoint: number,
        autoCashOut: Prisma.Decimal | null,
      ) => Prisma.Decimal;
    };

    expect(service.startControlProbeMultiplier(18.7984, decimal(20)).toFixed(4)).toBe('18.7984');
    expect(service.startControlProbeMultiplier(30, decimal(20)).toFixed(4)).toBe('20.0000');
  });

  it('caps game-matched crash controls at the next tick instead of leaving cashout room', () => {
    const service = new CrashSoloService({} as never) as unknown as {
      tuneCrashPoint: (
        naturalCrashPoint: number,
        amount: Prisma.Decimal,
        control: ControlOutcome,
        recentControlledLosses: number,
      ) => { crashPoint: number; control: ControlOutcome };
    };
    const control: ControlOutcome = {
      won: true,
      multiplier: decimal(8),
      payout: decimal(24000),
      controlled: true,
      flipReason: 'auto_balance_path_guard',
      controlId: 'auto-path-1',
      maxPayout: decimal(24000),
      gameMatchedPayoutOnly: true,
    };

    const tuned = service.tuneCrashPoint(20, decimal(3000), control, 0);

    expect(tuned.crashPoint).toBe(8.0001);
  });
});
