import type { FastifyInstance } from 'fastify';
import { ManualDetectionScope, Prisma } from '@prisma/client';
import {
  winLossControlSchema,
  winCapControlSchema,
  depositControlSchema,
  agentLineControlSchema,
  manualDetectionControlSchema,
  manualDetectionQuerySchema,
  deactivateManualDetectionSchema,
  toggleSchema,
} from './controls.schema.js';
import {
  calculateCurrentSettlement,
  checkAndCompleteManualDetectionControls,
  getAllActiveManualDetectionControls,
  getControlGameDay,
  normalizeAgentLineCapDay,
  normalizeMemberWinCapDay,
} from './controls.runtime.js';
import { writeAudit } from '../audit/audit.service.js';

function decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Prisma.Decimal(value);
  return new Prisma.Decimal(0);
}

function serializeSettlement(summary: Awaited<ReturnType<typeof calculateCurrentSettlement>>) {
  return {
    gameDay: summary.gameDay,
    totalBet: summary.totalBet.toFixed(2),
    totalPayout: summary.totalPayout.toFixed(2),
    memberWinLoss: summary.memberWinLoss.toFixed(2),
    totalRebate: summary.totalRebate.toFixed(2),
    superiorSettlement: summary.superiorSettlement.toFixed(2),
    totalBets: summary.totalBets,
    totalPlayers: summary.totalPlayers,
    status: summary.status,
    statusText: summary.statusText,
  };
}

async function serializeManualControl(
  fastify: FastifyInstance,
  control: Awaited<ReturnType<FastifyInstance['prisma']['manualDetectionControl']['findFirst']>> & { id: string },
) {
  const settlement = await calculateCurrentSettlement(
    fastify.prisma,
    control.scope,
    control.targetAgentId,
    control.targetMemberUsername,
  );
  return {
    ...control,
    targetSettlement: control.targetSettlement.toFixed(2),
    startSettlement: control.startSettlement?.toFixed(2) ?? null,
    completionSettlement: control.completionSettlement?.toFixed(2) ?? null,
    currentSettlement: settlement.superiorSettlement.toFixed(2),
    gameDay: settlement.gameDay,
  };
}

/**
 * 控制表 CRUD（僅 super-admin 可建立/改）。
 * 所有 mutation 都寫 AuditLog。
 */
