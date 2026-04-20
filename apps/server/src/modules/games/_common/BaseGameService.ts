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

/**
 * PostgreSQL 的 Serializable 隔離級別下，並發交易可能產生
 * 40001 (serialization_failure) 或 P2034/P2028 死鎖錯誤。
 * 語意上應自動重試——本函式包裹 `prisma.$transaction`，
 * 遇到可重試錯誤時最多重試 N 次。
 */
export async function runSerializable<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn, serializableTxOpts());
    } catch (err) {
      lastErr = err;
      if (!isRetryableTxError(err) || attempt === maxAttempts) throw err;
      // 指數退避 + 小抖動：20, 40, 80ms
      const delay = 20 * 2 ** (attempt - 1) + Math.floor(Math.random() * 10);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function isRetryableTxError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    meta?: { code?: string };
    message?: string;
  };
  // Prisma known codes
  if (e.code === 'P2034') return true; // transaction write conflict
  if (e.code === 'P2028') return true; // transaction API error (含 deadlock)
  // Postgres raw codes
  if (e.meta?.code === '40001' || e.meta?.code === '40P01') return true;
  // 文字匹配保險
  const msg = String(e.message ?? '').toLowerCase();
  if (msg.includes('write conflict') || msg.includes('deadlock') || msg.includes('serialization failure')) {
    return true;
  }
  return false;
}

export { PrismaClient };
