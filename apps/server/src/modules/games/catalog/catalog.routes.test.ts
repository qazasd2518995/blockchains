import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  blackjackCatalogGameId,
  gameCatalogRoutes,
  pendingCatalogGameId,
} from './catalog.routes.js';

function registrar(username: string, role = 'PLAYER') {
  const handlers = new Map<string, (request: { userId: string }) => Promise<unknown>>();
  const get = vi.fn((path, _options, routeHandler) => {
    handlers.set(path, routeHandler);
  });
  const findUnique = vi.fn(async () => ({ username, role, disabledAt: null }));
  const findMany = vi.fn(async () => []);
  const minesFindMany = vi.fn(async () => []);
  const hiLoFindMany = vi.fn(async () => []);
  const towerFindMany = vi.fn(async () => []);
  const blackjackFindMany = vi.fn(async () => []);
  const fastify = {
    authenticate: vi.fn(),
    get,
    prisma: {
      user: { findUnique },
      bet: { findMany },
      minesRound: { findMany: minesFindMany },
      hiLoRound: { findMany: hiLoFindMany },
      towerRound: { findMany: towerFindMany },
      blackjackRound: { findMany: blackjackFindMany },
    },
  } as unknown as FastifyInstance;
  return {
    fastify,
    findUnique,
    findMany,
    minesFindMany,
    hiLoFindMany,
    towerFindMany,
    blackjackFindMany,
    readHandler: (path = '/') => handlers.get(path),
  };
}

describe('new casino game catalog', () => {
  it.each(['testplayer', 'regular-member', 'custom-created-member'])(
    'returns the curated Jin Baobao catalog to authenticated member %s',
    async (username) => {
      const registration = registrar(username);
      await gameCatalogRoutes(registration.fastify, { platformRealm: 'qmoney' });
      const result = (await registration.readHandler()?.({ userId: 'test-user' })) as {
        version: number;
        games: Array<{
          id: string;
          name: string;
          category: string;
          cover: string;
          route: string;
          badge?: string;
          restricted: boolean;
        }>;
      };
      const namesIn = (category: string) =>
        result.games.filter((game) => game.category === category).map((game) => game.name);

      expect(result.version).toBe(7);
      expect(result.games).toHaveLength(27);
      expect(new Set(result.games.map((game) => game.id)).size).toBe(27);
      expect(result.games.every((game) => game.route.startsWith('/games/'))).toBe(true);
      expect(result.games.every((game) => game.restricted)).toBe(true);
      expect(result.games.every((game) => !Object.hasOwn(game, 'provider'))).toBe(true);
      expect(namesIn('熱門')).toEqual([
        '戰神賽特 II：覺醒之力',
        '雷神之錘 2：雷霆風暴',
        '歡樂水果機',
      ]);
      expect(namesIn('拉霸')).toEqual([
        '船長賞金',
        '招財金牛',
        '龍之孵化',
        '賞金女王',
        '幸運寶石',
        '奧林匹斯之門',
        '水果拉霸',
        '夜櫻武士',
        '索爾神槌',
        '暗夜古堡',
      ]);
      expect(namesIn('捕魚')).toEqual(['深海捕魚', '快樂捕魚', '雷霆戰機']);
      expect(namesIn('棋牌')).toEqual([
        '皇家21點',
        '經典21點',
        '萌娃十點半',
        '兔糖十點半',
        '天九黑粒',
        '御殿黑粒',
        '踩地雷',
        '爬階梯',
        '龍門推筒',
        '玉兔推索',
        '金殿推萬',
      ]);
      expect(result.games.map((game) => [game.id, game.cover])).toEqual([
        ['storm-of-seth-2', '/game-art/lobby/qmoney77/storm-of-seth-2.webp'],
        ['power-of-thor-2', '/game-art/lobby/qmoney77/power-of-thor-2.webp'],
        ['fruit-mary', '/game-art/generated/fruit-mary-cover-v1.png'],
        ['h5-captains-bounty', '/game-art/original/h5-individual/h5-captains-bounty-cover-v1.webp'],
        ['h5-fortune-ox', '/game-art/lobby/richpanda/fortune-ox.png'],
        ['h5-dragon-hatch', '/game-art/original/h5-individual/h5-dragon-hatch-cover-v1.webp'],
        ['h5-queen-of-bounty', '/game-art/lobby/qmoney77/queen-of-bounty.webp'],
        ['h5-fortune-gems', '/game-art/generated/h5-individual/h5-fortune-gems-cover-v1.webp'],
        [
          'h5-gates-of-olympus',
          '/game-art/generated/h5-individual/h5-gates-of-olympus-cover-v1.webp',
        ],
        ['fruit-slot', '/slots/fruit/cover-v2.png'],
        ['sakura-slot', '/slots/sakura/cover-v2.png'],
        ['thunder-slot', '/slots/thunder/cover-v2.png'],
        ['vampire-slot', '/slots/vampire/cover-v2.png'],
        [
          'h5-deep-sea-fishing',
          '/game-art/generated/h5-individual/h5-deep-sea-fishing-cover-v1.webp',
        ],
        ['h5-happy-fishing', '/game-art/generated/h5-individual/h5-happy-fishing-cover-v1.webp'],
        [
          'h5-thunder-fishing',
          '/game-art/generated/h5-individual/h5-thunder-fishing-cover-v1.webp',
        ],
        ['blackjack', '/game-art/lobby/qmoney77/royal-blackjack.webp'],
        ['blackjack-table-2', '/game-art/lobby/qmoney77/classic-blackjack.webp'],
        ['twenty-one-half-doll', '/game-art/local-table/ten-half-doll-cover.webp'],
        ['twenty-one-half-bunny', '/game-art/local-table/ten-half-bunny-cover.webp'],
        ['black-dot-tianjiu', '/game-art/local-table/black-dot-tianjiu-cover.webp'],
        ['black-dot-royal', '/game-art/local-table/black-dot-royal-cover.webp'],
        ['mines', '/game-art/lobby/qmoney77/mines.webp'],
        ['tower', '/game-art/lobby/qmoney77/tower-rush.webp'],
        ['tui-tongzi-dragon', '/game-art/local-table/tui-tongzi-dragon-cover.webp'],
        ['tui-tongzi-jade', '/game-art/local-table/tui-suozi-jade-cover.webp'],
        ['tui-tongzi-gold', '/game-art/local-table/tui-wanzi-gold-cover.webp'],
      ]);
      expect(result.games.find((game) => game.id === 'blackjack')?.route).toBe('/games/blackjack');
      expect(result.games.find((game) => game.id === 'blackjack-table-2')?.route).toBe(
        '/games/blackjack-table-2',
      );
      expect(
        result.games.every((game) => !['原版', '第1桌', '第2桌'].includes(String(game.badge))),
      ).toBe(true);
      expect(result.games.some((game) => game.id === 'h5-ocean-king-2')).toBe(false);
      expect(result.games.some((game) => game.id === 'h5-mahjong-ways-2')).toBe(false);
      expect(result.games.some((game) => game.id === 'nebula-slot')).toBe(false);
    },
  );

  it('does not expose the catalog without an authenticated username', async () => {
    const registration = registrar('   ');
    await gameCatalogRoutes(registration.fastify, { platformRealm: 'qmoney' });
    const result = (await registration.readHandler()?.({ userId: 'member-user' })) as {
      games: Array<{ id: string; restricted: boolean }>;
    };

    expect(result.games).toEqual([]);
  });
});

