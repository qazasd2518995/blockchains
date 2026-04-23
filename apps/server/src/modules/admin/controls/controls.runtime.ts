import { ManualDetectionScope, Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { listAgentDescendants } from '../../../utils/hierarchy.js';

type Db = PrismaClient | Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);
const SETTLED_STATUS = Prisma.sql`'SETTLED'::"BetStatus"`;

export interface SettlementSummary {
  gameDay: string;
  totalBet: Prisma.Decimal;
  totalPayout: Prisma.Decimal;
  memberWinLoss: Prisma.Decimal;
  totalRebate: Prisma.Decimal;
  superiorSettlement: Prisma.Decimal;
  totalBets: number;
  totalPlayers: number;
  status: 'green' | 'red';
  statusText: string;
}

interface BetAggregate {
  totalBet: Prisma.Decimal;
  totalPayout: Prisma.Decimal;
  memberWinLoss: Prisma.Decimal;
  totalBets: number;
  totalPlayers: number;
}

interface AgentRebateProfile {
  id: string;
  parentId: string | null;
  rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
  rebatePercentage: Prisma.Decimal;
  maxRebatePercentage: Prisma.Decimal;
}

export function getControlGameDay(now: Date = new Date()): string {
  const taipei = toTaipeiDate(now);
  if (taipei.getHours() < 7) taipei.setDate(taipei.getDate() - 1);
  return formatDateOnly(taipei);
}

