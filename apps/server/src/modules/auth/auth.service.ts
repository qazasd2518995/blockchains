import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { UserPublic } from '@bg/shared';
import { generateServerSeed, generateClientSeed, sha256 } from '@bg/provably-fair';
import { ApiError } from '../../utils/errors.js';
import { config } from '../../config.js';
import { randomBytes, createHash } from 'node:crypto';
import type { RegisterInput, LoginInput } from './auth.schema.js';

const BCRYPT_ROUNDS = 12;

export interface JwtSigner {
  sign(payload: { sub: string; role: string }): string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: JwtSigner,
  ) {}

  async register(
    input: RegisterInput,
  ): Promise<{ user: UserPublic; accessToken: string; refreshToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError('EMAIL_TAKEN', 'Email already in use');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          balance: new Prisma.Decimal(config.SIGNUP_BONUS),
        },
      });

      await tx.transaction.create({
        data: {
          userId: created.id,
          type: 'SIGNUP_BONUS',
          amount: new Prisma.Decimal(config.SIGNUP_BONUS),
          balanceAfter: new Prisma.Decimal(config.SIGNUP_BONUS),
          meta: { reason: 'New user signup' },
        },
      });

      const clientSeed = generateClientSeed();
      await tx.clientSeed.create({
        data: { userId: created.id, seed: clientSeed, isActive: true },
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

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toPublic(user), ...tokens };
  }

  async login(
    input: LoginInput,
  ): Promise<{ user: UserPublic; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', 'Invalid email or password');

    const tokens = await this.issueTokens(user.id, user.role);
    return { user: this.toPublic(user), ...tokens };
  }

  async getMe(userId: string): Promise<UserPublic> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found');
    return this.toPublic(user);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefresh(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: record.userId } });
    return this.issueTokens(user.id, user.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefresh(refreshToken);
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => {
        // ignore
      });
  }

  private async issueTokens(
    userId: string,
    role: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwt.sign({ sub: userId, role });
    const refreshToken = randomBytes(48).toString('hex');
    const ttlMs = parseDuration(config.JWT_REFRESH_TTL);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefresh(refreshToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return { accessToken, refreshToken };
  }

  private toPublic(user: {
    id: string;
    email: string;
    displayName: string | null;
    balance: Prisma.Decimal;
    role: string;
    createdAt: Date;
  }): UserPublic {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      balance: user.balance.toFixed(2),
      role: user.role as UserPublic['role'],
      createdAt: user.createdAt.toISOString(),
    };
  }
}

function hashRefresh(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDuration(d: string): number {
  const match = /^(\d+)([smhd])$/.exec(d);
  if (!match) return 7 * 24 * 3600 * 1000;
  const value = Number.parseInt(match[1] ?? '0', 10);
  const unit = match[2];
  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return value * multiplier;
}
