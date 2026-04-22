import type { Server, Socket } from 'socket.io';
import { PrismaClient, Prisma } from '@prisma/client';
import { crashPoint, sha256, generateServerSeed } from '@bg/provably-fair';
import { randomUUID } from 'node:crypto';
import type {
  CrashRoundSnapshot,
  CrashPlayerBet,
  CrashStatus,
} from '@bg/shared';
import { runSerializable } from '../modules/games/_common/BaseGameService.js';

const BETTING_WINDOW_MS = 5000;
const POST_CRASH_MS = 3000;
const TICK_MS = 100;
const GROWTH_RATE = 0.00006; // multiplier speed; tuned for ~10-20s average
const ROUND_CREATE_RETRY_BASE_MS = 80;
const ROUND_CREATE_RETRY_JITTER_MS = 220;
const PHASE_RECOVERY_MS = 1200;
const LEASE_DURATION_MS = 15000;
const LEASE_RENEW_MS = 5000;
const LEASE_ACQUIRE_RETRY_MS = 2500;
const LEASE_RETRY_JITTER_MS = 1000;

export interface CrashRoomConfig {
  gameId: string;
  tickMs?: number;
  growthRate?: number;
}

export class CrashRoom {
  private state: CrashStatus = 'BETTING';
  private currentRoundId: string | null = null;
  private currentSeed: string | null = null;
  private currentSeedHash: string | null = null;
  private currentCrashPoint = 1.0;
  private currentMultiplier = 1.0;
  private roundStartedAt = 0;
  private bettingEndsAt = 0;
  private tickTimer: NodeJS.Timeout | null = null;
  private phaseTimer: NodeJS.Timeout | null = null;
  private leaseTimer: NodeJS.Timeout | null = null;
  private pendingAutoCashouts = new Map<
    string,
    { betId: string; userId: string; autoCashOut: number }
  >();
  private roundNumber = 0;
  private isLeader = false;
  private readonly instanceId =
    process.env.RENDER_INSTANCE_ID ??
    process.env.RENDER_REPLICA_ID ??
    process.env.HOSTNAME ??
    randomUUID();

  constructor(
    private readonly io: Server,
    private readonly prisma: PrismaClient,
    private readonly config: CrashRoomConfig,
  ) {}

  get namespace(): string {
    return `/crash/${this.config.gameId}`;
  }