describe('pending game recovery catalog', () => {
  it('maps the classic Blackjack table back to its lobby game', () => {
    expect(blackjackCatalogGameId('classic')).toBe('blackjack-table-2');
    expect(blackjackCatalogGameId('royal')).toBe('blackjack');
    expect(
      pendingCatalogGameId({ gameId: 'blackjack', blackjackRound: { tableId: 'classic' } }),
    ).toBe('blackjack-table-2');
    expect(
      pendingCatalogGameId({ gameId: 'blackjack', blackjackRound: { tableId: 'royal' } }),
    ).toBe('blackjack');
  });

  it('returns only pending rounds that are available in the current lobby', async () => {
    const registration = registrar('regular-member');
    registration.findMany.mockResolvedValue([
      {
        id: 'classic-bet',
        gameId: 'blackjack',
        amount: new Prisma.Decimal(100),
        createdAt: new Date('2026-09-04T00:00:00.000Z'),
        blackjackRound: { tableId: 'classic' },
      },
      {
        id: 'hidden-bet',
        gameId: 'chicken-road',
        amount: new Prisma.Decimal(50),
        createdAt: new Date('2026-09-03T00:00:00.000Z'),
        blackjackRound: null,
      },
    ] as never);
    await gameCatalogRoutes(registration.fastify, { platformRealm: 'qmoney' });

    const result = (await registration.readHandler('/pending')?.({ userId: 'user-1' })) as {
      count: number;
      heldAmount: string;
      rounds: Array<{ gameId: string }>;
    };
    expect(result).toMatchObject({
      count: 1,
      heldAmount: '100.00',
      rounds: [{ gameId: 'blackjack-table-2' }],
    });
  });

  it('also returns active games whose Bet is only created during settlement', async () => {
    const registration = registrar('regular-member');
    registration.minesFindMany.mockResolvedValue([
      {
        id: 'mines-round',
        betAmount: new Prisma.Decimal(25),
        createdAt: new Date('2026-09-04T01:00:00.000Z'),
        bet: null,
      },
    ] as never);
    registration.blackjackFindMany.mockResolvedValue([
      {
        id: 'blackjack-round',
        tableId: 'classic',
        totalBetAmount: new Prisma.Decimal(100),
        createdAt: new Date('2026-09-04T02:00:00.000Z'),
        bet: null,
      },
    ] as never);
    await gameCatalogRoutes(registration.fastify, { platformRealm: 'qmoney' });

    const result = (await registration.readHandler('/pending')?.({ userId: 'user-1' })) as {
      count: number;
      heldAmount: string;
      rounds: Array<{ gameId: string; amount: string }>;
    };
    expect(result).toMatchObject({
      count: 2,
      heldAmount: '125.00',
      rounds: [
        { gameId: 'blackjack-table-2', amount: '100.00' },
        { gameId: 'mines', amount: '25.00' },
      ],
    });
  });
});