export function getControlGameDayWindow(now: Date = new Date()): {
  gameDay: string;
  start: Date;
  end: Date;
} {
  const gameDay = getControlGameDay(now);
  const start = new Date(`${gameDay}T07:00:00+08:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gameDay, start, end };
}

export async function calculateCurrentSettlement(
  db: Db,
  scope: ManualDetectionScope,
  targetAgentId?: string | null,
  targetMemberUsername?: string | null,
): Promise<SettlementSummary> {
  if (scope === 'MEMBER') {
    return calculateMemberSettlement(db, targetMemberUsername);
  }
  if (scope === 'AGENT_LINE') {
    return calculateAgentLineSettlement(db, targetAgentId);
  }
  return calculateAllSettlement(db);
}

export async function getAllActiveManualDetectionControls(db: Db) {
  const items = await db.manualDetectionControl.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });
  return [...items].sort((a, b) => {
    const rankA = manualScopeRank(a.scope);
    const rankB = manualScopeRank(b.scope);
    if (rankA !== rankB) return rankA - rankB;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function findApplicableManualDetectionControl(
  db: Db,
  member: { username: string; agentId: string | null },
) {
  const controls = await getAllActiveManualDetectionControls(db);
  if (controls.length === 0) return null;

  const memberControl = controls.find(
    (control) =>
      control.scope === 'MEMBER' &&
      control.targetMemberUsername === member.username,
  );
  if (memberControl) {
    return { control: memberControl, depth: -1 };
  }

  const ancestors = member.agentId ? await getAgentAncestors(db, member.agentId) : [];
  const lineCandidates = controls
    .filter(
      (control) =>
        control.scope === 'AGENT_LINE' &&
        control.targetAgentId &&
        ancestors.includes(control.targetAgentId),
    )
    .map((control) => ({
      control,
      depth: ancestors.indexOf(control.targetAgentId as string),
    }))
    .sort((a, b) => a.depth - b.depth || b.control.createdAt.getTime() - a.control.createdAt.getTime());
  if (lineCandidates.length > 0) return lineCandidates[0];

  const allControl = controls.find((control) => control.scope === 'ALL');
  if (!allControl) return null;
  return { control: allControl, depth: Number.POSITIVE_INFINITY };
}

export async function checkAndCompleteManualDetectionControls(
  db: Db,
): Promise<{ completedCount: number }> {
  const activeControls = await getAllActiveManualDetectionControls(db);
  let completedCount = 0;

  for (const control of activeControls) {
    if (control.scope === 'ALL') continue;

    const settlement = await calculateCurrentSettlement(
      db,
      control.scope,
      control.targetAgentId,
      control.targetMemberUsername,
    );
    const reached = isTargetReached(
      settlement.superiorSettlement,
      control.targetSettlement,
      control.startSettlement,
    );
    if (!reached) continue;

    if (control.scope === 'MEMBER') {
      if (control.isCompleted) continue;
      await db.manualDetectionControl.update({
        where: { id: control.id },
        data: {
          isCompleted: true,
          completedAt: new Date(),
          completionSettlement: settlement.superiorSettlement,
        },
      });
      completedCount += 1;
      continue;
    }

    await db.manualDetectionControl.update({
      where: { id: control.id },
      data: {
        isActive: false,
        isCompleted: true,
        completedAt: new Date(),
        completionSettlement: settlement.superiorSettlement,
      },
    });
    completedCount += 1;
  }

  return { completedCount };
}

export async function getAgentAncestors(db: Db, agentId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string; depth: number }[]>`
    WITH RECURSIVE path AS (
      SELECT id, "parentId", 0 AS depth FROM "Agent" WHERE id = ${agentId}
      UNION ALL
      SELECT a.id, a."parentId", path.depth + 1 AS depth
      FROM "Agent" a
      JOIN path ON a.id = path."parentId"
      WHERE path.depth < 20
    )
    SELECT id, depth FROM path ORDER BY depth ASC
  `;
  return rows.map((row) => row.id);
}

export async function normalizeMemberWinCapDay<T extends { id: string; currentGameDay: string }>(
  db: Db,
  control: T,
) {
  const day = getControlGameDay();
  if (control.currentGameDay === day) return control;
  return db.memberWinCapControl.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayWinAmount: ZERO,
      todayBetCount: 0,
      isCapped: false,
    },
  });
}

export async function normalizeAgentLineCapDay<T extends { id: string; currentGameDay: string }>(
  db: Db,
  control: T,
) {
  const day = getControlGameDay();
  if (control.currentGameDay === day) return control;
  return db.agentLineWinCap.update({
    where: { id: control.id },
    data: {
      currentGameDay: day,
      todayWinAmount: ZERO,
      isCapped: false,
    },
  });
}

function manualScopeRank(scope: ManualDetectionScope): number {
  if (scope === 'MEMBER') return 0;
  if (scope === 'AGENT_LINE') return 1;
  return 2;
}

function toTaipeiDate(now: Date): Date {
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Prisma.Decimal(value);
  return ZERO;
}

function actualChildRebate(agent: Pick<AgentRebateProfile, 'rebateMode' | 'rebatePercentage' | 'maxRebatePercentage'>): Prisma.Decimal {
  if (agent.rebateMode === 'ALL') return ZERO;
  if (agent.rebateMode === 'NONE') return agent.maxRebatePercentage;
  return agent.rebatePercentage;
}

function isTargetReached(
  currentSettlement: Prisma.Decimal,
  targetSettlement: Prisma.Decimal,
  startSettlement: Prisma.Decimal | null,
): boolean {
  if (targetSettlement.eq(0) && startSettlement) {
    if (startSettlement.gt(0)) return currentSettlement.lte(0);
    if (startSettlement.lt(0)) return currentSettlement.gte(0);
    return true;
  }
  return targetSettlement.gte(0)
    ? currentSettlement.gte(targetSettlement)
    : currentSettlement.lte(targetSettlement);
}

async function calculateMemberSettlement(
  db: Db,
  targetMemberUsername?: string | null,
): Promise<SettlementSummary> {
  const window = getControlGameDayWindow();
  if (!targetMemberUsername) return emptySummary(window.gameDay);

  const member = await db.user.findUnique({
    where: { username: targetMemberUsername },
    select: { id: true, agentId: true },
  });
  if (!member?.agentId) return emptySummary(window.gameDay);

  const [aggregate, agent] = await Promise.all([
    queryBetAggregate(db, window, { userId: member.id }),
    db.agent.findUnique({
      where: { id: member.agentId },
      select: {
        id: true,
        parentId: true,
        rebateMode: true,
        rebatePercentage: true,
        maxRebatePercentage: true,
      },
    }),
  ]);
  if (!agent) return toSummary(window.gameDay, aggregate, ZERO);

  const parent = agent.parentId
    ? await db.agent.findUnique({
        where: { id: agent.parentId },
        select: { rebatePercentage: true },
      })
    : null;
  const rebateRate = parent?.rebatePercentage ?? actualChildRebate(agent);
  return toSummary(window.gameDay, aggregate, aggregate.totalBet.mul(rebateRate));
}

async function calculateAgentLineSettlement(
  db: Db,
  targetAgentId?: string | null,
): Promise<SettlementSummary> {
  const window = getControlGameDayWindow();
  if (!targetAgentId) return emptySummary(window.gameDay);
  return calculateAgentSubtreeSettlement(db, targetAgentId, window);
}

async function calculateAllSettlement(db: Db): Promise<SettlementSummary> {
  const window = getControlGameDayWindow();
  const roots = await db.agent.findMany({
    where: { parentId: null, status: { not: 'DELETED' } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (roots.length === 0) return emptySummary(window.gameDay);

  const summaries = await Promise.all(
    roots.map((root) => calculateAgentSubtreeSettlement(db, root.id, window)),
  );
  return summaries.reduce(
    (acc, current) => ({
      gameDay: current.gameDay,
      totalBet: acc.totalBet.add(current.totalBet),
      totalPayout: acc.totalPayout.add(current.totalPayout),
      memberWinLoss: acc.memberWinLoss.add(current.memberWinLoss),
      totalRebate: acc.totalRebate.add(current.totalRebate),
      superiorSettlement: acc.superiorSettlement.add(current.superiorSettlement),
      totalBets: acc.totalBets + current.totalBets,
      totalPlayers: acc.totalPlayers + current.totalPlayers,
      status:
        acc.superiorSettlement.add(current.superiorSettlement).gt(0) ? 'green' : 'red',
      statusText:
        acc.superiorSettlement.add(current.superiorSettlement).gt(0)
          ? '绿色(平台亏损)'
          : '红色(平台盈利)',
    }),
    emptySummary(window.gameDay),
  );
}

async function calculateAgentSubtreeSettlement(
  db: Db,
  agentId: string,
  window: ReturnType<typeof getControlGameDayWindow>,
): Promise<SettlementSummary> {
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      parentId: true,
      rebateMode: true,
      rebatePercentage: true,
      maxRebatePercentage: true,
    },
  });
  if (!agent) return emptySummary(window.gameDay);

  const agentIds = await listAgentDescendants(db, agent.id);
  const members = await db.user.findMany({
    where: { agentId: { in: agentIds } },
    select: { id: true },
  });
  if (members.length === 0) return emptySummary(window.gameDay);

  const aggregate = await queryBetAggregate(db, window, { userIds: members.map((member) => member.id) });
  const parent = agent.parentId
    ? await db.agent.findUnique({
        where: { id: agent.parentId },
        select: { rebatePercentage: true },
      })
    : null;
  const rebateRate = parent?.rebatePercentage ?? actualChildRebate(agent);
  return toSummary(window.gameDay, aggregate, aggregate.totalBet.mul(rebateRate));
}

async function queryBetAggregate(
  db: Db,
  window: ReturnType<typeof getControlGameDayWindow>,
  filter: { userId?: string; userIds?: string[] },
): Promise<BetAggregate> {
  if (filter.userIds && filter.userIds.length === 0) {
    return emptyAggregate();
  }

  const userSql = filter.userId
    ? Prisma.sql`AND "userId" = ${filter.userId}`
    : filter.userIds
      ? Prisma.sql`AND "userId" IN (${Prisma.join(filter.userIds)})`
      : Prisma.sql``;

  const rows = await db.$queryRaw<
    {
      totalBet: string;
      totalPayout: string;
      memberWinLoss: string;
      totalBets: number;
      totalPlayers: number;
    }[]
  >(Prisma.sql`
    SELECT
      COALESCE(SUM("amount"), 0)::text AS "totalBet",
      COALESCE(SUM("payout"), 0)::text AS "totalPayout",
      COALESCE(SUM("profit"), 0)::text AS "memberWinLoss",
      COUNT(*)::int AS "totalBets",
      COUNT(DISTINCT "userId")::int AS "totalPlayers"
    FROM "Bet"
    WHERE "status" = ${SETTLED_STATUS}
      AND "createdAt" >= ${window.start}
      AND "createdAt" < ${window.end}
      ${userSql}
  `);
  const row = rows[0];
  if (!row) return emptyAggregate();
  return {
    totalBet: decimal(row.totalBet),
    totalPayout: decimal(row.totalPayout),
    memberWinLoss: decimal(row.memberWinLoss),
    totalBets: Number(row.totalBets ?? 0),
    totalPlayers: Number(row.totalPlayers ?? 0),
  };
}

function emptyAggregate(): BetAggregate {
  return {
    totalBet: ZERO,
    totalPayout: ZERO,
    memberWinLoss: ZERO,
    totalBets: 0,
    totalPlayers: 0,
  };
}

function emptySummary(gameDay: string): SettlementSummary {
  return {
    gameDay,
    totalBet: ZERO,
    totalPayout: ZERO,
    memberWinLoss: ZERO,
    totalRebate: ZERO,
    superiorSettlement: ZERO,
    totalBets: 0,
    totalPlayers: 0,
    status: 'red',
    statusText: '红色(平台盈利)',
  };
}

function toSummary(
  gameDay: string,
  aggregate: BetAggregate,
  totalRebate: Prisma.Decimal,
): SettlementSummary {
  const superiorSettlement = aggregate.memberWinLoss.add(totalRebate);
  return {
    gameDay,
    totalBet: aggregate.totalBet,
    totalPayout: aggregate.totalPayout,
    memberWinLoss: aggregate.memberWinLoss,
    totalRebate,
    superiorSettlement,
    totalBets: aggregate.totalBets,
    totalPlayers: aggregate.totalPlayers,
    status: superiorSettlement.gt(0) ? 'green' : 'red',
    statusText: superiorSettlement.gt(0) ? '绿色(平台亏损)' : '红色(平台盈利)',
  };
}
