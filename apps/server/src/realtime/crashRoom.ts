import type { Server, Socket } from 'socket.io';
import { PrismaClient, Prisma } from '@prisma/client';
import { crashPoint, sha256, generateServerSeed } from '@bg/provably-fair';
import { randomUUID } from 'node:crypto';
import { config as appConfig } from '../config.js';
import {
  MIN_BET_AMOUNT,
  type CrashRoundSnapshot,
  type CrashPlayerBet,
  type CrashStatus,
} from '@bg/shared';
import { runSerializable } from '../modules/games/_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  type ControlOutcome,
  type PredictedResult,
} from '../modules/games/_common/controls.js';

const BETTING_WINDOW_MS = 3000;
const POST_CRASH_MS = 3000;
const TICK_MS = 80;
const GROWTH_RATE = 0.0001; // multiplier speed; 2x in ~6.9s, 3x in ~11s
const ROUND_CREATE_RETRY_BASE_MS = 80;
const ROUND_CREATE_RETRY_JITTER_MS = 220;
const PHASE_RECOVERY_MS = 1200;
const LEASE_DURATION_MS = 15000;
const LEASE_RENEW_MS = 5000;
const LEASE_ACQUIRE_RETRY_MS = 2500;
const LEASE_RETRY_JITTER_MS = 1000;
const MIN_CASHOUT_MULTIPLIER = 1.01;
const MAX_AUTO_CASHOUT_MULTIPLIER = 1_000_000;

type QueuedCrashBet = {
  userId: string;
  amount: number;
  autoCashOut?: number;
  queuedAt: number;
};

export interface CrashRoomConfig {
  gameId: string;
  tickMs?: number;
  growthRate?: number;
}

