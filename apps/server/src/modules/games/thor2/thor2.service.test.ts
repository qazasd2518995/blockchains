import { Prisma } from '@prisma/client';
import { thor2Spin } from '@bg/provably-fair';
import { describe, expect, it } from 'vitest';
import type { ControlOutcome } from '../_common/controls.js';
import { thor2Payout } from './thor2.economics.js';
import { selectThor2Candidate } from './thor2.service.js';

describe('Thor 2 controlled result selection', () => {
  it('selects a bounded loss whose visible feature replay exactly matches settlement', () => {
    const serverSeed = 'thor2-control-test-server';
    const clientSeed = 'thor2-control-test-client';
    const nonce = 7;
    const baseBet = new Prisma.Decimal(1);
    const stake = new Prisma.Decimal(100);
    const engine = thor2Spin(serverSeed, clientSeed, nonce, { buyFeature: 'regular' });
    const payout = thor2Payout(baseBet, engine.totalMultiplier);
    const natural = {
      clientSeed,
      engine,
      payout,
      multiplier: payout.div(stake).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
    };
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
});
