import { Prisma, type PrismaClient } from '@prisma/client';
import {
  SETH2_MULTIPLIER_VALUES,
  isSeth2FactorRepresentable,
  isSeth2UnmultipliedFactorRepresentable,
  seth2AwakeningSpinForFactorWithSkill,
  seth2BoughtAwakeningGuaranteedSpin,
  seth2BuyFeature,
  seth2BuyFeatureEntry,
  seth2Spin,
  seth2SpinForFactor,
  seth2SpinForFactorWithoutMultiplier,
  seth2SuperMainSpin,
  seth2SuperMainSpinForFactor,
  type Seth2Outcome,
  type Seth2SpinMode,
} from '@bg/provably-fair';
import {
  GameId,
  SETH2_ALLOWED_BETS,
  SETH2_BUY_FEATURE_MULTIPLIER,
  SETH2_BUY_FEATURE_MULTIPLIERS,
  SETH2_FREE_SPINS,
  SETH2_MAX_FREE_SPINS,
  SETH2_MAX_WIN_MULTIPLIER,
  getBettingLimitForGame,
  type Seth2FeatureMode,
  type Seth2ProtocolResponse,
  type Seth2ReturnData,
} from '@bg/shared';
import {
  SeedHelper,
  creditAndRecord,
  debitAndRecord,
  lockUserAndCheckFunds,
  runLockedTransaction,
  type ActiveSeedBundle,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  forceControlOutcomeToLoss,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import { ApiError } from '../../../utils/errors.js';
import type { Seth2ProtocolInput, Seth2SourceInput } from './seth2.schema.js';
import {
  SETH2_SOURCE_DEFINITION,
  seth2SourceGameStates,
  seth2SourceInitialState,
  seth2SourcePlatform,
  type Seth2SourceAction,
} from './seth2.source.js';

const GAME_ID = GameId.STORM_OF_SETH_2;
const SETH2_MACHINE_PAGES = 8;
const SETH2_MACHINES_PER_PAGE = 500;
const SETH2_MACHINE_COUNT = SETH2_MACHINE_PAGES * SETH2_MACHINES_PER_PAGE;
const ALLOWED_BET_SET = new Set<number>(SETH2_ALLOWED_BETS);
const MAX_MULTIPLIER_BANK = SETH2_MAX_FREE_SPINS * 30 * 500;
const INTERRUPTED_SPIN_RESUME_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const SETH2_DEFERRED_PAYOUT_SEQUENCE_VERSION = 'seth2-v1.1.5-sequence-v2-deferred-payout';
// Every sub-2x value here is verified by isSeth2FactorRepresentable(). Keeping
// the legal small-win ladder lets lifecycle recovery honor a narrow payout cap
// instead of falling back to a loss merely because its 1.01x target is not an
// exact Seth board factor.
const CONTROL_FACTORS = [
  0, 0.5, 1, 1.05, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6, 1.65, 1.75, 1.8, 1.9, 1.95, 2, 3, 4, 5, 8, 10, 20,
  45, 50, 100, 200, 205, 220, 250, 300, 350, 400, 450, 500, 1000, 2015, 5000,
] as const;

export interface Seth2SessionState {
  freeSpinsRemaining: number;
  featureMode: Seth2FeatureMode;
  betAmount: string;
  multiplierBank: number;
  femaleLock: Seth2FemaleLockState | null;
  featureWinnings: number;
}

export interface Seth2FemaleLockState {
  cells: Array<{
    type: 10;
    mul: number;
    mul_type: number;
    code: number;
  }>;
  gamesRemaining: number;
}

interface Seth2Settlement {
  returnData: Seth2ReturnData;
  balance: number;
  jackpotPools?: Record<string, number>;
  spinId: string;
  session: Seth2SessionState;
  freeSpin: boolean;
  buying: boolean;
  featureIndex: 0 | 1 | 2 | null;
  totalStake: number;
  featureWinningsBefore: number;
}

interface Seth2FeatureRound {
  returnData: Seth2ReturnData;
  sessionBefore: Seth2SessionState;
  sessionAfter: Seth2SessionState;
  payoutFactor: number;
  featureWinningsBefore: number;
}

interface Seth2FeatureRun {
  rounds: Seth2FeatureRound[];
  totalPayoutFactor: number;
  finalSession: Seth2SessionState;
}

export interface Seth2MachineStatsRow {
  machineId: number;
  todayBet: Prisma.Decimal;
  todayPayout: Prisma.Decimal;
  thirtyDayBet: Prisma.Decimal;
  thirtyDayPayout: Prisma.Decimal;
}

const EMPTY_SESSION: Seth2SessionState = {
  freeSpinsRemaining: 0,
  featureMode: 'none',
  betAmount: '0.00',
  multiplierBank: 0,
  femaleLock: null,
  featureWinnings: 0,
};

export class Seth2Service {
  constructor(private readonly prisma: PrismaClient) {}

  async session(userId: string) {
    const user = await this.requireUser(userId);
    return {
      code: 1,
      data: {
        userInfo: {
          id: user.id,
          userName: user.username,
          nickname: user.displayName ?? user.username,
          score: Number(user.balance.toFixed(2)),
          socketPort: '',
        },
      },
    };
  }

  async protocol(userId: string, input: Seth2ProtocolInput): Promise<Seth2ProtocolResponse> {
    switch (input.type) {
      case 'ping':
        return response('pong', { timestamp: Date.now() });
      case 'connectToHall':
      case 'reconnect':
        await this.requireUser(userId);
        return response(input.type, { connected: true });
      case 'getUserInfo': {
        const session = await this.session(userId);
        return response(input.type, session.data.userInfo);
      }
      case 'getMachineList': {
        await this.requireUser(userId);
        const page = requireMachinePage(input.page);
        const stats = await this.machineStats();
        return response(input.type, {
          machineList: machineList(stats, page),
          page,
          totalPages: SETH2_MACHINE_PAGES,
          totalMachines: SETH2_MACHINE_COUNT,
        });
      }
      case 'getMachineInfo': {
        await this.requireUser(userId);
        const machineId = requireMachineId(input.machineId);
        const stats = await this.machineStats();
        return response(input.type, { machineInfo: machineInfo(machineId, stats.get(machineId)) });
      }
      case 'useMachine': {
        requireFormalPlay(input.isFreeModel);
        await this.requireUser(userId);
        const machineId = requireMachineId(input.machineId);
        await this.prisma.seth2PlayerState.upsert({
          where: { userId },
          create: { userId, selectedMachineId: machineId },
          update: { selectedMachineId: machineId },
        });
        return response(input.type, { machineId, success: true });
      }
      case 'gameRecordList':
        return response(input.type, await this.history(userId));
      case 'gameToolsList':
      case 'buyFreeGame': {
        requireFormalPlay(input.isFreeModel);
        const buying = input.type === 'buyFreeGame';
        const bet = requireBet(input.yazhu);
        const machineId = requireMachineId(input.machineId);
        const settlement = await this.settle(
          userId,
          bet,
          machineId,
          buying,
          buying ? 0 : null,
          false,
          input.operationId,
          false,
        );
        return response(input.type, {
          returnData: settlement.returnData,
          balance: settlement.balance,
          spinId: settlement.spinId,
        });
      }
    }
  }

  async source(userId: string, input: Seth2SourceInput): Promise<Record<string, unknown>> {
    const request = input.data;
    switch (input.event) {
      case 'initial': {
        const interruptedSpinId = sourceSpinId(request.resumeSpinId);
        const [user, playerState, activeSequence, jackpotPool] = await Promise.all([
          this.requireUser(userId),
          this.prisma.seth2PlayerState.findUnique({ where: { userId } }),
          this.prisma.seth2FeatureSequence.findFirst({
            where: { userId, status: 'READY' },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.seth2JackpotPool.findUnique({ where: { gameId: GAME_ID } }),
        ]);
        const interruptedBet =
          !activeSequence && interruptedSpinId
            ? await this.prisma.bet.findFirst({
                where: {
                  id: interruptedSpinId,
                  userId,
                  gameId: GAME_ID,
                  createdAt: {
                    gte: new Date(Date.now() - INTERRUPTED_SPIN_RESUME_WINDOW_MS),
                  },
                },
                select: {
                  id: true,
                  resultData: true,
                  seth2FeatureSequence: { select: { status: true } },
                },
              })
            : null;
        const machineId = playerState?.selectedMachineId ?? 1;
        const savedSettings = jsonObject(playerState?.settings);
        const bettingLimit = getBettingLimitForGame(
          user.bettingLimits,
          GAME_ID,
          user.bettingLimitLevel,
        );
        const platformBase = seth2SourcePlatform(
          {
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            balance: Number(user.balance.toFixed(2)),
          },
          machineId,
          savedSettings,
          jackpotPoolPayload(jackpotPool ?? SETH2_JACKPOT_SEEDS),
          bettingLimit,
        );
        const initialStakeIndex = platformBase.player.settings.stakeIndex;
        const initialRatioIndex = platformBase.player.settings.ratioIndex;
        const initialTotalStake = Number(
          (
            platformBase.game.stakeValues[initialStakeIndex]! *
            platformBase.game.ratioValues[initialRatioIndex]! *
            SETH2_SOURCE_DEFINITION.winlineDefs.length
          ).toFixed(2),
        );
        const referenceTimestamp = Date.now();
        const platform = {
          ...platformBase,
          // Machine statistics are only needed when the player opens the
          // table selector.  Keeping the 30-day aggregate off the initial
          // game boot removes a database scan from the critical path while
          // preserving all 500 first-page tables and animated rates.
          tables: sourceMachineTables(
            machineList(new Map(), 1, referenceTimestamp),
            userId,
            machineId,
            referenceTimestamp,
          ),
        };
        const storedSequenceStates = activeSequence
          ? readStoredGameStates(activeSequence.entryGameStates, activeSequence.featureGameStates)
          : null;
        if (activeSequence && !storedSequenceStates) {
          throw new ApiError('INTERNAL', '免費遊戲恢復資料損壞，已停止建立新的下注');
        }
        const sequenceResume = storedSequenceStates
          ? resumeStoredGameStates(storedSequenceStates, activeSequence?.resumeCursor ?? 0)
          : null;
        // Ordinary spins settle immediately, but the source may still be in
        // the middle of a tumble animation when the iframe is closed. A
        // same-device resume marker can safely replay that already-settled bet
        // without charging or crediting it again. Feature bets are excluded;
        // READY feature sequences above remain the sole financial authority.
        const interruptedSettlement =
          interruptedBet && !interruptedBet.seth2FeatureSequence
            ? readInterruptedSettlement(
                interruptedBet.id,
                interruptedBet.resultData,
                Number(user.balance.toFixed(2)),
              )
            : null;
        const interruptedGameStates = interruptedSettlement
          ? seth2SourceGameStates(interruptedSettlement.returnData, {
              action: interruptedSettlement.freeSpin ? 'freeSpin' : 'spin',
              spinId: interruptedSettlement.spinId,
              totalStake: interruptedSettlement.totalStake,
              freeGameCount: interruptedSettlement.session.freeSpinsRemaining,
              featureWinningsBefore: interruptedSettlement.featureWinningsBefore,
              isGoldenFg:
                interruptedSettlement.session.featureMode === 'awakening' ||
                interruptedSettlement.returnData.featureMode === 'awakening',
            })
          : null;
        const interruptedResume = interruptedGameStates
          ? resumeStoredGameStates(
              interruptedGameStates as unknown as Array<Record<string, unknown>>,
              0,
            )
          : null;
        const resumedStates = sequenceResume?.gameStates ?? interruptedResume?.gameStates ?? null;
        const resumedSpinId = sequenceResume
          ? activeSequence!.betId
          : interruptedResume
            ? interruptedSettlement!.spinId
            : '';
        const resumeCursor = sequenceResume?.resumeCursor ?? interruptedResume?.resumeCursor ?? 0;
        const resumeTotalViews = sequenceResume?.totalViews ?? interruptedResume?.totalViews ?? 0;
        return {
          status: 200,
          isResuming: Boolean(resumedStates),
          resumeKind: sequenceResume ? 'feature' : interruptedResume ? 'spin' : null,
          resumeCursor,
          resumeTotalViews,
          engine: {
            definition: SETH2_SOURCE_DEFINITION,
            gameState: resumedStates ?? [seth2SourceInitialState(initialTotalStake)],
            spinId: resumedSpinId,
          },
          platform,
        };
      }
      case 'updateFeatureProgress': {
        const sequenceId = String(request.sequenceId);
        const completedViews = Number(request.completedViews);
        await this.prisma.seth2FeatureSequence.updateMany({
          where: {
            userId,
            status: 'READY',
            resumeCursor: { lt: completedViews },
            OR: [{ id: sequenceId }, { betId: sequenceId }],
          },
          data: { resumeCursor: completedViews },
        });
        return { status: 200, sequenceId, completedViews };
      }
      case 'spin': {
        const buying = request.action === 'buyFeature';
        if (buying) {
          const totalStake = sourceTotalStake(request);
          const machineId = sourceMachineId(request);
          const featureIndex = sourceFeatureIndex(request.featureIndex);
          const settlement = await this.settle(
            userId,
            totalStake,
            machineId,
            true,
            featureIndex,
            false,
            sourceOperationId(request.operationId),
          );
          // v1.1.5 buys a feature in two requests: reserve the result, then
          // request the already-settled visual outcome with the returned spinId.
          return {
            status: 200,
            engine: { gameState: { spinId: settlement.spinId }, spinId: settlement.spinId },
            platform: sourceBalancePlatform(settlement.balance, settlement.jackpotPools),
          };
        }

        const requestedSpinId = sourceSpinId(request.spinId);
        const settlement = requestedSpinId
          ? await this.replayPurchasedSpin(userId, requestedSpinId)
          : await this.settle(
              userId,
              sourceTotalStake(request),
              sourceMachineId(request),
              false,
              null,
              false,
              sourceOperationId(request.operationId),
            );
        const featureIndex = settlement.featureIndex;
        const action: Seth2SourceAction =
          featureIndex === 2 ? 'superSpin' : settlement.freeSpin ? 'freeSpin' : 'spin';
        const gameState = seth2SourceGameStates(settlement.returnData, {
          action,
          spinId: settlement.spinId,
          totalStake: settlement.totalStake,
          freeGameCount: settlement.session.freeSpinsRemaining,
          featureWinningsBefore: settlement.featureWinningsBefore,
          isGoldenFg:
            settlement.session.featureMode === 'awakening' ||
            settlement.returnData.featureMode === 'awakening' ||
            featureIndex === 1,
        });
        return {
          status: 200,
          engine: { gameState, spinId: settlement.spinId },
          platform: sourceBalancePlatform(settlement.balance, settlement.jackpotPools),
        };
      }
      case 'collectFeatureSequence': {
        const sequenceId = String(request.sequenceId);
        const [sequence, user] = await Promise.all([
          this.prisma.seth2FeatureSequence.findFirst({
            where: {
              userId,
              OR: [{ id: sequenceId }, { betId: sequenceId }],
            },
          }),
          this.requireUser(userId),
        ]);
        if (!sequence) throw new ApiError('INVALID_ACTION', '找不到可重播的免費遊戲序列');
        const gameState = readStoredGameStateArray(sequence.featureGameStates);
        if (!gameState) throw new ApiError('INTERNAL', '免費遊戲序列資料損壞');
        return {
          status: 200,
          engine: { gameState, spinId: sequence.betId },
          // The sequence contains the complete visual result, but its payout
          // must remain hidden from the wallet until the source closes it.
          platform: sourceBalancePlatform(Number(user.balance.toFixed(2))),
        };
      }
      case 'closeSpin': {
        const spinId = sourceSpinId(request.spinId);
        if (!spinId) throw new ApiError('INVALID_ACTION', '缺少開獎編號');
        return runLockedTransaction(this.prisma, async (tx) => {
          const user = await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
            skipBetValidation: true,
          });
          const sequence = await tx.seth2FeatureSequence.findFirst({
            where: { userId, betId: spinId },
            select: {
              id: true,
              betId: true,
              machineId: true,
              finalPayout: true,
              definitionVersion: true,
              status: true,
            },
          });
          let balance = user.balance;
          if (sequence?.status === 'READY') {
            // v1 sequences were credited when they were created. Only v2 and
            // later deferred sequences are paid here, preserving compatibility
            // with in-flight rounds created before this deployment.
            if (sequence.definitionVersion === SETH2_DEFERRED_PAYOUT_SEQUENCE_VERSION) {
              balance = await creditAndRecord(
                tx,
                userId,
                sequence.finalPayout,
                sequence.betId,
                'BET_WIN',
                {
                  gameId: GAME_ID,
                  mode: 'feature-close',
                  machineId: sequence.machineId,
                },
              );
            }
            await tx.seth2FeatureSequence.updateMany({
              where: { id: sequence.id, status: 'READY' },
              data: { status: 'CONSUMED', consumedAt: new Date() },
            });
          }
          return {
            status: 200,
            platform: sourceBalancePlatform(Number(balance.toFixed(2))),
          };
        });
      }
      case 'updateSettings':
        await this.requireUser(userId);
        const savedState = await this.prisma.seth2PlayerState.findUnique({ where: { userId } });
        const settings = mergeSeth2PlayerSettings(
          jsonObject(savedState?.settings),
          request.settings,
        );
        await this.prisma.seth2PlayerState.upsert({
          where: { userId },
          create: { userId, settings: settings as Prisma.InputJsonValue },
          update: { settings: settings as Prisma.InputJsonValue },
        });
        return { status: 200 };
      case 'getBetRecords':
      case 'getUserReport': {
        const history = await this.history(userId);
        return { status: 200, ...history };
      }
      case 'getSlotTables': {
        await this.requireUser(userId);
        const page = requireMachinePage(Number(request.page ?? 1));
        const selected = sourceMachineId(request);
        const stats = await this.machineStats();
        const referenceTimestamp = Date.now();
        return {
          status: 200,
          data: {
            tables: sourceMachineTables(
              machineList(stats, page, referenceTimestamp),
              userId,
              selected,
              referenceTimestamp,
            ),
            lock: sourceTableLock(selected),
            tableMeta: {
              currentPage: page,
              tablePerPage: SETH2_MACHINES_PER_PAGE,
              totalPages: SETH2_MACHINE_PAGES,
              totalTableCount: SETH2_MACHINE_COUNT,
            },
          },
        };
      }
      case 'getSlotTableDetail': {
        await this.requireUser(userId);
        const machineId = sourceMachineId(request);
        const stats = await this.machineStats();
        const referenceTimestamp = Date.now();
        const machine = machineInfo(machineId, stats.get(machineId), referenceTimestamp);
        return {
          status: 200,
          data: {
            detail: sourceMachineDetail(machine, referenceTimestamp),
            lock: sourceTableLock(machineId),
          },
        };
      }
      case 'updateSlotTable': {
        await this.requireUser(userId);
        const machineId = sourceMachineId(request.table ?? request);
        await this.prisma.seth2PlayerState.upsert({
          where: { userId },
          create: { userId, selectedMachineId: machineId },
          update: { selectedMachineId: machineId },
        });
        return {
          status: 200,
          table: {
            roomId: machineId,
            number: machineId,
            status: 'Full',
            detail: null,
            lock: sourceTableLock(machineId),
          },
        };
      }
      case 'lockSlotTable':
        await this.requireUser(userId);
        return {
          status: 200,
          lock: sourceTableLock(
            (await this.prisma.seth2PlayerState.findUnique({ where: { userId } }))
              ?.selectedMachineId ?? 1,
          ),
        };
    }
  }

  async history(userId: string) {
    await this.requireUser(userId);
    const bets = await this.prisma.bet.findMany({
      where: { userId, gameId: GAME_ID, OR: [{ amount: { gt: 0 } }, { payout: { gt: 0 } }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, amount: true, payout: true, createdAt: true },
    });
    return {
      recordList: bets.map((bet) => ({
        id: bet.id,
        create_time: bet.createdAt.getTime(),
        yazhu: Number(bet.amount.toFixed(2)),
        total_gold: Number(bet.payout.toFixed(2)),
      })),
    };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        balance: true,
        bettingLimits: true,
        bettingLimitLevel: true,
        frozenAt: true,
        disabledAt: true,
      },
    });
    if (!user) throw new ApiError('UNAUTHORIZED', 'Authentication required');
    if (user.frozenAt || user.disabledAt) {
      throw new ApiError('MEMBER_FROZEN', 'Member account is frozen');
    }
    return user;
  }

  private async machineStats(): Promise<Map<number, Seth2MachineStatsRow>> {
    const rows = await this.prisma.$queryRaw<Seth2MachineStatsRow[]>(Prisma.sql`
      SELECT
        ("resultData"->>'machineId')::integer AS "machineId",
        COALESCE(
          SUM("amount") FILTER (
            WHERE "createdAt" >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')
              AT TIME ZONE 'Asia/Taipei'
          ),
          0
        ) AS "todayBet",
        COALESCE(
          SUM("payout") FILTER (
            WHERE "createdAt" >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')
              AT TIME ZONE 'Asia/Taipei'
          ),
          0
        ) AS "todayPayout",
        COALESCE(SUM("amount"), 0) AS "thirtyDayBet",
        COALESCE(SUM("payout"), 0) AS "thirtyDayPayout"
      FROM "Bet"
      WHERE "gameId" = ${GAME_ID}
        AND "status" = 'SETTLED'
        AND "createdAt" >= (
          date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Taipei')
            AT TIME ZONE 'Asia/Taipei'
        ) - INTERVAL '29 days'
        AND jsonb_typeof("resultData") = 'object'
        AND ("resultData"->>'machineId') ~ '^[1-9][0-9]{0,3}$'
      GROUP BY ("resultData"->>'machineId')::integer
    `);
    return new Map(rows.map((row) => [Number(row.machineId), row]));
  }

  private async settle(
    userId: string,
    requestedBet: number,
    machineId: number,
    buying: boolean,
    featureIndex: 0 | 1 | 2 | null = buying ? 0 : null,
    requireFreeSpin = false,
    operationId: string,
    atomicFeature = true,
  ): Promise<Seth2Settlement> {
    return runLockedTransaction(this.prisma, async (tx) => {
      const requestedBaseAmount = new Prisma.Decimal(requestedBet);
      const user = await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
        skipBetValidation: true,
      });
      const repeated = await tx.bet.findFirst({
        where: { userId, gameId: GAME_ID, operationId },
        select: { id: true, resultData: true },
      });
      if (repeated) {
        const stored = readStoredSettlement(repeated.id, repeated.resultData, {
          requestedBet,
          machineId,
          buying,
          featureIndex,
          atomicFeature,
        });
        if (!stored) {
          throw new ApiError('INVALID_ACTION', '相同 operationId 的請求內容不一致');
        }
        return stored;
      }
      await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
        limitAmounts: [requestedBaseAmount],
      });
      const activeSequence = await tx.seth2FeatureSequence.findFirst({
        where: { userId, status: 'READY' },
        select: { betId: true },
      });
      if (activeSequence) {
        throw new ApiError('INVALID_ACTION', `尚有未播放完成的免費遊戲：${activeSequence.betId}`);
      }
      const previous = await tx.bet.findFirst({
        where: { userId, gameId: GAME_ID },
        orderBy: { createdAt: 'desc' },
        select: { resultData: true },
      });
      // Source v1.1.5 settles an entire feature atomically and resumes it from
      // Seth2FeatureSequence. Legacy per-spin sessions left by older releases
      // must not block a new buy forever once no READY sequence exists.
      const currentSession = settlementSession(previous?.resultData, atomicFeature);
      const freeSpin = !buying && currentSession.freeSpinsRemaining > 0;
      if (requireFreeSpin && !freeSpin) {
        throw new ApiError('INVALID_ACTION', '目前沒有可收集的免費遊戲');
      }
      if (buying && currentSession.freeSpinsRemaining > 0) {
        throw new ApiError('INVALID_ACTION', '免費遊戲進行中，無法再次購買功能');
      }

      const baseAmount = freeSpin
        ? new Prisma.Decimal(currentSession.betAmount)
        : requestedBaseAmount;
      if (freeSpin && !baseAmount.equals(requestedBaseAmount)) {
        await lockUserAndCheckFunds(tx, userId, new Prisma.Decimal(0), GAME_ID, {
          limitAmounts: [baseAmount],
        });
      }
      const baseBet = requireBet(Number(baseAmount.toFixed(2)));
      const buyRate = buying
        ? SETH2_BUY_FEATURE_MULTIPLIERS[featureIndex ?? 0]
        : SETH2_BUY_FEATURE_MULTIPLIER;
      const debitAmount = buying
        ? baseAmount.mul(buyRate)
        : freeSpin
          ? new Prisma.Decimal(0)
          : baseAmount;
      if (user.balance.lessThan(debitAmount)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Insufficient balance');
      }

      const sessionMode: Seth2SpinMode = freeSpin
        ? currentSession.featureMode === 'awakening'
          ? 'awakening_free'
          : 'standard_free'
        : 'base';
      const multiplierBankBefore = freeSpin ? currentSession.multiplierBank : 0;
      const lockedMultiplierContribution = freeSpin
        ? femaleLockContribution(currentSession.femaleLock)
        : 0;
      const effectiveMultiplierBankBefore = multiplierBankBefore + lockedMultiplierContribution;
      const hasPersistentMultiplier = lockedMultiplierContribution > 0;
      const seedHelper = new SeedHelper(tx);
      const seed = await seedHelper.getActiveBundle(userId, GAME_ID);
      const originalOutcome = buying
        ? featureIndex === 1
          ? seth2BuyFeatureEntry(seed.serverSeed, seed.clientSeed, seed.nonce, 'awakening', baseBet)
          : featureIndex === 2
            ? seth2SuperMainSpin(seed.serverSeed, seed.clientSeed, seed.nonce, baseBet)
            : seth2BuyFeature(seed.serverSeed, seed.clientSeed, seed.nonce, baseBet)
        : seth2Spin(
            seed.serverSeed,
            seed.clientSeed,
            seed.nonce,
            baseBet,
            sessionMode,
            effectiveMultiplierBankBefore,
            hasPersistentMultiplier,
          );
      normalizeFemaleLockAccounting(
        originalOutcome.returnData,
        multiplierBankBefore,
        lockedMultiplierContribution,
      );
      const jackpotPool = debitAmount.greaterThan(0)
        ? await contributeSeth2Jackpot(tx, debitAmount)
        : null;
      const naturalJackpotTier = originalOutcome.returnData.JPtype;
      if (jackpotPool && naturalJackpotTier > 0) {
        applySeth2JackpotAward(originalOutcome, baseAmount, jackpotPool);
      }
      const boughtFeatureMode: Seth2FeatureMode = buying ? originalOutcome.featureMode : 'none';
      const mode: Seth2SpinMode = buying
        ? featureIndex === 2 || boughtFeatureMode === 'awakening'
          ? 'awakening_free'
          : 'bought_standard_free'
        : sessionMode;
      const opensFeature =
        atomicFeature &&
        !freeSpin &&
        featureIndex !== 2 &&
        (buying || originalOutcome.triggeredFreeSpins);
      const featureSeeds = opensFeature
        ? await seedHelper.getActiveBundles(userId, GAME_ID, SETH2_MAX_FREE_SPINS)
        : [];
      const originalFeatureRun = opensFeature
        ? generateFeatureRun({
            entryOutcome: originalOutcome,
            seeds: featureSeeds,
            baseBet,
            buying,
            featureIndex,
            featureMode: buying ? boughtFeatureMode : originalOutcome.featureMode,
          })
        : null;
      const originalTotalFactor =
        originalOutcome.payoutFactor + (originalFeatureRun?.totalPayoutFactor ?? 0);
      const originalPayout = payoutForFactor(baseAmount, originalTotalFactor);
      const controlAmount = debitAmount.greaterThan(0) ? debitAmount : baseAmount;
      const originalMultiplier = originalPayout
        .div(controlAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      const originalPrediction = {
        won: originalPayout.greaterThan(controlAmount),
        amount: controlAmount,
        multiplier: originalMultiplier,
        payout: originalPayout,
      };
      const controlled: ControlOutcome =
        !atomicFeature && buying && featureIndex !== 2
          ? { ...originalPrediction, controlled: false }
          : await applyControls(tx, userId, GAME_ID, originalPrediction, {
              burstEligible: true,
              burstPotentialMultiplier: baseAmount
                .mul(SETH2_MAX_WIN_MULTIPLIER)
                .div(controlAmount)
                .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN),
            });
      const gameCapApplied =
        originalTotalFactor > SETH2_MAX_WIN_MULTIPLIER && !controlled.controlled;
      const capControl = {
        won: true,
        multiplier: new Prisma.Decimal(SETH2_MAX_WIN_MULTIPLIER),
        minMultiplier: new Prisma.Decimal(SETH2_MAX_WIN_MULTIPLIER),
        maxMultiplier: new Prisma.Decimal(SETH2_MAX_WIN_MULTIPLIER),
      };
      let effectiveControl = controlled;
      let controlledSingleFactor: number | null = null;
      let controlledFeatureFactor: number | null = null;
      if (gameCapApplied && !originalFeatureRun) {
        controlledSingleFactor = chooseControlledSethFactor(
          baseAmount,
          controlAmount,
          capControl,
          mode,
          effectiveMultiplierBankBefore,
          hasPersistentMultiplier,
          seed.nonce,
        );
      } else if (controlled.controlled) {
        if (buying && featureIndex !== 2) {
          controlledFeatureFactor = chooseControlledSethFeatureFactor(
            baseAmount,
            controlAmount,
            effectiveControl,
            mode,
            seed.nonce,
          );
        } else {
          controlledSingleFactor = chooseControlledSethFactor(
            baseAmount,
            controlAmount,
            effectiveControl,
            mode,
            effectiveMultiplierBankBefore,
            hasPersistentMultiplier,
            seed.nonce,
          );
        }
        if (controlledSingleFactor === null && controlledFeatureFactor === null) {
          effectiveControl = forceControlOutcomeToLoss(controlled);
          if (buying && featureIndex !== 2) {
            controlledFeatureFactor = chooseControlledSethFeatureFactor(
              baseAmount,
              controlAmount,
              effectiveControl,
              mode,
              seed.nonce,
            );
          } else {
            controlledSingleFactor = chooseControlledSethFactor(
              baseAmount,
              controlAmount,
              effectiveControl,
              mode,
              effectiveMultiplierBankBefore,
              hasPersistentMultiplier,
              seed.nonce,
            );
          }
        }
      }
      if (
        (gameCapApplied && !originalFeatureRun && controlledSingleFactor === null) ||
        (effectiveControl.controlled &&
          (buying && featureIndex !== 2
            ? controlledFeatureFactor === null
            : controlledSingleFactor === null))
      ) {
        throw new ApiError('INTERNAL', '控制結果超出賽特 2 可顯示的賠率範圍');
      }

      const finalOutcome =
        effectiveControl.controlled || (gameCapApplied && !originalFeatureRun)
          ? buying && featureIndex !== 2
            ? originalOutcome
            : featureIndex === 2
              ? seth2SuperMainSpinForFactor(
                  seed.serverSeed,
                  seed.clientSeed,
                  seed.nonce,
                  baseBet,
                  controlledSingleFactor!,
                )
              : seth2SpinForFactor(
                  seed.serverSeed,
                  seed.clientSeed,
                  seed.nonce,
                  baseBet,
                  controlledSingleFactor!,
                  mode,
                  effectiveMultiplierBankBefore,
                  hasPersistentMultiplier,
                  true,
                  false,
                )
          : originalOutcome;
      if (finalOutcome !== originalOutcome) {
        normalizeFemaleLockAccounting(
          finalOutcome.returnData,
          multiplierBankBefore,
          lockedMultiplierContribution,
        );
      }
      const finalFeatureRun =
        gameCapApplied && originalFeatureRun
          ? generateFeatureRun({
              entryOutcome: finalOutcome,
              seeds: featureSeeds,
              baseBet,
              buying,
              featureIndex,
              featureMode: buying ? boughtFeatureMode : originalOutcome.featureMode,
              forcedTotalFactor: SETH2_MAX_WIN_MULTIPLIER,
            })
          : buying && featureIndex !== 2 && effectiveControl.controlled
            ? generateFeatureRun({
                entryOutcome: finalOutcome,
                seeds: featureSeeds,
                baseBet,
                buying: true,
                featureIndex,
                featureMode: boughtFeatureMode,
                forcedTotalFactor: controlledFeatureFactor!,
              })
            : finalOutcome === originalOutcome
              ? originalFeatureRun
              : null;
      const femaleLock = applyFemaleLockState(
        finalOutcome.returnData,
        freeSpin ? currentSession.femaleLock : null,
      );
      const finalTotalFactor =
        finalOutcome.payoutFactor + (finalFeatureRun?.totalPayoutFactor ?? 0);
      const finalPayout = payoutForFactor(baseAmount, finalTotalFactor);
      const entryPayout = payoutForFactor(baseAmount, finalOutcome.payoutFactor);
      const deferredPayout =
        Boolean(finalFeatureRun) || (atomicFeature && buying && featureIndex === 2);
      const finalControlMultiplier = finalPayout
        .div(controlAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      const betMultiplier = debitAmount.greaterThan(0)
        ? finalPayout.div(debitAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
        : new Prisma.Decimal(finalTotalFactor).toDecimalPlaces(4);

      const nextSession = advanceSession(currentSession, {
        buying,
        featureIndex,
        freeSpin,
        betAmount: baseAmount,
        triggeredFreeSpins: finalOutcome.triggeredFreeSpins,
        triggeredFeatureMode: finalOutcome.featureMode,
        boughtFeatureMode,
        extraSpins: finalOutcome.returnData.addGameCiShu,
        multiplierBankAfter: finalOutcome.returnData.multiplierBankAfter,
        femaleLock,
        roundPayout: Number(entryPayout.toFixed(2)),
      });
      const responseFeatureMode: Seth2FeatureMode = buying
        ? boughtFeatureMode
        : freeSpin
          ? currentSession.featureMode
          : finalOutcome.triggeredFreeSpins
            ? finalOutcome.featureMode
            : 'none';
      applyFeatureState(
        finalOutcome.returnData,
        nextSession.freeSpinsRemaining,
        (buying && featureIndex !== 2) || finalOutcome.triggeredFreeSpins,
        responseFeatureMode,
      );
      const storedSession = finalFeatureRun ? EMPTY_SESSION : nextSession;
      const settlesNaturalJackpot =
        naturalJackpotTier > 0 &&
        finalOutcome === originalOutcome &&
        !gameCapApplied &&
        !effectiveControl.controlled;
      const settledJackpotPool = jackpotPool
        ? jackpotPoolAfterSettlement(jackpotPool, naturalJackpotTier, settlesNaturalJackpot)
        : null;
      const jackpotPools = settledJackpotPool ? jackpotPoolPayload(settledJackpotPool) : undefined;

      const originalResult = {
        mode,
        machineId,
        baseAmount: baseAmount.toFixed(2),
        debitAmount: debitAmount.toFixed(2),
        returnData: originalOutcome.returnData,
        totalPayoutFactor: originalTotalFactor,
      };
      const finalResult = {
        mode: buying ? 'buy' : mode,
        machineId,
        buying,
        featureIndex,
        baseAmount: baseAmount.toFixed(2),
        debitAmount: debitAmount.toFixed(2),
        session: storedSession,
        displaySession: nextSession,
        featureWinningsBefore: freeSpin ? currentSession.featureWinnings : 0,
        returnData: finalOutcome.returnData,
        controlled: effectiveControl.controlled || gameCapApplied,
        flipReason: effectiveControl.flipReason ?? (gameCapApplied ? 'game_max_win' : null),
        raw: effectiveControl.controlled || gameCapApplied ? originalResult : null,
        operationId,
        balanceAfter: (deferredPayout
          ? user.balance.minus(debitAmount)
          : user.balance.minus(debitAmount).add(finalPayout)
        ).toFixed(2),
        hasFeatureSequence: deferredPayout,
        atomicFeature,
        jackpotPools,
      };
      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GAME_ID,
          amount: debitAmount,
          multiplier: betMultiplier,
          payout: finalPayout,
          profit: finalPayout.minus(debitAmount),
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult as unknown as Prisma.InputJsonValue,
          operationId,
        },
      });

      const debitedBalance = debitAmount.greaterThan(0)
        ? await debitAndRecord(tx, userId, debitAmount, bet.id, {
            gameId: GAME_ID,
            mode: buying ? 'buy' : mode,
            machineId,
          })
        : user.balance;
      const newBalance =
        !deferredPayout && finalPayout.greaterThan(0)
          ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN', {
              gameId: GAME_ID,
              mode: buying ? 'buy' : mode,
              machineId,
            })
          : debitedBalance;

      if (deferredPayout) {
        const entryGameStates = seth2SourceGameStates(finalOutcome.returnData, {
          action: featureIndex === 2 ? 'superSpin' : 'spin',
          spinId: bet.id,
          totalStake: baseBet,
          freeGameCount: nextSession.freeSpinsRemaining,
          featureWinningsBefore: 0,
          isGoldenFg: responseFeatureMode === 'awakening',
        });
        const featureGameStates = finalFeatureRun
          ? featureRunGameStates(finalFeatureRun, bet.id, baseBet)
          : [];
        await tx.seth2FeatureSequence.create({
          data: {
            userId,
            betId: bet.id,
            operationId,
            machineId,
            featureIndex,
            baseAmount,
            debitAmount,
            finalPayout,
            finalBalance: debitedBalance.add(finalPayout),
            entryGameStates: entryGameStates as unknown as Prisma.InputJsonValue,
            featureGameStates: featureGameStates as unknown as Prisma.InputJsonValue,
            mathResults: (finalFeatureRun
              ? finalFeatureRun.rounds.map((round, index) => ({
                  nonce: featureSeeds[index]?.nonce,
                  serverSeedId: featureSeeds[index]?.serverSeedId,
                  returnData: round.returnData,
                  payoutFactor: round.payoutFactor,
                }))
              : [
                  {
                    nonce: seed.nonce,
                    serverSeedId: seed.serverSeedId,
                    returnData: finalOutcome.returnData,
                    payoutFactor: finalOutcome.payoutFactor,
                  },
                ]) as unknown as Prisma.InputJsonValue,
            controlResult: {
              controlled: effectiveControl.controlled || gameCapApplied,
              reason: effectiveControl.flipReason ?? (gameCapApplied ? 'game_max_win' : null),
              accountingAmount: controlAmount.toFixed(2),
              originalPayout: originalPayout.toFixed(2),
              finalPayout: finalPayout.toFixed(2),
            },
            definitionVersion: SETH2_DEFERRED_PAYOUT_SEQUENCE_VERSION,
          },
        });
      }
      if (settlesNaturalJackpot) {
        await resetSeth2Jackpot(tx, naturalJackpotTier);
      }

      await finalizeControls(
        tx,
        userId,
        GAME_ID,
        originalPrediction,
        {
          won: finalPayout.greaterThan(controlAmount),
          amount: controlAmount,
          multiplier: finalControlMultiplier,
          payout: finalPayout,
        },
        effectiveControl,
        bet.id,
        originalResult as unknown as Prisma.InputJsonValue,
        finalResult as unknown as Prisma.InputJsonValue,
      );

      return {
        returnData: finalOutcome.returnData,
        balance: Number(newBalance.toFixed(2)),
        jackpotPools,
        spinId: bet.id,
        session: nextSession,
        freeSpin,
        buying,
        featureIndex,
        totalStake: baseBet,
        featureWinningsBefore: freeSpin ? currentSession.featureWinnings : 0,
      };
    });
  }

  private async replayPurchasedSpin(userId: string, spinId: string): Promise<Seth2Settlement> {
    const [user, bet] = await Promise.all([
      this.requireUser(userId),
      this.prisma.bet.findFirst({
        where: { id: spinId, userId, gameId: GAME_ID },
        select: { resultData: true },
      }),
    ]);
    const stored = readPurchasedSettlement(bet?.resultData);
    if (!stored) {
      throw new ApiError('INVALID_ACTION', '找不到購買功能的開獎結果');
    }
    return {
      returnData: stored.returnData,
      balance: Number(user.balance.toFixed(2)),
      jackpotPools: stored.jackpotPools,
      spinId,
      session: stored.session,
      freeSpin: false,
      buying: true,
      featureIndex: stored.featureIndex,
      totalStake: stored.totalStake,
      featureWinningsBefore: 0,
    };
  }
}

