import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { formatAutoBalanceLogDetail } from './controls.routes.js';

function autoBalanceControl(overrides: Partial<Parameters<typeof formatAutoBalanceLogDetail>[0]>) {
  return {
    memberUsername: 'Chen09811',
    baselineBalance: new Prisma.Decimal('61870.35'),
    biteTargetBalance: new Prisma.Decimal('12374.07'),
    reviveTargetBalance: new Prisma.Decimal('24748.14'),
    phase: 'DRAIN_TO_ZERO',
    templateKey: 'FIVE_NO_RECOVERY',
    lifecycleSteps: [60, 90, 10, 30, 0],
    currentStageIndex: 0,
    lifecycleCompletedAt: null,
    lastBalance: new Prisma.Decimal('61870.35'),
    secondLineAmount: new Prisma.Decimal('20000'),
    ...overrides,
  };
}

describe('formatAutoBalanceLogDetail', () => {
  it('shows completed five-stage paths without inventing a sixth stage', () => {
    const detail = formatAutoBalanceLogDetail(
      autoBalanceControl({
        currentStageIndex: 5,
        lifecycleCompletedAt: new Date('2026-07-16T11:59:55.598Z'),
        lastBalance: new Prisma.Decimal('6069.49'),
      }),
    );

    expect(detail).toContain('目前控制狀態（非本筆介入當下快照）');
    expect(detail).toContain('最新餘額 6069.49（9.81%）');
    expect(detail).toContain('路徑已完成（5/5 階，最終目標 0%，已進入完成區間）');
    expect(detail).not.toContain('第 6 階');
  });

  it('shows the current and total stage with its target balance while active', () => {
    const detail = formatAutoBalanceLogDetail(
      autoBalanceControl({
        currentStageIndex: 2,
        lastBalance: new Prisma.Decimal('43146.35'),
      }),
    );

    expect(detail).toContain('第 3/5 階：控輸到 10%（目標餘額 6187.04）');
  });
});
