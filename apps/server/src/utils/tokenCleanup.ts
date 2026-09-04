import type { PrismaClient } from '@prisma/client';

export async function cleanupExpiredAuthTokens(
  prisma: Pick<PrismaClient, 'refreshToken' | 'agentRefreshToken'>,
  now = new Date(),
): Promise<{ memberTokens: number; adminTokens: number }> {
  const [memberTokens, adminTokens] = await Promise.all([
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.agentRefreshToken.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  return { memberTokens: memberTokens.count, adminTokens: adminTokens.count };
}