  async start(): Promise<void> {
    const nsp = this.io.of(this.namespace);
    nsp.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    // 初始化 roundNumber 從資料庫最大值 + 1，避免重啟衝突
    const last = await this.prisma.crashRound.findFirst({
      where: { gameId: this.config.gameId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    this.roundNumber = last?.roundNumber ?? 0;
    this.scheduleLeaseAcquire(0);
  }

  private async beginBettingPhase(): Promise<void> {
    if (!this.isLeader) return;
    this.state = 'BETTING';
    this.currentRoundId = null;
    const seed = generateServerSeed();
    this.currentSeed = seed;
    this.currentSeedHash = sha256(seed);
    this.roundNumber += 1;
    this.currentCrashPoint = crashPoint(seed, `${this.config.gameId}:${this.roundNumber}`);
    this.currentMultiplier = 1.0;
    this.pendingAutoCashouts.clear();
    this.bettingEndsAt = Date.now() + BETTING_WINDOW_MS;

    // 遇到 unique 衝突（多實例 race / stale in-memory counter）時遞增重試
    let round: { id: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!this.isLeader) return;
      try {
        round = await this.prisma.crashRound.create({
          data: {
            gameId: this.config.gameId,
            roundNumber: this.roundNumber,
            serverSeedHash: this.currentSeedHash,
            crashPoint: new Prisma.Decimal(this.currentCrashPoint.toFixed(4)),
            status: 'BETTING',
            bettingEndsAt: new Date(this.bettingEndsAt),
          },
        });
        break;
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'P2002') {
          // 用少量隨機退避打破多實例同步 collision。
          await sleep(this.retryDelayMs(attempt));
          // 先抓 DB 最大值重設 counter
          const max = await this.prisma.crashRound.findFirst({
            where: { gameId: this.config.gameId },
            orderBy: { roundNumber: 'desc' },
            select: { roundNumber: true },
          });
          this.roundNumber = (max?.roundNumber ?? this.roundNumber) + 1;
          this.currentCrashPoint = crashPoint(seed, `${this.config.gameId}:${this.roundNumber}`);
          continue;
        }
        throw err;
      }
    }
    if (!round) {
      console.error(
        `[crashRoom] failed to create round after 5 retries (gameId=${this.config.gameId}); retrying later`,
      );
      this.scheduleBettingPhase(PHASE_RECOVERY_MS + this.retryDelayMs(0));
      return;
    }
    this.currentRoundId = round.id;

    this.broadcast('round:betting', this.snapshot());

    this.scheduleRunningPhase(BETTING_WINDOW_MS);
  }

  private async beginRunningPhase(): Promise<void> {
    if (!this.isLeader || !this.currentRoundId) return;
    this.state = 'RUNNING';
    this.roundStartedAt = Date.now();

    await this.prisma.crashRound.update({
      where: { id: this.currentRoundId },
      data: { status: 'RUNNING', startedAt: new Date(this.roundStartedAt) },
    });

    this.broadcast('round:running', { roundId: this.currentRoundId, startedAt: this.roundStartedAt });

    const tickMs = this.config.tickMs ?? TICK_MS;
    const growth = this.config.growthRate ?? GROWTH_RATE;

    this.tickTimer = setInterval(() => {
      const elapsed = Date.now() - this.roundStartedAt;
      // exponential growth: m = e^(growth * elapsed_ms)
      const m = Math.exp(growth * elapsed);
      this.currentMultiplier = Math.max(1, m);

      if (this.currentMultiplier >= this.currentCrashPoint) {
        this.currentMultiplier = this.currentCrashPoint;
        void this.crashPhase().catch((err) => {
          console.error(
            `[crashRoom] crashPhase failed (gameId=${this.config.gameId}, roundId=${this.currentRoundId ?? 'n/a'})`,
            err,
          );
          this.scheduleBettingPhase(PHASE_RECOVERY_MS);
        });
        return;
      }

      this.broadcast('round:tick', {
        multiplier: Number(this.currentMultiplier.toFixed(4)),
        elapsedMs: elapsed,
      });

      void this.autoCashOutCheck().catch((err) => {
        console.error(
          `[crashRoom] autoCashOutCheck failed (gameId=${this.config.gameId}, roundId=${this.currentRoundId ?? 'n/a'})`,
          err,
        );
      });
    }, tickMs);
  }

  private async autoCashOutCheck(): Promise<void> {
    if (!this.isLeader || !this.currentRoundId) return;
    // 使用記憶體快取的 pending 清單（由 placeBet 時寫入），避免每 100ms 打 DB
    const ready: { betId: string; userId: string; autoCashOut: number }[] = [];
    for (const p of this.pendingAutoCashouts.values()) {
      if (p.autoCashOut <= this.currentMultiplier) ready.push(p);
    }
    for (const p of ready) {
      this.pendingAutoCashouts.delete(p.betId);
      try {
        await this.settleCashout(p.userId, p.betId, p.autoCashOut);
      } catch {
        // ignore — bet already cashed out or round ended
      }
    }
  }

  private async crashPhase(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (!this.isLeader || !this.currentRoundId || !this.currentSeed) return;
    this.state = 'CRASHED';

    await this.prisma.crashRound.update({
      where: { id: this.currentRoundId },
      data: {
        status: 'CRASHED',
        crashedAt: new Date(),
        serverSeed: this.currentSeed,
      },
    });

    this.broadcast('round:crashed', {
      roundId: this.currentRoundId,
      finalMultiplier: Number(this.currentCrashPoint.toFixed(4)),
      serverSeed: this.currentSeed,
    });

    this.scheduleBettingPhase(POST_CRASH_MS);
  }

  private snapshot(): CrashRoundSnapshot {
    return {
      gameId: this.config.gameId,
      roundId: this.currentRoundId ?? '',
      roundNumber: this.roundNumber,
      status: this.state,
      serverSeedHash: this.currentSeedHash ?? '',
      bettingEndsAt:
        this.state === 'BETTING' ? new Date(this.bettingEndsAt).toISOString() : undefined,
      startedAt:
        this.state === 'RUNNING' || this.state === 'CRASHED'
          ? new Date(this.roundStartedAt).toISOString()
          : undefined,
    };
  }

  private broadcast(event: string, payload: unknown): void {
    this.io.of(this.namespace).emit(event, payload);
  }

  private scheduleLeaseAcquire(delayMs: number): void {
    this.clearLeaseTimer();
    this.leaseTimer = setTimeout(() => {
      this.leaseTimer = null;
      void this.tryAcquireLeadership();
    }, delayMs);
  }

  private scheduleLeaseRenew(delayMs: number): void {
    this.clearLeaseTimer();
    this.leaseTimer = setTimeout(() => {
      this.leaseTimer = null;
      void this.tryRenewLeadership();
    }, delayMs);
  }

  private clearLeaseTimer(): void {
    if (!this.leaseTimer) return;
    clearTimeout(this.leaseTimer);
    this.leaseTimer = null;
  }

  private async tryAcquireLeadership(): Promise<void> {
    try {
      const acquired = await this.acquireOrRenewLease();
      if (!acquired) {
        this.scheduleLeaseAcquire(LEASE_ACQUIRE_RETRY_MS + jitter(LEASE_RETRY_JITTER_MS));
        return;
      }

      if (!this.isLeader) {
        await this.onLeadershipAcquired();
      } else {
        this.scheduleLeaseRenew(LEASE_RENEW_MS);
      }
    } catch (err) {
      console.error(
        `[crashRoom] leadership acquire failed (gameId=${this.config.gameId}, instance=${this.instanceId})`,
        err,
      );
      this.scheduleLeaseAcquire(LEASE_ACQUIRE_RETRY_MS + jitter(LEASE_RETRY_JITTER_MS));
    }
  }

  private async tryRenewLeadership(): Promise<void> {
    if (!this.isLeader) {
      this.scheduleLeaseAcquire(LEASE_ACQUIRE_RETRY_MS);
      return;
    }

    try {
      const renewed = await this.acquireOrRenewLease();
      if (!renewed) {
        this.onLeadershipLost();
        this.scheduleLeaseAcquire(LEASE_ACQUIRE_RETRY_MS + jitter(LEASE_RETRY_JITTER_MS));
        return;
      }
      this.scheduleLeaseRenew(LEASE_RENEW_MS);
    } catch (err) {
      console.error(
        `[crashRoom] leadership renew failed (gameId=${this.config.gameId}, instance=${this.instanceId})`,
        err,
      );
      this.scheduleLeaseRenew(1000);
    }
  }

  private async acquireOrRenewLease(): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

    const renewed = await this.prisma.crashRoomLease.updateMany({
      where: {
        gameId: this.config.gameId,
        OR: [
          { ownerInstanceId: this.instanceId },
          { expiresAt: { lt: now } },
        ],
      },
      data: {
        ownerInstanceId: this.instanceId,
        expiresAt,
      },
    });
    if (renewed.count > 0) return true;

    try {
      await this.prisma.crashRoomLease.create({
        data: {
          gameId: this.config.gameId,
          ownerInstanceId: this.instanceId,
          expiresAt,
        },
      });
      return true;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') return false;
      throw err;
    }
  }

