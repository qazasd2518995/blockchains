import { PrismaClient, Prisma, type ServerSeed } from '@prisma/client';
import { sha256, generateServerSeed, generateClientSeed } from '@bg/provably-fair';
import { getBettingLimitForGame, MIN_BET_AMOUNT } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';

const RETRYABLE_ACTIVE_STATE_UNIQUE_INDEXES = new Set([
  'ServerSeed_one_active_per_user_game_key',
  'ClientSeed_one_active_per_user_key',
  'MinesRound_one_active_per_user_key',
  'HiLoRound_one_active_per_user_key',
  'TowerRound_one_active_per_user_key',
  'BlackjackRound_one_active_per_user_key',
]);

function formatBetLimit(value: number): string {
  return value.toLocaleString('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
  });
}

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
    const [bundle] = await this.getActiveBundles(userId, gameCategory, 1, providedClientSeed);
    if (!bundle) {
      throw new ApiError('INTERNAL', 'Unable to prepare game seed');
    }
    return bundle;
  }

  async getActiveBundles(
    userId: string,
    gameCategory: string,
    count: number,
    providedClientSeed?: string,
  ): Promise<ActiveSeedBundle[]> {
    const bundleCount = Math.max(1, Math.floor(count));
    let [server] = await this.tx.$queryRaw<ServerSeed[]>`
      SELECT *
      FROM "ServerSeed"
      WHERE "userId" = ${userId}
        AND "gameCategory" = ${gameCategory}
        AND "isActive" = true
      LIMIT 1
      FOR UPDATE
    `;
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
      data: { nonce: { increment: bundleCount } },
    });

    const firstNonce = incremented.nonce - bundleCount + 1;
    return Array.from({ length: bundleCount }, (_, index) => ({
      serverSeedId: server.id,
      serverSeed: server.seed,
      serverSeedHash: server.seedHash,
      clientSeed: clientSeedRecord.seed,
      nonce: firstNonce + index,
    }));
  }
}

export async function lockUserAndCheckFunds(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: Prisma.Decimal,
  gameId?: string,
  options: { limitAmounts?: Prisma.Decimal[] } = {},
): Promise<{ id: string; balance: Prisma.Decimal; displayName: string | null }> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.disabledAt || user.frozenAt) {
    throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
  }
  const configuredLimit = getBettingLimitForGame(
    user.bettingLimits,
    gameId,
    user.bettingLimitLevel,
  );
  const minBet = Math.max(MIN_BET_AMOUNT, configuredLimit.min);
  const maxBet = Math.min(config.MAX_SINGLE_BET, configuredLimit.max);
  const limitAmounts =
    options.limitAmounts && options.limitAmounts.length > 0 ? options.limitAmounts : [amount];
  const invalidAmount = limitAmounts.find((limitAmount) => limitAmount.lessThanOrEqualTo(0));
  if (invalidAmount) {
    throw new ApiError('BET_OUT_OF_RANGE', `最低下注為 ${formatBetLimit(minBet)}。`);
  }
  const belowMinAmount = limitAmounts.find((limitAmount) => limitAmount.lessThan(minBet));
  if (belowMinAmount) {
    throw new ApiError('BET_OUT_OF_RANGE', `最低下注為 ${formatBetLimit(minBet)}。`);
  }
  const aboveMaxAmount = limitAmounts.find((limitAmount) => limitAmount.greaterThan(maxBet));
  if (aboveMaxAmount) {
    throw new ApiError(
      'BET_OUT_OF_RANGE',
      `本遊戲限紅為 ${formatBetLimit(minBet)}-${formatBetLimit(maxBet)}。`,
    );
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
  meta?: Prisma.InputJsonValue,
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
      meta,
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
  meta?: Prisma.InputJsonValue,
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
      meta,
    },
  });
  return updated.balance;
}

export function serializableTxOpts(): {
  isolationLevel: Prisma.TransactionIsolationLevel;
  maxWait: number;
  timeout: number;
} {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 20_000,
  };
}

export function lockedTxOpts(): {
  isolationLevel: Prisma.TransactionIsolationLevel;
  maxWait: number;
  timeout: number;
} {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 10_000,
    timeout: 20_000,
  };
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
  maxAttempts = 7,
): Promise<T> {
  return runTxWithRetry(prisma, fn, serializableTxOpts(), maxAttempts);
}

/**
 * 適用於交易內已用 SELECT ... FOR UPDATE 明確鎖定資源的流程。
 * ReadCommitted 會讓同玩家/同 seed 下注等待上一筆提交後讀最新資料，
 * 可避免 Serializable 在等待 row lock 後頻繁丟 40001。
 */
export async function runLockedTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  return runTxWithRetry(prisma, fn, lockedTxOpts(), maxAttempts);
}

async function runTxWithRetry<T>(
  prisma: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: Parameters<PrismaClient['$transaction']>[1],
  maxAttempts: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn, opts);
    } catch (err) {
      lastErr = err;
      if (!isRetryableTxError(err) || attempt === maxAttempts) throw err;
      const delay = Math.min(800, 35 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 35);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

function isRetryableTxError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    meta?: { code?: string; target?: unknown };
    message?: string;
  };
  // Prisma known codes
  if (e.code === 'P2034') return true; // transaction write conflict
  if (e.code === 'P2028') return true; // transaction API error (含 deadlock)
  // Postgres raw codes
  if (e.meta?.code === '40001' || e.meta?.code === '40P01') return true;
  // 文字匹配保險
  const msg = String(e.message ?? '').toLowerCase();
  if (
    e.code === 'P2002' &&
    ((typeof e.meta?.target === 'string' &&
      RETRYABLE_ACTIVE_STATE_UNIQUE_INDEXES.has(e.meta.target)) ||
      Array.from(RETRYABLE_ACTIVE_STATE_UNIQUE_INDEXES).some((indexName) =>
        msg.includes(indexName.toLowerCase()),
      ))
  ) {
    return true;
  }
  if (
    msg.includes('write conflict') ||
    msg.includes('deadlock') ||
    msg.includes('serialization failure')
  ) {
    return true;
  }
  return false;
}

export { PrismaClient };
