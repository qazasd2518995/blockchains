import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { AdminCaptchaResponse, AgentPublic } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';
import { randomBytes, createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { AdminLoginInput } from './adminAuth.schema.js';

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_MAX_USED_NONCES = 10_000;

interface CaptchaTokenPayload {
  codeHash: string;
  exp: number;
  nonce: string;
}

export interface AdminJwtSigner {
  sign(payload: Record<string, unknown>): string;
}

export class AdminAuthService {
  private readonly usedCaptchaNonces = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: AdminJwtSigner,
  ) {}

  issueCaptcha(): AdminCaptchaResponse {
    const captchaCode = randomInt(0, 10_000).toString().padStart(4, '0');
    const exp = Date.now() + CAPTCHA_TTL_MS;
    const payload: CaptchaTokenPayload = {
      codeHash: hashCaptchaCode(captchaCode),
      exp,
      nonce: randomBytes(16).toString('hex'),
    };
    return {
      captchaCode,
      captchaToken: signCaptchaPayload(payload),
      expiresAt: new Date(exp).toISOString(),
    };
  }

  async login(
    input: AdminLoginInput,
  ): Promise<{ agent: AgentPublic; accessToken: string; refreshToken: string }> {
    this.verifyCaptcha(input.captchaCode, input.captchaToken);

    const agent = await this.prisma.agent.findUnique({ where: { username: input.username } });
    if (!agent) throw new ApiError('INVALID_CREDENTIALS', 'Invalid username or password');
    if (agent.status === 'DISABLED' || agent.status === 'DELETED') {
      throw new ApiError('AGENT_FROZEN', 'Agent account is not active');
    }
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
      return this.issueTokens(agent.id, agent.username, agent.role, agent.level, tx);
    });
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
    db: PrismaClient | Prisma.TransactionClient = this.prisma,
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
    await db.agentRefreshToken.create({
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
    baccaratRebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
    baccaratRebatePercentage: Prisma.Decimal;
    maxBaccaratRebatePercentage: Prisma.Decimal;
    bettingLimitLevel: string;
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
      status: agent.status,
      role: agent.role,
      notes: agent.notes,
      lastLoginAt: agent.lastLoginAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
    };
  }

  private verifyCaptcha(captchaCode: string, captchaToken: string): void {
    if (!/^\d{4}$/.test(captchaCode)) {
      throw new ApiError('INVALID_CAPTCHA', 'Invalid verification code');
    }

    const payload = verifyCaptchaToken(captchaToken);
    const now = Date.now();
    this.cleanupCaptchaNonces(now);

    if (payload.exp < now) {
      throw new ApiError('INVALID_CAPTCHA', 'Verification code expired');
    }
    if (this.usedCaptchaNonces.has(payload.nonce)) {
      throw new ApiError('INVALID_CAPTCHA', 'Verification code already used');
    }

    if (!safeEqual(hashCaptchaCode(captchaCode), payload.codeHash)) {
      throw new ApiError('INVALID_CAPTCHA', 'Invalid verification code');
    }

    this.usedCaptchaNonces.set(payload.nonce, payload.exp);
  }

  private cleanupCaptchaNonces(now: number): void {
    if (this.usedCaptchaNonces.size > CAPTCHA_MAX_USED_NONCES) {
      this.usedCaptchaNonces.clear();
      return;
    }
    for (const [nonce, exp] of this.usedCaptchaNonces) {
      if (exp < now) this.usedCaptchaNonces.delete(nonce);
    }
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

function signCaptchaPayload(payload: CaptchaTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', config.JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyCaptchaToken(token: string): CaptchaTokenPayload {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new ApiError('INVALID_CAPTCHA', 'Invalid verification token');
  const expectedSig = createHmac('sha256', config.JWT_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expectedSig)) {
    throw new ApiError('INVALID_CAPTCHA', 'Invalid verification token');
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<CaptchaTokenPayload>;
    if (
      typeof parsed.codeHash !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      throw new Error('Malformed captcha payload');
    }
    return { codeHash: parsed.codeHash, exp: parsed.exp, nonce: parsed.nonce };
  } catch {
    throw new ApiError('INVALID_CAPTCHA', 'Invalid verification token');
  }
}

function hashCaptchaCode(code: string): string {
  return createHash('sha256').update(`${config.JWT_SECRET}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) return false;
  return timingSafeEqual(aBuffer, bBuffer);
}