  private async onLeadershipAcquired(): Promise<void> {
    this.isLeader = true;
    this.stopRoundExecution();
    const last = await this.prisma.crashRound.findFirst({
      where: { gameId: this.config.gameId },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });
    this.roundNumber = last?.roundNumber ?? this.roundNumber;
    console.info(
      `[crashRoom] leadership acquired (gameId=${this.config.gameId}, instance=${this.instanceId})`,
    );
    this.scheduleLeaseRenew(LEASE_RENEW_MS);
    this.scheduleBettingPhase(0);
  }

  private onLeadershipLost(): void {
    if (!this.isLeader) return;
    console.warn(
      `[crashRoom] leadership lost (gameId=${this.config.gameId}, instance=${this.instanceId})`,
    );
    this.isLeader = false;
    this.stopRoundExecution();
  }

  private stopRoundExecution(): void {
    this.clearPhaseTimer();
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.currentRoundId = null;
    this.currentMultiplier = 1.0;
    this.pendingAutoCashouts.clear();
  }

  private scheduleBettingPhase(delayMs: number): void {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      void this.beginBettingPhase().catch((err) => {
        console.error(`[crashRoom] beginBettingPhase failed (gameId=${this.config.gameId})`, err);
        this.scheduleBettingPhase(PHASE_RECOVERY_MS + this.retryDelayMs(0));
      });
    }, delayMs);
  }

  private scheduleRunningPhase(delayMs: number): void {
    this.clearPhaseTimer();
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      void this.beginRunningPhase().catch((err) => {
        console.error(
          `[crashRoom] beginRunningPhase failed (gameId=${this.config.gameId}, roundId=${this.currentRoundId ?? 'n/a'})`,
          err,
        );
        this.scheduleBettingPhase(PHASE_RECOVERY_MS);
      });
    }, delayMs);
  }

  private clearPhaseTimer(): void {
    if (!this.phaseTimer) return;
    clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  private retryDelayMs(attempt: number): number {
    return (
      ROUND_CREATE_RETRY_BASE_MS * (attempt + 1) +
      Math.floor(Math.random() * ROUND_CREATE_RETRY_JITTER_MS)
    );
  }

  private handleConnection(socket: Socket): void {
    socket.emit('round:snapshot', this.snapshot());

    socket.on('bet:place', async (payload: { userId?: string; amount?: number; autoCashOut?: number }, ack?: (res: unknown) => void) => {
      try {
        if (this.state !== 'BETTING') throw new Error('Round is not accepting bets');
        if (!this.currentRoundId) throw new Error('No active round');
        if (!payload.userId || !payload.amount) throw new Error('Missing userId/amount');
        const res = await this.placeBet(payload.userId, payload.amount, payload.autoCashOut);
        ack?.({ ok: true, ...res });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });

    socket.on('bet:cashout', async (payload: { userId?: string }, ack?: (res: unknown) => void) => {
      try {
        if (this.state !== 'RUNNING') throw new Error('Round is not running');
        if (!payload.userId) throw new Error('Missing userId');
        const bet = await this.prisma.crashBet.findFirst({
          where: {
            roundId: this.currentRoundId ?? undefined,
            userId: payload.userId,
            cashedOutAt: null,
          },
        });
        if (!bet) throw new Error('No active bet');
        this.pendingAutoCashouts.delete(bet.id);
        const res = await this.settleCashout(payload.userId, bet.id, this.currentMultiplier);
        ack?.({ ok: true, ...res });
      } catch (err) {
        ack?.({ ok: false, error: (err as Error).message });
      }
    });
  }

  private async placeBet(
    userId: string,
    amount: number,
    autoCashOut?: number,
  ): Promise<{ betId: string; players: CrashPlayerBet[] }> {
    if (!this.currentRoundId) throw new Error('No active round');
    const amountD = new Prisma.Decimal(amount);

    const betId = await runSerializable(this.prisma, async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.balance.lessThan(amountD)) throw new Error('Insufficient funds');
      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: amountD } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: 'BET_PLACE',
          amount: amountD.negated(),
          balanceAfter: updated.balance,
          meta: { gameId: this.config.gameId, roundId: this.currentRoundId },
        },
      });
      const bet = await tx.crashBet.create({
        data: {
          roundId: this.currentRoundId!,
          userId,
          amount: amountD,
          autoCashOut:
            autoCashOut !== undefined
              ? new Prisma.Decimal(autoCashOut.toFixed(4))
              : null,
        },
      });
      return bet.id;
    });

    if (autoCashOut !== undefined && autoCashOut > 1) {
      this.pendingAutoCashouts.set(betId, { betId, userId, autoCashOut });
    }

    const players = await this.getPlayers();
    this.broadcast('bets:update', { players });
    return { betId, players };
  }

  private async settleCashout(
    userId: string,
    betId: string,
    multiplier: number,
  ): Promise<{ multiplier: number; payout: string; newBalance: string }> {
    return runSerializable(this.prisma, async (tx) => {
      const bet = await tx.crashBet.findUniqueOrThrow({ where: { id: betId } });
      if (bet.cashedOutAt) throw new Error('Already cashed out');
      const multD = new Prisma.Decimal(multiplier.toFixed(4));
      const payout = bet.amount.mul(multD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: payout } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: 'CASHOUT',
          amount: payout,
          balanceAfter: updated.balance,
          meta: { gameId: this.config.gameId, roundId: this.currentRoundId, multiplier },
        },
      });
      await tx.crashBet.update({
        where: { id: betId },
        data: { cashedOutAt: multD, payout },
      });
      const players = await this.getPlayers();
      this.broadcast('bets:update', { players });
      return {
        multiplier,
        payout: payout.toFixed(2),
        newBalance: updated.balance.toFixed(2),
      };
    });
  }

  private async getPlayers(): Promise<CrashPlayerBet[]> {
    if (!this.currentRoundId) return [];
    const bets = await this.prisma.crashBet.findMany({
      where: { roundId: this.currentRoundId },
      orderBy: { createdAt: 'asc' },
    });
    return bets.map((b) => ({
      userId: b.userId,
      amount: b.amount.toFixed(2),
      autoCashOut: b.autoCashOut ? Number(b.autoCashOut) : undefined,
      cashedOutAt: b.cashedOutAt ? Number(b.cashedOutAt) : undefined,
      payout: b.payout.toFixed(2),
    }));
  }
}

export class CrashRoomRegistry {
  private rooms = new Map<string, CrashRoom>();

  constructor(private readonly io: Server, private readonly prisma: PrismaClient) {}

  register(config: CrashRoomConfig): CrashRoom {
    const room = new CrashRoom(this.io, this.prisma, config);
    this.rooms.set(config.gameId, room);
    return room;
  }

  async startAll(): Promise<void> {
    await Promise.all([...this.rooms.values()].map((r) => r.start()));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function jitter(maxMs: number): number {
  return Math.floor(Math.random() * maxMs);
}
