import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
  const target = new Prisma.Decimal(process.env.BALANCE ?? '9000000');

  const agent = await prisma.agent.findUnique({ where: { username } });
  if (!agent) {
    console.error(`[set-super-admin-balance] agent "${username}" not found.`);
    process.exit(1);
  }

  const updated = await prisma.agent.update({
    where: { id: agent.id },
    data: { balance: target },
  });

  console.log(
    `[set-super-admin-balance] "${username}" balance ${agent.balance.toFixed(2)} → ${updated.balance.toFixed(2)}`,
  );
}

main()
  .catch((err) => {
    console.error('[set-super-admin-balance] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
