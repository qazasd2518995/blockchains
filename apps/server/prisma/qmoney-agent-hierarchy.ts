import { Prisma } from '@prisma/client';

export const QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME =
  process.env.QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME?.trim() || 'jinbaobao_exception';

export const QMONEY_TEST_PLAYER_USERNAMES = [
  'testplayer1',
  'testplayer2',
  'testplayer3',
  'testplayer4',
  'testplayer5',
  'testplayer6',
] as const;

const CONTROL_EXCLUDED_DISPLAY_NAME = '金寶寶例外測試線（不計交收）';
const CONTROL_EXCLUDED_NOTES =
  '金寶寶例外線：個別與代理控制照常套用，但整條下級樹不計入全盤控制交收與全域每日贏分限制。';

function inputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function provisionQmoneyControlExcludedLine(
  tx: Prisma.TransactionClient,
  input: {
    superAdminId: string;
    createPasswordHash: string;
    assignTestPlayers?: boolean;
  },
): Promise<{ id: string; username: string }> {
  const superAdmin = await tx.agent.findUnique({ where: { id: input.superAdminId } });
  if (!superAdmin || superAdmin.role !== 'SUPER_ADMIN' || superAdmin.status !== 'ACTIVE') {
    throw new Error('Active Jin Baobao super admin is required before provisioning exception line');
  }

  const existing = await tx.agent.findUnique({
    where: { username: QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME },
    select: { id: true, role: true },
  });
  if (existing && existing.role !== 'AGENT') {
    throw new Error(
      `Qmoney exception username ${QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME} belongs to a non-agent account`,
    );
  }

  const line = await tx.agent.upsert({
    where: { username: QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME },
    create: {
      username: QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME,
      passwordHash: input.createPasswordHash,
      displayName: CONTROL_EXCLUDED_DISPLAY_NAME,
      parentId: superAdmin.id,
      level: superAdmin.level + 1,
      marketType: superAdmin.marketType,
      balance: new Prisma.Decimal(0),
      commissionBalance: new Prisma.Decimal(0),
      commissionRate: new Prisma.Decimal(0),
      rebateMode: superAdmin.rebateMode,
      rebatePercentage: superAdmin.rebatePercentage,
      maxRebatePercentage: superAdmin.maxRebatePercentage,
      baccaratRebateMode: superAdmin.baccaratRebateMode,
      baccaratRebatePercentage: superAdmin.baccaratRebatePercentage,
      maxBaccaratRebatePercentage: superAdmin.maxBaccaratRebatePercentage,
      bettingLimitLevel: superAdmin.bettingLimitLevel,
      bettingLimits: inputJson(superAdmin.bettingLimits),
      excludeFromControlSettlement: true,
      role: 'AGENT',
      status: 'ACTIVE',
      notes: CONTROL_EXCLUDED_NOTES,
    },
    update: {
      displayName: CONTROL_EXCLUDED_DISPLAY_NAME,
      parentId: superAdmin.id,
      level: superAdmin.level + 1,
      marketType: superAdmin.marketType,
      rebateMode: superAdmin.rebateMode,
      rebatePercentage: superAdmin.rebatePercentage,
      maxRebatePercentage: superAdmin.maxRebatePercentage,
      baccaratRebateMode: superAdmin.baccaratRebateMode,
      baccaratRebatePercentage: superAdmin.baccaratRebatePercentage,
      maxBaccaratRebatePercentage: superAdmin.maxBaccaratRebatePercentage,
      bettingLimitLevel: superAdmin.bettingLimitLevel,
      bettingLimits: inputJson(superAdmin.bettingLimits),
      excludeFromControlSettlement: true,
      role: 'AGENT',
      status: 'ACTIVE',
      notes: CONTROL_EXCLUDED_NOTES,
    },
    select: { id: true, username: true },
  });

  if (input.assignTestPlayers) {
    await tx.user.updateMany({
      where: { username: { in: [...QMONEY_TEST_PLAYER_USERNAMES] } },
      data: { agentId: line.id },
    });
  }

  return line;
}
