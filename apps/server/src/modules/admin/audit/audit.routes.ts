import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { listAgentDescendants } from '../../../utils/hierarchy.js';
import type { AuditEntry } from '@bg/shared';
import type { Prisma } from '@prisma/client';

const querySchema = z.object({
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  actorId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function auditRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const q = querySchema.parse(req.query);
    const limit = q.limit ?? 50;

    const where: Prisma.AuditLogWhereInput = {};
    if (q.action) where.action = q.action;
    if (q.targetType) where.targetType = q.targetType;
    if (q.targetId) where.targetId = q.targetId;
    if (q.actorId) where.actorId = q.actorId;
    if (q.startDate) where.createdAt = { ...(where.createdAt as object), gte: new Date(q.startDate) };
    if (q.endDate) where.createdAt = { ...(where.createdAt as object), lte: new Date(q.endDate) };

    // 非 super 限制：actor 必須在自己 + 下級代理樹內
    if (req.admin.role !== 'SUPER_ADMIN') {
      const scope = await listAgentDescendants(fastify.prisma, req.admin.id);
      where.actorId = { in: scope };
    }

    const rows = await fastify.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items: AuditEntry[] = page.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorType: r.actorType,
      actorUsername: r.actorUsername,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      oldValues: r.oldValues,
      newValues: r.newValues,
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    }));
    return { items, nextCursor: hasMore ? page[page.length - 1]!.id : null };
  });
}
