import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  const username = process.env.SUPER_ADMIN_USERNAME ?? 'superadmin';
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!password || password.length < 8) {
    console.error(
      '[reset-super-admin] SUPER_ADMIN_PASSWORD must be set and at least 8 chars. Aborting.',
    );
    process.exit(1);
  }

  const agent = await prisma.agent.findUnique({ where: { username } });
  if (!agent) {
    console.error(`[reset-super-admin] agent "${username}" not found. Run db:seed:agent first.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await prisma.agent.update({
    where: { id: agent.id },
    data: { passwordHash, status: 'ACTIVE' },
  });

  console.log(`[reset-super-admin] password reset for "${username}" (status=ACTIVE).`);
}

main()
  .catch((err) => {
    console.error('[reset-super-admin] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
