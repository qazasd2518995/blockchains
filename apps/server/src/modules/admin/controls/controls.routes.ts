import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  winLossControlSchema,
  winCapControlSchema,
  depositControlSchema,
  agentLineControlSchema,
  toggleSchema,
} from './controls.schema.js';
import { writeAudit } from '../audit/audit.service.js';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 控制表 CRUD（僅 super-admin 可建立/改）。
 * 所有 mutation 都寫 AuditLog。
 */
export async function controlRoutes(fastify: FastifyInstance): Promise<void> {
  // === WinLossControl ===
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

  // === WinCapControl ===
  fastify.get('/win-cap', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.memberWinCapControl.findMany({ orderBy: { createdAt: 'desc' } });
    return { items };
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
      // memberUsername @unique — 用 upsert 避免第二次提交拋 Prisma raw 錯誤
      const created = await fastify.prisma.memberWinCapControl.upsert({
        where: { memberUsername: body.memberUsername },
        create: {
          memberId: body.memberId,
          memberUsername: body.memberUsername,
          agentId: member.agentId,
          winCapAmount: new Prisma.Decimal(body.winCapAmount),
          controlWinRate: new Prisma.Decimal(body.controlWinRate),
          triggerThreshold: new Prisma.Decimal(body.triggerThreshold),
          currentGameDay: todayString(),
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

  // === DepositControl ===
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

  // === AgentLineWinCap ===
  fastify.get('/agent-line', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.agentLineWinCap.findMany({ orderBy: { createdAt: 'desc' } });
    return { items };
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
          currentGameDay: todayString(),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
        },
        update: {
          dailyCap: new Prisma.Decimal(body.dailyCap),
          notes: body.notes ?? null,
          operatorUsername: req.admin.username,
          isActive: true,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'control.agent_line.create',
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
}