function response(type: string, data: unknown): Seth2ProtocolResponse {
  return { type, data };
}

function requireBet(value: number | undefined): number {
  if (value === undefined || !ALLOWED_BET_SET.has(value)) {
    throw new ApiError('INVALID_BET', '無效的投注金額');
  }
  return value;
}

function requireMachineId(value: number | undefined): number {
  if (!Number.isInteger(value) || value === undefined || value < 1 || value > SETH2_MACHINE_COUNT) {
    throw new ApiError('INVALID_ACTION', '無效的機台');
  }
  return value;
}

function requireMachinePage(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isInteger(value) || value < 1 || value > SETH2_MACHINE_PAGES) {
    throw new ApiError('INVALID_ACTION', '無效的機台頁碼');
  }
  return value;
}

function requireFormalPlay(isFreeModel: number | undefined): void {
  if (isFreeModel === 1) {
    throw new ApiError('INVALID_ACTION', '試玩模式已停用，請使用正式點數遊玩');
  }
}

const MACHINE_REFERENCE_TICK_MS = 5_000;
const MACHINE_REFERENCE_DAY_MS = 86_400_000;
const MACHINE_OCCUPANCY_TICK_MS = 30_000;
const MACHINE_OCCUPANCY_MIN_COUNT = Math.ceil(SETH2_MACHINES_PER_PAGE * 0.75);
const MACHINE_OCCUPANCY_MID_COUNT = Math.ceil(SETH2_MACHINES_PER_PAGE * 0.8);
const MACHINE_OCCUPANCY_SWING_COUNT = Math.floor(SETH2_MACHINES_PER_PAGE * 0.05);

