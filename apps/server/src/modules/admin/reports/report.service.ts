import { PrismaClient, Prisma } from '@prisma/client';
import { ApiError } from '../../../utils/errors.js';
import { listAgentDescendants, canManageAgent } from '../../../utils/hierarchy.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import type { ReportQuery, AgentAnalysisQuery } from './report.schema.js';

/**
 * 報表聚合服務
 *
 * 概念（沿用 agentBackend.js 的邏輯）：
 * - getDownlineMembers: 回傳某 agent 的所有下級會員 id
 * - listBets: 依日期/遊戲/代理範圍列出下注
 * - agentAnalysis: 針對某根 agent 的直屬子代理逐一聚合 bet 量 + 退水 + 交收
 *
 * 所有金額以 string (Decimal) 回傳。
 */
export class ReportService {
  constructor(private readonly prisma: PrismaClient) {}

  /** 取 agent 下屬（含自己）所有 agent id 的會員 id 清單 */
  async getDownlineMembers(agentId: string): Promise<string[]> {
    const agentIds = await listAgentDescendants(this.prisma, agentId);
    if (agentIds.length === 0) return [];
    const members = await this.prisma.user.findMany({
      where: { agentId: { in: agentIds } },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  /** 下注列表（依下級樹限制） */
  async listBets(
    operator: AdminCurrent,
    query: ReportQuery,
  ): Promise<{
    items: BetReportRow[];
    nextCursor: string | null;
    totals: {
      betCount: number;
      betAmount: string;
      memberWinLoss: string;
    };
  }> {
    const scopeAgentId = query.agentId ?? operator.id;
    if (query.agentId) {
      const ok = await canManageAgent(this.prisma, operator, query.agentId);
      if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this agent report');
    }

    const memberIds = operator.role === 'SUPER_ADMIN' && !query.agentId
      ? null
      : await this.getDownlineMembers(scopeAgentId);

    const limit = query.limit ?? 100;
    const where: Prisma.BetWhereInput = {};
    if (memberIds) where.userId = { in: memberIds };
    if (query.gameId) where.gameId = query.gameId;
    if (query.startDate) where.createdAt = { ...(where.createdAt as object), gte: new Date(query.startDate) };
    if (query.endDate) where.createdAt = { ...(where.createdAt as object), lte: new Date(query.endDate) };

    const rows = await this.prisma.bet.findMany({
      where,
      include: {
        user: { select: { username: true, agentId: true, agent: { select: { username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // 聚合用 aggregate（取全部，不含 cursor 分頁）
    const agg = await this.prisma.bet.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true, profit: true },
    });

    return {
      items: page.map((b) => ({
        id: b.id,
        gameId: b.gameId,
        memberUsername: b.user.username,
        agentUsername: b.user.agent?.username ?? null,
        amount: b.amount.toFixed(2),
        multiplier: b.multiplier.toFixed(4),
        payout: b.payout.toFixed(2),
        profit: b.profit.toFixed(2),
        createdAt: b.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      totals: {
        betCount: agg._count._all,
        betAmount: (agg._sum.amount ?? new Prisma.Decimal(0)).toFixed(2),
        memberWinLoss: (agg._sum.profit ?? new Prisma.Decimal(0)).toFixed(2),
      },
    };
  }

  /**
   * 代理分析 — 針對根 agent 的所有直屬子代理逐一聚合
   * - 每個 child 的統計來自「該 child 及其所有下屬代理下的所有會員」
   * - 退水 = member.bet.amount * (root.rebate - child.rebate)  <- earned by root from this subtree
   */
  async agentAnalysis(
    operator: AdminCurrent,
    query: AgentAnalysisQuery,
  ): Promise<{
    root: AgentAnalysisRow;
    children: AgentAnalysisRow[];
  }> {
    const rootId = query.rootAgentId ?? operator.id;
    const ok = await canManageAgent(this.prisma, operator, rootId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this subtree');

    const root = await this.prisma.agent.findUnique({ where: { id: rootId } });
    if (!root) throw new ApiError('AGENT_NOT_FOUND', 'Root agent not found');

    const children = await this.prisma.agent.findMany({
      where: { parentId: rootId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'asc' },
    });

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const gameId = query.gameId;

    const rootStats = await this.aggregateAgentSubtree(
      root,
      startDate,
      endDate,
      gameId,
      undefined,
      undefined,
    );
    const childStats = await Promise.all(
      children.map((c) =>
        this.aggregateAgentSubtree(
          c,
          startDate,
          endDate,
          gameId,
          root.rebatePercentage,
          root.commissionRate,
        ),
      ),
    );

    return {
      root: {
        agentId: root.id,
        username: root.username,
        level: root.level,
        rebatePercentage: root.rebatePercentage.toFixed(4),
        balance: root.balance.toFixed(2),
        ...rootStats,
      },
      children: children.map((c, i) => ({
        agentId: c.id,
        username: c.username,
        level: c.level,
        rebatePercentage: c.rebatePercentage.toFixed(4),
        balance: c.balance.toFixed(2),
        ...childStats[i]!,
      })),
    };
  }

  /**
   * 混合階層報表：回傳某 agent 的直屬代理 + 直屬會員各自的聚合指標。
   * agent 的聚合是整個子樹；member 的聚合是自己的下注記錄。
   * 用於前端「點代理下鑽、點會員看下注」的混合階層視圖。
   */
  async hierarchyAnalysis(
    operator: AdminCurrent,
    query: {
      parentId?: string;
      startDate?: string;
      endDate?: string;
      gameId?: string;
    },
  ): Promise<{
    parent: {
      id: string;
      username: string;
      level: number;
      rebatePercentage: string;
      commissionRate: string;
      balance: string;
      parentId: string | null;
    };
    breadcrumb: { id: string; username: string; level: number }[];
    items: HierarchyReportRow[];
    totals: {
      betCount: number;
      betAmount: string;
      validAmount: string;
      memberWinLoss: string;
      totalRebateAmount: string;
      memberProfitLossResult: string;
      receivableFromDownline: string;
      commissionAmount: string;
      earnedRebateAmount: string;
      profitLossResult: string;
      volumeRemitted: string;
      uplineSettlement: string;
    };
  }> {
    const parentId = query.parentId ?? operator.id;
    const ok = await canManageAgent(this.prisma, operator, parentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this subtree');

    const parent = await this.prisma.agent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        username: true,
        level: true,
        rebatePercentage: true,
        commissionRate: true,
        balance: true,
        parentId: true,
      },
    });
    if (!parent) throw new ApiError('AGENT_NOT_FOUND', 'Parent agent not found');

    // breadcrumb 從 parent 沿 parentId 向上
    const breadcrumb: { id: string; username: string; level: number }[] = [];
    let cursor: string | null = parent.id;
    while (cursor) {
      const a: {
        id: string;
        username: string;
        level: number;
        parentId: string | null;
      } | null = await this.prisma.agent.findUnique({
        where: { id: cursor },
        select: { id: true, username: true, level: true, parentId: true },
      });
      if (!a) break;
      breadcrumb.unshift({ id: a.id, username: a.username, level: a.level });
      cursor = a.parentId;
    }

    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    const gameId = query.gameId;

    const childAgents = await this.prisma.agent.findMany({
      where: { parentId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'asc' },
    });
    const directMembers = await this.prisma.user.findMany({
      where: { agentId: parentId },
      orderBy: { createdAt: 'asc' },
    });

    const agentRows: HierarchyReportRow[] = await Promise.all(
      childAgents.map(async (c) => {
        const stats = await this.aggregateAgentSubtree(
          c,
          startDate,
          endDate,
          gameId,
          parent.rebatePercentage,
          parent.commissionRate,
        );
        return {
          kind: 'agent' as const,
          id: c.id,
          username: c.username,
          displayName: c.displayName,
          level: c.level,
          rebatePercentage: c.rebatePercentage.toFixed(4),
          status: c.status,
          role: c.role,
          notes: c.notes,
          ...stats,
          balance: c.balance.toFixed(2),
        };
      }),
    );

    const memberRows: HierarchyReportRow[] = await Promise.all(
      directMembers.map(async (m) => {
        const where: Prisma.BetWhereInput = { userId: m.id };
        if (startDate) where.createdAt = { ...(where.createdAt as object), gte: startDate };
        if (endDate) where.createdAt = { ...(where.createdAt as object), lte: endDate };
        if (gameId) where.gameId = gameId;
        const agg = await this.prisma.bet.aggregate({
          where,
          _count: { _all: true },
          _sum: { amount: true, profit: true, payout: true },
        });
        const betAmount = agg._sum.amount ?? new Prisma.Decimal(0);
        const validAmount = betAmount;
        const profit = agg._sum.profit ?? new Prisma.Decimal(0);
        const payout = agg._sum.payout ?? new Prisma.Decimal(0);
        const totalRebatePct = parent.rebatePercentage; // 直屬會員的退水 = 所屬代理的退水%
        const totalRebateAmt = betAmount.mul(totalRebatePct);
        const commissionRate = parent.commissionRate;
        const commissionAmt = profit.neg().mul(commissionRate);
        const receivable = profit.neg();
        // 會員不會「賺取退水」給 parent（parent 自己就是最後一站），差異 = 0
        const earnedPct = new Prisma.Decimal(0);
        const earnedAmt = new Prisma.Decimal(0);
        const volumeRemitted = new Prisma.Decimal(0);
        const uplineSettle = profit.neg().mul(commissionRate).add(totalRebateAmt);
        return {
          kind: 'member' as const,
          id: m.id,
          username: m.username,
          displayName: m.displayName,
          level: null,
          rebatePercentage: '0.0000',
          status: m.frozenAt ? 'FROZEN' : 'ACTIVE',
          notes: m.notes,
          balance: m.balance.toFixed(2),
          memberCount: 0,
          betCount: agg._count._all,
          betAmount: betAmount.toFixed(2),
          validAmount: validAmount.toFixed(2),
          memberWinLoss: profit.toFixed(2),
          payout: payout.toFixed(2),
          totalRebatePercentage: totalRebatePct.toFixed(4),
          totalRebateAmount: totalRebateAmt.toFixed(2),
          memberProfitLossResult: profit.neg().add(totalRebateAmt).toFixed(2),
          receivableFromDownline: receivable.toFixed(2),
          commissionPercentage: commissionRate.toFixed(4),
          commissionAmount: commissionAmt.toFixed(2),
          commissionResult: commissionAmt.toFixed(2),
          earnedRebatePercentage: earnedPct.toFixed(4),
          earnedRebateAmount: earnedAmt.toFixed(2),
          profitLossResult: commissionAmt.toFixed(2),
          volumeRemitted: volumeRemitted.toFixed(2),
          uplineSettlement: uplineSettle.toFixed(2),
        };
      }),
    );

    const items = [...agentRows, ...memberRows];
    const totals = items.reduce(
      (acc, r) => {
        acc.betCount += r.betCount;
        acc.betAmount = acc.betAmount.add(new Prisma.Decimal(r.betAmount));
        acc.validAmount = acc.validAmount.add(new Prisma.Decimal(r.validAmount));
        acc.memberWinLoss = acc.memberWinLoss.add(new Prisma.Decimal(r.memberWinLoss));
        acc.totalRebateAmount = acc.totalRebateAmount.add(new Prisma.Decimal(r.totalRebateAmount));
        acc.memberProfitLossResult = acc.memberProfitLossResult.add(new Prisma.Decimal(r.memberProfitLossResult));
        acc.receivableFromDownline = acc.receivableFromDownline.add(new Prisma.Decimal(r.receivableFromDownline));
        acc.commissionAmount = acc.commissionAmount.add(new Prisma.Decimal(r.commissionAmount));
        acc.earnedRebateAmount = acc.earnedRebateAmount.add(new Prisma.Decimal(r.earnedRebateAmount));
        acc.profitLossResult = acc.profitLossResult.add(new Prisma.Decimal(r.profitLossResult));
        acc.volumeRemitted = acc.volumeRemitted.add(new Prisma.Decimal(r.volumeRemitted));
        acc.uplineSettlement = acc.uplineSettlement.add(new Prisma.Decimal(r.uplineSettlement));
        return acc;
      },
      {
        betCount: 0,
        betAmount: new Prisma.Decimal(0),
        validAmount: new Prisma.Decimal(0),
        memberWinLoss: new Prisma.Decimal(0),
        totalRebateAmount: new Prisma.Decimal(0),
        memberProfitLossResult: new Prisma.Decimal(0),
        receivableFromDownline: new Prisma.Decimal(0),
        commissionAmount: new Prisma.Decimal(0),
        earnedRebateAmount: new Prisma.Decimal(0),
        profitLossResult: new Prisma.Decimal(0),
        volumeRemitted: new Prisma.Decimal(0),
        uplineSettlement: new Prisma.Decimal(0),
      },
    );

    return {
      parent: {
        id: parent.id,
        username: parent.username,
        level: parent.level,
        rebatePercentage: parent.rebatePercentage.toFixed(4),
        commissionRate: parent.commissionRate.toFixed(4),
        balance: parent.balance.toFixed(2),
        parentId: parent.parentId,
      },
      breadcrumb,
      items,
      totals: {
        betCount: totals.betCount,
        betAmount: totals.betAmount.toFixed(2),
        validAmount: totals.validAmount.toFixed(2),
        memberWinLoss: totals.memberWinLoss.toFixed(2),
        totalRebateAmount: totals.totalRebateAmount.toFixed(2),
        memberProfitLossResult: totals.memberProfitLossResult.toFixed(2),
        receivableFromDownline: totals.receivableFromDownline.toFixed(2),
        commissionAmount: totals.commissionAmount.toFixed(2),
        earnedRebateAmount: totals.earnedRebateAmount.toFixed(2),
        profitLossResult: totals.profitLossResult.toFixed(2),
        volumeRemitted: totals.volumeRemitted.toFixed(2),
        uplineSettlement: totals.uplineSettlement.toFixed(2),
      },
    };
  }

  /**
   * 內部：聚合某 agent 子樹（含 agent 自己直屬會員）的 bet 統計
   * 回傳 18 欄報表所需的全部數值
   */
  private async aggregateAgentSubtree(
    agent: {
      id: string;
      rebatePercentage: Prisma.Decimal;
      commissionRate: Prisma.Decimal;
    },
    startDate?: Date,
    endDate?: Date,
    gameId?: string,
    parentRebate?: Prisma.Decimal,
    parentCommission?: Prisma.Decimal,
  ): Promise<AgentSubtreeStats> {
    const agentIds = await listAgentDescendants(this.prisma, agent.id);
    const members = await this.prisma.user.findMany({
      where: { agentId: { in: agentIds } },
      select: { id: true },
    });
    if (members.length === 0) {
      return emptyStats(parentRebate, parentCommission, agent);
    }
    const memberIds = members.map((m) => m.id);

    const where: Prisma.BetWhereInput = { userId: { in: memberIds } };
    if (startDate) where.createdAt = { ...(where.createdAt as object), gte: startDate };
    if (endDate) where.createdAt = { ...(where.createdAt as object), lte: endDate };
    if (gameId) where.gameId = gameId;

    const agg = await this.prisma.bet.aggregate({
      where,
      _count: { _all: true },
      _sum: { amount: true, profit: true, payout: true },
    });

    const betAmount = agg._sum.amount ?? new Prisma.Decimal(0);
    const validAmount = betAmount; // 本平台目前沒有無效注概念 → 有效 = 下注
    const memberWinLoss = agg._sum.profit ?? new Prisma.Decimal(0); // 會員盈虧（正=會員贏）
    const payout = agg._sum.payout ?? new Prisma.Decimal(0);

    // 退水% = 此層的 rebatePercentage（會員下注產生的退水總池）
    const totalRebatePct = agent.rebatePercentage;
    const totalRebateAmt = betAmount.mul(totalRebatePct);

    // 賺取退水% = parent.rebate - self.rebate（此子樹對 parent 的退水貢獻率）
    const earnedRebatePct = parentRebate ? parentRebate.sub(agent.rebatePercentage) : agent.rebatePercentage;
    const earnedRebateAmount = betAmount.mul(earnedRebatePct);

    // 佔成% = 此層的 commissionRate
    const commissionRate = agent.commissionRate;
    // 佔成金額 = 會員輸贏 × 佔成%  (正=代理賺會員的)
    const commissionAmount = memberWinLoss.neg().mul(commissionRate);

    // 應收下線 = 會員虧損 = -memberWinLoss
    const receivableFromDownline = memberWinLoss.neg();

    // 本級盈虧結果 = 佔成金額 + 賺取退水
    const profitLossResult = commissionAmount.add(earnedRebateAmount);

    // 上交貨量 = 下注金額 × (parent.commissionRate - self.commissionRate)
    // 若是 root（沒 parent）= 0
    const commissionDiff = parentCommission ? parentCommission.sub(commissionRate) : new Prisma.Decimal(0);
    const volumeRemitted = betAmount.mul(commissionDiff);

    // 上級交收 = parent 從此子樹收到的：memberLoss × parentCommission + 退水差
    const uplineSettlement = memberWinLoss
      .neg()
      .mul(parentCommission ?? new Prisma.Decimal(0))
      .add(earnedRebateAmount);

    return {
      betCount: agg._count._all,
      betAmount: betAmount.toFixed(2),
      validAmount: validAmount.toFixed(2),
      memberWinLoss: memberWinLoss.toFixed(2),
      payout: payout.toFixed(2),
      totalRebatePercentage: totalRebatePct.toFixed(4),
      totalRebateAmount: totalRebateAmt.toFixed(2),
      memberProfitLossResult: memberWinLoss.neg().add(totalRebateAmt).toFixed(2),
      receivableFromDownline: receivableFromDownline.toFixed(2),
      commissionPercentage: commissionRate.toFixed(4),
      commissionAmount: commissionAmount.toFixed(2),
      commissionResult: commissionAmount.toFixed(2),
      earnedRebatePercentage: earnedRebatePct.toFixed(4),
      earnedRebateAmount: earnedRebateAmount.toFixed(2),
      profitLossResult: profitLossResult.toFixed(2),
      volumeRemitted: volumeRemitted.toFixed(2),
      uplineSettlement: uplineSettlement.toFixed(2),
      memberCount: members.length,
    };
  }
}

function emptyStats(
  parentRebate: Prisma.Decimal | undefined,
  parentCommission: Prisma.Decimal | undefined,
  agent: { rebatePercentage: Prisma.Decimal; commissionRate: Prisma.Decimal },
): AgentSubtreeStats {
  const pr = parentRebate ?? new Prisma.Decimal(0);
  return {
    betCount: 0,
    betAmount: '0.00',
    validAmount: '0.00',
    memberWinLoss: '0.00',
    payout: '0.00',
    totalRebatePercentage: agent.rebatePercentage.toFixed(4),
    totalRebateAmount: '0.00',
    memberProfitLossResult: '0.00',
    receivableFromDownline: '0.00',
    commissionPercentage: agent.commissionRate.toFixed(4),
    commissionAmount: '0.00',
    commissionResult: '0.00',
    earnedRebatePercentage: pr.sub(agent.rebatePercentage).toFixed(4),
    earnedRebateAmount: '0.00',
    profitLossResult: '0.00',
    volumeRemitted: '0.00',
    uplineSettlement: '0.00',
    memberCount: 0,
  };
}

export interface BetReportRow {
  id: string;
  gameId: string;
  memberUsername: string;
  agentUsername: string | null;
  amount: string;
  multiplier: string;
  payout: string;
  profit: string;
  createdAt: string;
}

export interface AgentSubtreeStats {
  betCount: number;
  betAmount: string;
  validAmount: string;
  memberWinLoss: string;
  payout: string;
  totalRebatePercentage: string;
  totalRebateAmount: string;
  memberProfitLossResult: string;
  receivableFromDownline: string;
  commissionPercentage: string;
  commissionAmount: string;
  commissionResult: string;
  earnedRebatePercentage: string;
  earnedRebateAmount: string;
  profitLossResult: string;
  volumeRemitted: string;
  uplineSettlement: string;
  memberCount: number;
}

export interface AgentAnalysisRow extends AgentSubtreeStats {
  agentId: string;
  username: string;
  level: number;
  rebatePercentage: string;
  balance: string;
}

export interface HierarchyReportCommon {
  notes: string | null;
  balance: string;
  memberCount: number;
  betCount: number;
  betAmount: string;
  validAmount: string;
  memberWinLoss: string;
  payout: string;
  totalRebatePercentage: string;
  totalRebateAmount: string;
  memberProfitLossResult: string;
  receivableFromDownline: string;
  commissionPercentage: string;
  commissionAmount: string;
  commissionResult: string;
  earnedRebatePercentage: string;
  earnedRebateAmount: string;
  profitLossResult: string;
  volumeRemitted: string;
  uplineSettlement: string;
}

export type HierarchyReportRow =
  | (HierarchyReportCommon & {
      kind: 'agent';
      id: string;
      username: string;
      displayName: string | null;
      level: number;
      rebatePercentage: string;
      status: 'ACTIVE' | 'FROZEN' | 'DELETED';
      role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
    })
  | (HierarchyReportCommon & {
      kind: 'member';
      id: string;
      username: string;
      displayName: string | null;
      level: null;
      rebatePercentage: string;
      status: 'ACTIVE' | 'FROZEN';
    });
