import { PrismaClient, Prisma } from '@prisma/client';
import {
  kenoDraw,
  kenoEvaluate,
  kenoMultiplier,
  KENO_POOL_SIZE,
  KENO_DRAW_COUNT,
} from '@bg/provably-fair';
import { GameId, type KenoBetResult } from '@bg/shared';
import {
  SeedHelper,
  lockUserAndCheckFunds,
  debitAndRecord,
  creditAndRecord,
  runLockedTransaction,
} from '../_common/BaseGameService.js';
import {
  applyControls,
  finalizeControls,
  multiplierMatchesControlBounds,
  type ControlOutcome,
} from '../_common/controls.js';
import { pickWeightedRandom, selectControlledLossBand } from '../_common/resultSelection.js';
import type { KenoBetInput } from './keno.schema.js';

export class KenoService {
  constructor(private readonly prisma: PrismaClient) {}

  async bet(userId: string, input: KenoBetInput): Promise<KenoBetResult> {
    const amount = new Prisma.Decimal(input.amount);
    const unique = Array.from(new Set(input.selected));

    return runLockedTransaction(this.prisma, async (tx) => {
      await lockUserAndCheckFunds(tx, userId, amount, GameId.KENO);
      const seed = await new SeedHelper(tx).getActiveBundle(userId, 'keno', input.clientSeed);

      const drawn = kenoDraw(seed.serverSeed, seed.clientSeed, seed.nonce);
      const { hits } = kenoEvaluate(drawn, unique);
      const multiplier = kenoMultiplier(input.risk, unique.length, hits.length);
      const multiplierD = new Prisma.Decimal(multiplier.toFixed(4));
      const payout = amount.mul(multiplierD).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      const controlled = await applyControls(tx, userId, GameId.KENO, {
        won: payout.greaterThan(amount),
        amount,
        multiplier: multiplierD,
        payout,
      });

      let finalDrawn = drawn;
      let finalHits = hits;
      let finalMultiplier = multiplierD;
      let finalPayout = payout;
      if (controlled.controlled) {
        const hitCount = chooseKenoHitCount(
          input.risk,
          unique.length,
          controlled.won,
          amount,
          controlled,
        );
        finalDrawn = drawWithHitCount(unique, hitCount, drawn);
        finalHits = kenoEvaluate(finalDrawn, unique).hits;
        finalMultiplier = new Prisma.Decimal(
          kenoMultiplier(input.risk, unique.length, finalHits.length).toFixed(4),
        );
        finalPayout = amount.mul(finalMultiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      }
      const profit = finalPayout.minus(amount);

      const originalResult = { drawn, selected: unique, hits, risk: input.risk };
      const finalResult = {
        drawn: finalDrawn,
        selected: unique,
        hits: finalHits,
        risk: input.risk,
        controlled: controlled.controlled,
        flipReason: controlled.flipReason ?? null,
        raw: controlled.controlled ? originalResult : null,
      };

      const bet = await tx.bet.create({
        data: {
          userId,
          gameId: GameId.KENO,
          amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
          profit,
          nonce: seed.nonce,
          clientSeedUsed: seed.clientSeed,
          serverSeedId: seed.serverSeedId,
          resultData: finalResult,
        },
      });
      await debitAndRecord(tx, userId, amount, bet.id);
      const newBalance = finalPayout.greaterThan(0)
        ? await creditAndRecord(tx, userId, finalPayout, bet.id, 'BET_WIN')
        : (await tx.user.findUniqueOrThrow({ where: { id: userId } })).balance;
      await finalizeControls(
        tx,
        userId,
        GameId.KENO,
        { won: payout.greaterThan(amount), amount, multiplier: multiplierD, payout },
        {
          won: finalPayout.greaterThan(amount),
          amount,
          multiplier: finalMultiplier,
          payout: finalPayout,
        },
        controlled,
        bet.id,
        originalResult,
        finalResult,
      );

      return {
        betId: bet.id,
        drawn: finalDrawn,
        selected: unique,
        hits: finalHits,
        hitCount: finalHits.length,
        risk: input.risk,
        multiplier: Number(finalMultiplier.toFixed(4)),
        amount: amount.toFixed(2),
        payout: finalPayout.toFixed(2),
        profit: profit.toFixed(2),
        newBalance: newBalance.toFixed(2),
        nonce: seed.nonce,
        serverSeedHash: seed.serverSeedHash,
        clientSeed: seed.clientSeed,
      };
    });
  }
}

function chooseKenoHitCount(
  risk: KenoBetInput['risk'],
  pickCount: number,
  wantWin: boolean,
  amount: Prisma.Decimal,
  controlled: Pick<ControlOutcome, 'multiplier' | 'minMultiplier' | 'maxMultiplier' | 'maxPayout'>,
): number {
  const candidates = Array.from({ length: pickCount + 1 }, (_, hits) => ({
    hits,
    multiplier: kenoMultiplier(risk, pickCount, hits),
  }));

  const boundedWins = candidates.filter(
    (x) => x.multiplier > 1 && multiplierMatchesControlBounds(x.multiplier, amount, controlled),
  );
  if (wantWin && boundedWins.length > 0) {
    const targetMultiplier = Number(controlled.multiplier ?? controlled.minMultiplier ?? 2);
    const picked = pickWeightedRandom(boundedWins, (x) =>
      controlTargetWeight(x.multiplier, targetMultiplier),
    );
    return picked?.hits ?? boundedWins[0]?.hits ?? 0;
  }

  // A requested win can be impossible under a payout cap. In that case, use
  // the same natural loss distribution instead of hard-coding zero hits.
  const losingCandidates = candidates.filter((x) => x.multiplier < 1);
  const lossBand = selectControlledLossBand(losingCandidates);
  const picked = pickWeightedRandom(lossBand, (x) => controlledLossWeight(x.multiplier));
  return picked?.hits ?? losingCandidates[0]?.hits ?? 0;
}

function controlTargetWeight(multiplier: number, targetMultiplier: number): number {
  const distance = Math.abs(multiplier - targetMultiplier);
  return 1 / (1 + distance * 3);
}

function controlledLossWeight(multiplier: number): number {
  if (multiplier >= 0.75 && multiplier < 1) return 2.4;
  if (multiplier >= 0.5) return 1.7;
  if (multiplier > 0) return 1.2;
  return 1;
}

function drawWithHitCount(
  selected: number[],
  hitCount: number,
  naturalDrawn: number[] = [],
): number[] {
  const normalizedSelected = uniqueValidKenoNumbers(selected);
  const desiredHits = Math.max(0, Math.min(hitCount, normalizedSelected.length, KENO_DRAW_COUNT));
  const selectedSet = new Set(normalizedSelected);
  const normalizedNaturalDrawn = uniqueValidKenoNumbers(naturalDrawn);
  const naturalHits = normalizedNaturalDrawn.filter((n) => selectedSet.has(n));
  const hitSeed = hashKenoShapeSeed('hit', normalizedSelected, naturalDrawn, desiredHits);
  const extraHits = seededShuffle(
    normalizedSelected.filter((n) => !naturalHits.includes(n)),
    hitSeed,
  );
  const hits = [...naturalHits, ...extraHits].slice(0, desiredHits);
  const missCount = KENO_DRAW_COUNT - hits.length;
  const misses = chooseNaturalKenoMisses(
    normalizedSelected,
    hits,
    normalizedNaturalDrawn,
    missCount,
  );

  return [...hits, ...misses].sort((a, b) => a - b);
}

function chooseNaturalKenoMisses(
  selected: number[],
  hits: number[],
  naturalDrawn: number[],
  missCount: number,
): number[] {
  if (missCount <= 0) return [];
  const selectedSet = new Set(selected);
  const naturalMisses = naturalDrawn.filter((n) => !selectedSet.has(n));
  const remainingMissPool = Array.from({ length: KENO_POOL_SIZE }, (_, index) => index + 1).filter(
    (n) => !selectedSet.has(n) && !naturalMisses.includes(n),
  );
  const baseMissPool = [...naturalMisses, ...remainingMissPool];
  let best: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < 48; attempt += 1) {
    const seed = hashKenoShapeSeed(`miss:${attempt}`, selected, naturalDrawn, hits.length);
    const candidate = seededShuffle(baseMissPool, seed).slice(0, missCount);
    const draw = [...hits, ...candidate].sort((a, b) => a - b);
    const score = scoreKenoDrawShape(draw, hits);
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      if (score <= 1) break;
    }
  }

  return (best ?? baseMissPool.slice(0, missCount)).slice(0, missCount);
}