export function machineDisplayRate(id: number, timestamp = Date.now(), salt = 0): string {
  const tick = Math.floor(timestamp / MACHINE_REFERENCE_TICK_MS);
  const baseUnits = 7_800 + ((id * 137 + salt * 911) % 4_400);
  const phaseUnits = (tick + id * 29 + salt * 173) % 720;
  const waveUnits = Math.round(Math.sin((phaseUnits / 720) * Math.PI * 2) * 500);
  const rateUnits = Math.max(7_000, Math.min(12_999, baseUnits + waveUnits));
  return (rateUnits / 100).toFixed(2);
}

/**
 * Provides a display-only crowd for the private Seth 2 table selector.
 *
 * A page always has at least 75% occupied tables. The permutation rotates by
 * one position per 30-second tick, so only a small number of tables change at
 * once instead of the entire page visibly reshuffling. These occupants never
 * create users, wallet entries, bets, or any other persisted records.
 */
export function machineHasSimulatedPlayer(id: number, timestamp = Date.now()): boolean {
  const pageIndex = Math.floor((id - 1) / SETH2_MACHINES_PER_PAGE);
  const pagePosition = (id - 1) % SETH2_MACHINES_PER_PAGE;
  const tick = Math.floor(timestamp / MACHINE_OCCUPANCY_TICK_MS);
  const occupiedCount = Math.max(
    MACHINE_OCCUPANCY_MIN_COUNT,
    Math.min(
      SETH2_MACHINES_PER_PAGE,
      MACHINE_OCCUPANCY_MID_COUNT +
        Math.round(Math.sin((tick + pageIndex * 31) / 20) * MACHINE_OCCUPANCY_SWING_COUNT),
    ),
  );
  // 137 is coprime with 500, so every page position receives one unique rank.
  const rank = (pagePosition * 137 + tick + pageIndex * 83) % SETH2_MACHINES_PER_PAGE;
  return rank < occupiedCount;
}

