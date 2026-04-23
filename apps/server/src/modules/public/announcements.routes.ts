import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const querySchema = z.object({
  kind: z.enum(['marquee', 'popup']).optional(),
});

export async function publicAnnouncementRoutes(fastify: FastifyInstance): Promise<void> {
  // 公開 API — 不需 auth；只回啟用且時間範圍內的公告
  fastify.get('/announcements', async (req) => {
    const q = querySchema.parse(req.query);
    const now = new Date();

    const where: Prisma.AnnouncementWhereInput = {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    };
    if (q.kind) where.kind = q.kind;

    const rows = await fastify.prisma.announcement.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      items: rows.map((r) => ({
        id: r.id,
        content: r.content,
        priority: r.priority,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });
}
