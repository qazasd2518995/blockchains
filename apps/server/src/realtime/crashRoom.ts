import type { Server, Socket } from 'socket.io';
import { PrismaClient, Prisma } from '@prisma/client';
import { crashPoint, sha256, generateServerSeed } from '@bg/provably-fair';
import type {
  CrashRoundSnapshot,
  CrashPlayerBet,
  CrashStatus,
} from '@bg/shared';

const BETTING_WINDOW_MS = 5000;
const POST_CRASH_MS = 3000;
const TICK_MS = 100;
const GROWTH_RATE = 0.00006; // multiplier speed; tuned for ~10-20s average

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
  private roundNumber = 0;

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
    void this.beginBettingPhase();
  }

  private async beginBettingPhase(): Promise<void> {
    this.state = 'BETTING';
    const seed = generateServerSeed();
    this.currentSeed = seed;
    this.currentSeedHash = sha256(seed);
    this.roundNumber += 1;
    this.currentCrashPoint = crashPoint(seed, `${this.config.gameId}:${this.roundNumber}`);
    this.currentMultiplier = 1.0;
    this.bettingEndsAt = Date.now() + BETTING_WINDOW_MS;

    const round = await this.prisma.crashRound.create({
      data: {
        gameId: this.config.gameId,
        roundNumber: this.roundNumber,
        serverSeedHash: this.currentSeedHash,
        crashPoint: new Prisma.Decimal(this.currentCrashPoint.toFixed(4)),
        status: 'BETTING',
        bettingEndsAt: new Date(this.bettingEndsAt),
      },
    });
    this.currentRoundId = round.id;

    this.broadcast('round:betting', this.snapshot());

    setTimeout(() => {
      void this.beginRunningPhase();
    }, BETTING_WINDOW_MS);
  }

  private async beginRunningPhase(): Promise<void> {
    if (!this.currentRoundId) return;
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
        void this.crashPhase();
        return;
      }

      this.broadcast('round:tick', {
        multiplier: Number(this.currentMultiplier.toFixed(4)),
        elapsedMs: elapsed,
      });

      void this.autoCashOutCheck();
    }, tickMs);
  }

  private async autoCashOutCheck(): Promise<void> {
    if (!this.currentRoundId) return;
    const pending = await this.prisma.crashBet.findMany({
      where: {
        roundId: this.currentRoundId,
        cashedOutAt: null,
        autoCashOut: { not: null, lte: new Prisma.Decimal(this.currentMultiplier.toFixed(4)) },
      },
    });
    for (const bet of pending) {
      await this.settleCashout(bet.userId, bet.id, Number(bet.autoCashOut));
    }
  }

  private async crashPhase(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    if (!this.currentRoundId || !this.currentSeed) return;
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

    setTimeout(() => {
      void this.beginBettingPhase();
    }, POST_CRASH_MS);
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

    const betId = await this.prisma.$transaction(async (tx) => {
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const players = await this.getPlayers();
    this.broadcast('bets:update', { players });
    return { betId, players };
  }

  private async settleCashout(
    userId: string,
    betId: string,
    multiplier: number,
  ): Promise<{ multiplier: number; payout: string; newBalance: string }> {
    return this.prisma.$transaction(async (tx) => {
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