export function machineInfo(id: number, stats?: Seth2MachineStatsRow, timestamp = Date.now()) {
  const todayBet = stats?.todayBet ?? new Prisma.Decimal(0);
  const thirtyDayBet = stats?.thirtyDayBet ?? new Prisma.Decimal(0);
  return {
    id,
    code: String(id).padStart(4, '0'),
    use_status: 0,
    day_rate: machineDisplayRate(id, timestamp),
    totalBet: Number(todayBet.toFixed(2)),
    totalBet30: Number(thirtyDayBet.toFixed(2)),
    day_rate_30: machineDisplayRate(id, timestamp, 1),
    MINI_start_number: 25,
    MINI_JP_store: Number((id * 0.13).toFixed(2)),
    MINOR_start_number: 100,
    MINOR_JP_store: Number((id * 0.41).toFixed(2)),
    MAJOR_start_number: 500,
    MAJOR_JP_store: Number((id * 1.37).toFixed(2)),
    GRAND_start_number: 2000,
    GRAND_JP_store: Number((id * 4.73).toFixed(2)),
  };
}

export function machineList(
  stats: Map<number, Seth2MachineStatsRow>,
  page = 1,
  timestamp = Date.now(),
) {
  const firstId = (page - 1) * SETH2_MACHINES_PER_PAGE + 1;
  return Array.from({ length: SETH2_MACHINES_PER_PAGE }, (_, index) => {
    const id = firstId + index;
    return machineInfo(id, stats.get(id), timestamp);
  });
}

function readSession(resultData: Prisma.JsonValue | undefined): Seth2SessionState {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) {
    return EMPTY_SESSION;
  }
  const session = (resultData as Record<string, unknown>).session;
  if (session === undefined || session === null) return EMPTY_SESSION;
  if (typeof session !== 'object' || Array.isArray(session)) {
    throw new ApiError('INTERNAL', '賽特 2 遊戲狀態資料損壞，無法安全恢復');
  }
  const value = session as Record<string, unknown>;
  const remaining = Number(value.freeSpinsRemaining);
  const betAmount = String(value.betAmount ?? '0');
  const featureMode = value.featureMode;
  const multiplierBank = value.multiplierBank === undefined ? 0 : Number(value.multiplierBank);
  const featureWinnings = value.featureWinnings === undefined ? 0 : Number(value.featureWinnings);
  const femaleLock = readFemaleLock(value.femaleLock);
  if (
    remaining === 0 &&
    featureMode === 'none' &&
    Number(betAmount) === 0 &&
    multiplierBank === 0 &&
    featureWinnings === 0 &&
    femaleLock === null
  ) {
    return EMPTY_SESSION;
  }
  if (
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    remaining > SETH2_MAX_FREE_SPINS ||
    !Number.isInteger(multiplierBank) ||
    multiplierBank < 0 ||
    multiplierBank > MAX_MULTIPLIER_BANK ||
    !Number.isFinite(featureWinnings) ||
    featureWinnings < 0 ||
    !ALLOWED_BET_SET.has(Number(betAmount)) ||
    (featureMode !== 'none' && featureMode !== 'standard' && featureMode !== 'awakening') ||
    femaleLock === undefined
  ) {
    throw new ApiError('INTERNAL', '賽特 2 遊戲狀態資料不完整，無法安全恢復');
  }
  return {
    freeSpinsRemaining: remaining,
    featureMode,
    betAmount,
    multiplierBank,
    femaleLock,
    featureWinnings,
  };
}

export function settlementSession(
  resultData: Prisma.JsonValue | undefined,
  atomicFeature: boolean,
): Seth2SessionState {
  return atomicFeature ? EMPTY_SESSION : readSession(resultData);
}

