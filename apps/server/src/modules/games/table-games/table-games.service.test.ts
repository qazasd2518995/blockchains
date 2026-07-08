import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canAccessLocalTableBeta, GameId, isGameVisibleForUsername } from '@bg/shared';
import { __localTableServiceTestHooks } from './table-games.service.js';

const {
  buildRound,
  buildTwentyOneHalfRoundFromState,
  half21Score,
  prepareTwentyOneHalfBankerTurnData,
  rankDominoPair,
  rankTubeHand,
  settleTwentyOneHalfBanker,
  shapeBlackDotRoundForControl,
  shapeRoundForControl,
  shapeTwentyOneHalfBankerForControl,
  shapeTwentyOneHalfHitForControl,
  shouldTwentyOneHalfBankerDraw,
} = __localTableServiceTestHooks;

const card = (
  rank: string,
  rankValue: number,
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs' = 'spades',
) => ({
  kind: 'card' as const,
  rank,
  suit,
  label: `${rank}${suit === 'spades' ? '♠' : suit === 'hearts' ? '♥' : suit === 'diamonds' ? '♦' : '♣'}`,
  valueLabel: rankValue >= 11 ? '0.5' : String(rankValue),
  rankValue,
});

const domino = (
  id: string,
  name: string,
  pips: [number, number],
  pairKey: string,
  pairRank: number,
) => ({
  kind: 'domino' as const,
  id,
  name,
  pips,
  pairKey,
  pairRank,
});

