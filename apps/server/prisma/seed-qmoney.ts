import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { createPlayerSeeds } from '../src/modules/auth/player-seeds.js';
import {
  provisionQmoneyControlExcludedLine,
  QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME,
} from './qmoney-agent-hierarchy.js';

const EXPECTED_CONFIRMATION = 'create-isolated-qmoney-accounts';
const TARGET_BALANCE = new Prisma.Decimal('900000');
const BCRYPT_ROUNDS = 12;
const accountMappings = [
  { targetUsername: 'testplayer1', sourceUsername: 'testplayer', displayName: '測試玩家1' },
  { targetUsername: 'testplayer2', sourceUsername: 'testplayer2', displayName: '測試玩家2' },
  { targetUsername: 'testplayer3', sourceUsername: 'testplayer3', displayName: '測試玩家3' },
  { targetUsername: 'testplayer4', sourceUsername: 'testplayer4', displayName: '測試玩家4' },
  { targetUsername: 'testplayer5', sourceUsername: 'testplayer5', displayName: '測試玩家5' },
  { targetUsername: 'testplayer6', sourceUsername: 'testplayer6', displayName: '測試玩家6' },
] as const;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function databaseIdentity(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Qmoney account seed only supports PostgreSQL URLs');
  }
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}

function inputJson(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function main(): Promise<void> {
  if (process.env.QMONEY_ACCOUNT_CLONE_CONFIRM !== EXPECTED_CONFIRMATION) {
    throw new Error(
      `QMONEY_ACCOUNT_CLONE_CONFIRM must equal ${EXPECTED_CONFIRMATION}; refusing to write accounts`,
    );
  }

  const sourceUrl = requiredEnv('QMONEY_SOURCE_DATABASE_URL');
  const targetUrl = requiredEnv('QMONEY_TARGET_DATABASE_URL');
  const superUsername = requiredEnv('SUPER_ADMIN_USERNAME');
  const superPassword = requiredEnv('SUPER_ADMIN_PASSWORD');
  if (superPassword.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  }
  if (databaseIdentity(sourceUrl) === databaseIdentity(targetUrl)) {
    throw new Error('Source and target databases must be different');
  }

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient({ datasourceUrl: targetUrl });

  try {
    const sourceUsers = await source.user.findMany({
      where: { username: { in: accountMappings.map((account) => account.sourceUsername) } },
    });
    const sourceUserByUsername = new Map(sourceUsers.map((user) => [user.username, user]));
    const missingSourceUsers = accountMappings
      .filter((account) => !sourceUserByUsername.has(account.sourceUsername))
      .map((account) => account.sourceUsername);
    if (missingSourceUsers.length > 0) {
      throw new Error(`Missing source test accounts: ${missingSourceUsers.join(', ')}`);
    }
    const superPasswordHash = await bcrypt.hash(superPassword, BCRYPT_ROUNDS);
    const exceptionPasswordHash = await bcrypt.hash(
      `${superPassword}:${QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME}:control-excluded-line`,
      BCRYPT_ROUNDS,
    );

    await target.$transaction(
      async (tx) => {
        await tx.agent.updateMany({
          where: {
            role: 'SUPER_ADMIN',
            username: { not: superUsername },
          },
          data: {
            status: 'FROZEN',
            activeSessionId: null,
            activeSessionAt: null,
            notes: 'Disabled during independent Jin Baobao admin provisioning',
          },
        });

        const targetSuperAdmin = await tx.agent.upsert({
          where: { username: superUsername },
          create: {
            username: superUsername,
            passwordHash: superPasswordHash,
            displayName: '金寶寶總代理',
            parentId: null,
            level: 0,
            marketType: 'D',
            balance: new Prisma.Decimal(0),
            commissionBalance: new Prisma.Decimal(0),
            rebatePercentage: new Prisma.Decimal('0.025'),
            maxRebatePercentage: new Prisma.Decimal('0.025'),
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            notes: 'Independent Jin Baobao management root',
            twoFactorRequired: false,
            twoFactorEnabled: false,
          },
          update: {
            // Preserve an explicitly reset production password when this
            // account/bootstrap script is rerun.
            displayName: '金寶寶總代理',
            parentId: null,
            level: 0,
            role: 'SUPER_ADMIN',
            status: 'ACTIVE',
            activeSessionId: null,
            activeSessionAt: null,
            twoFactorRequired: false,
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorLastUsedStep: null,
            twoFactorLastUsedAt: null,
            notes: 'Independent Jin Baobao management root',
          },
        });

        const targetExceptionLine = await provisionQmoneyControlExcludedLine(tx, {
          superAdminId: targetSuperAdmin.id,
          createPasswordHash: exceptionPasswordHash,
        });

        for (const account of accountMappings) {
          const sourceUser = sourceUserByUsername.get(account.sourceUsername)!;
          const existing = await tx.user.findUnique({ where: { username: account.targetUsername } });
          const assignedAgentId = targetExceptionLine.id;

          const targetUser = existing
            ? await tx.user.update({
                where: { id: existing.id },
                data: {
                  passwordHash: sourceUser.passwordHash,
                  displayName: account.displayName,
                  balance: TARGET_BALANCE,
                  role: 'PLAYER',
                  agentId: assignedAgentId,
                  marketType: sourceUser.marketType,
                  bettingLimitLevel: sourceUser.bettingLimitLevel,
                  bettingLimits: inputJson(sourceUser.bettingLimits),
                  frozenAt: null,
                  disabledAt: null,
                  activeSessionId: null,
                  activeSessionAt: null,
                  notes: 'Independent Qmoney test account',
                },
              })
            : await tx.user.create({
                data: {
                  username: account.targetUsername,
                  passwordHash: sourceUser.passwordHash,
                  displayName: account.displayName,
                  balance: TARGET_BALANCE,
                  role: 'PLAYER',
                  agentId: assignedAgentId,
                  marketType: sourceUser.marketType,
                  bettingLimitLevel: sourceUser.bettingLimitLevel,
                  bettingLimits: inputJson(sourceUser.bettingLimits),
                  notes: 'Independent Qmoney test account',
                },
              });

          const previousBalance = existing?.balance ?? new Prisma.Decimal(0);
          const adjustment = TARGET_BALANCE.sub(previousBalance);
          if (!adjustment.isZero()) {
            await tx.transaction.create({
              data: {
                userId: targetUser.id,
                type: existing ? 'ADJUSTMENT' : 'SIGNUP_BONUS',
                amount: adjustment,
                balanceAfter: TARGET_BALANCE,
                meta: {
                  reason: 'Independent Qmoney test account provisioning',
                  sourceUsername: account.sourceUsername,
                },
              },
            });
          }

          const [clientSeedCount, serverSeedCount] = await Promise.all([
            tx.clientSeed.count({ where: { userId: targetUser.id } }),
            tx.serverSeed.count({ where: { userId: targetUser.id } }),
          ]);
          if (clientSeedCount === 0 && serverSeedCount === 0) {
            await createPlayerSeeds(tx, targetUser.id);
          }
        }
      },
      { timeout: 30_000 },
    );

    console.log(
      `[seed-qmoney] provisioned independent Jin Baobao super admin "${superUsername}", control-excluded line "${QMONEY_CONTROL_EXCLUDED_AGENT_USERNAME}", and ${accountMappings.length} test account(s) at ${TARGET_BALANCE.toFixed(2)} each`,
    );
  } finally {
    await Promise.allSettled([source.$disconnect(), target.$disconnect()]);
  }
}

main().catch((error) => {
  console.error('[seed-qmoney] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
