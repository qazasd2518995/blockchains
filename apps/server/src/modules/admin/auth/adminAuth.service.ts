import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { AgentPublic } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';
import { randomBytes, createHash } from 'node:crypto';
import type { AdminLoginInput } from './adminAuth.schema.js';

export interface AdminJwtSigner {
  sign(payload: Record<string, unknown>): string;
}

export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: AdminJwtSigner,
  ) {}

  async login(
    input: AdminLoginInput,
  ): Promise<{ agent: AgentPublic; accessToken: string; refreshToken: string }> {
    const agent = await this.prisma.agent.findUnique({ where: { username: input.username } });
    if (!agent) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');
    if (agent.status !== 'ACTIVE') throw new ApiError('AGENT_FROZEN', 'Agent account is not active');
    const ok = await bcrypt.compare(input.password, agent.passwordHash);
    if (!ok) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');

    await this.prisma.agent.update({
      where: { id: agent.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(agent.id, agent.username, agent.role, agent.level);
    return { agent: this.toPublic(agent), ...tokens };
  }

  async getMe(agentId: string): Promise<AgentPublic> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    return this.toPublic(agent);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashRefresh(refreshToken);
    const record = await this.prisma.agentRefreshToken.findUnique({ where: { tokenHash } });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw new ApiError('UNAUTHORIZED', 'Invalid refresh token');
    }
    await this.prisma.agentRefreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const agent = await this.prisma.agent.findUniqueOrThrow({ where: { id: record.agentId } });
    return this.issueTokens(agent.id, agent.username, agent.role, agent.level);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefresh(refreshToken);
    await this.prisma.agentRefreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  private async issueTokens(
    agentId: string,
    username: string,
    role: string,
    level: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = this.jwt.sign({
      sub: agentId,
      username,
      role,
      level,
      aud: 'admin',
    });
    const refreshToken = randomBytes(48).toString('hex');
    const ttlMs = parseDuration(config.JWT_REFRESH_TTL);
    await this.prisma.agentRefreshToken.create({
      data: {
        agentId,
        tokenHash: hashRefresh(refreshToken),
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
    bettingLimitLevel: string;
    status: 'ACTIVE' | 'FROZEN' | 'DELETED';
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
      bettingLimitLevel: agent.bettingLimitLevel,
      status: agent.status,
      role: agent.role,
      notes: agent.notes,
      lastLoginAt: agent.lastLoginAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
    };
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
  const multiplier =
    unit === 's' ? 1000 : unit === 'm' ? 60000 : unit === 'h' ? 3600000 : 86400000;
  return value * multiplier;
}
