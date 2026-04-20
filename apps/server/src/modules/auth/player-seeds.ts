import type { Prisma } from '@prisma/client';
import { generateServerSeed, generateClientSeed, sha256 } from '@bg/provably-fair';

const DEFAULT_GAME_CATEGORIES = ['dice', 'mines'];

/**
 * 為新建立的玩家帳號初始化 provably-fair 種子：1 個 ClientSeed + 多個 ServerSeed。
 * 原本嵌在 AuthService.register 內；拆除公開註冊後由 MemberService.create 復用。
 */
export async function createPlayerSeeds(
  tx: Prisma.TransactionClient,
  userId: string,
  gameCategories: string[] = DEFAULT_GAME_CATEGORIES,
): Promise<void> {
  const clientSeed = generateClientSeed();
  await tx.clientSeed.create({
    data: { userId, seed: clientSeed, isActive: true },
  });

  for (const gameCategory of gameCategories) {
    const seed = generateServerSeed();
    await tx.serverSeed.create({
      data: {
        userId,
        gameCategory,
        seed,
        seedHash: sha256(seed),
        isActive: true,
        nonce: 0,
      },
    });
  }
}
