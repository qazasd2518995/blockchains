import type { FastifyInstance } from 'fastify';
import {
  createAnnouncementSchema,
  updateAnnouncementSchema,
  toggleAnnouncementSchema,
} from './announcement.schema.js';
import { writeAudit } from '../audit/audit.service.js';

/**
 * 公告管理 CRUD（僅 super-admin 可建立/改/刪；所有已登入代理可讀）。
 * 所有 mutation 都寫 AuditLog。
 */
export async function announcementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async () => {
    const items = await fastify.prisma.announcement.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    return { items };
  });

  fastify.post(
    '/',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const body = createAnnouncementSchema.parse(req.body);
      const created = await fastify.prisma.announcement.create({
        data: {
          content: body.content,
          kind: body.kind,
          priority: body.priority,
          isActive: body.isActive,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          createdBy: req.admin.username,
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'announcement.create',
        targetType: 'announcement',
        targetId: created.id,
        newValues: {
          content: created.content,
          kind: created.kind,
          priority: created.priority,
          isActive: created.isActive,
        },
        req,
      });
      reply.code(201).send(created);
    },
  );

  fastify.patch(
    '/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = updateAnnouncementSchema.parse(req.body);
      const existing = await fastify.prisma.announcement.findUnique({ where: { id } });
      if (!existing) {
        throw new Error('Announcement not found');
      }
      const updated = await fastify.prisma.announcement.update({
        where: { id },
        data: {
          ...(body.content !== undefined ? { content: body.content } : {}),
          ...(body.kind !== undefined ? { kind: body.kind } : {}),
          ...(body.priority !== undefined ? { priority: body.priority } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.startsAt !== undefined
            ? { startsAt: body.startsAt ? new Date(body.startsAt) : null }
            : {}),
          ...(body.endsAt !== undefined
            ? { endsAt: body.endsAt ? new Date(body.endsAt) : null }
            : {}),
        },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'announcement.update',
        targetType: 'announcement',
        targetId: id,
        oldValues: {
          content: existing.content,
          kind: existing.kind,
          priority: existing.priority,
          isActive: existing.isActive,
        },
        newValues: {
          content: updated.content,
          kind: updated.kind,
          priority: updated.priority,
          isActive: updated.isActive,
        },
        req,
      });
      return updated;
    },
  );

  fastify.patch(
    '/:id/toggle',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req) => {
      const { id } = req.params as { id: string };
      const { isActive } = toggleAnnouncementSchema.parse(req.body);
      const updated = await fastify.prisma.announcement.update({
        where: { id },
        data: { isActive },
      });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'announcement.toggle',
        targetType: 'announcement',
        targetId: id,
        newValues: { isActive },
        req,
      });
      return updated;
    },
  );

  fastify.delete(
    '/:id',
    { preHandler: [fastify.authenticateAdmin, fastify.requireSuperAdmin] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await fastify.prisma.announcement.delete({ where: { id } });
      await writeAudit(fastify.prisma, {
        actor: { id: req.admin.id, type: 'super_admin', username: req.admin.username },
        action: 'announcement.delete',
        targetType: 'announcement',
        targetId: id,
        req,
      });
      reply.code(204).send();
    },
  );
}
