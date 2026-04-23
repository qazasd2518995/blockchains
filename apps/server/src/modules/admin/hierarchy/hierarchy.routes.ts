import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canManageAgent } from '../../../utils/hierarchy.js';
import type { Prisma } from '@prisma/client';

const querySchema = z.object({
  parentId: z.string().optional(),   // 目標代理；不填 = 自己
  keyword: z.string().optional(),
  status: z.enum(['ACTIVE', 'FROZEN']).optional(),
});

export async function hierarchyRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/admin/hierarchy
   * 回傳某 agent 的直屬子代理 + 直屬會員（混合列表）
   */
  fastify.get('/', { preHandler: [fastify.authenticateAdmin] }, async (req) => {
    const q = querySchema.parse(req.query);
    const parentId = q.parentId ?? req.admin.id;

    const ok = await canManageAgent(fastify.prisma, req.admin, parentId);
    if (!ok) {
      return { parent: null, items: [], stats: { agentCount: 0, memberCount: 0 } };
    }

    const parent = await fastify.prisma.agent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        username: true,
        displayName: true,
        level: true,
        marketType: true,
        balance: true,
        rebatePercentage: true,
        role: true,
        status: true,
        parentId: true,
      },
    });
    if (!parent) return { parent: null, items: [], stats: { agentCount: 0, memberCount: 0 } };

    // breadcrumb: 從 parent 沿 parentId 往上爬
    const breadcrumb: {
      id: string;
      username: string;
      level: number;
    }[] = [];
    let cursor: { id: string; parentId: string | null } | null = { id: parent.id, parentId: parent.parentId };
    while (cursor) {
      const a: {
        id: string;
        username: string;
        level: number;
        parentId: string | null;
      } | null = await fastify.prisma.agent.findUnique({
        where: { id: cursor.id },
        select: { id: true, username: true, level: true, parentId: true },
      });
      if (!a) break;
      breadcrumb.unshift({ id: a.id, username: a.username, level: a.level });
      cursor = a.parentId ? { id: a.parentId, parentId: null } : null;
    }

    const agentWhere: Prisma.AgentWhereInput = {
      parentId,
      status: { not: 'DELETED' },
    };
    const memberWhere: Prisma.UserWhereInput = {
      agentId: parentId,
    };
    if (q.status === 'FROZEN') {
      agentWhere.status = 'FROZEN';
      memberWhere.frozenAt = { not: null };
    } else if (q.status === 'ACTIVE') {
      agentWhere.status = 'ACTIVE';
      memberWhere.frozenAt = null;
    }
    if (q.keyword) {
      agentWhere.OR = [
        { username: { contains: q.keyword, mode: 'insensitive' } },
        { displayName: { contains: q.keyword, mode: 'insensitive' } },
      ];
      memberWhere.OR = [
        { username: { contains: q.keyword, mode: 'insensitive' } },
        { displayName: { contains: q.keyword, mode: 'insensitive' } },
      ];
    }

    const [agents, members] = await Promise.all([
      fastify.prisma.agent.findMany({
        where: agentWhere,
        orderBy: { createdAt: 'asc' },
      }),
      fastify.prisma.user.findMany({
        where: memberWhere,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // 聚合每個 agent 的 child / member 數量
    const childCountsRaw = agents.length > 0
      ? await fastify.prisma.agent.groupBy({
          by: ['parentId'],
          where: { parentId: { in: agents.map((a) => a.id) } },
          _count: { _all: true },
        })
      : [];
    const memberCountsRaw = agents.length > 0
      ? await fastify.prisma.user.groupBy({
          by: ['agentId'],
          where: { agentId: { in: agents.map((a) => a.id) } },
          _count: { _all: true },
        })
      : [];
    const childCountMap = new Map<string, number>(
      childCountsRaw.map((x) => [x.parentId ?? '', x._count._all]),
    );
    const memberCountMap = new Map<string, number>(
      memberCountsRaw.map((x) => [x.agentId ?? '', x._count._all]),
    );

    type MixedRow =
      | {
          kind: 'agent';
          id: string;
          username: string;
          displayName: string | null;
          level: number;
          marketType: 'D' | 'A';
          balance: string;
          rebatePercentage: string;
          bettingLimitLevel: string;
          status: 'ACTIVE' | 'FROZEN' | 'DELETED';
          role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
          createdAt: string;
          childCount: number;
          memberCount: number;
          notes: string | null;
        }
      | {
          kind: 'member';
          id: string;
          username: string;
          displayName: string | null;
          level: null;
          marketType: 'D' | 'A';
          balance: string;
          bettingLimitLevel: string;
          status: 'ACTIVE' | 'FROZEN';
          frozenAt: string | null;
          notes: string | null;
          createdAt: string;
        };

    const items: MixedRow[] = [
      ...agents.map((a): MixedRow => ({
        kind: 'agent',
        id: a.id,
        username: a.username,
        displayName: a.displayName,
        level: a.level,
        marketType: a.marketType,
        balance: a.balance.toFixed(2),
        rebatePercentage: a.rebatePercentage.toFixed(4),
        bettingLimitLevel: a.bettingLimitLevel,
        status: a.status,
        role: a.role,
        createdAt: a.createdAt.toISOString(),
        childCount: childCountMap.get(a.id) ?? 0,
        memberCount: memberCountMap.get(a.id) ?? 0,
        notes: a.notes,
      })),
      ...members.map((m): MixedRow => ({
        kind: 'member',
        id: m.id,
        username: m.username,
        displayName: m.displayName,
        level: null,
        marketType: m.marketType,
        balance: m.balance.toFixed(2),
        bettingLimitLevel: m.bettingLimitLevel,
        status: m.frozenAt ? 'FROZEN' : 'ACTIVE',
        frozenAt: m.frozenAt?.toISOString() ?? null,
        notes: m.notes,
        createdAt: m.createdAt.toISOString(),
      })),
    ];

    return {
      parent: {
        id: parent.id,
        username: parent.username,
        displayName: parent.displayName,
        level: parent.level,
        marketType: parent.marketType,
        balance: parent.balance.toFixed(2),
        rebatePercentage: parent.rebatePercentage.toFixed(4),
        role: parent.role,
        status: parent.status,
        parentId: parent.parentId,
      },
      breadcrumb,
      items,
      stats: {
        agentCount: agents.length,
        memberCount: members.length,
      },
    };
  });
}