function readPurchasedSettlement(resultData: Prisma.JsonValue | undefined): {
  returnData: Seth2ReturnData;
  session: Seth2SessionState;
  featureIndex: 0 | 1 | 2;
  totalStake: number;
  jackpotPools?: Record<string, number>;
} | null {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) return null;
  const stored = resultData as Record<string, unknown>;
  const featureIndex = Number(stored.featureIndex);
  const totalStake = Number(stored.baseAmount);
  const returnData = stored.returnData;
  if (
    stored.buying !== true ||
    (featureIndex !== 0 && featureIndex !== 1 && featureIndex !== 2) ||
    !ALLOWED_BET_SET.has(totalStake) ||
    !returnData ||
    typeof returnData !== 'object' ||
    Array.isArray(returnData)
  ) {
    return null;
  }
  const outcome = returnData as Record<string, unknown>;
  if (!Array.isArray(outcome.list) || !Number.isFinite(Number(outcome.total_gold))) return null;
  const displaySession = readSessionObject(stored.displaySession) ?? readSession(resultData);
  return {
    returnData: returnData as unknown as Seth2ReturnData,
    session: displaySession,
    featureIndex,
    totalStake,
    jackpotPools: readJackpotPools(stored.jackpotPools),
  };
}

function readSessionObject(session: unknown): Seth2SessionState | null {
  if (!session || typeof session !== 'object' || Array.isArray(session)) return null;
  return readSession({ session } as unknown as Prisma.JsonValue);
}

function readStoredSettlement(
  spinId: string,
  resultData: Prisma.JsonValue | undefined,
  expected: {
    requestedBet: number;
    machineId: number;
    buying: boolean;
    featureIndex: 0 | 1 | 2 | null;
    atomicFeature: boolean;
  },
): Seth2Settlement | null {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) return null;
  const stored = resultData as Record<string, unknown>;
  const baseAmount = Number(stored.baseAmount);
  const machineId = Number(stored.machineId);
  const buying = stored.buying === true;
  const featureIndexValue = stored.featureIndex;
  const featureIndex =
    featureIndexValue === null || featureIndexValue === undefined
      ? null
      : Number(featureIndexValue);
  const returnData = stored.returnData;
  const balance = Number(stored.balanceAfter);
  if (
    baseAmount !== expected.requestedBet ||
    machineId !== expected.machineId ||
    buying !== expected.buying ||
    featureIndex !== expected.featureIndex ||
    stored.atomicFeature !== expected.atomicFeature ||
    !Number.isFinite(balance) ||
    !returnData ||
    typeof returnData !== 'object' ||
    Array.isArray(returnData) ||
    !Array.isArray((returnData as Record<string, unknown>).list)
  ) {
    return null;
  }
  const session = readSessionObject(stored.displaySession) ?? readSession(resultData);
  const mode = String(stored.mode ?? 'base');
  const featureWinningsBefore = Number(stored.featureWinningsBefore ?? 0);
  return {
    returnData: returnData as unknown as Seth2ReturnData,
    balance,
    jackpotPools: readJackpotPools(stored.jackpotPools),
    spinId,
    session,
    freeSpin: mode === 'standard_free' || mode === 'awakening_free',
    buying,
    featureIndex:
      featureIndex === 0 || featureIndex === 1 || featureIndex === 2 ? featureIndex : null,
    totalStake: baseAmount,
    featureWinningsBefore: Number.isFinite(featureWinningsBefore) ? featureWinningsBefore : 0,
  };
}

function readFemaleLock(value: unknown): Seth2FemaleLockState | null | undefined {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const lock = value as Record<string, unknown>;
  const gamesRemaining = Number(lock.gamesRemaining);
  if (!Number.isInteger(gamesRemaining) || gamesRemaining < 1 || gamesRemaining > 6) {
    return undefined;
  }
  if (!Array.isArray(lock.cells) || lock.cells.length < 1 || lock.cells.length > 30)
    return undefined;
  const cells: Seth2FemaleLockState['cells'] = [];
  for (const raw of lock.cells) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
    const source = raw as Record<string, unknown>;
    const mul = Number(source.mul);
    const mulType = Number(source.mul_type);
    const code = Number(source.code);
    if (
      !Number.isInteger(mul) ||
      mul < 2 ||
      mul > 500 ||
      !Number.isInteger(mulType) ||
      (mulType !== 0 && mulType !== 1) ||
      !Number.isInteger(code) ||
      code < 0 ||
      code >= 30
    ) {
      return undefined;
    }
    cells.push({ type: 10, mul, mul_type: mulType, code });
  }
  return { cells, gamesRemaining };
}

export function applyFemaleLockState(
  data: Seth2ReturnData,
  current: Seth2FemaleLockState | null,
): Seth2FemaleLockState | null {
  if (current) {
    placeFemaleLockCells(data, current.cells);
    addFemaleLockWinUpgrades(data, current.cells);
  }
  if (data.type18_start_mul_list.length > 0) {
    const board = data.list[0]?.start_data ?? [];
    const usedCodes = new Set<number>();
    const visibleCells = data.type18_start_mul_list.map((selected) => {
      const requestedCode = Number(selected.code);
      const exact =
        Number.isInteger(requestedCode) &&
        requestedCode >= 0 &&
        requestedCode < board.length &&
        board[requestedCode]?.type === 10
          ? requestedCode
          : -1;
      const matched = board.findIndex(
        (cell, code) =>
          !usedCodes.has(code) &&
          cell.type === 10 &&
          cell.mul === selected.mul &&
          (cell.mul_type ?? 0) === (selected.mul_type ?? 0),
      );
      const code = exact >= 0 && !usedCodes.has(exact) ? exact : matched;
      const safeCode = code >= 0 ? code : Math.max(0, Math.min(29, requestedCode || 0));
      usedCodes.add(safeCode);
      const cell = board[safeCode];
      return {
        type: 10 as const,
        mul: cell?.type === 10 ? cell.mul : selected.mul,
        mul_type: cell?.type === 10 ? (cell.mul_type ?? 0) : (selected.mul_type ?? 0),
        code: safeCode,
      };
    });
    const duration =
      data.type18_mul_count === 6 || data.type18_mul_count === 4 || data.type18_mul_count === 2
        ? data.type18_mul_count
        : 2;
    data.type18_start_mul_list = visibleCells.map((cell) => ({ ...cell }));
    data.type18_mul_count = duration;
    const persistedCells = applyPersistedMultiplierUpgrades(data, visibleCells);
    return duration > 1 ? { cells: persistedCells, gamesRemaining: duration - 1 } : null;
  }
  if (!current) {
    data.type18_start_mul_list = [];
    data.type18_mul_count = 0;
    return null;
  }
  data.type18_start_mul_list = current.cells.map((cell) => ({ ...cell }));
  data.type18_mul_count = current.gamesRemaining;
  const persistedCells = applyPersistedMultiplierUpgrades(data, current.cells);
  return current.gamesRemaining > 1
    ? {
        cells: persistedCells,
        gamesRemaining: current.gamesRemaining - 1,
      }
    : null;
}

function applyPersistedMultiplierUpgrades(
  data: Seth2ReturnData,
  cells: Seth2FemaleLockState['cells'],
): Seth2FemaleLockState['cells'] {
  return cells.map((cell) => {
    let mul = cell.mul;
    for (const round of data.list) {
      const upgrade = round.upgrade_mul_list.find(
        (candidate) =>
          Number(candidate.code) === cell.code &&
          candidate.mul === mul &&
          Number(candidate.mul_type ?? 0) === cell.mul_type,
      );
      if (upgrade) mul = upgrade.new_mul;
    }
    return { ...cell, mul };
  });
}

function femaleLockContribution(lock: Seth2FemaleLockState | null): number {
  return lock?.cells.reduce((total, cell) => total + cell.mul, 0) ?? 0;
}

function nextFemaleLockMultiplier(value: number): number {
  const index = SETH2_MULTIPLIER_VALUES.indexOf(value as (typeof SETH2_MULTIPLIER_VALUES)[number]);
  return index >= 0 && index < SETH2_MULTIPLIER_VALUES.length - 1
    ? SETH2_MULTIPLIER_VALUES[index + 1]!
    : value;
}

function femaleLockCellsAfterWinningCascades(
  cells: readonly Seth2FemaleLockState['cells'][number][],
  winningCascades: number,
): Seth2FemaleLockState['cells'] {
  return cells.map((cell) => {
    let mul = cell.mul;
    for (let index = 0; index < winningCascades; index += 1) {
      mul = nextFemaleLockMultiplier(mul);
    }
    return { ...cell, mul };
  });
}

function winningCascadeCount(data: Seth2ReturnData): number {
  return data.list.filter((round) => Number(round.score) > 0).length;
}

function addFemaleLockWinUpgrades(
  data: Seth2ReturnData,
  cells: readonly Seth2FemaleLockState['cells'][number][],
): void {
  const currentValues = new Map(cells.map((cell) => [Number(cell.code), cell.mul]));
  for (const round of data.list) {
    if (!(Number(round.score) > 0)) continue;
    for (const cell of cells) {
      const code = Number(cell.code);
      const before = currentValues.get(code) ?? cell.mul;
      const after = nextFemaleLockMultiplier(before);
      if (after === before) continue;
      round.upgrade_mul_list.push({
        type: 10,
        mul: before,
        new_mul: after,
        mul_type: cell.mul_type ?? 0,
        code,
      });
      currentValues.set(code, after);
    }
  }
}

export function normalizeFemaleLockAccounting(
  data: Seth2ReturnData,
  savedBankBefore: number,
  lockedMultiplierContribution: number,
): void {
  const generatedContribution = data.multiplierBankAdded;
  const collectedLockedContribution = data.score > 0 ? lockedMultiplierContribution : 0;
  data.multiplierBankBefore = savedBankBefore;
  data.multiplierBankAdded = generatedContribution + collectedLockedContribution;
  data.multiplierBankAfter = savedBankBefore + data.multiplierBankAdded;
}

function placeFemaleLockCells(data: Seth2ReturnData, cells: Seth2FemaleLockState['cells']): void {
  const board = data.list[0]?.start_data;
  if (!board || board.length !== 30) return;
  const targetCodes = new Set(cells.map((cell) => cell.code));
  for (const locked of cells) {
    const target = locked.code;
    const displaced = board[target];
    if (!displaced) continue;
    if (data.list[0]!.remove_type.includes(displaced.type) || displaced.type === 10) {
      const swapIndex = board.findIndex(
        (candidate, index) =>
          !targetCodes.has(index) &&
          candidate.type !== 10 &&
          !data.list[0]!.remove_type.includes(candidate.type),
      );
      if (swapIndex >= 0) {
        board[swapIndex] = displaced;
        moveSeth2AnimatedCellMetadata(data, target, swapIndex);
      }
    }
    board[target] = { ...locked };
  }
}

/**
 * Persistent woman-lock cells keep their original screen positions. When one
 * lands on a newly generated multiplier, that multiplier is moved to a safe
 * cell. Keep every animation pointer on the moved cell as well; otherwise the
 * man's split animation (or a rare-ball upgrade) reads the locked ball at the
 * old position and can wait on the wrong symbol node.
 */
function moveSeth2AnimatedCellMetadata(
  data: Seth2ReturnData,
  fromCode: number,
  toCode: number,
): void {
  const maleSource = data.type17_beishu;
  if (maleSource && Number(maleSource.code) === fromCode) {
    data.type17_beishu = { ...maleSource, code: toCode };
  }
  for (const round of data.list) {
    for (const upgrade of round.upgrade_mul_list) {
      if (Number(upgrade.code) === fromCode) upgrade.code = toCode;
    }
    const roundMaleSource = round.male_source;
    if (roundMaleSource && Number(roundMaleSource.code) === fromCode) {
      round.male_source = { ...roundMaleSource, code: toCode };
    }
  }
}