function scoreKenoDrawShape(drawn: number[], hits: number[]): number {
  const sorted = [...drawn].sort((a, b) => a - b);
  const hitSet = new Set(hits);
  let longestRun = 1;
  let currentRun = 1;
  let adjacentPairs = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i] === sorted[i - 1]! + 1) {
      currentRun += 1;
      adjacentPairs += 1;
      longestRun = Math.max(longestRun, currentRun);
    } else {
      currentRun = 1;
    }
  }

  const firstNonPrefix = sorted.findIndex((number, index) => number !== index + 1);
  const lowPrefixRun = firstNonPrefix === -1 ? sorted.length : firstNonPrefix;
  const hitIndexes = sorted
    .map((number, index) => (hitSet.has(number) ? index : -1))
    .filter((index) => index >= 0);
  const hitOnLastOnly =
    hitIndexes.length > 0 && hitIndexes.every((index) => index === sorted.length - 1);
  const hitOnEdgeOnly =
    hitIndexes.length > 0 &&
    hitIndexes.every((index) => index === 0 || index === sorted.length - 1);
  const minHit = Math.min(...hits);
  const maxHit = Math.max(...hits);
  const hasHit = hits.length > 0 && Number.isFinite(minHit) && Number.isFinite(maxHit);
  const hasMissBelowHit = hasHit && sorted.some((n) => n < minHit && !hitSet.has(n));
  const hasMissAboveHit = hasHit && sorted.some((n) => n > maxHit && !hitSet.has(n));
  const oneSidedHitContext = hasHit && (!hasMissBelowHit || !hasMissAboveHit);

  return (
    Math.max(0, longestRun - 3) * 18 +
    Math.max(0, lowPrefixRun - 2) * 22 +
    adjacentPairs * 2 +
    (hitOnLastOnly ? 28 : 0) +
    (hitOnEdgeOnly ? 8 : 0) +
    (oneSidedHitContext ? 10 : 0)
  );
}

function uniqueValidKenoNumbers(numbers: number[]): number[] {
  return Array.from(
    new Set(numbers.filter((n) => Number.isInteger(n) && n >= 1 && n <= KENO_POOL_SIZE)),
  );
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const next = [...items];
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = next[i]!;
    next[i] = next[j]!;
    next[j] = a;
  }
  return next;
}

function hashKenoShapeSeed(
  label: string,
  selected: number[],
  drawn: number[],
  hitCount: number,
): number {
  const source = `${label}|${hitCount}|${selected.join(',')}|${drawn.join(',')}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export const __kenoServiceTestHooks = {
  chooseKenoHitCount,
  drawWithHitCount,
  scoreKenoDrawShape,
};