export interface CrashRoomAuth {
  verifyToken: (token: string) => Promise<{ userId: string }>;
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
  private nextRoundBets = new Map<string, QueuedCrashBet>();
  private roundControlOutcomes = new Map<
    string,
    { outcome: ControlOutcome; original: PredictedResult }
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
    private readonly auth: CrashRoomAuth,
  ) {}

  get namespace(): string {
    return `/crash/${this.config.gameId}`;
  }

  async start(): Promise<void> {
    const nsp = this.io.of(this.namespace);
    nsp.use(async (socket, next) => {
      try {
        const token = readSocketToken(socket);
        if (!token) throw new Error('Authentication required');
        const verified = await this.auth.verifyToken(token);
        socket.data.userId = verified.userId;
        next();
      } catch (err) {
        next(err instanceof Error ? err : new Error('Authentication required'));
      }
    });
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
    this.roundControlOutcomes.clear();
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
    await this.flushQueuedBets();

    this.scheduleRunningPhase(Math.max(0, this.bettingEndsAt - Date.now()));
  }

  private async beginRunningPhase(): Promise<void> {
    if (!this.isLeader || !this.currentRoundId) return;
    await this.applyRoundControls();
    this.state = 'RUNNING';
    this.roundStartedAt = Date.now();

    await this.prisma.crashRound.update({
      where: { id: this.currentRoundId },
      data: { status: 'RUNNING', startedAt: new Date(this.roundStartedAt) },
    });

    if (this.currentCrashPoint <= 1.0) {
      this.currentMultiplier = 1.0;
      await this.crashPhase();
      return;
    }

    this.broadcast('round:running', {
      roundId: this.currentRoundId,
      startedAt: this.roundStartedAt,
    });

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

    await this.finalizeCrashedBets();

    this.scheduleBettingPhase(POST_CRASH_MS);
  }

  private async applyRoundControls(): Promise<void> {
    if (!this.currentRoundId) return;
    const bets = await this.prisma.crashBet.findMany({
      where: { roundId: this.currentRoundId },
      select: { id: true, userId: true, amount: true, autoCashOut: true },
    });
    if (bets.length === 0) return;

    let forcedCrashPoint = this.currentCrashPoint;
    for (const bet of bets) {
      const autoCashOut = bet.autoCashOut ? Number(bet.autoCashOut) : null;
      const naturalCashout =
        autoCashOut !== null && autoCashOut < this.currentCrashPoint ? autoCashOut : null;
      const predictedMultiplier = new Prisma.Decimal((naturalCashout ?? 0).toFixed(4));
      const predictedPayout = naturalCashout
        ? bet.amount.mul(predictedMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(0);
      const original: PredictedResult = {
        won: predictedPayout.greaterThan(bet.amount),
        amount: bet.amount,
        multiplier: predictedMultiplier,
        payout: predictedPayout,
      };
      const outcome = await runSerializable(this.prisma, (tx) =>
        applyControls(tx, bet.userId, this.config.gameId, original),
      );
      if (!outcome.controlled) continue;

      this.roundControlOutcomes.set(bet.id, { outcome, original });
      if (!outcome.won) {
        forcedCrashPoint = Math.min(forcedCrashPoint, MIN_CASHOUT_MULTIPLIER);
      } else {
        const capFromPayout = outcome.maxPayout
          ? Number(outcome.maxPayout.div(bet.amount).toFixed(4))
          : Number.POSITIVE_INFINITY;
        const maxTarget = Math.min(
          outcome.maxMultiplier
            ? Number(outcome.maxMultiplier.toFixed(4))
            : Number.POSITIVE_INFINITY,
          capFromPayout,
        );
        const minTarget = outcome.minMultiplier ? Number(outcome.minMultiplier.toFixed(4)) : 1.01;
        const target = autoCashOut ?? Math.max(3, minTarget, Number(outcome.multiplier.toFixed(4)));
        if (target > maxTarget) {
          forcedCrashPoint = Math.min(forcedCrashPoint, MIN_CASHOUT_MULTIPLIER);
          this.roundControlOutcomes.set(bet.id, {
            outcome: {
              won: false,
              multiplier: new Prisma.Decimal(0),
              payout: new Prisma.Decimal(0),
              controlled: true,
              flipReason: 'burst_budget_guard',
              controlId: outcome.controlId,
            },
            original,
          });
        } else {
          forcedCrashPoint = Math.max(forcedCrashPoint, target + 0.05);
        }
      }
    }

    if (Math.abs(forcedCrashPoint - this.currentCrashPoint) >= 0.0001) {
      this.currentCrashPoint = Number(forcedCrashPoint.toFixed(4));
      await this.prisma.crashRound.update({
        where: { id: this.currentRoundId },
        data: { crashPoint: new Prisma.Decimal(this.currentCrashPoint.toFixed(4)) },
      });
    }
  }

  private async finalizeCrashedBets(): Promise<void> {
    if (!this.currentRoundId) return;
    const bets = await this.prisma.crashBet.findMany({
      where: { roundId: this.currentRoundId, cashedOutAt: null },
      select: { id: true, userId: true, amount: true },
    });
    for (const bet of bets) {
      const control = this.roundControlOutcomes.get(bet.id);
      const effectiveOutcome = control?.outcome.won ? null : control?.outcome;
      const original = control?.original ?? {
        won: false,
        amount: bet.amount,
        multiplier: new Prisma.Decimal(0),
        payout: new Prisma.Decimal(0),
      };
      await runSerializable(this.prisma, (tx) =>
        finalizeControls(
          tx,
          bet.userId,
          this.config.gameId,
          original,
          {
            won: false,
            amount: bet.amount,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
          },
          effectiveOutcome ?? {
            won: false,
            multiplier: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            controlled: false,
          },
          bet.id,
          {
            crashPoint: original.multiplier.toFixed(4),
            payout: original.payout.toFixed(2),
          },
          {
            crashPoint: this.currentCrashPoint.toFixed(4),
            payout: '0.00',
          },
        ),
      );
    }
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
        OR: [{ ownerInstanceId: this.instanceId }, { expiresAt: { lt: now } }],
      },
      data: {
        ownerInstanceId: this.instanceId,
        expiresAt,
      },
    });
    if (renewed.count > 0) return true;

    const inserted = await this.prisma.crashRoomLease.createMany({
      data: {
        gameId: this.config.gameId,
        ownerInstanceId: this.instanceId,
        expiresAt,
      },
      skipDuplicates: true,
    });
    return inserted.count > 0;
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
    const connectedUserId = getSocketUserId(socket);
    socket.join(crashUserRoom(connectedUserId));
    socket.emit('round:snapshot', this.snapshot());
    const queuedBet = this.nextRoundBets.get(connectedUserId);
    if (queuedBet) {
      socket.emit('bet:queued', {
        amount: queuedBet.amount.toFixed(2),
        autoCashOut: queuedBet.autoCashOut,
        roundNumber: this.roundNumber + 1,
      });
    }
    void this.getPlayers()
      .then((players) => {
        socket.emit('bets:update', { players });
      })
      .catch((err) => {
        console.error(
          `[crashRoom] failed to send connection bet snapshot (gameId=${this.config.gameId})`,
          err,
        );
      });

    socket.on(
      'bet:place',
      async (payload: { amount?: number; autoCashOut?: number }, ack?: (res: unknown) => void) => {
        try {
          const userId = getSocketUserId(socket);
          if (!payload.amount) throw new Error('Missing amount');
          if (this.state === 'BETTING' && this.currentRoundId) {
            try {
              const res = await this.placeBet(userId, payload.amount, payload.autoCashOut);
              ack?.({ ok: true, ...res });
              return;
            } catch (err) {
              if (!isLateBetRequeueError((err as Error).message)) throw err;
            }
          }

          const res = await this.queueNextRoundBet(userId, payload.amount, payload.autoCashOut);
          ack?.({ ok: true, ...res });
        } catch (err) {
          ack?.({ ok: false, error: (err as Error).message });
        }
      },
    );

    socket.on('bet:cashout', async (_payload: unknown, ack?: (res: unknown) => void) => {
      try {
        if (this.state !== 'RUNNING') throw new Error('Round is not running');
        if (!this.currentRoundId) throw new Error('No active round');
        if (this.currentMultiplier < MIN_CASHOUT_MULTIPLIER) {
          throw new Error(`Cashout available from ${MIN_CASHOUT_MULTIPLIER.toFixed(2)}x`);
        }
        if (this.currentMultiplier >= this.currentCrashPoint)
          throw new Error('Round already crashed');
        const userId = getSocketUserId(socket);
        const bet = await this.prisma.crashBet.findFirst({
          where: {
            roundId: this.currentRoundId ?? undefined,
            userId,
            cashedOutAt: null,
          },
        });
        if (!bet) {
          const settledBet = await this.prisma.crashBet.findFirst({
            where: {
              roundId: this.currentRoundId ?? undefined,
              userId,
              cashedOutAt: { not: null },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (settledBet?.cashedOutAt) {
            const user = await this.prisma.user.findUniqueOrThrow({
              where: { id: userId },
              select: { balance: true },
            });
            ack?.({
              ok: true,
              multiplier: Number(settledBet.cashedOutAt),
              payout: settledBet.payout.toFixed(2),
              newBalance: user.balance.toFixed(2),
            });
            return;
          }
          throw new Error('No active bet');
        }
        this.pendingAutoCashouts.delete(bet.id);
        const res = await this.settleCashout(userId, bet.id, this.currentMultiplier);
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
  ): Promise<{ betId: string; players: CrashPlayerBet[]; newBalance: string }> {
    const roundId = this.currentRoundId;
    if (!roundId) throw new Error('No active round');
    const amountD = this.validateBetInput(amount, autoCashOut);

    const placed = await runSerializable(this.prisma, async (tx) => {
      const round = await tx.crashRound.findUnique({
        where: { id: roundId },
        select: { status: true, bettingEndsAt: true },
      });
      if (!round || round.status !== 'BETTING') throw new Error('Round is not accepting bets');
      if (round.bettingEndsAt && round.bettingEndsAt.getTime() <= Date.now()) {
        throw new Error('Round is not accepting bets');
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.disabledAt) throw new Error('Account disabled');
      if (user.frozenAt) throw new Error('Account frozen');
      if (user.balance.lessThan(amountD)) throw new Error('Insufficient funds');
      const existingBet = await tx.crashBet.findFirst({
        where: { roundId, userId },
        select: { id: true },
      });
      if (existingBet) throw new Error('Bet already placed for this round');
      let bet: { id: string };
      try {
        bet = await tx.crashBet.create({
          data: {
            roundId,
            userId,
            amount: amountD,
            autoCashOut:
              autoCashOut !== undefined ? new Prisma.Decimal(autoCashOut.toFixed(4)) : null,
          },
          select: { id: true },
        });
      } catch (err) {
        if ((err as { code?: string })?.code === 'P2002') {
          throw new Error('Bet already placed for this round');
        }
        throw err;
      }
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
          meta: {
            gameId: this.config.gameId,
            roundId,
            crashBetId: bet.id,
          },
        },
      });
      return { betId: bet.id, newBalance: updated.balance.toFixed(2) };
    });

    if (autoCashOut !== undefined) {
      this.pendingAutoCashouts.set(placed.betId, { betId: placed.betId, userId, autoCashOut });
    }

    const players = await this.getPlayers();
    this.broadcast('bets:update', { players });
    return { ...placed, players };
  }

  private async queueNextRoundBet(
    userId: string,
    amount: number,
    autoCashOut?: number,
  ): Promise<{ queued: true; roundNumber: number }> {
    const amountD = this.validateBetInput(amount, autoCashOut);
    if (this.nextRoundBets.has(userId)) throw new Error('Next round bet already queued');

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { balance: true, disabledAt: true, frozenAt: true },
    });
    if (user.disabledAt) throw new Error('Account disabled');
    if (user.frozenAt) throw new Error('Account frozen');
    if (user.balance.lessThan(amountD)) throw new Error('Insufficient funds');

    const roundNumber = this.roundNumber + 1;
    const queued: QueuedCrashBet = {
      userId,
      amount: Number(amountD.toFixed(2)),
      autoCashOut,
      queuedAt: Date.now(),
    };
    this.nextRoundBets.set(userId, queued);
    this.emitToUser(userId, 'bet:queued', {
      amount: amountD.toFixed(2),
      autoCashOut,
      roundNumber,
    });
    return { queued: true, roundNumber };
  }

  private async flushQueuedBets(): Promise<void> {
    if (!this.currentRoundId || this.nextRoundBets.size === 0) return;
    const queuedBets = Array.from(this.nextRoundBets.values()).sort(
      (a, b) => a.queuedAt - b.queuedAt,
    );
    this.nextRoundBets.clear();

    for (const queued of queuedBets) {
      try {
        const placed = await this.placeBet(queued.userId, queued.amount, queued.autoCashOut);
        this.emitToUser(queued.userId, 'bet:confirmed', {
          betId: placed.betId,
          amount: new Prisma.Decimal(queued.amount).toFixed(2),
          autoCashOut: queued.autoCashOut,
          newBalance: placed.newBalance,
          roundId: this.currentRoundId,
          roundNumber: this.roundNumber,
        });
      } catch (err) {
        this.emitToUser(queued.userId, 'bet:queue_failed', {
          roundId: this.currentRoundId,
          roundNumber: this.roundNumber,
          error: (err as Error).message,
        });
      }
    }
  }

  private validateBetInput(amount: number, autoCashOut?: number): Prisma.Decimal {
    if (!Number.isFinite(amount)) throw new Error('Invalid bet amount');
    if (amount < MIN_BET_AMOUNT) throw new Error(`Minimum bet is ${MIN_BET_AMOUNT.toFixed(2)}`);
    if (amount > appConfig.MAX_SINGLE_BET) {
      throw new Error(`Max single bet is ${appConfig.MAX_SINGLE_BET}`);
    }
    if (
      autoCashOut !== undefined &&
      (!Number.isFinite(autoCashOut) ||
        autoCashOut < MIN_CASHOUT_MULTIPLIER ||
        autoCashOut > MAX_AUTO_CASHOUT_MULTIPLIER)
    ) {
      throw new Error(
        `Auto cashout must be between ${MIN_CASHOUT_MULTIPLIER.toFixed(2)}x and ${MAX_AUTO_CASHOUT_MULTIPLIER}x`,
      );
    }
    return new Prisma.Decimal(amount);
  }

  private emitToUser(userId: string, event: string, payload: unknown): void {
    this.io.of(this.namespace).to(crashUserRoom(userId)).emit(event, payload);
  }

  private async settleCashout(
    userId: string,
    betId: string,
    multiplier: number,
  ): Promise<{ multiplier: number; payout: string; newBalance: string }> {
    const activeRoundId = this.currentRoundId;
    const settled = await runSerializable(this.prisma, async (tx) => {
      const round = activeRoundId
        ? await tx.crashRound.findUnique({
            where: { id: activeRoundId },
            select: { id: true, status: true, crashPoint: true },
          })
        : null;
      if (!round || round.status !== 'RUNNING') throw new Error('Round is not running');
      const bet = await tx.crashBet.findUniqueOrThrow({ where: { id: betId } });
      if (bet.cashedOutAt) throw new Error('Already cashed out');
      if (bet.userId !== userId) throw new Error('Bet does not belong to user');
      if (bet.roundId !== round.id) throw new Error('Bet does not belong to active round');
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (user.disabledAt) throw new Error('Account disabled');
      if (user.frozenAt) throw new Error('Account frozen');
      const multD = new Prisma.Decimal(multiplier.toFixed(4));
      if (multD.greaterThanOrEqualTo(round.crashPoint)) throw new Error('Round already crashed');
      const payout = bet.amount.mul(multD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const existingControl = this.roundControlOutcomes.get(betId);
      if (existingControl?.outcome.controlled && !existingControl.outcome.won) {
        throw new Error('Cashout window missed');
      }
      const cashoutOriginal: PredictedResult = {
        won: payout.greaterThan(bet.amount),
        amount: bet.amount,
        multiplier: multD,
        payout,
      };
      const cashoutControl =
        existingControl?.outcome ??
        (await applyControls(tx, userId, this.config.gameId, cashoutOriginal));
      if (cashoutControl.controlled && !cashoutControl.won) {
        this.roundControlOutcomes.set(betId, {
          outcome: cashoutControl,
          original: cashoutOriginal,
        });
        throw new Error('Cashout window missed');
      }
      if (cashoutControl.controlled && cashoutControl.won) {
        this.roundControlOutcomes.set(betId, {
          outcome: cashoutControl,
          original: cashoutOriginal,
        });
      }
      const settledMultiplier =
        cashoutControl.controlled && cashoutControl.won ? cashoutControl.multiplier : multD;
      const settledPayout =
        cashoutControl.controlled && cashoutControl.won ? cashoutControl.payout : payout;
      const claimed = await tx.crashBet.updateMany({
        where: { id: betId, cashedOutAt: null },
        data: { cashedOutAt: settledMultiplier, payout: settledPayout },
      });
      if (claimed.count !== 1) throw new Error('Already cashed out');
      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: settledPayout } },
      });
      await tx.transaction.create({
        data: {
          userId,
          type: 'CASHOUT',
          amount: settledPayout,
          balanceAfter: updated.balance,
          meta: {
            gameId: this.config.gameId,
            roundId: activeRoundId,
            crashBetId: betId,
            multiplier: Number(settledMultiplier.toFixed(4)),
          },
        },
      });
      const control = this.roundControlOutcomes.get(betId);
      const original = control?.original ?? cashoutOriginal;
      await finalizeControls(
        tx,
        userId,
        this.config.gameId,
        original,
        {
          won: settledPayout.greaterThan(bet.amount),
          amount: bet.amount,
          multiplier: settledMultiplier,
          payout: settledPayout,
        },
        control?.outcome ?? {
          won: payout.greaterThan(bet.amount),
          multiplier: multD,
          payout,
          controlled: false,
        },
        betId,
        {
          cashoutAt: original.multiplier.toFixed(4),
          payout: original.payout.toFixed(2),
        },
        {
          cashoutAt: settledMultiplier.toFixed(4),
          payout: settledPayout.toFixed(2),
        },
      );
      return {
        multiplier: Number(settledMultiplier.toFixed(4)),
        payout: settledPayout.toFixed(2),
        newBalance: updated.balance.toFixed(2),
      };
    });
    const players = await this.getPlayers();
    this.broadcast('bets:update', { players });
    return settled;
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

  constructor(
    private readonly io: Server,
    private readonly prisma: PrismaClient,
    private readonly auth: CrashRoomAuth,
  ) {}

  register(config: CrashRoomConfig): CrashRoom {
    const room = new CrashRoom(this.io, this.prisma, config, this.auth);
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

function readSocketToken(socket: Socket): string | null {
  const token = socket.handshake.auth?.token;
  if (typeof token === 'string' && token.length > 0) return token;
  const header = socket.handshake.headers.authorization;
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  const [scheme, value] = raw.split(' ');
  return scheme?.toLowerCase() === 'bearer' && value ? value : null;
}

function getSocketUserId(socket: Socket): string {
  const userId = socket.data.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('Authentication required');
  }
  return userId;
}

function crashUserRoom(userId: string): string {
  return `user:${userId}`;
}

function isLateBetRequeueError(message: string): boolean {
  return message === 'Round is not accepting bets';
}