describe('local table game rules', () => {
  it('keeps local table games visible only for the beta account', () => {
    expect(canAccessLocalTableBeta('testplayer')).toBe(true);
    expect(canAccessLocalTableBeta('TestPlayer')).toBe(true);
    expect(canAccessLocalTableBeta('player001')).toBe(false);
    expect(isGameVisibleForUsername(GameId.TUI_TONGZI_DRAGON, 'testplayer')).toBe(true);
    expect(isGameVisibleForUsername(GameId.TUI_TONGZI_DRAGON, 'player001')).toBe(false);
    expect(isGameVisibleForUsername(GameId.BLACKJACK, 'player001')).toBe(true);
  });

  it('scores Ten-and-a-Half cards with face cards as half points', () => {
    const score = half21Score([
      {
        kind: 'card',
        rank: '10',
        suit: 'spades',
        label: '10♠',
        valueLabel: '10',
        rankValue: 10,
      },
      {
        kind: 'card',
        rank: 'K',
        suit: 'hearts',
        label: 'K♥',
        valueLabel: '0.5',
        rankValue: 13,
      },
    ]);

    expect(score).toBe(10.5);
  });

  it('ranks Tui Tongzi special hands above normal points', () => {
    const whitePair = rankTubeHand([
      { kind: 'tube', id: 'w1', label: '白板', value: 0, rankValue: 0, isWhite: true },
      { kind: 'tube', id: 'w2', label: '白板', value: 0, rankValue: 0, isWhite: true },
    ]);
    const erba = rankTubeHand([
      { kind: 'tube', id: '2', label: '2筒', value: 2, rankValue: 2 },
      { kind: 'tube', id: '8', label: '8筒', value: 8, rankValue: 8 },
    ]);
    const ninePoint = rankTubeHand([
      { kind: 'tube', id: '4', label: '4筒', value: 4, rankValue: 4 },
      { kind: 'tube', id: '5', label: '5筒', value: 5, rankValue: 5 },
    ]);
    const bieshi = rankTubeHand([
      { kind: 'tube', id: '1', label: '1筒', value: 1, rankValue: 1 },
      { kind: 'tube', id: '9', label: '9筒', value: 9, rankValue: 9 },
    ]);

    expect(whitePair.category).toBeGreaterThan(erba.category);
    expect(erba.category).toBeGreaterThan(ninePoint.category);
    expect(ninePoint.category).toBeGreaterThan(bieshi.category);
  });

  it('deals bamboo and character tiles for themed push-tile rooms', () => {
    const seed = { serverSeed: 'server-seed', clientSeed: 'client-seed', nonce: 7 };
    const jadeRound = buildRound(GameId.TUI_TONGZI_JADE, new Prisma.Decimal(100), seed, 0);
    const goldRound = buildRound(GameId.TUI_TONGZI_GOLD, new Prisma.Decimal(100), seed, 0);

    const jadeTiles = [...jadeRound.player.pieces, ...jadeRound.banker.pieces];
    const goldTiles = [...goldRound.player.pieces, ...goldRound.banker.pieces];

    expect(jadeRound.roomName).toBe('玉兔推索');
    expect(jadeRound.ruleSummary[0]).toContain('一索至九索');
    expect(jadeTiles.every((tile) => tile.kind === 'tube' && tile.suit === 'sou')).toBe(true);
    expect(
      jadeTiles.every((tile) => tile.kind !== 'tube' || tile.isWhite || tile.label.endsWith('索')),
    ).toBe(true);

    expect(goldRound.roomName).toBe('金殿推萬');
    expect(goldRound.ruleSummary[0]).toContain('一萬至九萬');
    expect(goldTiles.every((tile) => tile.kind === 'tube' && tile.suit === 'man')).toBe(true);
    expect(
      goldTiles.every((tile) => tile.kind !== 'tube' || tile.isWhite || tile.label.endsWith('萬')),
    ).toBe(true);
  });

  it('ranks Black Dot Pai Gow pairs and wong/gong combinations above normal points', () => {
    const heavenPair = rankDominoPair([
      { kind: 'domino', id: 'h1', name: '天牌', pips: [6, 6], pairKey: 'heaven', pairRank: 15 },
      { kind: 'domino', id: 'h2', name: '天牌', pips: [6, 6], pairKey: 'heaven', pairRank: 15 },
    ]);
    const wong = rankDominoPair([
      { kind: 'domino', id: 'h1', name: '天牌', pips: [6, 6], pairKey: 'heaven', pairRank: 15 },
      { kind: 'domino', id: 'n1', name: '雜九', pips: [4, 5], pairKey: 'mixed-nine', pairRank: 4 },
    ]);
    const gong = rankDominoPair([
      { kind: 'domino', id: 'e1', name: '地牌', pips: [1, 1], pairKey: 'earth', pairRank: 14 },
      { kind: 'domino', id: 'a1', name: '雜八', pips: [2, 6], pairKey: 'mixed-eight', pairRank: 3 },
    ]);
    const ninePoint = rankDominoPair([
      { kind: 'domino', id: 'g1', name: '至尊一', pips: [1, 2], pairKey: 'gee', pairRank: 16 },
      { kind: 'domino', id: 'l1', name: '長牌', pips: [3, 3], pairKey: 'long', pairRank: 10 },
    ]);

    expect(heavenPair.category).toBeGreaterThan(wong.category);
    expect(wong.category).toBe(gong.category);
    expect(wong.rank).toBeGreaterThan(gong.rank);
    expect(gong.category).toBeGreaterThan(ninePoint.category);
    expect(ninePoint.rank).toBe(9);
  });

  it('builds deterministic Card War rounds from the same seed bundle', () => {
    const amount = new Prisma.Decimal(100);
    const seed = { serverSeed: 'table-test-server', clientSeed: 'client', nonce: 7 };
    const first = buildRound(GameId.CARD_WAR, amount, seed, 0);
    const second = buildRound(GameId.CARD_WAR, amount, seed, 0);

    expect(first.summary).toBe(second.summary);
    expect(first.player.pieces).toEqual(second.player.pieces);
    expect(first.banker.pieces).toEqual(second.banker.pieces);
  });

  it('shapes controlled losses into visible losing rounds', () => {
    const amount = new Prisma.Decimal(100);
    const seed = { serverSeed: 'control-loss-server', clientSeed: 'client', nonce: 3 };
    const natural = buildRound(GameId.TWENTY_ONE_HALF_DOLL, amount, seed, 0);
    const { round } = shapeRoundForControl(GameId.TWENTY_ONE_HALF_DOLL, amount, seed, natural, {
      won: false,
      multiplier: new Prisma.Decimal(0),
      payout: new Prisma.Decimal(0),
      controlled: true,
      flipReason: 'test_force_loss',
    });

    expect(round.outcome).toBe('LOSE');
    expect(round.payout.toNumber()).toBe(0);
    expect(round.profit.toNumber()).toBe(-100);
  });

  it('turns impossible capped wins into visible losses for pre-shaped table rounds', () => {
    const amount = new Prisma.Decimal(100);
    const control = {
      won: true,
      multiplier: new Prisma.Decimal('1.2'),
      payout: new Prisma.Decimal('120.00'),
      controlled: true,
      flipReason: 'global_member_daily_win_cap',
      controlId: 'global-member-daily-win-cap',
      maxPayout: new Prisma.Decimal('120.00'),
      gameMatchedPayoutOnly: true,
    };

    for (const gameId of [GameId.TUI_TONGZI_DRAGON, GameId.CARD_WAR]) {
      const seed = { serverSeed: `cap-${gameId}`, clientSeed: 'client', nonce: 11 };
      const natural = buildRound(gameId, amount, seed, 0);
      const { round, control: effectiveControl } = shapeRoundForControl(
        gameId,
        amount,
        seed,
        natural,
        control,
      );

      expect(round.outcome).toBe('LOSE');
      expect(round.payout.toFixed(2)).toBe('0.00');
      expect(effectiveControl.won).toBe(false);
      expect(effectiveControl.flipReason).toBe('control_bounds_guard');
    }
  });

  it('keeps Ten-and-a-Half hit control natural when an immediate controlled win is impossible', () => {
    const amount = new Prisma.Decimal(100);
    const data = {
      kind: 'twenty-one-half' as const,
      status: 'ACTIVE' as const,
      gameId: GameId.TWENTY_ONE_HALF_DOLL,
      roomName: '萌娃十點半',
      player: [card('7', 7)],
      banker: [card('K', 13, 'hearts')],
      deck: [card('5', 5), card('A', 1), card('2', 2), card('3', 3), card('Q', 12)],
      deckIndex: 0,
      summary: '測試',
    };
    const naturalBust = {
      ...data,
      player: [...data.player, card('5', 5)],
      deckIndex: 1,
    };
    const naturalRound = buildTwentyOneHalfRoundFromState(naturalBust, amount);
    const shaped = shapeTwentyOneHalfHitForControl(
      data,
      amount,
      {
        won: true,
        multiplier: new Prisma.Decimal('1.96'),
        payout: new Prisma.Decimal('196.00'),
        controlled: true,
        flipReason: 'win_control',
        controlId: 'win-control-1',
      },
      naturalRound,
    );

    expect(shaped?.kind).toBe('progress');
    if (shaped?.kind !== 'progress') throw new Error('expected progress shape');
    expect(half21Score(shaped.data.player)).toBe(8);
    expect(shaped.data.player).toHaveLength(2);
  });

  it('stages Ten-and-a-Half banker draws one card at a time after player stands', () => {
    const amount = new Prisma.Decimal(100);
    const data = {
      kind: 'twenty-one-half' as const,
      status: 'ACTIVE' as const,
      phase: 'PLAYER_TURN' as const,
      gameId: GameId.TWENTY_ONE_HALF_DOLL,
      roomName: '萌娃十點半',
      player: [card('7', 7)],
      banker: [card('K', 13, 'hearts')],
      deck: [card('2', 2), card('4', 4), card('3', 3)],
      deckIndex: 0,
      summary: '測試',
    };
    const resolved = settleTwentyOneHalfBanker(data);
    const naturalRound = buildTwentyOneHalfRoundFromState(resolved, amount);
    const bankerTurn = prepareTwentyOneHalfBankerTurnData(
      data,
      resolved,
      naturalRound,
      {
        won: naturalRound.profit.greaterThan(0),
        multiplier: naturalRound.multiplier,
        payout: naturalRound.payout,
        controlled: false,
      },
      false,
    );

    expect(resolved.banker).toHaveLength(4);
    expect(bankerTurn.phase).toBe('BANKER_TURN');
    expect(bankerTurn.banker).toHaveLength(1);
    expect(bankerTurn.deckIndex).toBe(0);
    expect(shouldTwentyOneHalfBankerDraw(bankerTurn)).toBe(true);

    const afterOneDraw = {
      ...bankerTurn,
      banker: [...bankerTurn.banker, bankerTurn.deck[bankerTurn.deckIndex]!],
      deckIndex: bankerTurn.deckIndex + 1,
    };

    expect(afterOneDraw.banker).toHaveLength(2);
    expect(half21Score(afterOneDraw.banker)).toBe(2.5);
    expect(shouldTwentyOneHalfBankerDraw(afterOneDraw)).toBe(true);
  });

  it('guards Ten-and-a-Half stand wins that cannot fit a payout ceiling', () => {
    const amount = new Prisma.Decimal(100);
    const shaped = shapeTwentyOneHalfBankerForControl(
      {
        kind: 'twenty-one-half',
        status: 'ACTIVE',
        gameId: GameId.TWENTY_ONE_HALF_DOLL,
        roomName: '萌娃十點半',
        player: [card('7', 7)],
        banker: [card('K', 13, 'hearts')],
        deck: [card('7', 7), card('6', 6), card('5', 5), card('4', 4)],
        deckIndex: 0,
        summary: '測試',
      },
      amount,
      {
        won: true,
        multiplier: new Prisma.Decimal('1.2'),
        payout: new Prisma.Decimal('120.00'),
        controlled: true,
        flipReason: 'global_member_daily_win_cap',
        controlId: 'global-member-daily-win-cap',
        maxPayout: new Prisma.Decimal('120.00'),
        gameMatchedPayoutOnly: true,
      },
    );

    expect(shaped?.round.outcome).toBe('LOSE');
    expect(shaped?.round.payout.toFixed(2)).toBe('0.00');
    expect(shaped?.control.won).toBe(false);
    expect(shaped?.control.flipReason).toBe('control_bounds_guard');
  });

  it('guards Black Dot controlled wins that cannot fit a payout ceiling', () => {
    const amount = new Prisma.Decimal(100);
    const playerTiles = [
      domino('mf-a', '雜五', [1, 4], 'mixed-five', 1),
      domino('ms-a', '雜七', [2, 5], 'mixed-seven', 2),
      domino('me-a', '雜八', [2, 6], 'mixed-eight', 3),
      domino('mn-a', '雜九', [4, 5], 'mixed-nine', 4),
    ];
    const bankerCandidates = [
      domino('h-1', '天牌', [6, 6], 'heaven', 15),
      domino('h-2', '天牌', [6, 6], 'heaven', 15),
      domino('e-1', '地牌', [1, 1], 'earth', 14),
      domino('e-2', '地牌', [1, 1], 'earth', 14),
    ];
    const data = {
      kind: 'black-dot' as const,
      status: 'ACTIVE' as const,
      stage: 'AWAIT_SPLIT' as const,
      gameId: GameId.BLACK_DOT_TIANJIU,
      roomName: '天九黑粒',
      playerTiles,
      deck: [...playerTiles, ...bankerCandidates],
      deckIndex: 4,
      summary: '測試',
    };
    const natural = buildRound(
      GameId.BLACK_DOT_TIANJIU,
      amount,
      { serverSeed: 'black-dot-cap', clientSeed: 'client', nonce: 2 },
      0,
    );
    const shaped = shapeBlackDotRoundForControl(data, amount, '0-1_2-3', natural, {
      won: true,
      multiplier: new Prisma.Decimal('1.2'),
      payout: new Prisma.Decimal('120.00'),
      controlled: true,
      flipReason: 'global_member_daily_win_cap',
      controlId: 'global-member-daily-win-cap',
      maxPayout: new Prisma.Decimal('120.00'),
      gameMatchedPayoutOnly: true,
    });

    expect(shaped.round.outcome).toBe('LOSE');
    expect(shaped.round.payout.toFixed(2)).toBe('0.00');
    expect(shaped.control.won).toBe(false);
    expect(shaped.control.flipReason).toBe('control_bounds_guard');
  });
});
