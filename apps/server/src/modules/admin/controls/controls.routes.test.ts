import { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { controlRoutes, formatAutoBalanceLogDetail } from './controls.routes.js';

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

function manualControl(overrides: Record<string, unknown> = {}) {
  return {
    id: 'path-old',
    scope: 'MEMBER',
    targetAgentId: null,
    targetAgentUsername: null,
    targetMemberId: 'member-1',
    targetMemberUsername: 'ts1111',
    controlMode: 'lifecycle_path',
    targetSettlement: new Prisma.Decimal(0),
    controlPercentage: 50,
    lifecycleTemplateKeys: [],
    lifecycleSteps: [80, 0],
    lineFreezeThreshold: new Prisma.Decimal(50000),
    bitePercentage: null,
    houseTakePercentage: new Prisma.Decimal(10),
    completionBehavior: 'stop_on_target',
    targetBand: new Prisma.Decimal(0),
    cycleCount: 0,
    lastCycleSettlement: null,
    lastCycleAt: null,
    lastCapitalAmount: null,
    lastPlatformTake: null,
    lastRedistributionAmount: null,
    totalDistributedAmount: new Prisma.Decimal(0),
    startSettlement: null,
    isActive: false,
    isCompleted: false,
    completedAt: null,
    completionSettlement: null,
    operatorId: 'zone-owner',
    operatorUsername: 'ts5168',
    controlZoneRootAgentId: 'zone-owner',
    createdAt: new Date('2026-09-04T04:01:00Z'),
    updatedAt: new Date('2026-09-04T04:02:00Z'),
    ...overrides,
  };
}

async function registerControlRouteHandlers(prisma: Record<string, unknown>) {
  const fastify = {
    prisma,
    authenticateAdmin: vi.fn(),
    requireSuperAdmin: vi.fn(),
    addHook: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as FastifyInstance;
  await controlRoutes(fastify);
  return fastify as unknown as {
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

function registeredHandler(mock: ReturnType<typeof vi.fn>, path: string) {
  const call = mock.mock.calls.find(([registeredPath]) => registeredPath === path);
  if (!call) throw new Error(`Route ${path} was not registered`);
  return call.at(-1) as (req: unknown, reply: unknown) => Promise<unknown>;
}

const delegatedAdmin = {
  id: 'zone-owner',
  username: 'ts5168',
  role: 'AGENT',
  canManageControlZone: true,
};

describe('manual path lifecycle mutations', () => {
  it('atomically switches an existing same-member path when a stopped path is enabled', async () => {
    const record = manualControl();
    const reactivated = manualControl({ isActive: true });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue(reactivated);
    const resetRuntime = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      manualDetectionControl: { updateMany, update },
      memberAutoBalanceControl: { updateMany: resetRuntime },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      manualDetectionControl: { findFirst: vi.fn().mockResolvedValue(record) },
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const fastify = await registerControlRouteHandlers(prisma);
    const handler = registeredHandler(fastify.post, '/manual-detection/:id/reactivate');

    const result = await handler(
      { params: { id: record.id }, admin: delegatedAdmin, ip: '127.0.0.1', headers: {} },
      {},
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { not: record.id },
        scope: 'MEMBER',
        targetMemberId: record.targetMemberId,
        isActive: true,
        controlZoneRootAgentId: delegatedAdmin.id,
      },
      data: { isActive: false },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: record.id },
      data: {
        isActive: true,
        isCompleted: false,
        completedAt: null,
        completionSettlement: null,
      },
    });
    expect(resetRuntime).toHaveBeenCalledWith({
      where: { memberId: record.targetMemberId, isActive: true },
      data: {
        isActive: false,
        resetReason: `manual_path_reactivated:${record.id}`,
      },
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: record.id, isActive: true });
  });

  it('deletes the selected path and its audit record in one transaction', async () => {
    const record = manualControl({ isActive: true });
    const remove = vi.fn().mockResolvedValue(record);
    const resetRuntime = vi.fn().mockResolvedValue({ count: 1 });
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = {
      manualDetectionControl: { delete: remove },
      memberAutoBalanceControl: { updateMany: resetRuntime },
      auditLog: { create: auditCreate },
    };
    const prisma = {
      manualDetectionControl: { findFirst: vi.fn().mockResolvedValue(record) },
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const fastify = await registerControlRouteHandlers(prisma);
    const handler = registeredHandler(fastify.delete, '/manual-detection/:id');
    const send = vi.fn();
    const code = vi.fn().mockReturnValue({ send });

    await handler(
      { params: { id: record.id }, admin: delegatedAdmin, ip: '127.0.0.1', headers: {} },
      { code },
    );

    expect(remove).toHaveBeenCalledWith({ where: { id: record.id } });
    expect(resetRuntime).toHaveBeenCalledWith({
      where: { memberId: record.targetMemberId, isActive: true },
      data: { isActive: false, resetReason: `manual_path_deleted:${record.id}` },
    });
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(code).toHaveBeenCalledWith(204);
    expect(send).toHaveBeenCalledOnce();
  });
});
