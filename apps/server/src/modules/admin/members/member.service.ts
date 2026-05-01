import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { BetDetailResponse, MemberPublic, MemberBetEntry, MemberBetListResponse } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';
import { canManageAgent, canManageMember, listAgentDescendants } from '../../../utils/hierarchy.js';
import { runSerializable } from '../../games/_common/BaseGameService.js';
import { createPlayerSeeds } from '../../auth/player-seeds.js';
import { writeAudit } from '../audit/audit.service.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import { resolveAdminGameDayRange } from '../gameDay.js';
import type {
  CreateMemberInput,
  UpdateMemberNotesInput,
  UpdateMemberStatusInput,
  AdjustMemberBalanceInput,
  ResetMemberPasswordInput,
  UpdateMemberBettingLimitInput,
  MemberListQuery,
  MemberBetQuery,
} from './member.schema.js';
import type { FastifyRequest } from 'fastify';

const BCRYPT_ROUNDS = 12;

export class MemberService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    operator: AdminCurrent,
    input: CreateMemberInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const targetAgent = await this.prisma.agent.findUnique({ where: { id: input.agentId } });
    if (!targetAgent) throw new ApiError('AGENT_NOT_FOUND', 'Target agent not found');
    if (targetAgent.status !== 'ACTIVE') {
      throw new ApiError('AGENT_FROZEN', 'Target agent is not active');
    }
    const ok = await canManageAgent(this.prisma, operator, input.agentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot create member under this agent');

    const existing = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (existing) throw new ApiError('USERNAME_TAKEN', 'Username already in use');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const initialBalance = input.initialBalance
      ? new Prisma.Decimal(input.initialBalance)
      : new Prisma.Decimal(0);

    const { member, agentAfter } = await runSerializable(this.prisma, async (tx) => {
      let balanceForMember = new Prisma.Decimal(0);
      let agentAfterBalance = targetAgent.balance;

      // 若需從代理餘額扣款
      if (initialBalance.greaterThan(0)) {
        const locked = await tx.agent.findUnique({
          where: { id: targetAgent.id },
          select: { balance: true },
        });
        if (!locked || locked.balance.lessThan(initialBalance)) {
          throw new ApiError('INSUFFICIENT_FUNDS', 'Agent balance insufficient');
        }
        agentAfterBalance = locked.balance.sub(initialBalance);
        await tx.agent.update({
          where: { id: targetAgent.id },
          data: { balance: agentAfterBalance },
        });
        balanceForMember = initialBalance;
      } else if (targetAgent.role === 'SUPER_ADMIN') {
        // super admin 建會員不扣代理餘額，改用 SIGNUP_BONUS 直接給會員
        balanceForMember = new Prisma.Decimal(config.SIGNUP_BONUS);
      }

      const created = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          displayName: input.displayName ?? null,
          balance: balanceForMember,
          role: 'PLAYER',
          agentId: targetAgent.id,
          marketType: targetAgent.marketType,
          bettingLimitLevel: input.bettingLimitLevel ?? targetAgent.bettingLimitLevel,
          notes: input.notes ?? null,
        },
      });

      // 初始點數來源：若來自代理，寫 PointTransfer；若來自 SIGNUP_BONUS，寫 Transaction SIGNUP_BONUS
      if (initialBalance.greaterThan(0)) {
        await tx.pointTransfer.create({
          data: {
            type: 'AGENT_TO_MEMBER',
            fromType: 'agent',
            fromId: targetAgent.id,
            toType: 'member',
            toId: created.id,
            amount: initialBalance,
            fromBeforeBalance: targetAgent.balance,
            fromAfterBalance: agentAfterBalance,
            toBeforeBalance: new Prisma.Decimal(0),
            toAfterBalance: balanceForMember,
            description: 'Initial balance from agent',
            operatorId: operator.id,
            operatorType: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
            ipAddress: req?.ip ?? null,
          },
        });
        await tx.transaction.create({
          data: {
            userId: created.id,
            type: 'TRANSFER_IN',
            amount: initialBalance,
            balanceAfter: balanceForMember,
            meta: { from: 'agent', agentId: targetAgent.id, reason: 'Initial balance' },
          },
        });
      } else if (balanceForMember.greaterThan(0)) {
        await tx.transaction.create({
          data: {
            userId: created.id,
            type: 'SIGNUP_BONUS',
            amount: balanceForMember,
            balanceAfter: balanceForMember,
            meta: { reason: 'Member created by super admin' },
          },
        });
      }

      await createPlayerSeeds(tx, created.id);

      return { member: created, agentAfter: agentAfterBalance };
    });

    void agentAfter;

    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'member.create',
      targetType: 'member',
      targetId: member.id,
      newValues: {
        username: member.username,
        agentId: member.agentId,
        initialBalance: initialBalance.toFixed(2),
      },
      req,
    });

    return toMemberPublic(member, targetAgent.username);
  }

  async list(operator: AdminCurrent, query: MemberListQuery): Promise<{ items: MemberPublic[]; nextCursor: string | null }> {
    const limit = query.limit ?? 50;
    const scopedAgentIds = operator.role === 'SUPER_ADMIN'
      ? null
      : await listAgentDescendants(this.prisma, operator.id);

    const where: Prisma.UserWhereInput = {};
    if (query.agentId) {
      if (scopedAgentIds && !scopedAgentIds.includes(query.agentId)) {
        throw new ApiError('FORBIDDEN', 'Cannot list members of this agent');
      }
      where.agentId = query.agentId;
    } else if (scopedAgentIds) {
      where.agentId = { in: scopedAgentIds };
    }
    if (query.status === 'FROZEN') {
      where.frozenAt = { not: null };
      where.disabledAt = null;
    }
    if (query.status === 'ACTIVE') {
      where.frozenAt = null;
      where.disabledAt = null;
    }
    if (query.status === 'DISABLED') where.disabledAt = { not: null };
    if (query.keyword) {
      where.OR = [
        { username: { contains: query.keyword, mode: 'insensitive' } },
        { displayName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.user.findMany({
      where,
      include: { agent: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page.map((u) => toMemberPublic(u, u.agent?.username ?? null)),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  async getById(operator: AdminCurrent, id: string): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this member');
    const member = await this.prisma.user.findUnique({
      where: { id },
      include: { agent: { select: { username: true } } },
    });
    if (!member) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    return toMemberPublic(member, member.agent?.username ?? null);
  }

  async updateNotes(
    operator: AdminCurrent,
    id: string,
    input: UpdateMemberNotesInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot update this member');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { notes: input.notes },
      include: { agent: { select: { username: true } } },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.notes.update',
      targetType: 'member',
      targetId: id,
      oldValues: { notes: existing.notes },
      newValues: { notes: updated.notes },
      req,
    });
    return toMemberPublic(updated, updated.agent?.username ?? null);
  }

  async updateStatus(
    operator: AdminCurrent,
    id: string,
    input: UpdateMemberStatusInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot freeze this member');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    const now = new Date();
    const statusData =
      input.status === 'ACTIVE'
        ? { frozenAt: null, disabledAt: null }
        : input.status === 'FROZEN'
          ? { frozenAt: now, disabledAt: null }
          : { frozenAt: null, disabledAt: now };
    const updated = await this.prisma.user.update({
      where: { id },
      data: statusData,
      include: { agent: { select: { username: true } } },
    });
    if (input.status === 'DISABLED') {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: `member.status.${input.status.toLowerCase()}`,
      targetType: 'member',
      targetId: id,
      oldValues: { frozenAt: existing.frozenAt, disabledAt: existing.disabledAt },
      newValues: { frozenAt: updated.frozenAt, disabledAt: updated.disabledAt },
      req,
    });
    return toMemberPublic(updated, updated.agent?.username ?? null);
  }

  /**
   * 軟刪除會員 — 帳號無法登入（frozenAt），username 加前綴避免衝突未來同名建帳。
   * 真實資料庫記錄保留供審計。真刪除可由 DBA 後續清理。
   */
  async softDelete(operator: AdminCurrent, id: string, req?: FastifyRequest): Promise<void> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot delete this member');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    const stamp = Date.now().toString(36);
    const deletedUsername = `__del_${stamp}_${existing.username}`.slice(0, 80);
    await this.prisma.user.update({
      where: { id },
      data: {
        username: deletedUsername,
        frozenAt: new Date(),
        disabledAt: new Date(),
        notes: `[deleted by ${operator.username}] ${existing.notes ?? ''}`.slice(0, 500),
      },
    });
    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'member.delete',
      targetType: 'member',
      targetId: id,
      oldValues: { username: existing.username, frozenAt: existing.frozenAt },
      newValues: { username: deletedUsername, frozenAt: new Date() },
      req,
    });
  }

  async adjustBalance(
    operator: AdminCurrent,
    id: string,
    input: AdjustMemberBalanceInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot adjust this member');
    const delta = new Prisma.Decimal(input.delta);
    if (delta.isZero()) throw new ApiError('INVALID_TRANSFER', 'delta cannot be zero');

    const result = await runSerializable(this.prisma, async (tx) => {
      const current = await tx.user.findUnique({ where: { id }, select: { balance: true } });
      if (!current) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
      const next = current.balance.add(delta);
      if (next.isNegative()) throw new ApiError('INSUFFICIENT_FUNDS', 'Adjustment would go negative');
      const updated = await tx.user.update({
        where: { id },
        data: { balance: next },
        include: { agent: { select: { username: true } } },
      });
      await tx.transaction.create({
        data: {
          userId: id,
          type: 'ADJUSTMENT',
          amount: delta,
          balanceAfter: next,
          meta: { operatorId: operator.id, description: input.description ?? null },
        },
      });
      return updated;
    });

    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.balance.adjust',
      targetType: 'member',
      targetId: id,
      newValues: { delta: delta.toFixed(2), description: input.description ?? null },
      req,
    });

    return toMemberPublic(result, result.agent?.username ?? null);
  }

  async resetPassword(
    operator: AdminCurrent,
    id: string,
    input: ResetMemberPasswordInput,
    req?: FastifyRequest,
  ): Promise<void> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot reset this member');
    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.password.reset',
      targetType: 'member',
      targetId: id,
      req,
    });
  }

  async updateBettingLimit(
    operator: AdminCurrent,
    id: string,
    input: UpdateMemberBettingLimitInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot modify betting limit');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { bettingLimitLevel: input.bettingLimitLevel },
      include: { agent: { select: { username: true } } },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.betting_limit.update',
      targetType: 'member',
      targetId: id,
      oldValues: { bettingLimitLevel: existing.bettingLimitLevel },
      newValues: { bettingLimitLevel: updated.bettingLimitLevel },
      req,
    });
    return toMemberPublic(updated, updated.agent?.username ?? null);
  }

  async getBets(
    operator: AdminCurrent,
    id: string,
    query: MemberBetQuery,
  ): Promise<MemberBetListResponse> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view bets of this member');
    const limit = query.limit ?? 50;
    const pageNumber = query.page ?? 1;
    const offset = (pageNumber - 1) * limit;
    const take = query.cursor ? limit + 1 : offset + limit + 1;
    const cursor = parseMergedCursor(query.cursor);
    const range = resolveAdminGameDayRange(query);

    const betWhere: Prisma.BetWhereInput = { userId: id };
    if (range.start) betWhere.createdAt = { ...(betWhere.createdAt as object), gte: range.start };
    if (range.end) betWhere.createdAt = { ...(betWhere.createdAt as object), lte: range.end };
    if (query.gameId) betWhere.gameId = query.gameId;
    if (query.settlementStatus === 'settled') betWhere.status = 'SETTLED';
    if (query.settlementStatus === 'unsettled') betWhere.status = 'PENDING';

    const crashWhere: Prisma.CrashBetWhereInput = { userId: id };
    if (range.start) crashWhere.createdAt = { ...(crashWhere.createdAt as object), gte: range.start };
    if (range.end) crashWhere.createdAt = { ...(crashWhere.createdAt as object), lte: range.end };
    const crashRoundWhere: Prisma.CrashRoundWhereInput = {};
    if (query.gameId) crashRoundWhere.gameId = query.gameId;
    if (query.settlementStatus === 'settled') crashRoundWhere.status = 'CRASHED';
    if (query.settlementStatus === 'unsettled') crashRoundWhere.status = { in: ['BETTING', 'RUNNING'] };
    if (Object.keys(crashRoundWhere).length > 0) crashWhere.round = crashRoundWhere;

    const [totalBets, totalCrashBets, rows, crashRows] = await Promise.all([
      this.prisma.bet.count({ where: betWhere }),
      this.prisma.crashBet.count({ where: crashWhere }),
      this.prisma.bet.findMany({
        where: withMergedCursor(betWhere, cursor),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      }),
      this.prisma.crashBet.findMany({
        where: withMergedCursor(crashWhere, cursor),
        include: { round: { select: { gameId: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      }),
    ]);

    const merged = [
      ...rows.map((b) => ({
        id: b.id,
        gameId: b.gameId,
        amount: b.amount.toFixed(2),
        multiplier: b.multiplier.toFixed(4),
        payout: b.payout.toFixed(2),
        profit: b.profit.toFixed(2),
        createdAt: b.createdAt.toISOString(),
      })),
      ...crashRows.map((b) => ({
        id: b.id,
        gameId: b.round.gameId,
        amount: b.amount.toFixed(2),
        multiplier: (b.cashedOutAt ?? new Prisma.Decimal(0)).toFixed(4),
        payout: b.payout.toFixed(2),
        profit: b.payout.sub(b.amount).toFixed(2),
        createdAt: b.createdAt.toISOString(),
      })),
    ].sort(compareMergedEntries);

    const total = totalBets + totalCrashBets;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const pageStart = query.cursor ? 0 : offset;
    const pageEnd = pageStart + limit;
    const hasMore = query.cursor ? merged.length > limit : merged.length > pageEnd;
    const page = merged.slice(pageStart, pageEnd);
    return {
      items: page,
      nextCursor: hasMore ? buildMergedCursor(page[page.length - 1]!) : null,
      pagination: {
        page: pageNumber,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getBetDetail(
    operator: AdminCurrent,
    id: string,
    betId: string,
  ): Promise<BetDetailResponse> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view bets of this member');

    const bet = await this.prisma.bet.findFirst({
      where: { id: betId, userId: id },
      include: {
        serverSeed: {
          select: { seedHash: true },
        },
      },
    });

    if (bet) {
      return {
        id: bet.id,
        kind: 'bet',
        gameId: bet.gameId,
        amount: bet.amount.toFixed(2),
        multiplier: bet.multiplier.toFixed(4),
        payout: bet.payout.toFixed(2),
        profit: bet.profit.toFixed(2),
        status: bet.status,
        createdAt: bet.createdAt.toISOString(),
        settledAt: bet.settledAt?.toISOString() ?? null,
        nonce: bet.nonce,
        clientSeed: bet.clientSeedUsed,
        serverSeedHash: bet.serverSeed.seedHash,
        roundId:
          bet.minesRoundId ??
          bet.hiloRoundId ??
          bet.towerRoundId ??
          bet.blackjackRoundId ??
          null,
        roundNumber: null,
        resultData: sanitizePublicResult(bet.resultData),
      };
    }

    const crashBet = await this.prisma.crashBet.findFirst({
      where: { id: betId, userId: id },
      include: {
        round: true,
      },
    });

    if (crashBet) {
      const payout = crashBet.payout ?? new Prisma.Decimal(0);
      const profit = payout.minus(crashBet.amount);
      const multiplier =
        crashBet.cashedOutAt ??
        (payout.greaterThan(0) && crashBet.amount.greaterThan(0)
          ? payout.div(crashBet.amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
          : new Prisma.Decimal(0));
      const settled = crashBet.round.status === 'CRASHED';

      return {
        id: crashBet.id,
        kind: 'crash',
        gameId: crashBet.round.gameId,
        amount: crashBet.amount.toFixed(2),
        multiplier: multiplier.toFixed(4),
        payout: payout.toFixed(2),
        profit: profit.toFixed(2),
        status: settled ? 'SETTLED' : 'PENDING',
        createdAt: crashBet.createdAt.toISOString(),
        settledAt: crashBet.round.crashedAt?.toISOString() ?? null,
        nonce: null,
        clientSeed: null,
        serverSeedHash: crashBet.round.serverSeedHash,
        roundId: crashBet.roundId,
        roundNumber: crashBet.round.roundNumber,
        resultData: {
          roundNumber: crashBet.round.roundNumber,
          crashPoint: crashBet.round.crashPoint.toFixed(4),
          autoCashOut: crashBet.autoCashOut?.toFixed(4) ?? null,
          cashoutAt: crashBet.cashedOutAt?.toFixed(4) ?? null,
          payout: payout.toFixed(2),
          status: crashBet.round.status,
        },
      };
    }

    throw new ApiError('INVALID_BET', 'Bet detail not found');
  }
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

function sanitizePublicResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicResult(item));
  }

  const record = asRecord(value);
  if (!record) return value;

  const internalKeys = new Set([
    'raw',
    'rawRoll',
    'rawWon',
    'controlled',
    'flipReason',
    'controlId',
    'bustedByCashoutControl',
  ]);
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (internalKeys.has(key)) continue;
    output[key] = sanitizePublicResult(child);
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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

function toMemberPublic(
  user: {
    id: string;
    username: string;
    displayName: string | null;
    agentId: string | null;
    balance: Prisma.Decimal;
    marketType: 'D' | 'A';
    bettingLimitLevel: string;
    frozenAt: Date | null;
    disabledAt: Date | null;
    notes: string | null;
    createdAt: Date;
  },
  agentUsername: string | null,
): MemberPublic {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    agentId: user.agentId,
    agentUsername,
    balance: user.balance.toFixed(2),
    marketType: user.marketType,
    bettingLimitLevel: user.bettingLimitLevel,
    status: user.disabledAt ? 'DISABLED' : user.frozenAt ? 'FROZEN' : 'ACTIVE',
    frozenAt: user.frozenAt?.toISOString() ?? null,
    disabledAt: user.disabledAt?.toISOString() ?? null,
    notes: user.notes,
    lastLoginAt: null,
    createdAt: user.createdAt.toISOString(),
  };
}