export function advanceSession(
  current: Seth2SessionState,
  input: {
    buying: boolean;
    featureIndex?: 0 | 1 | 2 | null;
    freeSpin: boolean;
    betAmount: Prisma.Decimal;
    triggeredFreeSpins: boolean;
    triggeredFeatureMode: Seth2FeatureMode;
    boughtFeatureMode: Seth2FeatureMode;
    extraSpins: number;
    multiplierBankAfter: number;
    femaleLock: Seth2FemaleLockState | null;
    roundPayout?: number;
  },
): Seth2SessionState {
  if (input.buying) {
    if (input.featureIndex === 2) return EMPTY_SESSION;
    return {
      freeSpinsRemaining: SETH2_FREE_SPINS,
      featureMode: input.boughtFeatureMode,
      betAmount: input.betAmount.toFixed(2),
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: input.roundPayout ?? 0,
    };
  }
  if (input.freeSpin) {
    const remaining = Math.min(
      SETH2_MAX_FREE_SPINS,
      Math.max(0, current.freeSpinsRemaining - 1 + input.extraSpins),
    );
    return {
      freeSpinsRemaining: remaining,
      featureMode: remaining > 0 ? current.featureMode : 'none',
      betAmount: remaining > 0 ? current.betAmount : '0.00',
      multiplierBank: remaining > 0 ? input.multiplierBankAfter : 0,
      femaleLock: remaining > 0 ? input.femaleLock : null,
      featureWinnings:
        remaining > 0 ? addPayoutValues(current.featureWinnings, input.roundPayout ?? 0) : 0,
    };
  }
  if (input.triggeredFreeSpins) {
    return {
      freeSpinsRemaining: SETH2_FREE_SPINS,
      featureMode: input.triggeredFeatureMode === 'awakening' ? 'awakening' : 'standard',
      betAmount: input.betAmount.toFixed(2),
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: input.roundPayout ?? 0,
    };
  }
  return EMPTY_SESSION;
}

function applyFeatureState(
  data: Seth2ReturnData | Seth2Outcome['returnData'],
  remaining: number,
  featureActive: boolean,
  featureMode: Seth2FeatureMode,
): void {
  data.is_sjc = featureActive ? 1 : 0;
  data.freeGameCount = remaining;
  data.featureMode = featureMode;
  data.gameModelType = featureMode === 'awakening' ? 1 : 0;
}

export function generateFeatureRun(input: {
  entryOutcome: Seth2Outcome;
  seeds: ActiveSeedBundle[];
  baseBet: number;
  buying: boolean;
  featureIndex: 0 | 1 | 2 | null;
  featureMode: Seth2FeatureMode;
  forcedTotalFactor?: number;
}): Seth2FeatureRun {
  const entryPayout = factorPayoutValue(input.baseBet, input.entryOutcome.payoutFactor);
  let session = advanceSession(EMPTY_SESSION, {
    buying: input.buying,
    featureIndex: input.featureIndex,
    freeSpin: false,
    betAmount: new Prisma.Decimal(input.baseBet),
    triggeredFreeSpins: !input.buying,
    triggeredFeatureMode: input.featureMode,
    boughtFeatureMode: input.featureMode,
    extraSpins: input.entryOutcome.returnData.addGameCiShu,
    multiplierBankAfter: 0,
    femaleLock: null,
    roundPayout: entryPayout,
  });
  let forcedFactors =
    input.forcedTotalFactor === undefined
      ? null
      : splitSeth2FeatureFactor(
          input.forcedTotalFactor - input.entryOutcome.payoutFactor,
          input.featureMode === 'awakening'
            ? 'awakening_free'
            : input.buying
              ? 'bought_standard_free'
              : 'standard_free',
          input.seeds[0]?.nonce ?? 0,
        );
  if (input.forcedTotalFactor !== undefined && !forcedFactors) {
    throw new ApiError('INTERNAL', '控制結果無法生成一致的免費遊戲動畫');
  }
  const controlledAwakening =
    forcedFactors !== null &&
    input.buying &&
    input.featureIndex === 1 &&
    input.featureMode === 'awakening';
  let controlledAwakeningOpening: Seth2Outcome | null = null;
  if (forcedFactors && controlledAwakening) {
    const openingSeed = input.seeds[0];
    if (!openingSeed) throw new ApiError('INTERNAL', '免費遊戲種子不足');
    controlledAwakeningOpening = seth2AwakeningSpinForFactorWithSkill(
      openingSeed.serverSeed,
      openingSeed.clientSeed,
      openingSeed.nonce,
      input.baseBet,
      2,
    );
    const hasFemaleLock = controlledAwakeningOpening.returnData.type18_start_mul_list.length > 0;
    const reserved = reserveSeth2AwakeningWindow(
      forcedFactors,
      openingSeed.nonce,
      hasFemaleLock ? 5 : 0,
    );
    if (!reserved) {
      throw new ApiError('INTERNAL', '覺醒之力控制結果低於角色符號的最低合法派彩');
    }
    forcedFactors = reserved;
  }

  const rounds: Seth2FeatureRound[] = [];
  let totalPayoutFactor = 0;
  let finalForcedWinIndex = -1;
  if (forcedFactors) {
    for (let index = forcedFactors.length - 1; index >= 0; index -= 1) {
      if (forcedFactors[index]! > 0) {
        finalForcedWinIndex = index;
        break;
      }
    }
  }
  while (session.freeSpinsRemaining > 0 && rounds.length < SETH2_MAX_FREE_SPINS) {
    const seed = input.seeds[rounds.length];
    if (!seed) throw new ApiError('INTERNAL', '免費遊戲種子不足');
    const mode: Seth2SpinMode =
      session.featureMode === 'awakening'
        ? 'awakening_free'
        : input.buying
          ? 'bought_standard_free'
          : 'standard_free';
    const lockedContribution = femaleLockContribution(session.femaleLock);
    const effectiveBank = session.multiplierBank + lockedContribution;
    const factor = forcedFactors?.[rounds.length];
    const buildOutcome = (multiplierBank: number): Seth2Outcome =>
      controlledAwakeningOpening && rounds.length === 0
        ? controlledAwakeningOpening
        : factor === undefined &&
            rounds.length === 0 &&
            input.buying &&
            input.featureIndex === 1 &&
            input.featureMode === 'awakening'
          ? seth2BoughtAwakeningGuaranteedSpin(
              seed.serverSeed,
              seed.clientSeed,
              seed.nonce,
              input.baseBet,
            )
          : factor === undefined
            ? seth2Spin(
                seed.serverSeed,
                seed.clientSeed,
                seed.nonce,
                input.baseBet,
                mode,
                multiplierBank,
                lockedContribution > 0,
              )
            : controlledAwakening &&
                session.femaleLock === null &&
                factor > 0 &&
                rounds.length > 0 &&
                rounds.length < finalForcedWinIndex
              ? seth2SpinForFactorWithoutMultiplier(
                  seed.serverSeed,
                  seed.clientSeed,
                  seed.nonce,
                  input.baseBet,
                  factor,
                  mode,
                  multiplierBank,
                )
              : seth2SpinForFactor(
                  seed.serverSeed,
                  seed.clientSeed,
                  seed.nonce,
                  input.baseBet,
                  factor,
                  mode,
                  multiplierBank,
                  lockedContribution > 0,
                  true,
                  false,
                );
    const buildSafeOutcome = (multiplierBank: number): Seth2Outcome => {
      const candidate = buildOutcome(multiplierBank);
      const triggersWoman = candidate.returnData.list.some((cascade) =>
        cascade.remove_type.includes(18),
      );
      const unsafeWomanTrigger =
        triggersWoman &&
        (session.femaleLock !== null ||
          candidate.returnData.type18_mul_count > session.freeSpinsRemaining);
      if (!unsafeWomanTrigger) return candidate;
      // One lock cannot safely replace another in v1.1.5, and a newly selected
      // duration must fit in the games that are still available. Re-render the
      // exact same payout without a woman lock (a man event may remain) so
      // settlement/RTP stays unchanged and the animation reaches its end.
      const safeOutcome = seth2SpinForFactor(
        seed.serverSeed,
        seed.clientSeed,
        seed.nonce,
        input.baseBet,
        candidate.payoutFactor,
        mode,
        multiplierBank,
        lockedContribution > 0,
        true,
        false,
        false,
      );
      if (safeOutcome.payoutFactor !== candidate.payoutFactor) {
        throw new ApiError('INTERNAL', '女性鎖球結果無法生成一致的安全動畫');
      }
      return safeOutcome;
    };
    let outcome = buildSafeOutcome(effectiveBank);
    if (session.femaleLock && outcome.returnData.score > 0) {
      // A rare ball selected by the woman advances once for every successful
      // elimination. Re-render with the upgraded locked contribution so the
      // visible multiplier, persisted state and authoritative payout agree.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const upgradedCells = femaleLockCellsAfterWinningCascades(
          session.femaleLock.cells,
          winningCascadeCount(outcome.returnData),
        );
        const upgradedContribution = upgradedCells.reduce((total, cell) => total + cell.mul, 0);
        if (upgradedContribution === lockedContribution) break;
        const upgradedOutcome = buildSafeOutcome(session.multiplierBank + upgradedContribution);
        const stableCascadeCount =
          winningCascadeCount(upgradedOutcome.returnData) ===
          winningCascadeCount(outcome.returnData);
        outcome = upgradedOutcome;
        if (stableCascadeCount) break;
      }
    }
    const femaleLock = applyFemaleLockState(outcome.returnData, session.femaleLock);
    const accountedLockedContribution = session.femaleLock
      ? applyPersistedMultiplierUpgrades(outcome.returnData, session.femaleLock.cells).reduce(
          (total, cell) => total + cell.mul,
          0,
        )
      : 0;
    normalizeFemaleLockAccounting(
      outcome.returnData,
      session.multiplierBank,
      accountedLockedContribution,
    );
    const featureWinningsBefore = session.featureWinnings;
    const sessionAfter = advanceSession(session, {
      buying: false,
      featureIndex: null,
      freeSpin: true,
      betAmount: new Prisma.Decimal(input.baseBet),
      triggeredFreeSpins: false,
      triggeredFeatureMode: input.featureMode,
      boughtFeatureMode: input.featureMode,
      extraSpins: outcome.returnData.addGameCiShu,
      multiplierBankAfter: outcome.returnData.multiplierBankAfter,
      femaleLock,
      roundPayout: factorPayoutValue(input.baseBet, outcome.payoutFactor),
    });
    applyFeatureState(
      outcome.returnData,
      sessionAfter.freeSpinsRemaining,
      false,
      session.featureMode,
    );
    rounds.push({
      returnData: outcome.returnData,
      sessionBefore: session,
      sessionAfter,
      payoutFactor: outcome.payoutFactor,
      featureWinningsBefore,
    });
    totalPayoutFactor += outcome.payoutFactor;
    session = sessionAfter;
  }
  if (session.freeSpinsRemaining > 0) {
    throw new ApiError('INVALID_ACTION', '免費遊戲局數超過安全上限');
  }
  return { rounds, totalPayoutFactor, finalSession: session };
}

export function reserveSeth2AwakeningWindow(
  factors: readonly number[],
  entropy = 0,
  femaleLockFollowUps = 5,
): number[] | null {
  const reservedFollowUps = femaleLockFollowUps > 0 ? 5 : 0;
  const firstAvailableSlot = reservedFollowUps + 1;
  if (factors.length < firstAvailableSlot) return null;
  const target = Number(factors.reduce((total, factor) => total + factor, 0).toFixed(4));
  if (target < 2) return null;
  const remainingParts = naturalFeatureFactorParts(
    Number((target - 2).toFixed(4)),
    'awakening_free',
    entropy,
    true,
    4,
  );
  if (!remainingParts || remainingParts.length > factors.length - firstAvailableSlot) return null;

  // The paid 2x skill opens the sequence while the saved multiplier bank is
  // still empty. Only a woman skill reserves five clean locked follow-ups;
  // a man's split completes in the opening game and the next result may pay.
  const result = Array.from({ length: factors.length }, () => 0);
  result[0] = 2;
  const orderedSlots = Array.from(
    { length: factors.length - firstAvailableSlot },
    (_, index) => index + firstAvailableSlot,
  );
  remainingParts.forEach((factor, index) => {
    result[orderedSlots[index]!] = factor;
  });
  return result;
}

