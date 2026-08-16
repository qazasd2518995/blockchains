import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { H5_FISH_GAMES, H5_SLOT_GAMES } from '@bg/shared';
import { isHotlineCascadeGame } from '@bg/provably-fair';
import type { ControlOutcome } from '../_common/controls.js';
import { __hotlineServiceTestHooks } from '../hotline/hotline.service.js';

const adapterPath = fileURLToPath(
  new URL('../../../../../web/public/games/h5-slot-collection/yachiyo-adapter.js', import.meta.url),
);
const adapterSource = fs.readFileSync(adapterPath, 'utf8');

type AdapterHarness = {
  shape: { family: string; reels: number; rows: number };
  buildLotteryResponses: (result: Record<string, unknown>) => Array<{
    response: { ResultCode: number; ResultData: Record<string, unknown> };
  }>;
  createFakeSocket: () => {
    emit: (event: string, payload: string) => void;
    on: (event: string, handler: (payload: Record<string, unknown>) => void) => void;
  };
};

describe('imported H5 control presentation matrix', () => {
  it('keeps settlement, animation payout, and winning markers aligned for every slot', () => {
    const stake = new Prisma.Decimal(100);
    const profiles = allControlProfiles(stake);

    H5_SLOT_GAMES.forEach((game, gameIndex) => {
      const adapter = loadAdapter(game.code);
      profiles.forEach((profile, profileIndex) => {
        const variant = gameIndex * 211 + profileIndex * 31;
        const result = controlledResult(game.gameId, stake, profile, variant);
        const responses = adapter.buildLotteryResponses(result);
        const context = `${game.gameId}/${profile.flipReason}/${profile.won ? 'win' : 'loss'}`;

        expect(Number(result.payout) > Number(result.stakeAmount), `${context}/outcome`).toBe(
          profile.won,
        );
        expect(responses.length, context).toBeGreaterThan(0);
        expect(
          responses.every((queued) => queued.response.ResultCode === 1),
          context,
        ).toBe(true);
        const animatedPayout = roundMoney(
          responses.reduce(
            (sum, queued) => sum + Number(queued.response.ResultData.winscore ?? 0),
            0,
          ),
        );
        expect(animatedPayout, `${context}/animated-payout`).toBe(Number(result.payout));
        const finalResponse = responses.at(-1)!.response.ResultData;
        const displayedFinalBalance = roundMoney(
          Number(finalResponse.userscore) +
            (game.code === '188' ? Number(finalResponse.winscore ?? 0) : 0),
        );
        expect(displayedFinalBalance, `${context}/final-balance`).toBe(Number(result.newBalance));

        for (const queued of responses) {
          const data = queued.response.ResultData;
          const payout = Number(data.winscore ?? 0);
          if (payout > 0) {
            expect(
              hasVisibleWinningMarker(data, adapter.shape.family),
              `${context}/win-marker`,
            ).toBe(true);
          }
        }
      });
    });
  });

  it('keeps controlled feature purchases entirely inside their visible free-game sequence', () => {
    const baseAmount = new Prisma.Decimal(10);
    const games = H5_SLOT_GAMES.filter((game) => game.code === '278' || game.code === '321');

    games.forEach((game, gameIndex) => {
      const stake = baseAmount.mul(game.code === '321' ? 75 : 50);
      const adapter = loadAdapter(game.code);
      allControlProfiles(stake).forEach((profile, profileIndex) => {
        const variant = 9000 + gameIndex * 101 + profileIndex * 17;
        const result = controlledResult(game.gameId, stake, profile, variant, baseAmount, true);
        const responses = adapter.buildLotteryResponses(result);
        const context = `${game.gameId}/buy/${profile.flipReason}/${profile.won ? 'win' : 'loss'}`;
        const first = responses[0]!.response.ResultData;
        const animatedPayout = roundMoney(
          responses.reduce(
            (sum, queued) => sum + Number(queued.response.ResultData.winscore ?? 0),
            0,
          ),
        );

        expect(Number(result.payout) > Number(result.stakeAmount), `${context}/outcome`).toBe(
          profile.won,
        );
        expect(Number(first.winscore ?? 0), `${context}/trigger-payout`).toBe(0);
        expect(animatedPayout, `${context}/animated-payout`).toBe(Number(result.payout));
        expect(
          responses.slice(1).some((queued) => Number(queued.response.ResultData.winscore) > 0),
        ).toBe(true);
        expect(
          roundMoney(Number(responses.at(-1)!.response.ResultData.userscore)),
          `${context}/final-balance`,
        ).toBe(Number(result.newBalance));
        expect(
          responses.every(
            (queued) =>
              roundMoney(Number(queued.response.ResultData.userscore)) ===
              Number(result.newBalance),
          ),
          `${context}/deferred-balance`,
        ).toBe(true);

        if (game.code === '321') {
          const features = result.features as {
            freeSpinMultiplierBank: number;
            freeSpinRounds: Array<{
              baseMultiplier: number;
              multiplierSymbols: Array<{ value?: number }>;
              multiplierTotal: number;
              appliedMultiplier: number;
              sourceMultiplierBank?: number;
              totalMultiplier: number;
              cascades: Array<{
                multiplier: number;
                sourceAppliedMultiplier?: number;
              }>;
            }>;
          };
          let multiplierBank = 1;
          for (const round of features.freeSpinRounds) {
            expect(round.multiplierSymbols, `${context}/no-invented-balls`).toEqual([]);
            expect(round.multiplierTotal, `${context}/no-hidden-ball-total`).toBe(0);
            expect(round.appliedMultiplier, `${context}/neutral-post-multiplier`).toBe(1);
            for (const cascade of round.cascades) {
              expect(cascade.sourceAppliedMultiplier, `${context}/visible-tumble-multiplier`).toBe(
                multiplierBank,
              );
              if (cascade.multiplier > 0) multiplierBank += 1;
            }
            if (round.sourceMultiplierBank !== undefined) {
              expect(round.sourceMultiplierBank, `${context}/persistent-bank`).toBe(multiplierBank);
            }
          }
          expect(features.freeSpinMultiplierBank, `${context}/final-ladder`).toBe(multiplierBank);
        }
      });
    });
  });

  it('maps every controlled fish settlement to exactly one matching hit result', async () => {
    const stake = new Prisma.Decimal(100);
    const profiles = allControlProfiles(stake);

    for (const [gameIndex, game] of H5_FISH_GAMES.entries()) {
      for (const [profileIndex, profile] of profiles.entries()) {
        const variant = 20_000 + gameIndex * 211 + profileIndex * 31;
        const result = controlledResult(game.gameId, stake, profile, variant);
        const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
        const adapter = loadAdapter(game.code, async (url, init) => {
          requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
          return {
            ok: true,
            status: 200,
            json: async () => result,
          };
        });
        const socket = adapter.createFakeSocket();
        const hitResults: Record<string, unknown>[] = [];
        socket.on('HitResult', (payload) => hitResults.push(payload));
        const bulletId = `controlled-${game.code}-${profileIndex}`;
        socket.emit('fishShoot', JSON.stringify({ bulletId, bet: 10, uid: 'controlled-player' }));
        socket.emit(
          'fishHit',
          JSON.stringify({ bulletId, fishId: `fish-${profileIndex}`, uid: 'controlled-player' }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const context = `${game.gameId}/${profile.flipReason}/${profile.won ? 'win' : 'loss'}`;
        expect(Number(result.payout) > Number(result.stakeAmount), `${context}/outcome`).toBe(
          profile.won,
        );
        expect(requests, `${context}/request`).toHaveLength(1);
        expect(requests[0]!.url, `${context}/url`).toBe(
          'https://example.test/api/games/h5-slots/spin',
        );
        expect(requests[0]!.body, `${context}/body`).toEqual({
          gameCode: game.code,
          amount: 100,
          isBuyFree: false,
        });

        if (Number(result.payout) > 0) {
          expect(hitResults, `${context}/hit-count`).toHaveLength(1);
          const hit = hitResults[0]!.ResultData as Record<string, unknown>;
          expect(roundMoney(Number(hit.hitSocre) * 10), `${context}/visible-payout`).toBe(
            Number(result.payout),
          );
        } else {
          expect(hitResults, `${context}/loss-hit-count`).toHaveLength(0);
        }
      }
    }
  });
});

const WIN_CONTROL_REASONS = [
  'win_control',
  'loss_control_release',
  'deposit_control',
  'deposit_lifecycle_path_guard',
  'online_reward_next_win',
  'auto_balance_revive',
  'auto_balance_path_guard',
  'manual_detection',
  'manual_detection_release',
  'global_accidental_burst_cap',
  'burst_win',
  'burst_small_win',
  'burst_risk_cap',
] as const;

const LOSS_CONTROL_REASONS = [
  'loss_control',
  'deposit_control',
  'deposit_lifecycle_path_guard',
  'auto_balance_bite',
  'auto_balance_drain',
  'auto_balance_path_guard',
  'manual_detection',
  'win_cap',
  'win_cap_rate',
  'agent_line_cap',
  'agent_line_cap_rate',
  'global_member_daily_win_cap',
  'burst_loss',
  'burst_budget_guard',
  'burst_risk_guard',
] as const;

function allControlProfiles(stake: Prisma.Decimal): ControlOutcome[] {
  return [
    ...WIN_CONTROL_REASONS.map((reason) => controlProfile(reason, true, stake)),
    ...LOSS_CONTROL_REASONS.map((reason) => controlProfile(reason, false, stake)),
  ];
}

function loadAdapter(
  gameCode: string,
  fetchImpl: (
    url: string | URL,
    init?: { body?: unknown },
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> = () =>
    Promise.reject(new Error('network disabled in control presentation tests')),
): AdapterHarness {
  const storedValues: Record<string, string> = {
    'bg-auth': JSON.stringify({
      state: { accessToken: 'control-matrix-access', refreshToken: 'control-matrix-refresh' },
      version: 0,
    }),
  };
  const storage = {
    getItem: (key: string) => storedValues[key] ?? null,
    setItem: (key: string, value: string) => {
      storedValues[key] = value;
    },
  };
  const context: Record<string, unknown> = {
    URL,
    URLSearchParams,
    AbortController,
    fetch: fetchImpl,
    console: { info: () => {}, warn: () => {}, error: () => {}, log: () => {} },
    XMLHttpRequest: function XMLHttpRequest() {},
    location: {
      origin: 'https://example.test',
      href: `https://example.test/game?gameId=${gameCode}`,
      search: `?gameId=${gameCode}`,
    },
    localStorage: storage,
    parent: { localStorage: storage, postMessage: () => {} },
    setTimeout,
    clearTimeout,
  };
  context.window = context;
  vm.runInNewContext(adapterSource, context, { filename: adapterPath });
  return context.__YachiyoH5AdapterTest as AdapterHarness;
}

function controlProfile(flipReason: string, won: boolean, stake: Prisma.Decimal): ControlOutcome {
  const multiplier = new Prisma.Decimal(won ? 2 : 0);
  return {
    won,
    multiplier,
    payout: stake.mul(multiplier),
    controlled: true,
    flipReason,
    controlId: `${flipReason}-${won ? 'win' : 'loss'}`,
    ...(won
      ? {
          minMultiplier: new Prisma.Decimal(flipReason === 'burst_win' ? 2 : '1.01'),
          maxMultiplier: new Prisma.Decimal(flipReason === 'burst_win' ? 500 : 20),
          maxPayout: stake.mul(flipReason === 'burst_win' ? 500 : 20),
        }
      : {}),
  };
}

function controlledResult(
  gameId: string,
  stake: Prisma.Decimal,
  control: ControlOutcome,
  variant: number,
  baseAmount = stake,
  buyFeature = false,
): Record<string, unknown> {
  const selection = __hotlineServiceTestHooks.selectControlledHotlineRound(
    gameId,
    stake,
    control,
    control,
    variant,
  );
  const round =
    gameId === 'h5-fortune-gems'
      ? __hotlineServiceTestHooks.decorateFortuneGemsRound(selection.round, 1, false)
      : selection.round;
  let multiplier = new Prisma.Decimal(round.totalMultiplier.toFixed(4));
  let payout = stake.mul(multiplier).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  let features =
    gameId !== 'h5-dragon-hatch' &&
    (buyFeature || isHotlineCascadeGame(gameId) || Boolean(round.features))
      ? buyFeature
        ? __hotlineServiceTestHooks.buildControlledMegaFeature(
            payout.div(baseAmount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN).toNumber(),
            true,
            variant,
            undefined,
            gameId,
          )
        : (round.features ??
          __hotlineServiceTestHooks.buildControlledMegaFeature(
            multiplier.toNumber(),
            false,
            variant,
            round,
            gameId,
          ))
      : undefined;

  if (features && features.freeSpinsAwarded > 0) {
    const allowAboveOne = __hotlineServiceTestHooks.canMegaFreeGameExceedOne(
      selection.effectiveControl,
    );
    const preserveTarget = __hotlineServiceTestHooks.shouldPreserveControlledMegaFreeGameTarget(
      selection.effectiveControl,
    );
    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      features,
      buyFeature,
      baseAmount,
      stake,
      variant,
      selection.effectiveControl.maxPayout,
      allowAboveOne,
      preserveTarget,
      gameId,
    );
    features = capped.features;
    payout = capped.payout;
    multiplier = capped.multiplier;
  }

  const payoutDeferred = Boolean(
    (gameId === 'h5-caishen-wins' || gameId === 'h5-gates-of-olympus') &&
    features &&
    features.freeSpinRounds.length > 0,
  );
  const newBalance = new Prisma.Decimal(10000)
    .sub(stake)
    .add(payoutDeferred ? 0 : payout)
    .toDecimalPlaces(2);
  return {
    grid: buyFeature
      ? __hotlineServiceTestHooks.blankHotlineGrid(gameId, variant + 503)
      : round.grid,
    lines: buyFeature ? [] : round.lines,
    cascades: buyFeature ? [] : round.cascades,
    ...(features ? { features } : {}),
    ...(round.sourceFeature ? { sourceFeature: round.sourceFeature } : {}),
    buyFeature,
    baseAmount: baseAmount.toFixed(2),
    stakeAmount: stake.toFixed(2),
    multiplier: multiplier.toNumber(),
    amount: stake.toFixed(2),
    payout: payout.toFixed(2),
    newBalance: newBalance.toFixed(2),
    payoutDeferred,
  };
}

function hasVisibleWinningMarker(data: Record<string, unknown>, family: string): boolean {
  const view = data.viewarray as Record<string, unknown> | Array<Record<string, unknown>>;
  if (family === 'classic') {
    return Array.isArray((view as Record<string, unknown>).nWinLinesDetail)
      ? ((view as Record<string, unknown>).nWinLinesDetail as unknown[]).length > 0
      : false;
  }
  if (family === 'tumble') {
    const ways = (view as Record<string, unknown>).wp as Record<string, unknown> | undefined;
    return Boolean(ways && Object.keys(ways).length > 0);
  }
  return (
    Array.isArray(view) &&
    view.some(
      (step) =>
        Number(step.win ?? step.winscore ?? 0) > 0 &&
        Array.isArray(step.nWinLinesDetail) &&
        step.nWinLinesDetail.length > 0,
    )
  );
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
