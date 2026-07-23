import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { type AdminCaptchaResponse, type AgentPublic } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';
import { randomBytes, createHash } from 'node:crypto';
import type { AdminChangePasswordInput, AdminLoginInput } from './adminAuth.schema.js';
import { CaptchaService } from '../../../utils/captcha.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import { writeAudit } from '../audit/audit.service.js';
import {
  createOtpAuthUrl,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotp,
} from './totp.js';
import { normalizeStoredAgentBettingLimitOptions } from '../bettingLimits.js';

const BCRYPT_ROUNDS = 12;

export interface AdminJwtSigner {
  sign(payload: Record<string, unknown>): string;
}

export class AdminAuthService {
  private readonly captcha = new CaptchaService();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: AdminJwtSigner,
  ) {}

  issueCaptcha(): AdminCaptchaResponse {
    return this.captcha.issue();
  }

  async login(input: AdminLoginInput): Promise<
    | { agent: AgentPublic; accessToken: string; refreshToken: string }
    | {
        requiresTwoFactor: true;
        setupRequired: boolean;
        manualKey: string | null;
        otpauthUrl: string | null;
        message: string;
      }
  > {
    this.captcha.verify(input.captchaCode, input.captchaToken);

    const agent = await this.prisma.agent.findUnique({ where: { username: input.username } });
    if (!agent) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');
    if (agent.status === 'DISABLED' || agent.status === 'DELETED') {
      throw new ApiError('AGENT_FROZEN', 'Agent account is not active');
    }
    const ok = await bcrypt.compare(input.password, agent.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');

    const twoFactor = await this.verifyTwoFactor(agent, input.twoFactorCode);
    if (!twoFactor.verified) {
      return {
        requiresTwoFactor: true,
        setupRequired: twoFactor.setupRequired,
        manualKey: twoFactor.manualKey,
        otpauthUrl: twoFactor.otpauthUrl,
        message: twoFactor.message,
      };
    }

    const sessionId = randomBytes(24).toString('hex');
    const { publicAgent, tokens } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.agent.update({
        where: { id: agent.id },
        data: { lastLoginAt: new Date(), activeSessionId: sessionId, activeSessionAt: new Date() },
      });
      return {
        publicAgent: this.toPublic(updated),
        tokens: await this.issueTokens(
          updated.id,
          updated.username,
          updated.role,
          updated.level,
          sessionId,
          tx,
        ),
      };
    });
    return { agent: publicAgent, ...tokens };
  }

  async getMe(agentId: string): Promise<AgentPublic> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    return this.toPublic(agent);
  }

  async changePassword(
    operator: AdminCurrent,
    input: AdminChangePasswordInput,
    req?: FastifyRequest,
  ): Promise<void> {
    const agent = await this.prisma.agent.findUnique({ where: { id: operator.id } });
    if (!agent) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    if (agent.status === 'DISABLED' || agent.status === 'DELETED') {
      throw new ApiError('AGENT_FROZEN', 'Agent account is not active');
    }

    const ok = await bcrypt.compare(input.currentPassword, agent.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', '目前密碼錯誤');
    if (input.currentPassword === input.newPassword) {
      throw new ApiError('INVALID_ACTION', '新密碼不能與目前密碼相同');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.prisma.agent.update({ where: { id: operator.id }, data: { passwordHash } });
    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'auth.password.change',
      targetType: 'agent',
      targetId: operator.id,
      req,
    });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefresh(refreshToken);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.agentRefreshToken.findUnique({ where: { tokenHash } });
      if (!record || record.revokedAt || record.expiresAt < new Date()) {
        throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
      }
      const revoked = await tx.agentRefreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count !== 1) throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
      const agent = await tx.agent.findUniqueOrThrow({ where: { id: record.agentId } });
      if (agent.status === 'DISABLED' || agent.status === 'DELETED') {
        throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
      }
      if (!record.sessionId || agent.activeSessionId !== record.sessionId) {
        throw new ApiError(
          'SESSION_REPLACED',
          'Logged out because this account signed in on another device',
        );
      }
      return this.issueTokens(
        agent.id,
        agent.username,
        agent.role,
        agent.level,
        record.sessionId,
        tx,
      );
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefresh(refreshToken);
    await this.prisma
      .$transaction(async (tx) => {
        const record = await tx.agentRefreshToken.findUnique({ where: { tokenHash } });
        if (!record) return;
        await tx.agentRefreshToken.updateMany({
          where: { id: record.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (record.sessionId) {
          await tx.agent.updateMany({
            where: { id: record.agentId, activeSessionId: record.sessionId },
            data: { activeSessionId: null, activeSessionAt: null },
          });
        }
      })
      .catch(() => undefined);
  }

  private async issueTokens(
    agentId: string,
    username: string,
    role: string,
    level: number,
    sessionId: string,
    db: PrismaClient | Prisma.TransactionClient = this.prisma,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwt.sign({
      sub: agentId,
      username,
      role,
      level,
      aud: 'admin',
      sid: sessionId,
    });
    const refreshToken = randomBytes(48).toString('hex');
    const ttlMs = parseDuration(config.ADMIN_SESSION_TTL);
    await db.agentRefreshToken.create({
      data: {
        agentId,
        tokenHash: hashRefresh(refreshToken),
        sessionId,
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return { accessToken, refreshToken };
  }

  private toPublic(agent: {
    id: string;
    username: string;
    displayName: string | null;
    parentId: string | null;
    level: number;
    marketType: 'D' | 'A';
    balance: Prisma.Decimal;
    commissionBalance: Prisma.Decimal;
    commissionRate: Prisma.Decimal;
    rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
    rebatePercentage: Prisma.Decimal;
    maxRebatePercentage: Prisma.Decimal;
    baccaratRebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
    baccaratRebatePercentage: Prisma.Decimal;
    maxBaccaratRebatePercentage: Prisma.Decimal;
    bettingLimitLevel: string;
    bettingLimits?: Prisma.JsonValue;
    status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
    role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
    notes: string | null;
    lastLoginAt: Date | null;
    createdAt: Date;
  }): AgentPublic {
    return {
      id: agent.id,
      username: agent.username,
      displayName: agent.displayName,
      parentId: agent.parentId,
      level: agent.level,
      marketType: agent.marketType,
      balance: agent.balance.toFixed(2),
      commissionBalance: agent.commissionBalance.toFixed(2),
      commissionRate: agent.commissionRate.toFixed(4),
      rebateMode: agent.rebateMode,
      rebatePercentage: agent.rebatePercentage.toFixed(4),
      maxRebatePercentage: agent.maxRebatePercentage.toFixed(4),
      baccaratRebateMode: agent.baccaratRebateMode,
      baccaratRebatePercentage: agent.baccaratRebatePercentage.toFixed(4),
      maxBaccaratRebatePercentage: agent.maxBaccaratRebatePercentage.toFixed(4),
      bettingLimitLevel: agent.bettingLimitLevel,
      bettingLimits: normalizeStoredAgentBettingLimitOptions(
        agent.bettingLimits,
        agent.bettingLimitLevel,
      ),
      status: agent.status,
      role: agent.role,
      notes: agent.notes,
      lastLoginAt: agent.lastLoginAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
    };
  }

  private async verifyTwoFactor(
    agent: {
      id: string;
      username: string;
      twoFactorRequired: boolean;
      twoFactorEnabled: boolean;
      twoFactorSecret: string | null;
      twoFactorLastUsedStep: bigint | null;
    },
    token: string | undefined,
  ): Promise<{
    verified: boolean;
    setupRequired: boolean;
    manualKey: string | null;
    otpauthUrl: string | null;
    message: string;
  }> {
    if (!agent.twoFactorRequired) {
      return {
        verified: true,
        setupRequired: false,
        manualKey: null,
        otpauthUrl: null,
        message: '',
      };
    }

    const secret = await this.getOrCreateTwoFactorSecret(agent);
    const setupRequired = !agent.twoFactorEnabled;
    const setupPayload = setupRequired
      ? {
          manualKey: secret,
          otpauthUrl: createOtpAuthUrl(agent.username, secret),
        }
      : {
          manualKey: null,
          otpauthUrl: null,
        };

    if (!token) {
      return {
        verified: false,
        setupRequired,
        ...setupPayload,
        message: setupRequired
          ? '此帳號需要綁定 Google Authenticator，請輸入 App 中顯示的 6 位驗證碼'
          : '請輸入 Google Authenticator 6 位驗證碼',
      };
    }

    const result = verifyTotp(secret, token, agent.twoFactorLastUsedStep);
    if (!result.valid || !result.step) {
      return {
        verified: false,
        setupRequired,
        ...setupPayload,
        message: result.replayed
          ? '驗證碼已使用，請等待下一組驗證碼'
          : 'Google Authenticator 驗證碼錯誤',
      };
    }

    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        twoFactorEnabled: true,
        twoFactorLastUsedAt: new Date(),
        twoFactorLastUsedStep: result.step,
      },
    });

    return {
      verified: true,
      setupRequired: false,
      manualKey: null,
      otpauthUrl: null,
      message: '',
    };
  }

  private async getOrCreateTwoFactorSecret(agent: {
    id: string;
    twoFactorSecret: string | null;
  }): Promise<string> {
    if (agent.twoFactorSecret) {
      try {
        return decryptTotpSecret(agent.twoFactorSecret);
      } catch {
        // Rotate a broken or undecryptable secret and force a fresh setup.
      }
    }

    const secret = generateTotpSecret();
    await this.prisma.agent.update({
      where: { id: agent.id },
      data: {
        twoFactorSecret: encryptTotpSecret(secret),
        twoFactorEnabled: false,
        twoFactorLastUsedStep: null,
        twoFactorLastUsedAt: null,
      },
    });
    return secret;
  }
}

export function hashRefresh(token: string): string {
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
