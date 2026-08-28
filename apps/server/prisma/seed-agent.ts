import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const superUsername = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;
  const isQmoneyRealm = process.env.PLATFORM_REALM === 'qmoney';

  if (!superPassword || superPassword.length < 8) {
    console.error(
      '[seed-agent] SUPER_ADMIN_PASSWORD must be set and at least 8 chars long. Aborting.',
    );
    process.exit(1);
  }

  // 1) Super admin agent
  const existingSuper = await prisma.agent.findUnique({ where: { username: superUsername } });
  let superAdmin = existingSuper;
  if (isQmoneyRealm) {
    const passwordHash = await bcrypt.hash(superPassword, BCRYPT_ROUNDS);
    superAdmin = await prisma.agent.upsert({
      where: { username: superUsername },
      create: {
        username: superUsername,
        passwordHash,
        displayName: '金寶寶總代理',
        level: 0,
        marketType: 'D',
        rebatePercentage: new Prisma.Decimal('0.025'),
        maxRebatePercentage: new Prisma.Decimal('0.025'),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        notes: 'Independent Jin Baobao management root',
      },
      update: {
        passwordHash,
        displayName: '金寶寶總代理',
        parentId: null,
        level: 0,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        activeSessionId: null,
        activeSessionAt: null,
        notes: 'Independent Jin Baobao management root',
      },
    });

    const supersededRoots = await prisma.agent.findMany({
      where: { role: 'SUPER_ADMIN', id: { not: superAdmin.id } },
      select: { id: true },
    });
    const supersededRootIds = supersededRoots.map((agent) => agent.id);
    if (supersededRootIds.length > 0) {
      await prisma.$transaction([
        prisma.user.updateMany({
          where: { agentId: { in: supersededRootIds } },
          data: { agentId: superAdmin.id },
        }),
        prisma.agent.updateMany({
          where: { parentId: { in: supersededRootIds } },
          data: { parentId: superAdmin.id },
        }),
        prisma.agent.updateMany({
          where: { id: { in: supersededRootIds } },
          data: {
            displayName: '已停用總代理',
            status: 'FROZEN',
            activeSessionId: null,
            activeSessionAt: null,
            notes: 'Disabled during independent Jin Baobao admin provisioning',
          },
        }),
      ]);
    }
    console.log(
      `[seed-agent] independent Jin Baobao super-admin "${superUsername}" provisioned; disabled ${supersededRootIds.length} superseded root(s).`,
    );
  } else if (existingSuper) {
    console.log(`[seed-agent] super-admin "${superUsername}" already exists, skipping create.`);
  } else {
    const passwordHash = await bcrypt.hash(superPassword, BCRYPT_ROUNDS);
    superAdmin = await prisma.agent.create({
      data: {
        username: superUsername,
        passwordHash,
        displayName: 'Super Admin',
        level: 0,
        marketType: 'D',
        rebatePercentage: new Prisma.Decimal('0.025'),
        maxRebatePercentage: new Prisma.Decimal('0.025'),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
    });
    console.log(`[seed-agent] super-admin created: ${superUsername}`);
  }

  // 2) System agent（存放歷史 User，確保 agentId 非 null）
  let systemAgent = await prisma.agent.findUnique({ where: { username: 'system' } });
  if (!systemAgent) {
    const systemHash = await bcrypt.hash(`sys-${Date.now()}-${Math.random()}`, BCRYPT_ROUNDS);
    systemAgent = await prisma.agent.create({
      data: {
        username: 'system',
        passwordHash: systemHash,
        displayName: isQmoneyRealm ? '金寶寶系統帳號' : 'System (legacy owner)',
        level: 0,
        marketType: 'D',
        rebatePercentage: new Prisma.Decimal('0'),
        maxRebatePercentage: new Prisma.Decimal('0.025'),
        role: 'AGENT',
        status: 'FROZEN',
        notes: isQmoneyRealm
          ? '金寶寶歷史會員資料的系統歸屬帳號，不可用於登入。'
          : '此 agent 僅作為 Phase A migration 前歷史 User 的 fallback owner，不可用於登入。',
      },
    });
    console.log(`[seed-agent] system agent created (id=${systemAgent.id})`);
  } else if (isQmoneyRealm) {
    systemAgent = await prisma.agent.update({
      where: { id: systemAgent.id },
      data: {
        displayName: '金寶寶系統帳號',
        status: 'FROZEN',
        activeSessionId: null,
        activeSessionAt: null,
        notes: '金寶寶歷史會員資料的系統歸屬帳號，不可用於登入。',
      },
    });
  }

  // 3) Backfill 所有 agentId = null 的既有 User
  const backfill = await prisma.user.updateMany({
    where: { agentId: null },
    data: { agentId: systemAgent.id },
  });
  console.log(`[seed-agent] backfilled ${backfill.count} user(s) under system agent.`);
}

main()
  .catch((err) => {
    console.error('[seed-agent] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
