import { Prisma } from '@prisma/client';
import { thor2Spin } from '@bg/provably-fair';
import { describe, expect, it } from 'vitest';
import type { ControlOutcome } from '../_common/controls.js';
import { thor2Payout } from './thor2.economics.js';
import { selectThor2Candidate } from './thor2.service.js';

function naturalCandidate(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  baseBet: Prisma.Decimal,
  stake: Prisma.Decimal,
  action: 'spin' | 'extra' | 'regular' | 'super' | 'lucky',
) {
  const options =
    action === 'regular' || action === 'super' || action === 'lucky'
      ? { buyFeature: action }
      : action === 'extra'
        ? { extraBet: true }
        : {};
  const engine = thor2Spin(serverSeed, clientSeed, nonce, options);
  const payout = thor2Payout(baseBet, engine.totalMultiplier);
  return {
    clientSeed,
    engine,
    payout,
    multiplier: payout.div(stake).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
  };
}

describe('Thor 2 controlled result selection', () => {
  it('selects a bounded loss whose visible feature replay exactly matches settlement', () => {
    const serverSeed = 'thor2-control-test-server';
    const clientSeed = 'thor2-control-test-client';
    const nonce = 7;
    const baseBet = new Prisma.Decimal(1);
    const stake = new Prisma.Decimal(100);
    const natural = naturalCandidate(serverSeed, clientSeed, nonce, baseBet, stake, 'regular');
    const control: ControlOutcome = {
      won: false,
      multiplier: new Prisma.Decimal(0),
      payout: new Prisma.Decimal(0),
      controlled: true,
      flipReason: 'THOR2_TEST_LOSS',
      controlId: 'thor2-test-control',
    };

    const selected = selectThor2Candidate(natural, control, {
      serverSeed,
      clientSeed,
      nonce,
      baseBet,
      stake,
      action: 'regular',
    });

    expect(selected.candidate.payout.lessThanOrEqualTo(stake)).toBe(true);
    expect(selected.candidate.engine.feature?.rounds.length).toBeGreaterThanOrEqual(15);
    expect(selected.candidate.payout.toFixed(2)).toBe(
      thor2Payout(baseBet, selected.candidate.engine.totalMultiplier).toFixed(2),
    );
  });

  it.each([
    ['spin', 1],
    ['extra', 1.25],
    ['regular', 100],
    ['super', 500],
    ['lucky', 4_000],
  ] as const)('generates a bounded visible win for %s control', (action, costMultiplier) => {
    const serverSeed = `thor2-${action}-win-server`;
    const clientSeed = `thor2-${action}-win-client`;
    const nonce = 11;
    const baseBet = new Prisma.Decimal(1);
    const stake = baseBet.mul(costMultiplier);
    const natural = naturalCandidate(serverSeed, clientSeed, nonce, baseBet, stake, action);
    const control: ControlOutcome = {
      won: true,
      multiplier: new Prisma.Decimal('1.05'),
      payout: stake.mul('1.05'),
      controlled: true,
      flipReason: 'deposit_control',
      controlId: 'thor2-deposit-control',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal('1.20'),
    };
    const selected = selectThor2Candidate(natural, control, {
      serverSeed,
      clientSeed,
      nonce,
      baseBet,
      stake,
      action,
    });

    expect(selected.control.controlled).toBe(true);
    expect(selected.control.won).toBe(true);
    expect(selected.candidate.payout.greaterThan(stake)).toBe(true);
    expect(selected.candidate.multiplier.greaterThanOrEqualTo('1.01')).toBe(true);
    expect(selected.candidate.multiplier.lessThanOrEqualTo('1.20')).toBe(true);
    expect(selected.candidate.clientSeed).toContain(':thor2-control:');
    expect(selected.candidate.payout.toFixed(2)).toBe(
      thor2Payout(baseBet, selected.candidate.engine.totalMultiplier).toFixed(2),
    );
  });

  it('guards an unreachable narrow Lucky Strike band instead of inventing an illegal factor', () => {
    const serverSeed = 'thor2-lucky-narrow-server';
    const clientSeed = 'thor2-lucky-narrow-client';
    const nonce = 17;
    const baseBet = new Prisma.Decimal(1);
    const stake = new Prisma.Decimal(4_000);
    const natural = naturalCandidate(serverSeed, clientSeed, nonce, baseBet, stake, 'lucky');
    const control: ControlOutcome = {
      won: true,
      multiplier: new Prisma.Decimal('1.01'),
      payout: new Prisma.Decimal(4_040),
      controlled: true,
      flipReason: 'auto_balance_revive',
      controlId: 'thor2-auto-balance',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal('1.03'),
    };
    const selected = selectThor2Candidate(natural, control, {
      serverSeed,
      clientSeed,
      nonce,
      baseBet,
      stake,
      action: 'lucky',
    });

    expect(selected.control.won).toBe(false);
    expect(selected.control.flipReason).toBe('control_bounds_guard');
    expect(selected.candidate.payout.lessThanOrEqualTo(stake)).toBe(true);
    expect(selected.candidate.engine.totalMultiplier).not.toBe(4_080);
    expect(selected.candidate.clientSeed).toContain(':thor2-control:');
  });

  it('honors the exact payout ceiling used by burst and member-cap controls', () => {
    const serverSeed = 'thor2-burst-cap-server';
    const clientSeed = 'thor2-burst-cap-client';
    const nonce = 23;
    const baseBet = new Prisma.Decimal(1);
    const stake = new Prisma.Decimal(500);
    const maxPayout = new Prisma.Decimal('525.00');
    const natural = naturalCandidate(serverSeed, clientSeed, nonce, baseBet, stake, 'super');
    const control: ControlOutcome = {
      won: true,
      multiplier: new Prisma.Decimal('1.05'),
      payout: maxPayout,
      controlled: true,
      flipReason: 'burst_risk_cap',
      controlId: 'thor2-burst-control',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal('1.10'),
      maxPayout,
    };
    const selected = selectThor2Candidate(natural, control, {
      serverSeed,
      clientSeed,
      nonce,
      baseBet,
      stake,
      action: 'super',
    });

    expect(selected.control.won).toBe(true);
    expect(selected.candidate.payout.greaterThan(stake)).toBe(true);
    expect(selected.candidate.payout.lessThanOrEqualTo(maxPayout)).toBe(true);
  });

  it('uses a real visible loss when a requested band has no legal Thor win', () => {
    const serverSeed = 'thor2-impossible-band-server';
    const clientSeed = 'thor2-impossible-band-client';
    const nonce = 29;
    const baseBet = new Prisma.Decimal(1);
    const stake = new Prisma.Decimal(1);
    const natural = naturalCandidate(serverSeed, clientSeed, nonce, baseBet, stake, 'spin');
    const control: ControlOutcome = {
      won: true,
      multiplier: new Prisma.Decimal('1.01'),
      payout: new Prisma.Decimal('1.01'),
      controlled: true,
      flipReason: 'manual_detection_release',
      controlId: 'thor2-manual-control',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal('1.02'),
    };
    const selected = selectThor2Candidate(natural, control, {
      serverSeed,
      clientSeed,
      nonce,
      baseBet,
      stake,
      action: 'spin',
    });

    expect(selected.control.won).toBe(false);
    expect(selected.control.flipReason).toBe('control_bounds_guard');
    expect(selected.candidate.payout.lessThanOrEqualTo(stake)).toBe(true);
    expect(selected.candidate.engine.totalMultiplier).toBe(0);
  });

  it('varies controlled losing returns while keeping every result below break-even', () => {
    const baseBet = new Prisma.Decimal(1);
    const stake = new Prisma.Decimal(100);
    const payouts = new Set<string>();
    for (let nonce = 0; nonce < 6; nonce += 1) {
      const serverSeed = 'thor2-varied-loss-server';
      const clientSeed = `thor2-varied-loss-${nonce}`;
      const natural = naturalCandidate(serverSeed, clientSeed, nonce, baseBet, stake, 'regular');
      const control: ControlOutcome = {
        won: false,
        multiplier: new Prisma.Decimal(0),
        payout: new Prisma.Decimal(0),
        controlled: true,
        flipReason: 'deposit_control',
        controlId: 'thor2-loss-control',
      };
      const selected = selectThor2Candidate(natural, control, {
        serverSeed,
        clientSeed,
        nonce,
        baseBet,
        stake,
        action: 'regular',
      });
      expect(selected.candidate.payout.lessThanOrEqualTo(stake)).toBe(true);
      payouts.add(selected.candidate.payout.toFixed(2));
    }
    expect(payouts.size).toBeGreaterThanOrEqual(4);
  });
});