export function splitSeth2FeatureFactor(
  totalFactor: number,
  mode: Seth2SpinMode,
  entropy = 0,
): number[] | null {
  const target = Number(totalFactor.toFixed(4));
  if (target < 0) return null;
  const parts = naturalFeatureFactorParts(target, mode, entropy);
  if (!parts) return null;
  if (parts.length > SETH2_FREE_SPINS) return null;
  const result = Array.from({ length: SETH2_FREE_SPINS }, () => 0);
  if (parts.length === 0) return result;
  const slots = new Set<number>();
  let cursor = Math.abs(Math.trunc(entropy)) % SETH2_FREE_SPINS;
  while (slots.size < parts.length) {
    slots.add(cursor);
    cursor = (cursor + 3 + slots.size) % SETH2_FREE_SPINS;
  }
  [...slots]
    .sort((left, right) => left - right)
    .forEach((slot, index) => {
      result[slot] = parts[index]!;
    });
  return result;
}

function naturalFeatureFactorParts(
  target: number,
  mode: Seth2SpinMode,
  entropy: number,
  unmultipliedPrefixes = false,
  finalMultiplierBank = 0,
): number[] | null {
  if (target === 0) return [];
  const baseSmallFactors = [3, 5, 8, 10, 4, 2.25, 2, 1.75, 1.5, 1.25, 1, 0.75, 0.5, 0.25].filter(
    (factor) =>
      isSeth2FactorRepresentable(factor, mode, 0, false) &&
      (!unmultipliedPrefixes || isSeth2UnmultipliedFactorRepresentable(factor)),
  );
  const normalizedEntropy = Math.abs(Math.trunc(entropy));
  const maximumParts = Math.min(9, Math.max(1, Math.floor(target / 10)));
  const minimumParts = maximumParts >= 5 ? 5 : Math.max(1, maximumParts - 2);
  const partCountRange = maximumParts - minimumParts + 1;
  const desiredParts = minimumParts + (normalizedEntropy % partCountRange);
  const rotation =
    baseSmallFactors.length > 0
      ? Math.floor(normalizedEntropy / partCountRange) % baseSmallFactors.length
      : 0;
  let smallFactors = [...baseSmallFactors.slice(rotation), ...baseSmallFactors.slice(0, rotation)];
  if (
    baseSmallFactors.length > 0 &&
    Math.floor(normalizedEntropy / (partCountRange * baseSmallFactors.length)) % 2 === 1
  ) {
    smallFactors = smallFactors.reverse();
  }

  for (let partCount = desiredParts; partCount >= 1; partCount -= 1) {
    const prefixCount = partCount - 1;
    const prefix: number[] = [];
    const findPrefix = (depth: number, sum: number): number[] | null => {
      if (depth === prefixCount) {
        const remainder = Number((target - sum).toFixed(4));
        return remainder > 0 &&
          isSeth2FactorRepresentable(remainder, mode, finalMultiplierBank, false)
          ? [...prefix, remainder]
          : null;
      }
      const orderedFactors = [
        ...smallFactors.slice(depth % smallFactors.length),
        ...smallFactors.slice(0, depth % smallFactors.length),
      ];
      for (const factor of orderedFactors) {
        if (sum + factor >= target) continue;
        prefix.push(factor);
        const result = findPrefix(depth + 1, Number((sum + factor).toFixed(4)));
        prefix.pop();
        if (result) return result;
      }
      return null;
    };
    const result = findPrefix(0, 0);
    if (result) return result;
  }
  return null;
}

function controlFactorCandidates(
  baseAmount: Prisma.Decimal,
  controlAmount: Prisma.Decimal,
  control: Pick<ControlOutcome, 'multiplier' | 'minMultiplier' | 'maxMultiplier'>,
): number[] {
  const values = new Set<number>();
  const addFactor = (factor: Prisma.Decimal | number) => {
    const normalized = Number(new Prisma.Decimal(factor).toDecimalPlaces(4).toFixed(4));
    if (Number.isFinite(normalized) && normalized >= 0 && normalized <= SETH2_MAX_WIN_MULTIPLIER) {
      values.add(normalized);
    }
  };
  const addQuarterNeighborhood = (factor: Prisma.Decimal | number) => {
    const center = new Prisma.Decimal(factor);
    addFactor(center.minus('0.25'));
    addFactor(center);
    addFactor(center.plus('0.25'));
  };
  for (const factor of CONTROL_FACTORS) addQuarterNeighborhood(factor);
  const addMultiplier = (multiplier: Prisma.Decimal | undefined) => {
    if (!multiplier) return;
    const factor = multiplier.mul(controlAmount).div(baseAmount);
    addFactor(factor);
    if (multiplier.greaterThan(0)) {
      // Controlled wins used to expose the exact same total on every round
      // (notably 2,020x for a 2,000x buy controlled to 1.01x). Build a narrow
      // family around the requested target; the game-specific selector still
      // rejects anything outside every min/max/payout bound.
      for (const scale of [1.025, 1.05, 1.075, 1.1, 1.125, 1.15, 1.2, 1.25]) {
        addQuarterNeighborhood(factor.mul(scale).mul(4).round().div(4));
      }
    }
  };
  const breakEvenFactor = controlAmount.div(baseAmount);
  // A LOSS means net payout <= the accounting stake, not necessarily a zero
  // return. These anchors provide visibly different losing amounts while the
  // existing control bounds remain authoritative.
  for (const ratio of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
    addQuarterNeighborhood(breakEvenFactor.mul(ratio).mul(4).round().div(4));
  }
  addMultiplier(control.multiplier);
  addMultiplier(control.minMultiplier);
  addMultiplier(control.maxMultiplier);
  return [...values];
}

export function chooseControlledSethFeatureFactor(
  baseAmount: Prisma.Decimal,
  controlAmount: Prisma.Decimal,
  control: Pick<
    ControlOutcome,
    'won' | 'multiplier' | 'minMultiplier' | 'maxMultiplier' | 'maxPayout'
  >,
  mode: Seth2SpinMode,
  entropy?: number,
): number | null {
  const candidates = controlFactorCandidates(baseAmount, controlAmount, control).filter(
    (factor) => {
      if (factor < 3) return false;
      const parts = splitSeth2FeatureFactor(factor - 3, mode);
      if (!parts) return false;
      if (mode === 'awakening_free' && !reserveSeth2AwakeningWindow(parts)) return false;
      const accountingMultiplier = baseAmount
        .mul(factor)
        .div(controlAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      if (control.won) {
        return (
          accountingMultiplier.greaterThan(1) &&
          multiplierMatchesControlBounds(accountingMultiplier, controlAmount, control)
        );
      }
      return accountingMultiplier.lessThanOrEqualTo(1);
    },
  );
  if (candidates.length === 0) return null;
  const target = Number(control.multiplier.mul(controlAmount).div(baseAmount).toFixed(4));
  return selectControlledSethFactor(
    candidates,
    target,
    control.won,
    Number(controlAmount.div(baseAmount).toFixed(4)),
    entropy,
  );
}

function selectControlledSethFactor(
  candidates: number[],
  target: number,
  won: boolean,
  breakEvenFactor: number,
  entropy?: number,
): number {
  const nearest = (expected: number) =>
    candidates.reduce((best, factor) =>
      Math.abs(factor - expected) < Math.abs(best - expected) ? factor : best,
    );
  if (entropy === undefined || candidates.length === 1) return nearest(target);

  const pool = won
    ? candidates
        .filter((factor) => factor >= target && factor <= Math.max(target + 0.75, target * 1.25))
        .sort((left, right) => left - right)
    : [0, 0.1, 0.25, 0.5, 0.75, 1]
        .flatMap((ratio) =>
          [-0.25, 0, 0.25].map((offset) => nearest(Math.max(0, breakEvenFactor * ratio + offset))),
        )
        .filter((factor) => factor <= breakEvenFactor)
        .filter((factor, index, factors) => factors.indexOf(factor) === index)
        .sort((left, right) => left - right);
  if (pool.length < 2) return nearest(target);
  return pool[Math.abs(Math.trunc(entropy)) % pool.length]!;
}

function featureRunGameStates(run: Seth2FeatureRun, spinId: string, totalStake: number) {
  return run.rounds.flatMap((round) =>
    seth2SourceGameStates(round.returnData, {
      action: 'freeSpin',
      spinId,
      totalStake,
      freeGameCount: round.sessionAfter.freeSpinsRemaining,
      featureWinningsBefore: round.featureWinningsBefore,
      isGoldenFg:
        round.sessionBefore.featureMode === 'awakening' ||
        round.returnData.featureMode === 'awakening',
    }),
  );
}

function factorPayoutValue(baseBet: number, factor: number): number {
  return Number(
    new Prisma.Decimal(String(baseBet))
      .mul(new Prisma.Decimal(String(factor)))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
      .toFixed(2),
  );
}

function addPayoutValues(left: number, right: number): number {
  return Number(
    new Prisma.Decimal(String(left))
      .plus(new Prisma.Decimal(String(right)))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
      .toFixed(2),
  );
}

function payoutForFactor(baseAmount: Prisma.Decimal, factor: number): Prisma.Decimal {
  return baseAmount.mul(new Prisma.Decimal(factor)).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

const SETH2_JACKPOT_SEEDS = {
  grand: new Prisma.Decimal(200_000),
  major: new Prisma.Decimal(70_000),
  minor: new Prisma.Decimal(13_000),
  mini: new Prisma.Decimal(1_600),
} as const;

type Seth2JackpotPoolValue = {
  grand: Prisma.Decimal;
  major: Prisma.Decimal;
  minor: Prisma.Decimal;
  mini: Prisma.Decimal;
};

function jackpotPoolPayload(pool: Seth2JackpotPoolValue): Record<string, number> {
  return {
    'jp-mini': Number(pool.mini.toFixed(2)),
    'jp-minor': Number(pool.minor.toFixed(2)),
    'jp-major': Number(pool.major.toFixed(2)),
    'jp-grand': Number(pool.grand.toFixed(2)),
  };
}

function jackpotPoolAfterSettlement(
  pool: Seth2JackpotPoolValue,
  tier: number,
  awarded: boolean,
): Seth2JackpotPoolValue {
  if (!awarded) return pool;
  const key = jackpotPoolKey(tier);
  return key ? { ...pool, [key]: SETH2_JACKPOT_SEEDS[key] } : pool;
}

async function contributeSeth2Jackpot(
  tx: Prisma.TransactionClient,
  debitAmount: Prisma.Decimal,
): Promise<Seth2JackpotPoolValue> {
  const contribution = debitAmount.mul('0.01').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const grand = contribution.mul('0.4').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const major = contribution.mul('0.3').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const minor = contribution.mul('0.2').toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const mini = contribution.minus(grand).minus(major).minus(minor);
  return tx.seth2JackpotPool.upsert({
    where: { gameId: GAME_ID },
    create: {
      gameId: GAME_ID,
      grand: SETH2_JACKPOT_SEEDS.grand.add(grand),
      major: SETH2_JACKPOT_SEEDS.major.add(major),
      minor: SETH2_JACKPOT_SEEDS.minor.add(minor),
      mini: SETH2_JACKPOT_SEEDS.mini.add(mini),
    },
    update: {
      grand: { increment: grand },
      major: { increment: major },
      minor: { increment: minor },
      mini: { increment: mini },
    },
  });
}

function jackpotPoolKey(tier: number): keyof Seth2JackpotPoolValue | null {
  if (tier === 11) return 'grand';
  if (tier === 12) return 'major';
  if (tier === 13) return 'minor';
  if (tier === 14) return 'mini';
  return null;
}

export function applySeth2JackpotAward(
  outcome: Seth2Outcome,
  baseAmount: Prisma.Decimal,
  pool: Seth2JackpotPoolValue,
): void {
  const key = jackpotPoolKey(outcome.returnData.JPtype);
  if (!key) return;
  const award = pool[key].toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const factor = Number(award.div(baseAmount).toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN));
  outcome.payoutFactor = factor;
  outcome.returnData.JPGold = Number(award.toFixed(2));
  outcome.returnData.total_gold = Number(award.toFixed(2));
  const finalRound = outcome.returnData.list.at(-1);
  if (finalRound) finalRound.total_gold = Number(award.toFixed(2));
}

async function resetSeth2Jackpot(tx: Prisma.TransactionClient, tier: number): Promise<void> {
  const key = jackpotPoolKey(tier);
  if (!key) return;
  await tx.seth2JackpotPool.update({
    where: { gameId: GAME_ID },
    data: { [key]: SETH2_JACKPOT_SEEDS[key] },
  });
}

export function chooseControlledSethFactor(
  baseAmount: Prisma.Decimal,
  controlAmount: Prisma.Decimal,
  control: Pick<
    ControlOutcome,
    'won' | 'multiplier' | 'minMultiplier' | 'maxMultiplier' | 'maxPayout'
  >,
  mode: Seth2SpinMode = 'base',
  multiplierBank = 0,
  hasPersistentMultiplier = false,
  entropy?: number,
): number | null {
  const candidates = controlFactorCandidates(baseAmount, controlAmount, control).filter(
    (factor) => {
      if (!isSeth2FactorRepresentable(factor, mode, multiplierBank, hasPersistentMultiplier)) {
        return false;
      }
      const accountingMultiplier = baseAmount
        .mul(factor)
        .div(controlAmount)
        .toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN);
      if (control.won) {
        return (
          accountingMultiplier.greaterThan(1) &&
          multiplierMatchesControlBounds(accountingMultiplier, controlAmount, control)
        );
      }
      return accountingMultiplier.lessThanOrEqualTo(1);
    },
  );
  if (candidates.length === 0) return null;
  const targetFactor = Number(control.multiplier.mul(controlAmount).div(baseAmount).toFixed(4));
  return selectControlledSethFactor(
    candidates,
    targetFactor,
    control.won,
    Number(controlAmount.div(baseAmount).toFixed(4)),
    entropy,
  );
}

