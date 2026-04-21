import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcrypt';
import { sha256, generateServerSeed, generateClientSeed } from '@bg/provably-fair';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const adminUsername = 'admin';
  const existing = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (existing) {
    console.log(`[seed] admin already exists (${adminUsername})`);
    return;
  }

  const passwordHash = await bcrypt.hash('admin123456', 12);
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username: adminUsername,
        passwordHash,
        displayName: 'Admin',
        role: 'ADMIN',
        balance: new Prisma.Decimal(10000),
      },
    });
    await tx.transaction.create({
      data: {
        userId: created.id,
        type: 'SIGNUP_BONUS',
        amount: new Prisma.Decimal(10000),
        balanceAfter: new Prisma.Decimal(10000),
        meta: { note: 'Admin seeded' },
      },
    });
    await tx.clientSeed.create({
      data: { userId: created.id, seed: generateClientSeed(), isActive: true },
    });
    for (const gameCategory of ['dice', 'mines']) {
      const seed = generateServerSeed();
      await tx.serverSeed.create({
        data: {
          userId: created.id,
          gameCategory,
          seed,
          seedHash: sha256(seed),
          isActive: true,
          nonce: 0,
        },
      });
    }
    return created;
  });

  console.log(`[seed] Admin user created: ${user.username} / admin123456`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
