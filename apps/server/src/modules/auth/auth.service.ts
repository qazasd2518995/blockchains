import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { CaptchaResponse, UserPublic } from '@bg/shared';
import { ApiError } from '../../utils/errors.js';
import { config } from '../../config.js';
import { randomBytes, createHash } from 'node:crypto';
import type { LoginInput } from './auth.schema.js';
import { CaptchaService } from '../../utils/captcha.js';

const BCRYPT_ROUNDS = 12;

export interface JwtSigner {
  sign(payload: { sub: string; role: string; sid: string }): string;
}

export class AuthService {
  private readonly captcha = new CaptchaService();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: JwtSigner,
  ) {}

  issueCaptcha(): CaptchaResponse {
    return this.captcha.issue();
  }

  async login(
    input: LoginInput,
  ): Promise<{ user: UserPublic; accessToken: string; refreshToken: string }> {
    this.captcha.verify(input.captchaCode, input.captchaToken);

    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    if (!user) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');
    if (user.disabledAt) throw new ApiError('MEMBER_FROZEN', 'Member account is disabled');
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');

    const sessionId = randomBytes(24).toString('hex');
    const { publicUser, tokens } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { activeSessionId: sessionId, activeSessionAt: new Date() },
      });
      return {
        publicUser: this.toPublic(updated),
        tokens: await this.issueTokens(updated.id, updated.role, sessionId, tx),
      };
    });
    return { user: publicUser, ...tokens };
  }

  async getMe(userId: string): Promise<UserPublic> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found');
    return this.toPublic(user);
  }

  async changePassword(
    userId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found');
    if (user.disabledAt) throw new ApiError('MEMBER_FROZEN', 'Member account is disabled');

    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', 'Invalid current password');
    if (input.currentPassword === input.newPassword) {
      throw new ApiError('INVALID_CREDENTIALS', 'New password must be different');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefresh(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!record || record.revokedAt || record.expiresAt < new Date()) {
        throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
      }
      const revoked = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
      const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      if (user.disabledAt) throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
      if (!record.sessionId || user.activeSessionId !== record.sessionId) {
        throw new ApiError(
          'SESSION_REPLACED',
          'Logged out because this account signed in on another device',
        );
      }
      return this.issueTokens(user.id, user.role, record.sessionId, tx);
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefresh(refreshToken);
    await this.prisma
      .$transaction(async (tx) => {
        const record = await tx.refreshToken.findUnique({ where: { tokenHash } });
        if (!record) return;
        await tx.refreshToken.updateMany({
          where: { id: record.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (record.sessionId) {
          await tx.user.updateMany({
            where: { id: record.userId, activeSessionId: record.sessionId },
            data: { activeSessionId: null, activeSessionAt: null },
          });
        }
      })
      .catch(() => undefined);
  }

  private async issueTokens(
    userId: string,
    role: string,
    sessionId: string,
    db: PrismaClient | Prisma.TransactionClient = this.prisma,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwt.sign({ sub: userId, role, sid: sessionId });
    const refreshToken = randomBytes(48).toString('hex');
    const ttlMs = parseDuration(config.JWT_REFRESH_TTL);
    await db.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefresh(refreshToken),
        sessionId,
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
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return value * multiplier;
}
