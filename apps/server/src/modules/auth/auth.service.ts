import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { UserPublic } from '@bg/shared';
import { ApiError } from '../../utils/errors.js';
import { config } from '../../config.js';
import { randomBytes, createHash } from 'node:crypto';
import type { LoginInput } from './auth.schema.js';

export interface JwtSigner {
  sign(payload: { sub: string; role: string }): string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: JwtSigner,
  ) {}

  async login(
    input: LoginInput,
  ): Promise<{ user: UserPublic; accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (!user) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');
    if (user.disabledAt) throw new ApiError('MEMBER_FROZEN', 'Member account is disabled');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');

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
    if (user.disabledAt) throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
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
    username: string;
    displayName: string | null;
    balance: Prisma.Decimal;
    role: string;
    createdAt: Date;
  }): UserPublic {
    return {
      id: user.id,
      username: user.username,
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
