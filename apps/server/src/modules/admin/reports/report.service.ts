import { PrismaClient, Prisma } from '@prisma/client';
import { ApiError } from '../../../utils/errors.js';
import { listAgentDescendants, canManageAgent } from '../../../utils/hierarchy.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import type { ReportQuery, AgentAnalysisQuery } from './report.schema.js';
import { BACCARAT_GAME_IDS, type DashboardSummaryResponse } from '@bg/shared';
import {
  getAdminGameDay,
  getAdminGameDayWindowByDay,
  resolveAdminGameDayRange,
  shiftAdminGameDay,
} from '../gameDay.js';
import {
  type DualRebateProfile,
  calculateRebateAmountByCategory,
  effectiveDownlineRebate,
  fallbackRateForGame,
  isBaccaratGameId,
  weightedRate,
} from '../rebate.js';

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

  /** 儀表板摘要：7 日下注、活躍會員、遊戲分布（含 Crash 類下注） */
  async dashboardSummary(operator: AdminCurrent): Promise<DashboardSummaryResponse> {
    const now = new Date();
    const currentGameDay = getAdminGameDay(now);
    const startGameDay = shiftAdminGameDay(currentGameDay, -6);
    const startDate = getAdminGameDayWindowByDay(startGameDay).start;
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const rootAgentId = await this.resolveDashboardRootAgentId(operator);

    const agentIds = rootAgentId ? await listAgentDescendants(this.prisma, rootAgentId) : null;
    const downlineAgentWhere: Prisma.AgentWhereInput = agentIds
      ? {
          id: { in: agentIds.filter((id) => id !== rootAgentId) },
          role: { not: 'SUB_ACCOUNT' },
          status: { not: 'DELETED' },
        }
      : { role: { not: 'SUB_ACCOUNT' }, status: { not: 'DELETED' } };
    const memberWhere: Prisma.UserWhereInput = agentIds
      ? { agentId: { in: agentIds }, role: 'PLAYER' }
      : { role: 'PLAYER' };

    const [downlineAgentCount, scopedMembers] = await Promise.all([
      this.prisma.agent.count({ where: downlineAgentWhere }),
      this.prisma.user.findMany({
        where: memberWhere,
        select: { id: true, createdAt: true },
      }),
    ]);

    const memberIds = agentIds ? scopedMembers.map((member) => member.id) : null;
    const betWhere: Prisma.BetWhereInput = {
      createdAt: { gte: startDate, lte: now },
    };
    const crashBetWhere: Prisma.CrashBetWhereInput = {
      createdAt: { gte: startDate, lte: now },
    };
    if (memberIds) {
      betWhere.userId = { in: memberIds };
      crashBetWhere.userId = { in: memberIds };
    }

    const [standardBets, crashBets] = await Promise.all([
      this.prisma.bet.findMany({
        where: betWhere,
        select: {
          userId: true,
          gameId: true,
          amount: true,
          payout: true,
          createdAt: true,
        },
      }),
      this.prisma.crashBet.findMany({
        where: crashBetWhere,
        select: {
          userId: true,
          amount: true,
          payout: true,
          createdAt: true,
          round: { select: { gameId: true } },
        },
      }),
    ]);

    const dayKeys = Array.from({ length: 7 }, (_, index) => shiftAdminGameDay(startGameDay, index));
    const trendBuckets = new Map<string, DashboardBucket>();
    for (const key of dayKeys) {
      trendBuckets.set(key, {
        amount: new Prisma.Decimal(0),
        count: 0,
        activeMembers: new Set<string>(),
      });
    }

    const gameBuckets = new Map<string, { amount: Prisma.Decimal; count: number }>();
    const activeMembers7d = new Set<string>();
    const activeMembers24h = new Set<string>();
    let betAmount7d = new Prisma.Decimal(0);
    let payout7d = new Prisma.Decimal(0);
    let betCount7d = 0;

    const absorbBet = (bet: DashboardBetInput) => {
      betAmount7d = betAmount7d.add(bet.amount);
      payout7d = payout7d.add(bet.payout);
      betCount7d += 1;
      activeMembers7d.add(bet.userId);
      if (bet.createdAt >= since24h) activeMembers24h.add(bet.userId);

      const key = getAdminGameDay(bet.createdAt);
      const dayBucket = trendBuckets.get(key);
      if (dayBucket) {
        dayBucket.amount = dayBucket.amount.add(bet.amount);
        dayBucket.count += 1;
        dayBucket.activeMembers.add(bet.userId);
      }

      const gameBucket = gameBuckets.get(bet.gameId) ?? {
        amount: new Prisma.Decimal(0),
        count: 0,
      };
      gameBucket.amount = gameBucket.amount.add(bet.amount);
      gameBucket.count += 1;
      gameBuckets.set(bet.gameId, gameBucket);
    };

    for (const bet of standardBets) {
      absorbBet({
        userId: bet.userId,
        gameId: bet.gameId,
        amount: bet.amount,
        payout: bet.payout,
        createdAt: bet.createdAt,
      });
    }
    for (const bet of crashBets) {
      absorbBet({
        userId: bet.userId,
        gameId: bet.round.gameId,
        amount: bet.amount,
        payout: bet.payout,
        createdAt: bet.createdAt,
      });
    }

    const newMembers7d = scopedMembers.filter((member) => member.createdAt >= startDate).length;
    const platformNet7d = betAmount7d.sub(payout7d);
    const avgBetAmount7d =
      betCount7d > 0 ? betAmount7d.div(new Prisma.Decimal(betCount7d)) : new Prisma.Decimal(0);

    return {
      range: {
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
      },
      totals: {
        downlineAgentCount,
        memberCount: scopedMembers.length,
        newMembers7d,
        activeMembers24h: activeMembers24h.size,
        activeMembers7d: activeMembers7d.size,
        betCount7d,
        betAmount7d: betAmount7d.toFixed(2),
        payout7d: payout7d.toFixed(2),
        platformNet7d: platformNet7d.toFixed(2),
        avgBetAmount7d: avgBetAmount7d.toFixed(2),
      },
      trend: dayKeys.map((key) => {
        const bucket = trendBuckets.get(key);
        return {
          date: key,
          label: labelFromGameDay(key),
          betAmount: (bucket?.amount ?? new Prisma.Decimal(0)).toFixed(2),
          betCount: bucket?.count ?? 0,
          activeMembers: bucket?.activeMembers.size ?? 0,
        };
      }),
      gameBreakdown: Array.from(gameBuckets.entries())
        .sort(([, a], [, b]) => b.amount.comparedTo(a.amount))
        .slice(0, 6)
        .map(([gameId, bucket]) => ({
          gameId,
          betAmount: bucket.amount.toFixed(2),
          betCount: bucket.count,
        })),
    };
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

    const memberIds =
      operator.role === 'SUPER_ADMIN' && !query.agentId
        ? null
        : await this.getDownlineMembers(scopeAgentId);
    const limit = query.limit ?? 100;
    const cursor = parseMergedCursor(query.cursor);
    const range = resolveAdminGameDayRange(query);

    const [standardRows, crashRows, agg] = await Promise.all([
      this.prisma.bet.findMany({
        where: this.buildBetWhere({
          memberIds,
          gameId: query.gameId,
          startDate: range.start,
          endDate: range.end,
          cursor,
        }),
        include: {
          user: { select: { username: true, agentId: true, agent: { select: { username: true } } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.prisma.crashBet.findMany({
        where: this.buildCrashBetWhere({
          memberIds,
          gameId: query.gameId,
          startDate: range.start,
          endDate: range.end,
          cursor,
        }),
        include: {
          round: { select: { gameId: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      }),
      this.aggregateUnifiedBets({
        memberIds,
        gameId: query.gameId,
        startDate: range.start,
        endDate: range.end,
      }),
    ]);

    const crashUserIds = Array.from(new Set(crashRows.map((row) => row.userId)));
    const crashUsers = crashUserIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: crashUserIds } },
          select: { id: true, username: true, agent: { select: { username: true } } },
        })
      : [];
    const crashUserMap = new Map(crashUsers.map((user) => [user.id, user]));

    const merged = [
      ...standardRows.map((b) => ({
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
      ...crashRows.map((b) => ({
        id: b.id,
        gameId: b.round.gameId,
        memberUsername: crashUserMap.get(b.userId)?.username ?? b.userId,
        agentUsername: crashUserMap.get(b.userId)?.agent?.username ?? null,
        amount: b.amount.toFixed(2),
        multiplier: (b.cashedOutAt ?? new Prisma.Decimal(0)).toFixed(4),
        payout: b.payout.toFixed(2),
        profit: b.payout.sub(b.amount).toFixed(2),
        createdAt: b.createdAt.toISOString(),
      })),
    ].sort(compareMergedEntries);

    const hasMore = merged.length > limit;
    const page = hasMore ? merged.slice(0, limit) : merged;

    return {
      items: page,
      nextCursor: hasMore ? buildMergedCursor(page[page.length - 1]!) : null,
      totals: {
        betCount: agg.betCount,
        betAmount: agg.betAmount.toFixed(2),
        memberWinLoss: agg.memberWinLoss.toFixed(2),
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

    const { start: startDate, end: endDate } = resolveAdminGameDayRange(query);
    const gameId = query.gameId;

    const rootStats = await this.aggregateAgentSubtree(root, startDate, endDate, gameId);
    const childStats = await Promise.all(
      children.map((c) => this.aggregateAgentSubtree(c, startDate, endDate, gameId, root)),
    );

    return {
      root: {
        agentId: root.id,
        username: root.username,
        level: root.level,
        rebatePercentage: resolveConfiguredDisplayRate(root, gameId).toFixed(4),
        balance: root.balance.toFixed(2),
        ...rootStats,
      },
      children: children.map((c, i) => ({
        agentId: c.id,
        username: c.username,
        level: c.level,
        rebatePercentage: resolveConfiguredDisplayRate(c, gameId).toFixed(4),
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
      username?: string;
      settlementStatus?: 'settled' | 'unsettled';
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
      commissionResult: string;
      earnedRebateAmount: string;
      profitLossResult: string;
      volumeRemitted: string;
      uplineSettlement: string;
    };
  }> {
    const isPlatformRoot = operator.role === 'SUPER_ADMIN' && !query.parentId;
    const parentId = query.parentId ?? operator.id;
    const ok = isPlatformRoot || await canManageAgent(this.prisma, operator, parentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this subtree');

    const parent = await this.prisma.agent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        username: true,
        level: true,
        rebateMode: true,
        rebatePercentage: true,
        maxRebatePercentage: true,
        baccaratRebateMode: true,
        baccaratRebatePercentage: true,
        maxBaccaratRebatePercentage: true,
        balance: true,
        parentId: true,
      },
    });
    if (!parent) throw new ApiError('AGENT_NOT_FOUND', 'Parent agent not found');

    // breadcrumb 從 parent 沿 parentId 向上
    const breadcrumb: { id: string; username: string; level: number }[] = isPlatformRoot
      ? [{ id: '', username: '全平台', level: 0 }]
      : [];
    let cursor: string | null = isPlatformRoot ? null : parent.id;
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
    if (operator.role === 'SUPER_ADMIN' && !isPlatformRoot && breadcrumb[0]?.id !== '') {
      breadcrumb.unshift({ id: '', username: '全平台', level: 0 });
    }

    const { start: startDate, end: endDate } = resolveAdminGameDayRange(query);
    const gameId = query.gameId;
    const username = query.username?.trim();
    const agentAccountSearchWhere: Prisma.AgentWhereInput | undefined = username
      ? {
          OR: [
            { username: { contains: username, mode: 'insensitive' as const } },
            { displayName: { contains: username, mode: 'insensitive' as const } },
          ],
        }
      : undefined;
    const memberAccountSearchWhere: Prisma.UserWhereInput | undefined = username
      ? {
          OR: [
            { username: { contains: username, mode: 'insensitive' as const } },
            { displayName: { contains: username, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const childAgentBaseWhere: Prisma.AgentWhereInput = isPlatformRoot
      ? {
          OR: [{ parentId: null }, { parentId: operator.id }],
          id: { not: operator.id },
          role: { not: 'SUPER_ADMIN' },
          status: { not: 'DELETED' },
        }
      : { parentId, status: { not: 'DELETED' } };
    const directMemberBaseWhere: Prisma.UserWhereInput = isPlatformRoot
      ? { OR: [{ agentId: null }, { agentId: operator.id }] }
      : { agentId: parentId };
    const childAgentWhere: Prisma.AgentWhereInput = agentAccountSearchWhere
      ? { AND: [childAgentBaseWhere, agentAccountSearchWhere] }
      : childAgentBaseWhere;
    const directMemberWhere: Prisma.UserWhereInput = memberAccountSearchWhere
      ? { AND: [directMemberBaseWhere, memberAccountSearchWhere] }
      : directMemberBaseWhere;

    const childAgents = await this.prisma.agent.findMany({
      where: childAgentWhere,
      orderBy: { createdAt: 'asc' },
    });
    const directMembers = await this.prisma.user.findMany({
      where: directMemberWhere,
      orderBy: { createdAt: 'asc' },
    });

    const agentRows: HierarchyReportRow[] = await Promise.all(
      childAgents.map(async (c) => {
        const stats = await this.aggregateAgentSubtree(
          c,
          startDate,
          endDate,
          gameId,
          parent,
          query.settlementStatus,
        );
        return {
          kind: 'agent' as const,
          id: c.id,
          username: c.username,
          displayName: c.displayName,
          level: c.level,
          rebatePercentage: resolveConfiguredDisplayRate(c, gameId).toFixed(4),
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
        const agg = await this.aggregateUnifiedBets({
          memberIds: [m.id],
          gameId,
          startDate,
          endDate,
          settlementStatus: query.settlementStatus,
        });
        const betAmount = agg.betAmount;
        const validAmount = betAmount;
        const memberWinLoss = agg.memberWinLoss; // 正=會員贏
        const payout = agg.payout;

        const memberElectronicRebatePct = effectiveDownlineRebate(parent, 'electronic');
        const memberBaccaratRebatePct = effectiveDownlineRebate(parent, 'baccarat');
        const memberRebateAmt = calculateRebateAmountByCategory(
          agg,
          memberElectronicRebatePct,
          memberBaccaratRebatePct,
        );
        const memberRebatePct = weightedRate(
          betAmount,
          memberRebateAmt,
          fallbackRateForGame(gameId, memberElectronicRebatePct, memberBaccaratRebatePct),
        );

        // 會員的「上級交收」 = 會員輸贏 + 完整退水（參考系統 calculateItemSuperiorSettlement）
        const uplineSettle = memberWinLoss.add(memberRebateAmt);

        return {
          kind: 'member' as const,
          id: m.id,
          username: m.username,
          displayName: m.displayName,
          level: null,
          rebatePercentage: '0.0000', // 會員本身不是代理，無分配退水率
          status: m.disabledAt ? 'DISABLED' : m.frozenAt ? 'FROZEN' : 'ACTIVE',
          notes: m.notes,
          balance: m.balance.toFixed(2),
          memberCount: 0,
          betCount: agg.betCount,
          betAmount: betAmount.toFixed(2),
          validAmount: validAmount.toFixed(2),
          memberWinLoss: memberWinLoss.toFixed(2),
          payout: payout.toFixed(2),
          totalRebatePercentage: memberRebatePct.toFixed(4),
          totalRebateAmount: memberRebateAmt.toFixed(2),
          memberProfitLossResult: memberWinLoss.toFixed(2), // 參考系統：保持與會員輸贏一致
          receivableFromDownline: memberWinLoss.neg().toFixed(2),
          // 保留 commission 欄位但不影響 uplineSettlement 的計算
          commissionPercentage: '0.0000',
          commissionAmount: '0.00',
          commissionResult: '0.00',
          earnedRebatePercentage: memberRebatePct.toFixed(4),
          earnedRebateAmount: memberRebateAmt.toFixed(2),
          profitLossResult: memberWinLoss.toFixed(2),
          volumeRemitted: '0.00',
          uplineSettlement: uplineSettle.toFixed(2),
        };
      }),
    );

    const items = [...agentRows, ...memberRows].filter(hasEffectiveReportData);
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
        acc.commissionResult = acc.commissionResult.add(new Prisma.Decimal(r.commissionResult));
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
        commissionResult: new Prisma.Decimal(0),
        earnedRebateAmount: new Prisma.Decimal(0),
        profitLossResult: new Prisma.Decimal(0),
        volumeRemitted: new Prisma.Decimal(0),
        uplineSettlement: new Prisma.Decimal(0),
      },
    );

    return {
      parent: {
        id: isPlatformRoot ? '' : parent.id,
        username: isPlatformRoot ? '全平台' : parent.username,
        level: isPlatformRoot ? 0 : parent.level,
        rebatePercentage: resolveConfiguredDisplayRate(parent, gameId).toFixed(4),
        commissionRate: '0.0000',
        balance: parent.balance.toFixed(2),
        parentId: isPlatformRoot ? null : parent.parentId,
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
        commissionResult: totals.commissionResult.toFixed(2),
        earnedRebateAmount: totals.earnedRebateAmount.toFixed(2),
        profitLossResult: totals.profitLossResult.toFixed(2),
        volumeRemitted: totals.volumeRemitted.toFixed(2),
        uplineSettlement: totals.uplineSettlement.toFixed(2),
      },
    };
  }

  /**
   * 聚合某 agent 子樹（含 agent 自己直屬會員）的 bet 統計
   *
   * 公式對齊參考系統（/Users/justin/Desktop/Bet/agent）：
   *   - 會員輸贏  = Σ(payout - amount) = Σ(profit) 正=會員贏
   *   - 有效投注  = 下注金額（目前無無效注概念）
   *   - 下級實際退水率 = rebateMode='ALL' 時 0；rebateMode='NONE' 時 maxRebatePercentage；否則 rebatePercentage
   *   - 賺水率    = parent.rebate - self.實際rebate（當層代理從此子樹賺到的退水差）
   *   - 整條線退水 = betAmount × 下級實際退水率
   *   - 上級交收  = 整條線輸贏 + 整條線退水 + 當層賺水
   *   - 應收下線  = 整條線輸贏（-memberWinLoss）
   */
  private async aggregateAgentSubtree(
    agent: {
      id: string;
      rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
      rebatePercentage: Prisma.Decimal;
      maxRebatePercentage: Prisma.Decimal;
      baccaratRebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
      baccaratRebatePercentage: Prisma.Decimal;
      maxBaccaratRebatePercentage: Prisma.Decimal;
    },
    startDate?: Date,
    endDate?: Date,
    gameId?: string,
    parentProfile?: DualRebateProfile,
    settlementStatus?: 'settled' | 'unsettled',
  ): Promise<AgentSubtreeStats> {
    const agentIds = await listAgentDescendants(this.prisma, agent.id);
    const members = await this.prisma.user.findMany({
      where: { agentId: { in: agentIds } },
      select: { id: true },
    });
    if (members.length === 0) {
      return emptyStats(parentProfile, gameId, agent);
    }
    const memberIds = members.map((m) => m.id);
    const agg = await this.aggregateUnifiedBets({
      memberIds,
      gameId,
      startDate,
      endDate,
      settlementStatus,
    });

    const betAmount = agg.betAmount;
    const validAmount = betAmount;
    const memberWinLoss = agg.memberWinLoss; // 正=會員贏
    const payout = agg.payout;

    const actualElectronicRebate = effectiveDownlineRebate(agent, 'electronic');
    const actualBaccaratRebate = effectiveDownlineRebate(agent, 'baccarat');
    const totalLineRebate = calculateRebateAmountByCategory(
      agg,
      actualElectronicRebate,
      actualBaccaratRebate,
    );

    const earnedElectronicRebatePct = parentProfile
      ? effectiveDownlineRebate(parentProfile, 'electronic').sub(actualElectronicRebate)
      : actualElectronicRebate;
    const earnedBaccaratRebatePct = parentProfile
      ? effectiveDownlineRebate(parentProfile, 'baccarat').sub(actualBaccaratRebate)
      : actualBaccaratRebate;
    const earnedRebateAmount = calculateRebateAmountByCategory(
      agg,
      earnedElectronicRebatePct,
      earnedBaccaratRebatePct,
    );
    const totalRebateDisplayPct = weightedRate(
      betAmount,
      totalLineRebate,
      fallbackRateForGame(gameId, actualElectronicRebate, actualBaccaratRebate),
    );
    const earnedRebateDisplayPct = weightedRate(
      betAmount,
      earnedRebateAmount,
      fallbackRateForGame(gameId, earnedElectronicRebatePct, earnedBaccaratRebatePct),
    );

    // 應收下線 = 會員虧損
    const receivableFromDownline = memberWinLoss.neg();

    // 本級盈虧結果 = 會員輸贏 + 當層賺水（當層對上級「賺的」也要算進盈虧）
    const profitLossResult = memberWinLoss.add(earnedRebateAmount);

    // 上級交收 = 整條線輸贏 + 整條線退水 + 當層賺水（參考系統公式）
    const uplineSettlement = memberWinLoss.add(totalLineRebate).add(earnedRebateAmount);

    return {
      betCount: agg.betCount,
      betAmount: betAmount.toFixed(2),
      validAmount: validAmount.toFixed(2),
      memberWinLoss: memberWinLoss.toFixed(2),
      payout: payout.toFixed(2),
      totalRebatePercentage: totalRebateDisplayPct.toFixed(4),
      totalRebateAmount: totalLineRebate.toFixed(2),
      memberProfitLossResult: memberWinLoss.toFixed(2),
      receivableFromDownline: receivableFromDownline.toFixed(2),
      commissionPercentage: '0.0000',
      commissionAmount: '0.00',
      commissionResult: '0.00',
      earnedRebatePercentage: earnedRebateDisplayPct.toFixed(4),
      earnedRebateAmount: earnedRebateAmount.toFixed(2),
      profitLossResult: profitLossResult.toFixed(2),
      volumeRemitted: '0.00',
      uplineSettlement: uplineSettlement.toFixed(2),
      memberCount: members.length,
    };
  }

  private buildBetWhere(input: {
    memberIds: string[] | null;
    gameId?: string | string[];
    startDate?: Date;
    endDate?: Date;
    cursor?: MergedCursor;
    settlementStatus?: 'settled' | 'unsettled';
  }): Prisma.BetWhereInput {
    const where: Prisma.BetWhereInput = {};
    if (input.memberIds) where.userId = { in: input.memberIds };
    if (Array.isArray(input.gameId)) {
      where.gameId = { in: [...input.gameId] };
    } else if (input.gameId) {
      where.gameId = input.gameId;
    }
    if (input.startDate) where.createdAt = { ...(where.createdAt as object), gte: input.startDate };
    if (input.endDate) where.createdAt = { ...(where.createdAt as object), lte: input.endDate };
    applySettlementFilter(where, input.settlementStatus);
    return withMergedCursor(where, input.cursor);
  }

  private buildCrashBetWhere(input: {
    memberIds: string[] | null;
    gameId?: string;
    startDate?: Date;
    endDate?: Date;
    cursor?: MergedCursor;
    settlementStatus?: 'settled' | 'unsettled';
  }): Prisma.CrashBetWhereInput {
    const where: Prisma.CrashBetWhereInput = {};
    if (input.memberIds) where.userId = { in: input.memberIds };
    if (input.startDate) where.createdAt = { ...(where.createdAt as object), gte: input.startDate };
    if (input.endDate) where.createdAt = { ...(where.createdAt as object), lte: input.endDate };
    if (input.gameId || input.settlementStatus) {
      const roundWhere: Prisma.CrashRoundWhereInput = {};
      if (input.gameId) roundWhere.gameId = input.gameId;
      applyCrashSettlementFilter(roundWhere, input.settlementStatus);
      where.round = roundWhere;
    }
    return withMergedCursor(where, input.cursor);
  }

  private async aggregateUnifiedBets(input: {
    memberIds: string[] | null;
    gameId?: string;
    startDate?: Date;
    endDate?: Date;
    createdBefore?: Date;
    settlementStatus?: 'settled' | 'unsettled';
  }): Promise<{
    betCount: number;
    betAmount: Prisma.Decimal;
    payout: Prisma.Decimal;
    memberWinLoss: Prisma.Decimal;
    electronicBetAmount: Prisma.Decimal;
    baccaratBetAmount: Prisma.Decimal;
  }> {
    const shouldQueryBaccarat = !input.gameId || isBaccaratGameId(input.gameId);
    const baccaratGameFilter = input.gameId ? input.gameId : [...BACCARAT_GAME_IDS];
    const [standardAgg, baccaratAgg, crashAgg] = await Promise.all([
      this.prisma.bet.aggregate({
        where: this.buildBetWhere(input),
        _count: { _all: true },
        _sum: { amount: true, profit: true, payout: true },
      }),
      shouldQueryBaccarat
        ? this.prisma.bet.aggregate({
            where: this.buildBetWhere({ ...input, gameId: baccaratGameFilter }),
            _sum: { amount: true },
          })
        : Promise.resolve({ _sum: { amount: new Prisma.Decimal(0) } }),
      this.prisma.crashBet.aggregate({
        where: this.buildCrashBetWhere(input),
        _count: { _all: true },
        _sum: { amount: true, payout: true },
      }),
    ]);

    const standardAmount = standardAgg._sum.amount ?? new Prisma.Decimal(0);
    const standardPayout = standardAgg._sum.payout ?? new Prisma.Decimal(0);
    const standardProfit = standardAgg._sum.profit ?? new Prisma.Decimal(0);
    const crashAmount = crashAgg._sum.amount ?? new Prisma.Decimal(0);
    const crashPayout = crashAgg._sum.payout ?? new Prisma.Decimal(0);
    const crashProfit = crashPayout.sub(crashAmount);
    const baccaratAmount = baccaratAgg._sum.amount ?? new Prisma.Decimal(0);
    const electronicAmount = standardAmount.sub(baccaratAmount).add(crashAmount);

    return {
      betCount: standardAgg._count._all + crashAgg._count._all,
      betAmount: standardAmount.add(crashAmount),
      payout: standardPayout.add(crashPayout),
      memberWinLoss: standardProfit.add(crashProfit),
      electronicBetAmount: electronicAmount,
      baccaratBetAmount: baccaratAmount,
    };
  }

  private async resolveDashboardRootAgentId(operator: AdminCurrent): Promise<string | null> {
    if (operator.role === 'SUPER_ADMIN') return null;
    if (operator.role !== 'SUB_ACCOUNT') return operator.id;
    const agent = await this.prisma.agent.findUnique({
      where: { id: operator.id },
      select: { parentId: true },
    });
    return agent?.parentId ?? operator.id;
  }
}

interface DashboardBucket {
  amount: Prisma.Decimal;
  count: number;
  activeMembers: Set<string>;
}

interface DashboardBetInput {
  userId: string;
  gameId: string;
  amount: Prisma.Decimal;
  payout: Prisma.Decimal;
  createdAt: Date;
}

interface MergedCursor {
  createdAt: Date;
  id: string;
}

function parseMergedCursor(cursor?: string): MergedCursor | undefined {
  if (!cursor) return undefined;
  const [createdAtRaw = '', id = ''] = cursor.split('__');
  if (!id) return undefined;
  const createdAt = new Date(createdAtRaw);
  if (!Number.isFinite(createdAt.getTime())) return undefined;
  return { createdAt, id };
}

function buildMergedCursor(entry: { createdAt: string; id: string }): string {
  return `${entry.createdAt}__${entry.id}`;
}

function compareMergedEntries(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
): number {
  const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (timeDiff !== 0) return timeDiff;
  return b.id.localeCompare(a.id);
}

function labelFromGameDay(key: string): string {
  const [, month = '0', day = '0'] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}

function withMergedCursor<T extends { id?: unknown; createdAt?: unknown }>(
  where: T,
  cursor: MergedCursor | undefined,
): T {
  if (!cursor) return where;
  return {
    AND: [
      where,
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ],
  } as unknown as T;
}

function emptyStats(
  parentProfile: DualRebateProfile | undefined,
  gameId: string | undefined,
  agent: DualRebateProfile,
): AgentSubtreeStats {
  const actualElectronicRebate = effectiveDownlineRebate(agent, 'electronic');
  const actualBaccaratRebate = effectiveDownlineRebate(agent, 'baccarat');
  const earnedElectronicRebate = parentProfile
    ? effectiveDownlineRebate(parentProfile, 'electronic').sub(actualElectronicRebate)
    : actualElectronicRebate;
  const earnedBaccaratRebate = parentProfile
    ? effectiveDownlineRebate(parentProfile, 'baccarat').sub(actualBaccaratRebate)
    : actualBaccaratRebate;
  return {
    betCount: 0,
    betAmount: '0.00',
    validAmount: '0.00',
    memberWinLoss: '0.00',
    payout: '0.00',
    totalRebatePercentage: fallbackRateForGame(
      gameId,
      actualElectronicRebate,
      actualBaccaratRebate,
    ).toFixed(4),
    totalRebateAmount: '0.00',
    memberProfitLossResult: '0.00',
    receivableFromDownline: '0.00',
    commissionPercentage: '0.0000',
    commissionAmount: '0.00',
    commissionResult: '0.00',
    earnedRebatePercentage: fallbackRateForGame(
      gameId,
      earnedElectronicRebate,
      earnedBaccaratRebate,
    ).toFixed(4),
    earnedRebateAmount: '0.00',
    profitLossResult: '0.00',
    volumeRemitted: '0.00',
    uplineSettlement: '0.00',
    memberCount: 0,
  };
}

function hasEffectiveReportData(row: HierarchyReportRow): boolean {
  return row.betCount > 0 || new Prisma.Decimal(row.betAmount).greaterThan(0);
}

function applySettlementFilter(
  where: Prisma.BetWhereInput,
  settlementStatus: 'settled' | 'unsettled' | undefined,
): void {
  if (settlementStatus === 'settled') {
    where.status = 'SETTLED';
  } else if (settlementStatus === 'unsettled') {
    where.status = 'PENDING';
  }
}

function applyCrashSettlementFilter(
  where: Prisma.CrashRoundWhereInput,
  settlementStatus: 'settled' | 'unsettled' | undefined,
): void {
  if (settlementStatus === 'settled') {
    where.status = 'CRASHED';
  } else if (settlementStatus === 'unsettled') {
    where.status = { in: ['BETTING', 'RUNNING'] };
  }
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

function resolveConfiguredDisplayRate(agent: DualRebateProfile, gameId?: string): Prisma.Decimal {
  if (!gameId) return new Prisma.Decimal(0);
  return effectiveDownlineRebate(agent, isBaccaratGameId(gameId) ? 'baccarat' : 'electronic');
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
      status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
      role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
    })
  | (HierarchyReportCommon & {
      kind: 'member';
      id: string;
      username: string;
      displayName: string | null;
      level: null;
      rebatePercentage: string;
      status: 'ACTIVE' | 'FROZEN' | 'DISABLED';
    });
