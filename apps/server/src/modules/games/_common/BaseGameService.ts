import { PrismaClient, Prisma } from '@prisma/client';
import { sha256, generateServerSeed, generateClientSeed } from '@bg/provably-fair';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';

export interface ActiveSeedBundle {
  serverSeedId: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export class SeedHelper {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async getActiveBundle(
    userId: string,
    gameCategory: string,
    providedClientSeed?: string,
  ): Promise<ActiveSeedBundle> {
    let server = await this.tx.serverSeed.findFirst({
      where: { userId, gameCategory, isActive: true },
    });
    if (!server) {
      const seed = generateServerSeed();
      server = await this.tx.serverSeed.create({
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

    let clientSeedRecord = await this.tx.clientSeed.findFirst({
      where: { userId, isActive: true },
    });
    if (providedClientSeed) {
      const trimmed = providedClientSeed.trim();
      if (trimmed.length >= 4 && trimmed !== clientSeedRecord?.seed) {
        await this.tx.clientSeed.updateMany({
          where: { userId, isActive: true },
          data: { isActive: false },
        });
        clientSeedRecord = await this.tx.clientSeed.create({
          data: { userId, seed: trimmed, isActive: true },
        });
      }
    }
    if (!clientSeedRecord) {
      clientSeedRecord = await this.tx.clientSeed.create({
        data: { userId, seed: generateClientSeed(), isActive: true },
      });
    }

    const incremented = await this.tx.serverSeed.update({
      where: { id: server.id },
      data: { nonce: { increment: 1 } },
    });

    return {
      serverSeedId: server.id,
      serverSeed: server.seed,
      serverSeedHash: server.seedHash,
      clientSeed: clientSeedRecord.seed,
      nonce: incremented.nonce,
    };
  }
}

export async function lockUserAndCheckFunds(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: Prisma.Decimal,
): Promise<{ id: string; balance: Prisma.Decimal; displayName: string | null }> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (amount.lessThanOrEqualTo(0)) {
    throw new ApiError('INVALID_BET', 'Bet amount must be positive');
  }
  if (amount.greaterThan(config.MAX_SINGLE_BET)) {
    throw new ApiError('BET_OUT_OF_RANGE', `Max single bet is ${config.MAX_SINGLE_BET}`);
  }
  if (user.balance.lessThan(amount)) {
    throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
  }
  return user;
}

export async function debitAndRecord(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: Prisma.Decimal,
  betId: string | null = null,
): Promise<Prisma.Decimal> {
  const updated = await tx.user.update({
    where: { id: userId },
    data: { balance: { decrement: amount } },
  });
  await tx.transaction.create({
    data: {
      userId,
      type: 'BET_PLACE',
      amount: amount.negated(),
      balanceAfter: updated.balance,
      betId,
    },
  });
  return updated.balance;
}

export async function creditAndRecord(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: Prisma.Decimal,
  betId: string | null = null,
  type: 'BET_WIN' | 'CASHOUT' = 'BET_WIN',
): Promise<Prisma.Decimal> {
  if (amount.lessThanOrEqualTo(0)) {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return user.balance;
  }
  const updated = await tx.user.update({
    where: { id: userId },
    data: { balance: { increment: amount } },
  });
  await tx.transaction.create({
    data: {
      userId,
      type,
      amount,
      balanceAfter: updated.balance,
      betId,
    },
  });
  return updated.balance;
}

export function serializableTxOpts(): { isolationLevel: Prisma.TransactionIsolationLevel } {
  return { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
}

export { PrismaClient };