export async function controlRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/logs', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const logs = await fastify.prisma.winLossControlLogs.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const userIds = Array.from(new Set(logs.map((log) => log.userId)));
    const users = await fastify.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const usernames = new Map(users.map((user) => [user.id, user.username]));
    return {
      items: logs.map((log) => ({
        ...log,
        username: usernames.get(log.userId) ?? log.userId,
      })),
    };
  });

  fastify.get('/win-loss', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.winLossControl.findMany({ orderBy: { createdAt: 'desc' } });
    return { items };
  });

  fastify.post(
    '/win-loss',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = winLossControlSchema.parse(req.body);
      const created = await fastify.prisma.winLossControl.create({
        data: {
          controlMode: body.controlMode,
          targetType: body.targetType ?? null,
          targetId: body.targetId ?? null,
          targetUsername: body.targetUsername ?? null,
          controlPercentage: new Prisma.Decimal(body.controlPercentage),
          winControl: body.winControl,
          lossControl: body.lossControl,
          isActive: true,
          startPeriod: body.startPeriod ?? null,
          operatorId: req.admin.id,
          operatorUsername: req.admin.username,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_loss.create',
        targetType: 'control',
        targetId: created.id,
        newValues: { controlMode: created.controlMode, targetId: created.targetId },
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/win-loss/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.winLossControl.update({ where: { id }, data: { isActive } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_loss.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/win-loss/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.winLossControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_loss.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get('/win-cap', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.memberWinCapControl.findMany({ orderBy: { createdAt: 'desc' } });
    const normalized = await Promise.all(items.map((item) => normalizeMemberWinCapDay(fastify.prisma, item)));
    return {
      items: normalized.map((item) => ({
        ...item,
        isCapped: item.todayWinAmount.greaterThanOrEqualTo(item.winCapAmount),
      })),
    };
  });

  fastify.post(
    '/win-cap',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = winCapControlSchema.parse(req.body);
      const member = await fastify.prisma.user.findUnique({ where: { id: body.memberId } });
      if (!member?.agentId) {
        reply.code(400).send({ code: 'INVALID_ACTION', message: 'Member has no agent' });
        return;
      }
      const created = await fastify.prisma.memberWinCapControl.upsert({
        where: { memberUsername: body.memberUsername },
        create: {
          memberId: body.memberId,
          memberUsername: body.memberUsername,
          agentId: member.agentId,
          winCapAmount: new Prisma.Decimal(body.winCapAmount),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          currentGameDay: getControlGameDay(),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
        update: {
          winCapAmount: new Prisma.Decimal(body.winCapAmount),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
          isActive: true,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_cap.upsert',
        targetType: 'control',
        targetId: created.id,
        newValues: { memberUsername: body.memberUsername, winCapAmount: body.winCapAmount },
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/win-cap/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.memberWinCapControl.update({ where: { id }, data: { isActive } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_cap.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/win-cap/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.memberWinCapControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.win_cap.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get('/deposit', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.memberDepositControl.findMany({ orderBy: { createdAt: 'desc' } });
    return { items };
  });

  fastify.post(
    '/deposit',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = depositControlSchema.parse(req.body);
      const member = await fastify.prisma.user.findUnique({ where: { id: body.memberId } });
      if (!member?.agentId) {
        reply.code(400).send({ code: 'INVALID_ACTION', message: 'Member has no agent' });
        return;
      }
      const created = await fastify.prisma.memberDepositControl.create({
        data: {
          memberId: body.memberId,
          memberUsername: body.memberUsername,
          agentId: member.agentId,
          depositAmount: new Prisma.Decimal(body.depositAmount),
          targetProfit: new Prisma.Decimal(body.targetProfit),
          startBalance: new Prisma.Decimal(body.startBalance),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.deposit.create',
        targetType: 'control',
        targetId: created.id,
        newValues: body,
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/deposit/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.memberDepositControl.update({ where: { id }, data: { isActive } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.deposit.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/deposit/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.memberDepositControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.deposit.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get('/agent-line', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.agentLineWinCap.findMany({ orderBy: { createdAt: 'desc' } });
    const normalized = await Promise.all(items.map((item) => normalizeAgentLineCapDay(fastify.prisma, item)));
    return {
      items: normalized.map((item) => ({
        ...item,
        isCapped: item.todayWinAmount.greaterThanOrEqualTo(item.dailyCap),
      })),
    };
  });

  fastify.post(
    '/agent-line',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = agentLineControlSchema.parse(req.body);
      const created = await fastify.prisma.agentLineWinCap.upsert({
        where: { agentId: body.agentId },
        create: {
          agentId: body.agentId,
          agentUsername: body.agentUsername,
          dailyCap: new Prisma.Decimal(body.dailyCap),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          currentGameDay: getControlGameDay(),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
        update: {
          dailyCap: new Prisma.Decimal(body.dailyCap),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
          isActive: true,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.upsert',
        targetType: 'control',
        targetId: created.id,
        newValues: body,
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/agent-line/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleSchema.parse(req.body);
      const updated = await fastify.prisma.agentLineWinCap.update({ where: { id }, data: { isActive } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.toggle',
        targetType: 'control',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/agent-line/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.agentLineWinCap.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );

  fastify.get('/manual-detection/status', { preHandler: [fastify.authenticateAdmin] }, async () => {
    await checkAndCompleteManualDetectionControls(fastify.prisma);
    const items = await getAllActiveManualDetectionControls(fastify.prisma);
    const serialized = await Promise.all(items.map((item) => serializeManualControl(fastify, item)));
    return {
      items: serialized,
      activeControls: serialized,
      isActive: serialized.length > 0,
      totalActive: serialized.length,
    };
  });

  fastify.get('/manual-detection/history', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.manualDetectionControl.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const serialized = await Promise.all(items.map((item) => serializeManualControl(fastify, item)));
    return { items: serialized, total: serialized.length };
  });

  fastify.get('/manual-detection/settlement', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const query = manualDetectionQuerySchema.parse(req.query);
    const settlement = await calculateCurrentSettlement(
      fastify.prisma,
      query.scope as ManualDetectionScope,
      query.agentId,
      query.memberUsername,
    );
    return serializeSettlement(settlement);
  });

  fastify.post(
    '/manual-detection/activate',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = manualDetectionControlSchema.parse(req.body);

      let targetAgentId = body.targetAgentId ?? null;
      let targetAgentUsername = body.targetAgentUsername ?? null;
      let targetMemberId = body.targetMemberId ?? null;
      let targetMemberUsername = body.targetMemberUsername ?? null;

      if (body.scope === 'AGENT_LINE') {
        const agent = await fastify.prisma.agent.findUnique({
          where: { id: targetAgentId ?? undefined },
          select: { id: true, username: true },
        });
        if (!agent) {
          reply.code(404).send({ code: 'AGENT_NOT_FOUND', message: 'Agent not found' });
          return;
        }
        targetAgentId = agent.id;
        targetAgentUsername = agent.username;
      }

      if (body.scope === 'MEMBER') {
        const member = targetMemberId
          ? await fastify.prisma.user.findUnique({
              where: { id: targetMemberId },
              select: { id: true, username: true },
            })
          : await fastify.prisma.user.findUnique({
              where: { username: targetMemberUsername ?? undefined },
              select: { id: true, username: true },
            });
        if (!member) {
          reply.code(404).send({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
          return;
        }
        targetMemberId = member.id;
        targetMemberUsername = member.username;
      }

      const settlement = await calculateCurrentSettlement(
        fastify.prisma,
        body.scope as ManualDetectionScope,
        targetAgentId,
        targetMemberUsername,
      );

      const existing = await fastify.prisma.manualDetectionControl.findFirst({
        where:
          body.scope === 'ALL'
            ? { scope: 'ALL', isActive: true }
            : body.scope === 'AGENT_LINE'
              ? { scope: 'AGENT_LINE', targetAgentId, isActive: true }
              : { scope: 'MEMBER', targetMemberUsername, isActive: true },
        orderBy: { createdAt: 'desc' },
      });

      const data = {
        scope: body.scope as ManualDetectionScope,
        targetAgentId,
        targetAgentUsername,
        targetMemberId,
        targetMemberUsername,
        targetSettlement: decimal(body.targetSettlement).toDecimalPlaces(2),
        controlPercentage: body.controlPercentage,
        startSettlement: settlement.superiorSettlement.toDecimalPlaces(2),
        isActive: true,
        isCompleted: false,
        completedAt: null,
        completionSettlement: null,
        operatorId: req.admin.id,
        operatorUsername: req.admin.username,
      };

      const record = existing
        ? await fastify.prisma.manualDetectionControl.update({
            where: { id: existing.id },
            data,
          })
        : await fastify.prisma.manualDetectionControl.create({ data });

      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: existing ? 'control.manual_detection.update' : 'control.manual_detection.create',
        targetType: 'control',
        targetId: record.id,
        newValues: {
          scope: record.scope,
          targetAgentId: record.targetAgentId,
          targetMemberUsername: record.targetMemberUsername,
          targetSettlement: record.targetSettlement.toFixed(2),
          controlPercentage: record.controlPercentage,
          startSettlement: record.startSettlement?.toFixed(2) ?? null,
        },
        req,
      });

      reply.code(existing ? 200 : 201).send(await serializeManualControl(fastify, record));
    },
  );

  fastify.post(
    '/manual-detection/deactivate',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = deactivateManualDetectionSchema.parse(req.body);
      if (id) {
        const updated = await fastify.prisma.manualDetectionControl.update({
          where: { id },
          data: { isActive: false },
        });
        await writeAudit(fastify.prisma, {
          actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
          action: 'control.manual_detection.deactivate',
          targetType: 'control',
          targetId: id,
          req,
        });
        return updated;
      }

      await fastify.prisma.manualDetectionControl.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.manual_detection.deactivate_all',
        targetType: 'control',
        req,
      });
      return { success: true };
    },
  );

  fastify.post(
    '/manual-detection/:id/reactivate',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const record = await fastify.prisma.manualDetectionControl.findUnique({ where: { id } });
      if (!record) {
        reply.code(404).send({ code: 'CONTROL_NOT_FOUND', message: 'Control not found' });
        return;
      }

      const conflict = await fastify.prisma.manualDetectionControl.findFirst({
        where:
          record.scope === 'ALL'
            ? { id: { not: id }, scope: 'ALL', isActive: true }
            : record.scope === 'AGENT_LINE'
              ? { id: { not: id }, scope: 'AGENT_LINE', targetAgentId: record.targetAgentId, isActive: true }
              : { id: { not: id }, scope: 'MEMBER', targetMemberUsername: record.targetMemberUsername, isActive: true },
      });
      if (conflict) {
        reply.code(400).send({ code: 'CONTROL_CONFLICT', message: 'Same-scope control is already active' });
        return;
      }

      const updated = await fastify.prisma.manualDetectionControl.update({
        where: { id },
        data: {
          isActive: true,
          isCompleted: false,
          completedAt: null,
          completionSettlement: null,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.manual_detection.reactivate',
        targetType: 'control',
        targetId: id,
        req,
      });
      return serializeManualControl(fastify, updated);
    },
  );

  fastify.delete(
    '/manual-detection/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.manualDetectionControl.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.manual_detection.delete',
        targetType: 'control',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );
}
