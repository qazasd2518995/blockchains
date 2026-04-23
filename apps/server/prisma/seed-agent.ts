import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const superUsername = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
  const superPassword = process.env.SUPER_ADMIN_PASSWORD;

  if (!superPassword || superPassword.length < 8) {
    console.error(
      '[seed-agent] SUPER_ADMIN_PASSWORD must be set and at least 8 chars long. Aborting.',
    );
    process.exit(1);
  }

  // 1) Super admin agent
  const existingSuper = await prisma.agent.findUnique({ where: { username: superUsername } });
  if (existingSuper) {
    console.log(`[seed-agent] super-admin "${superUsername}" already exists, skipping create.`);
  } else {
    const passwordHash = await bcrypt.hash(superPassword, BCRYPT_ROUNDS);
    await prisma.agent.create({
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
        displayName: 'System (legacy owner)',
        level: 0,
        marketType: 'D',
        rebatePercentage: new Prisma.Decimal('0'),
        maxRebatePercentage: new Prisma.Decimal('0.025'),
        role: 'AGENT',
        status: 'FROZEN',
        notes: '此 agent 僅作為 Phase A migration 前歷史 User 的 fallback owner，不可用於登入。',
      },
    });
    console.log(`[seed-agent] system agent created (id=${systemAgent.id})`);
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