function sourceFeatureIndex(value: unknown): 0 | 1 | 2 {
  const featureIndex = Number(value);
  if (featureIndex !== 0 && featureIndex !== 1 && featureIndex !== 2) {
    throw new ApiError('INVALID_ACTION', '無效的購買功能');
  }
  return featureIndex;
}

function sourceSpinId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError('INVALID_ACTION', '無效的開獎編號');
  }
  return value;
}

function sourceOperationId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128) {
    throw new ApiError('INVALID_ACTION', '缺少有效的 operationId');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ApiError('INVALID_ACTION', '無效的 operationId');
  }
  return value;
}

function sourceTotalStake(data: Record<string, unknown>): number {
  const stakeValue = Number(data.stakeValue ?? 1);
  const ratioValue = Number(data.ratioValue ?? 0.1);
  const totalStake = Number((stakeValue * ratioValue * 20).toFixed(2));
  return requireBet(totalStake);
}

function sourceMachineId(data: unknown): number {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 1;
  const value = data as Record<string, unknown>;
  const nested = value.table;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return sourceMachineId(nested);
  }
  const candidate = Number(value.machineId ?? value.roomId ?? value.number ?? 1);
  return requireMachineId(candidate);
}

function sourceBalancePlatform(balance: number, jackpotPools?: Record<string, number>) {
  return {
    player: { balance: { currency: 'POINT', amount: balance, gemAmount: 0, betAmount: 0 } },
    ...(jackpotPools ? { jackpotPools } : {}),
  };
}

function readJackpotPools(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const keys = ['jp-mini', 'jp-minor', 'jp-major', 'jp-grand'] as const;
  const result: Record<string, number> = {};
  for (const key of keys) {
    const amount = Number(source[key]);
    if (!Number.isFinite(amount) || amount < 0) return undefined;
    result[key] = amount;
  }
  return result;
}

function sourceTableLock(machineId = 0) {
  return { roomId: machineId, number: machineId, time: 0, resetDef: 0, expiredDef: 0 };
}

function jsonObject(value: Prisma.JsonValue | undefined): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function mergeSeth2PlayerSettings(
  current: Record<string, unknown> | null,
  update: unknown,
): Record<string, unknown> {
  const existing = current ?? {};
  if (!update || typeof update !== 'object' || Array.isArray(update)) return { ...existing };
  const patch = update as Record<string, unknown>;
  if (patch.type === 'game') {
    const gameData = jsonObject(patch.data as Prisma.JsonValue);
    const advanced = jsonObject(existing.advancedSettings as Prisma.JsonValue) ?? {};
    const sounds = jsonObject(advanced.sounds as Prisma.JsonValue) ?? {};
    const autoPlay = jsonObject(existing.autoPlay as Prisma.JsonValue) ?? {};
    const hasAdvancedPatch =
      gameData?.turbo !== undefined ||
      gameData?.notify !== undefined ||
      gameData?.backgroundVolume !== undefined ||
      gameData?.effectVolume !== undefined;
    return {
      ...existing,
      ...(gameData?.stakeIndex === undefined ? {} : { stakeIndex: Number(gameData.stakeIndex) }),
      ...(gameData?.ratioIndex === undefined ? {} : { ratioIndex: Number(gameData.ratioIndex) }),
      ...(gameData?.stopOnJackpot === undefined
        ? {}
        : { autoPlay: { ...autoPlay, stopOnJackpot: Boolean(gameData.stopOnJackpot) } }),
      ...(hasAdvancedPatch
        ? {
            advancedSettings: {
              ...advanced,
              ...(gameData?.turbo === undefined ? {} : { turbo: Boolean(gameData.turbo) }),
              ...(gameData?.notify === undefined ? {} : { notify: Boolean(gameData.notify) }),
              ...(gameData?.backgroundVolume === undefined && gameData?.effectVolume === undefined
                ? {}
                : {
                    sounds: {
                      ...sounds,
                      ...(gameData.backgroundVolume === undefined
                        ? {}
                        : { backgroundVolume: Number(gameData.backgroundVolume) }),
                      ...(gameData.effectVolume === undefined
                        ? {}
                        : { effectVolume: Number(gameData.effectVolume) }),
                    },
                  }),
            },
          }
        : {}),
    };
  }
  const advanced = jsonObject(existing.advancedSettings as Prisma.JsonValue) ?? {};
  const advancedPatch = jsonObject(patch.advancedSettings as Prisma.JsonValue);
  const sounds = jsonObject(advanced.sounds as Prisma.JsonValue) ?? {};
  const soundsPatch = jsonObject(advancedPatch?.sounds as Prisma.JsonValue);
  return {
    ...existing,
    ...patch,
    ...(advancedPatch
      ? {
          advancedSettings: {
            ...advanced,
            ...advancedPatch,
            ...(soundsPatch ? { sounds: { ...sounds, ...soundsPatch } } : {}),
          },
        }
      : {}),
  };
}

function readStoredGameStateArray(value: Prisma.JsonValue): Array<Record<string, unknown>> | null {
  if (!Array.isArray(value)) return null;
  const states: Array<Record<string, unknown>> = [];
  for (const state of value) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    const source = state as Record<string, unknown>;
    if (!Array.isArray(source.view) || typeof source.spinId !== 'string') return null;
    states.push({ ...source });
  }
  return states;
}

function readStoredGameStates(
  entryValue: Prisma.JsonValue,
  featureValue: Prisma.JsonValue,
): Array<Record<string, unknown>> | null {
  const entry = readStoredGameStateArray(entryValue);
  const feature = readStoredGameStateArray(featureValue);
  // Eternal Rise is one super-main sequence stored entirely in entry states;
  // the two 15-game features append their rounds in feature states.
  if (!entry || !feature || entry.length === 0) return null;
  const states = [...entry, ...feature];
  states.forEach((state, currentView) => {
    state.currentView = currentView;
    state.totalViews = states.length;
    if (currentView > 0) state.startFreeGame = false;
  });
  return states;
}

function resumeStoredGameStates(
  states: Array<Record<string, unknown>>,
  completedViews: number,
): {
  gameStates: Array<Record<string, unknown>>;
  resumeCursor: number;
  totalViews: number;
} {
  const totalViews = states.length;
  const requestedCursor = Number.isInteger(completedViews) ? completedViews : 0;
  // The last view must be replayed when it finished locally but closeSpin did
  // not reach the server. That gives the source client another deterministic
  // chance to send the deferred settlement request.
  const nextCursor = Math.max(0, Math.min(requestedCursor, totalViews - 1));
  // Source collection views depend on the preceding win view (`preSpinData`).
  // Replaying one completed view reconstructs that transient client context
  // while still skipping the rest of a long feature sequence.
  const resumeCursor = nextCursor > 0 ? nextCursor - 1 : 0;
  const gameStates = states.slice(resumeCursor).map((state, currentView, remaining) => ({
    ...state,
    currentView,
    totalViews: remaining.length,
    startFreeGame: currentView === 0 ? state.startFreeGame : false,
  }));
  return { gameStates, resumeCursor, totalViews };
}

function readInterruptedSettlement(
  spinId: string,
  resultData: Prisma.JsonValue | undefined,
  currentBalance: number,
): Seth2Settlement | null {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) return null;
  const stored = resultData as Record<string, unknown>;
  if (stored.buying === true) return null;
  const requestedBet = Number(stored.baseAmount);
  const machineId = Number(stored.machineId);
  const atomicFeature = stored.atomicFeature === true;
  if (!ALLOWED_BET_SET.has(requestedBet) || !Number.isInteger(machineId)) return null;
  const settlement = readStoredSettlement(spinId, resultData, {
    requestedBet,
    machineId,
    buying: false,
    featureIndex: null,
    atomicFeature,
  });
  return settlement ? { ...settlement, balance: currentBalance } : null;
}

function sourceMachineTables(
  machines: ReturnType<typeof machineList>,
  userId: string,
  selectedMachineId: number,
  timestamp = Date.now(),
) {
  return machines.map((machine) => {
    const detail = sourceMachineDetail(machine, timestamp);
    const bet = detail.todayBet;
    const win = detail.todayWin;
    const selected = machine.id === selectedMachineId;
    const simulated = !selected && machineHasSimulatedPlayer(machine.id, timestamp);
    const occupied = selected || simulated;
    return {
      roomId: machine.id,
      number: machine.id,
      bet,
      win,
      today: { bet, win },
      status: occupied ? 'Full' : 'Empty',
      user: selected
        ? { userId }
        : simulated
          ? { userId: `sim:seth2:${machine.id}`, simulated: true }
          : null,
    };
  });
}

function sourceMachineDetail(machine: ReturnType<typeof machineInfo>, timestamp = Date.now()) {
  // These values are explicitly presented by the source UI as simulated
  // reference statistics. They move in small deterministic steps so the list
  // and detail panel stay coherent without pretending to be live player bets.
  const dayBucket = Math.floor(timestamp / MACHINE_REFERENCE_DAY_MS);
  const tickInDay = Math.floor(
    (timestamp - dayBucket * MACHINE_REFERENCE_DAY_MS) / MACHINE_REFERENCE_TICK_MS,
  );
  const seed = (machine.id * 8_191 + dayBucket * 131) % 100_003;
  const openingBetCents = 100_000 + (seed % 900_000);
  const incrementCents = 25 + (seed % 176);
  const referenceTodayBet = (openingBetCents + tickInDay * incrementCents) / 100;
  const referenceDayBet = referenceTodayBet + 150_000 + ((seed * 37) % 650_000);
  const todayBet = Number(referenceTodayBet.toFixed(2));
  const todayWin = Number((todayBet * (Number(machine.day_rate) / 100)).toFixed(2));
  const dayBet = Number(referenceDayBet.toFixed(2));
  const dayWin = Number((dayBet * (Number(machine.day_rate_30) / 100)).toFixed(2));
  const currentCycle = 24 + (seed % 73);
  const mgCounts = [
    1 + ((tickInDay + seed) % currentCycle),
    6 + ((seed * 17 + dayBucket) % 91),
    8 + ((seed * 29 + dayBucket * 3) % 103),
  ];
  return {
    dayWin,
    dayBet,
    hourWin: todayWin,
    hourBet: todayBet,
    todayBet,
    todayWin,
    mgCounts,
  };
}
